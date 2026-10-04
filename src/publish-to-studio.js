// Publish to blyg (Studio) — a Drafts action that posts the current draft to a
// blyg running Blygger Studio 0.9 or later, through its documented owner API.
// Paste this into a single Script step. Edit CONFIG below.
//
// Two ways to use it:
//   - A plain draft becomes a fragment.
//   - A draft whose FIRST LINE is a blyg permalink (…/f/{id}/ or …/t/{id}/)
//     becomes a response to that item: a thread that declares stub_of, with the
//     rest of the draft as your commentary. Studio adds the citation and sends
//     the Webmention.

// ---- config ----
const CONFIG = Object.assign({
  blyg: "https://blyg.example.com/", // your blyg's public address, including any mount path
  mode: "publish",                   // "publish", or "draft" to save in Studio without publishing
  maxChars: 1000,                    // refuse longer drafts (the spec's recommended cap)
}, typeof BLYG_CONFIG_OVERRIDE !== "undefined" ? BLYG_CONFIG_OVERRIDE : {});
// ---- end config ----

const DONE_TAG = CONFIG.mode === "draft" ? "blyg-drafted" : "blyg-published";

function fail(msg) {
  app.displayErrorMessage(msg);
  context.fail(msg);
}

/** The blyg address with exactly one trailing slash. */
function blygBase() {
  return CONFIG.blyg.replace(/\/*$/, "/");
}

/** The owner API is host-rooted, even when the blyg is mounted at a path. */
function apiRoot() {
  const m = /^(https?:\/\/[^\/?#]+)/.exec(CONFIG.blyg);
  return m ? m[1] + "/api" : null;
}

function header(resp, name) {
  const h = resp.headers || {};
  for (const k of Object.keys(h)) if (k.toLowerCase() === name) return h[k];
  return null;
}

function sessionFrom(setCookie) {
  if (!setCookie) return null;
  const m = /blyg_session=([^;,\s]+)/.exec(String(setCookie));
  return m ? "blyg_session=" + m[1] : null;
}

/**
 * A first line that is a blyg permalink makes this a response.
 * Returns { origin, id, body } or null.
 */
function parseTarget(text) {
  const lines = text.split("\n");
  const first = lines[0].trim();
  const m = /^(https?:\/\/\S+?\/)(f|t)\/([^\/\s?#]+)\/?(?:[?#]\S*)?$/.exec(first);
  if (!m) return null;
  return { origin: m[1], id: m[3], body: lines.slice(1).join("\n").trim() };
}

function api(method, path, body, cookie) {
  const headers = { "Accept": "application/json" };
  if (cookie) headers["Cookie"] = cookie;
  const req = { url: apiRoot() + path, method, headers };
  if (body !== null && body !== undefined) {
    req.data = body;
    req.encoding = "json";
  }
  return HTTP.create().request(req);
}

function apiError(resp, what) {
  let detail = "";
  try {
    const j = JSON.parse(resp.responseText || "{}");
    if (j.error) detail = ": " + j.error;
  } catch (e) {}
  switch (resp.statusCode) {
    case 401: return `${what} was refused (401). The Studio session didn't take; run the action again.`;
    case 404: return `${what} not found (404). This action needs Blygger Studio 0.9 or later, and CONFIG.blyg must be your blyg's address.`;
    case 409: return `${what} conflicted with a change made elsewhere (409). Try again.`;
    default:  return `${what} failed (${resp.statusCode})${detail}`;
  }
}

/** Sign in at {blyg}/studio/login. Returns { cookie } or { error }. */
function login(password) {
  const http = HTTP.create();
  try { http.followRedirects = false; } catch (e) {}
  const r = http.request({
    url: blygBase() + "studio/login",
    method: "POST",
    data: { password },
    encoding: "form",
  });
  if (r.statusCode === 403) return { error: "Wrong Studio password. Forget it under Drafts › Settings › Credentials and run again." };
  const cookie = sessionFrom(header(r, "set-cookie"));
  if (cookie) return { cookie };
  // The redirect may have been followed, leaving the cookie in the system
  // cookie store rather than in the headers we can see. Ask the API.
  const probe = api("GET", "/settings", null, null);
  if (probe.statusCode === 200) return { cookie: null };
  return { error: `Couldn't sign in to Studio (login ${r.statusCode}, check ${probe.statusCode}). Is CONFIG.blyg right?` };
}

/** Latest public version of a remote (or local) item. */
function fetchTarget(t) {
  const r = HTTP.create().request({ url: `${t.origin}items/${t.id}.json`, method: "GET", headers: { "Accept": "application/json" } });
  if (!r.success) return { error: `Couldn't read the item you're responding to (${r.statusCode}). Is the first line its permalink?` };
  let doc;
  try { doc = JSON.parse(r.responseText); } catch (e) { return { error: "The item you're responding to isn't a blyg item document." }; }
  if (doc.kind === "withdrawn") return { error: "That item has been withdrawn; there's nothing to respond to." };
  if (!Number.isInteger(doc.version) || doc.version < 1) return { error: "That item document has no usable version." };
  return { ref: { origin: doc.origin || t.origin, id: doc.id || t.id, version: doc.version } };
}

function main() {
  if (CONFIG.blyg.includes("example.com") || !apiRoot()) return fail("Set CONFIG.blyg to your blyg's address first.");
  if (CONFIG.mode !== "publish" && CONFIG.mode !== "draft") return fail('CONFIG.mode must be "publish" or "draft".');

  const text = draft.content.trim();
  if (!text) return fail("Empty draft.");
  if (draft.hasTag(DONE_TAG)) return fail("Already sent. Duplicate the draft to send it again.");

  const target = parseTarget(text);
  const words = target ? target.body : text;
  if (!words) return fail("Add your commentary below the link.");
  if (words.length > CONFIG.maxChars) return fail(`${words.length} chars, over the ${CONFIG.maxChars} cap.`);

  const cred = Credential.create(
    `Blygger Studio ${blygBase()}`,
    "Your Studio owner password (the one you sign in to /studio with)."
  );
  cred.addPasswordField("password", "Password");
  if (!cred.authorize()) return fail("No Studio password provided.");

  let body;
  if (target) {
    const t = fetchTarget(target);
    if (t.error) return fail(t.error);
    body = { mode: "blank", kind: "thread", content_md: words, stub_of: t.ref };
  } else {
    body = { mode: "blank", kind: "fragment", content_md: words };
  }

  const session = login(cred.getValue("password"));
  if (session.error) return fail(session.error);

  const created = api("POST", "/items", body, session.cookie);
  if (created.statusCode !== 201) {
    console.log(created.responseText);
    return fail(apiError(created, "Creating the item"));
  }
  const item = JSON.parse(created.responseText);
  const page = blygBase() + (item.kind === "thread" ? "t/" : "f/") + item.id + "/";

  if (CONFIG.mode === "publish") {
    const pub = api("POST", `/items/${item.id}/publish`, {}, session.cookie);
    if (!pub.success) {
      console.log(pub.responseText);
      return fail(apiError(pub, `Publishing (draft ${item.id} was saved in Studio)`));
    }
  }

  draft.addTag(DONE_TAG);
  draft.update();
  console.log(page);
  app.displaySuccessMessage(CONFIG.mode === "publish" ? (target ? "Response published" : "Published") : "Saved to Studio");
}

main();
