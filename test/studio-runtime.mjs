// Mock of the Drafts scripting runtime for src/publish-to-studio.js.
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const STUDIO_SCRIPT = fs.readFileSync(path.join(here, "../src/publish-to-studio.js"), "utf8");

// http: (req, client) => ({ success, statusCode, responseText, headers })
// client.followRedirects reflects what the script set on that HTTP object.
export function runStudioAction({ content, tags = [], password = "pw", config = {}, http }) {
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
    create: (name) => {
      out.credentialName = name;
      return { addPasswordField: () => {}, authorize: () => password !== null, getValue: () => password };
    },
  };
  const HTTP = {
    create: () => {
      const client = {
        followRedirects: true,
        request(req) {
          out.requests.push({ ...req, followRedirects: client.followRedirects });
          return http(req, client);
        },
      };
      return client;
    },
  };
  const logs = [];
  vm.runInNewContext(STUDIO_SCRIPT, {
    draft, context, app, Credential, HTTP,
    console: { log: (...a) => logs.push(a.join(" ")) },
    BLYG_CONFIG_OVERRIDE: { blyg: "https://blyg.test/", ...config },
  }, { filename: "publish-to-studio.js" });
  out.logs = logs;
  return out;
}
