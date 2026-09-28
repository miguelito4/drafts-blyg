// Minimal mock of the Drafts scripting runtime, enough to run the action in Node.
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const SCRIPT = fs.readFileSync(path.join(here, "../src/publish-to-blyg.js"), "utf8");

// http: (req) => ({ success, statusCode, responseText })
export function runAction({ content, tags = [], token = "tok", config = {}, http, noBase64 = false }) {
  const out = { requests: [], errors: [], successes: [], failed: false, tags: [...tags], updated: false };

  const draft = {
    content,
    hasTag: (t) => out.tags.includes(t),
    addTag: (t) => { if (!out.tags.includes(t)) out.tags.push(t); },
    update: () => { out.updated = true; },
  };
  const context = {
    fail: (m) => { out.failed = true; out.failMessage = m; },
    cancel: () => { out.cancelled = true; },
  };
  const app = {
    displayErrorMessage: (m) => out.errors.push(m),
    displaySuccessMessage: (m) => out.successes.push(m),
  };
  const Credential = {
    create: (name, desc) => {
      out.credentialName = name;
      return {
        addPasswordField: () => {},
        authorize: () => token !== null,
        getValue: () => token,
      };
    },
  };
  const HTTP = {
    create: () => ({
      request: (req) => {
        out.requests.push(req);
        return http ? http(req) : { success: true, statusCode: 201, responseText: "{}" };
      },
    }),
  };
  // Drafts' Base64.encode takes a JS string; encode as UTF-8.
  const Base64 = {
    encode: (s) => Buffer.from(s, "utf8").toString("base64"),
    decode: (b) => Buffer.from(b, "base64").toString("utf8"),
  };
  const logs = [];
  const sandbox = {
    draft, context, app, Credential, HTTP, ...(noBase64 ? {} : { Base64 }),
    console: { log: (...a) => logs.push(a.join(" ")) },
    BLYG_CONFIG_OVERRIDE: { owner: "testuser", repo: "testsite", ...config },
    Date,
  };
  vm.runInNewContext(SCRIPT, sandbox, { filename: "publish-to-blyg.js" });
  out.logs = logs;
  return out;
}
