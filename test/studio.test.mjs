import { test } from "node:test";
import assert from "node:assert/strict";
import { runStudioAction } from "./studio-runtime.mjs";

const json = (statusCode, obj, headers = {}) => ({
  success: statusCode >= 200 && statusCode < 300, statusCode, responseText: JSON.stringify(obj), headers,
});
const COOKIE = "blyg_session=123.abc";

/** A fake Studio. Options tweak one behaviour each. */
function studio({ password = "pw", cookieInHeaders = true, createStatus = 201, publishStatus = 200, target = null } = {}) {
  const state = { created: null, published: false };
  return {
    state,
    http(req) {
      const url = new URL(req.url);
      if (url.pathname.endsWith("/studio/login") && req.method === "POST") {
        if (req.data.password !== password) return { success: false, statusCode: 403, responseText: "<html>", headers: {} };
        return cookieInHeaders
          ? { success: false, statusCode: 302, responseText: "", headers: { "Set-Cookie": `${COOKIE}; Path=/; HttpOnly` } }
          : { success: true, statusCode: 200, responseText: "<html>studio</html>", headers: {} };
      }
      if (url.pathname === "/api/settings") return cookieInHeaders ? json(401, { error: "unauthorized" }) : json(200, {});
      if (url.pathname === "/api/items" && req.method === "POST") {
        if (cookieInHeaders && req.headers.Cookie !== COOKIE) return json(401, { error: "unauthorized" });
        if (createStatus !== 201) return json(createStatus, { error: "nope" });
        state.created = JSON.parse(JSON.stringify(req.data));
        return json(201, { id: "newid", kind: req.data.kind, status: "draft" });
      }
      if (url.pathname === "/api/items/newid/publish") {
        state.published = true;
        return json(publishStatus, publishStatus === 200 ? { ok: true, version: 1 } : { error: "bad" });
      }
      if (target && req.url === target.url) return target.response;
      return json(404, { error: "not found" });
    },
  };
}

test("fragment: login, create, publish, tag", () => {
  const s = studio();
  const r = runStudioAction({ content: "  A thought.  ", http: s.http });
  assert.equal(r.failed, false, r.failMessage);
  assert.deepEqual(s.state.created, { mode: "blank", kind: "fragment", content_md: "A thought." });
  assert.ok(s.state.published);
  assert.ok(r.tags.includes("blyg-published"));
  assert.equal(r.logs.at(-1), "https://blyg.test/f/newid/");
  const login = r.requests[0];
  assert.equal(login.url, "https://blyg.test/studio/login");
  assert.equal(login.encoding, "form");
  assert.equal(login.followRedirects, false);
});

test("API is host-rooted even for a path-mounted blyg", () => {
  const s = studio();
  const r = runStudioAction({ content: "x", config: { blyg: "https://example.org/blyg" }, http: s.http });
  assert.equal(r.failed, false, r.failMessage);
  assert.equal(r.requests[0].url, "https://example.org/blyg/studio/login");
  assert.equal(r.requests[1].url, "https://example.org/api/items");
  assert.equal(r.logs.at(-1), "https://example.org/blyg/f/newid/");
});

test("draft mode saves without publishing", () => {
  const s = studio();
  const r = runStudioAction({ content: "later", config: { mode: "draft" }, http: s.http });
  assert.equal(r.failed, false);
  assert.equal(s.state.published, false);
  assert.ok(r.tags.includes("blyg-drafted"));
});

test("cookie jar fallback when the redirect was followed", () => {
  const s = studio({ cookieInHeaders: false });
  const r = runStudioAction({ content: "x", http: s.http });
  assert.equal(r.failed, false, r.failMessage);
  assert.equal(r.requests.find((q) => q.url.endsWith("/api/items")).headers.Cookie, undefined);
});

test("wrong password", () => {
  const r = runStudioAction({ content: "x", password: "bad", http: studio().http });
  assert.ok(r.failed);
  assert.match(r.failMessage, /Wrong Studio password/);
});

test("response: first-line permalink becomes stub_of at the latest version", () => {
  const target = {
    url: "https://other.example/blyg/items/abc123.json",
    response: json(200, { blyg: "0.3", id: "abc123", kind: "thread", origin: "https://other.example/blyg/", version: 3 }),
  };
  const s = studio({ target });
  const r = runStudioAction({ content: "https://other.example/blyg/t/abc123/\n\nMy take.", http: s.http });
  assert.equal(r.failed, false, r.failMessage);
  assert.deepEqual(s.state.created, {
    mode: "blank", kind: "thread", content_md: "My take.",
    stub_of: { origin: "https://other.example/blyg/", id: "abc123", version: 3 },
  });
  assert.equal(r.logs.at(-1), "https://blyg.test/t/newid/");
  assert.match(r.successes[0], /Response/);
});

test("response: root-mounted permalink without trailing slash", () => {
  const target = {
    url: "https://blyg.other.example/items/xyz.json",
    response: json(200, { id: "xyz", kind: "fragment", origin: "https://blyg.other.example/", version: 1 }),
  };
  const s = studio({ target });
  const r = runStudioAction({ content: "https://blyg.other.example/f/xyz\nYes.", http: s.http });
  assert.equal(r.failed, false, r.failMessage);
  assert.equal(s.state.created.stub_of.origin, "https://blyg.other.example/");
});

test("response needs commentary, and refuses withdrawn targets", () => {
  assert.match(runStudioAction({ content: "https://o.example/f/a/", http: studio().http }).failMessage, /commentary/);
  const target = { url: "https://o.example/items/a.json", response: json(200, { id: "a", kind: "withdrawn", version: 2 }) };
  assert.match(runStudioAction({ content: "https://o.example/f/a/\nhm", http: studio({ target }).http }).failMessage, /withdrawn/);
});

test("a URL that isn't the whole first line is just text", () => {
  const s = studio();
  const r = runStudioAction({ content: "Read https://o.example/f/a/ today", http: s.http });
  assert.equal(s.state.created.kind, "fragment");
  assert.equal(r.failed, false);
});

test("guards: empty, over cap, already sent, unconfigured", () => {
  assert.ok(runStudioAction({ content: " ", http: studio().http }).failed);
  assert.match(runStudioAction({ content: "a".repeat(1001), http: studio().http }).failMessage, /cap/);
  assert.match(runStudioAction({ content: "x", tags: ["blyg-published"], http: studio().http }).failMessage, /Already/);
  assert.match(runStudioAction({ content: "x", config: { blyg: "https://blyg.example.com/" }, http: studio().http }).failMessage, /CONFIG.blyg/);
});

test("old server: 404 on /api/items explains the version requirement", () => {
  const r = runStudioAction({ content: "x", http: studio({ createStatus: 404 }).http });
  assert.match(r.failMessage, /Studio 0\.9/);
  assert.ok(!r.tags.includes("blyg-published"));
});

test("publish failure says the draft was saved", () => {
  const r = runStudioAction({ content: "x", http: studio({ publishStatus: 422 }).http });
  assert.ok(r.failed);
  assert.match(r.failMessage, /newid was saved/);
  assert.ok(!r.tags.includes("blyg-published"));
});
