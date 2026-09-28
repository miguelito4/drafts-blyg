import { test } from "node:test";
import assert from "node:assert/strict";
import { runAction } from "./drafts-runtime.mjs";

const decode = (b) => Buffer.from(b, "base64").toString("utf8");

test("publishes: correct URL, headers, branch, body, tag", () => {
  const r = runAction({ content: "  Capital follows structure.  \n" });
  assert.equal(r.failed, false);
  assert.equal(r.requests.length, 1);
  const req = r.requests[0];
  assert.equal(req.method, "PUT");
  assert.match(req.url, /^https:\/\/api\.github\.com\/repos\/testuser\/testsite\/contents\/content\/blyg\/\d{8}T\d{6}Z\.md$/);
  assert.equal(req.headers.Authorization, "Bearer tok");
  assert.equal(req.data.branch, "main");
  assert.equal(decode(req.data.content), "Capital follows structure.\n");
  assert.equal(req.data.message, "blyg: Capital follows structure.");
  assert.ok(r.tags.includes("blyg-published"));
  assert.ok(r.updated);
  assert.equal(r.successes.length, 1);
});

test("unicode survives (Farsi, emoji)", () => {
  const text = "سرمایه ساختار را دنبال می‌کند 🌊";
  const r = runAction({ content: text });
  assert.equal(decode(r.requests[0].data.content), text + "\n");
});

test("frontmatter option wraps body", () => {
  const r = runAction({ content: "hi", config: { frontmatter: true } });
  assert.match(decode(r.requests[0].data.content), /^---\ncreated: \d{4}-\d\d-\d\dT[\d:.]+Z\n---\n\nhi\n$/);
});

test("custom dir/branch/ext, trailing slash tolerated", () => {
  const r = runAction({ content: "x", config: { dir: "blyg/fragments/", branch: "prod", ext: ".txt" } });
  assert.match(r.requests[0].url, /\/contents\/blyg\/fragments\/\d{8}T\d{6}Z\.txt$/);
  assert.equal(r.requests[0].data.branch, "prod");
});

test("refuses empty draft", () => {
  const r = runAction({ content: "   \n " });
  assert.ok(r.failed);
  assert.equal(r.requests.length, 0);
});

test("refuses over the cap, counts trimmed text", () => {
  assert.ok(runAction({ content: "a".repeat(501) }).failed);
  assert.equal(runAction({ content: "a".repeat(500) + "   " }).failed, false);
});

test("refuses already-published draft", () => {
  const r = runAction({ content: "x", tags: ["blyg-published"] });
  assert.ok(r.failed);
  assert.equal(r.requests.length, 0);
});

test("refuses unconfigured script", () => {
  const r = runAction({ content: "x", config: { owner: "YOUR_GITHUB_USER" } });
  assert.ok(r.failed);
  assert.match(r.failMessage, /owner and repo/);
});

test("no token → fail, no request", () => {
  const r = runAction({ content: "x", token: null });
  assert.ok(r.failed);
  assert.equal(r.requests.length, 0);
});

for (const [status, re] of [[401, /token/], [403, /permission/], [404, /not found/], [422, /already exist/], [500, /500/]]) {
  test(`HTTP ${status} → fail, draft untouched`, () => {
    const r = runAction({ content: "x", http: () => ({ success: false, statusCode: status, responseText: "{}" }) });
    assert.ok(r.failed);
    assert.match(r.failMessage, re);
    assert.ok(!r.tags.includes("blyg-published"));
    assert.equal(r.updated, false);
  });
}

test("commit message collapses newlines and truncates", () => {
  const r = runAction({ content: "line one\nline two " + "z".repeat(100) });
  const m = r.requests[0].data.message;
  assert.ok(!m.includes("\n"));
  assert.equal(m.length, "blyg: ".length + 60);
});

test("fallback encoder matches Buffer when Base64 global is missing", () => {
  for (const text of ["a", "ab", "abc", "Capital follows structure.", "سرمایه ساختار 🌊✓"]) {
    const r = runAction({ content: text, noBase64: true });
    assert.equal(r.requests[0].data.content, Buffer.from(text + "\n", "utf8").toString("base64"));
  }
});
