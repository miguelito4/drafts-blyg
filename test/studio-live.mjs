// Live test: runs src/publish-to-studio.js against a real Blygger Studio.
// Use a local one (wrangler dev) or a throwaway deployment, never your real blyg:
// it publishes items, and published items are permanent.
//
//   STUDIO_URL=http://localhost:8787/ STUDIO_PASSWORD=... node test/studio-live.mjs
//
// It runs twice, once per way Drafts' HTTP client might behave on login:
//   headers  — the 302 is not followed, so the script reads Set-Cookie itself
//   jar      — the redirect is followed and the cookie lives in a cookie store
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runStudioAction } from "./studio-runtime.mjs";

const { STUDIO_URL, STUDIO_PASSWORD } = process.env;
if (!STUDIO_URL || !STUDIO_PASSWORD) {
  console.error("Set STUDIO_URL and STUDIO_PASSWORD (a local or throwaway Studio).");
  process.exit(2);
}

function transport(mode) {
  const jar = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "jar-")), "cookies");
  return (req, client) => {
    const follow = mode === "jar"; // simulate a client that follows redirects regardless
    const args = ["-sS", "-i", "-X", req.method, req.url];
    if (mode === "jar") args.push("-b", jar, "-c", jar);
    if (follow) args.push("-L");
    for (const [k, v] of Object.entries(req.headers || {})) args.push("-H", `${k}: ${v}`);
    if (req.data !== undefined) {
      if (req.encoding === "form") {
        for (const [k, v] of Object.entries(req.data)) args.push("--data-urlencode", `${k}=${v}`);
      } else {
        args.push("-H", "Content-Type: application/json", "--data-binary", JSON.stringify(req.data));
      }
    }
    const raw = execFileSync("curl", args, { encoding: "utf8" });
    // With -L, curl prints every response; keep the last one.
    const blocks = raw.split(/\r?\n\r?\n/);
    let i = 0, last = 0;
    while (i < blocks.length && /^HTTP\/\S+ \d{3}/.test(blocks[i])) { last = i; i++; }
    const head = blocks[last].split(/\r?\n/);
    const statusCode = Number(head[0].split(" ")[1]);
    const headers = {};
    for (const line of head.slice(1)) {
      const j = line.indexOf(":");
      if (j > 0) headers[line.slice(0, j)] = line.slice(j + 1).trim();
    }
    const responseText = blocks.slice(last + 1).join("\n\n");
    return { success: statusCode >= 200 && statusCode < 300, statusCode, responseText, headers };
  };
}

const getJson = (url) => JSON.parse(execFileSync("curl", ["-sS", url], { encoding: "utf8" }));
const base = STUDIO_URL.replace(/\/*$/, "/");
let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? "PASS" : "FAIL"} ${msg}`); if (!ok) failures++; };

for (const mode of ["headers", "jar"]) {
  const http = transport(mode);
  const stamp = new Date().toISOString();

  // 1. Fragment
  const a = runStudioAction({ content: `live ${mode} ${stamp} — ✓ سلام`, password: STUDIO_PASSWORD, config: { blyg: base }, http });
  check(!a.failed, `[${mode}] fragment publish ${a.failMessage || ""}`);
  if (a.failed) { console.log(a.logs.join("\n")); continue; }
  const page = a.logs.at(-1);
  const id = page.split("/").filter(Boolean).pop();
  const doc = getJson(`${base}items/${id}.json`);
  check(doc.kind === "fragment" && doc.version === 1 && doc.content_md.includes("سلام"), `[${mode}] fragment is live at v1 with non-ASCII intact`);

  // 2. Response to it
  const b = runStudioAction({ content: `${page}\n\nResponding (${mode}).`, password: STUDIO_PASSWORD, config: { blyg: base }, http });
  check(!b.failed, `[${mode}] response publish ${b.failMessage || ""}`);
  if (!b.failed) {
    const sid = b.logs.at(-1).split("/").filter(Boolean).pop();
    const sdoc = getJson(`${base}items/${sid}.json`);
    check(sdoc.kind === "thread" && sdoc.stub_of?.id === id && sdoc.stub_of?.version === 1, `[${mode}] response is a thread with stub_of → ${id} v1`);
    check(Boolean(sdoc.stub_of?.cited?.retrieved), `[${mode}] Studio composed the citation`);
  }

  // 3. Draft mode
  const c = runStudioAction({ content: `draft ${mode} ${stamp}`, password: STUDIO_PASSWORD, config: { blyg: base, mode: "draft" }, http });
  check(!c.failed, `[${mode}] draft saved ${c.failMessage || ""}`);
  if (!c.failed) {
    const did = c.logs.at(-1).split("/").filter(Boolean).pop();
    const code = execFileSync("curl", ["-s", "-o", "/dev/null", "-w", "%{http_code}", `${base}items/${did}.json`], { encoding: "utf8" });
    check(code === "404", `[${mode}] draft is not public (${code})`);
  }

  // 4. Wrong password
  const d = runStudioAction({ content: "nope", password: "wrong-password", config: { blyg: base }, http });
  check(d.failed && /Wrong Studio password/.test(d.failMessage), `[${mode}] wrong password is refused clearly`);
}

process.exit(failures ? 1 : 0);
