// Live test: runs the real action script against the GitHub API, then deletes
// the file it created. Use a throwaway repo, not your production site.
//
//   GITHUB_TOKEN=... TEST_OWNER=you TEST_REPO=blyg-sandbox [TEST_BRANCH=main] node test/live.mjs
//
// Drafts' HTTP is synchronous, so the mock shells out to curl.
import { execFileSync } from "node:child_process";
import { runAction } from "./drafts-runtime.mjs";

const { GITHUB_TOKEN, TEST_OWNER, TEST_REPO, TEST_BRANCH = "main" } = process.env;
if (!GITHUB_TOKEN || !TEST_OWNER || !TEST_REPO) {
  console.error("Set GITHUB_TOKEN, TEST_OWNER, TEST_REPO (a throwaway repo).");
  process.exit(2);
}

function curl(req) {
  const args = ["-sS", "-X", req.method, "-w", "\n%{http_code}", req.url];
  for (const [k, v] of Object.entries(req.headers)) args.push("-H", `${k}: ${v}`);
  args.push("-H", "Content-Type: application/json", "--data-binary", JSON.stringify(req.data));
  const raw = execFileSync("curl", args, { encoding: "utf8" });
  const i = raw.lastIndexOf("\n");
  const statusCode = Number(raw.slice(i + 1));
  return { success: statusCode >= 200 && statusCode < 300, statusCode, responseText: raw.slice(0, i) };
}

const text = `live test ${new Date().toISOString()} — ✓ سلام`;
const r = runAction({
  content: text,
  token: GITHUB_TOKEN,
  config: { owner: TEST_OWNER, repo: TEST_REPO, branch: TEST_BRANCH, dir: "blyg-live-test" },
  http: curl,
});

if (r.failed) {
  console.error("FAIL:", r.failMessage, "\n", r.logs.join("\n"));
  process.exit(1);
}
console.log("PASS publish:", r.successes[0]);

// Read back, verify, clean up
const url = r.requests[0].url;
const hdrs = { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: "application/vnd.github+json" };
const get = await fetch(`${url}?ref=${TEST_BRANCH}`, { headers: hdrs }).then((x) => x.json());
const body = Buffer.from(get.content, "base64").toString("utf8");
if (body !== text + "\n") { console.error("FAIL roundtrip:", JSON.stringify(body)); process.exit(1); }
console.log("PASS roundtrip");

const del = await fetch(url, {
  method: "DELETE",
  headers: hdrs,
  body: JSON.stringify({ message: "blyg live test cleanup", sha: get.sha, branch: TEST_BRANCH }),
});
console.log(del.ok ? "PASS cleanup" : `WARN cleanup ${del.status}`);
