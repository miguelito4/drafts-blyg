// Publish to blyg — a Drafts action that posts the current draft as a
// Blygger fragment by committing it to your site's GitHub repo.
// Paste this into a single Script step. Edit CONFIG below.

// ---- config ----
const CONFIG = Object.assign({
  owner: "YOUR_GITHUB_USER",   // GitHub user or org that owns the site repo
  repo: "YOUR_SITE_REPO",      // repo your blyg is built from
  branch: "main",              // branch your deploy builds from
  dir: "content/blyg",         // folder where fragment files live
  ext: ".md",
  maxChars: 500,               // fragments are tweet-sized; refuse longer
  frontmatter: false,          // true if your build does NOT add frontmatter
  commitPrefix: "blyg: ",
}, typeof BLYG_CONFIG_OVERRIDE !== "undefined" ? BLYG_CONFIG_OVERRIDE : {});
// ---- end config ----

const PUBLISHED_TAG = "blyg-published";

function fail(msg) {
  app.displayErrorMessage(msg);
  context.fail(msg);
}

// UTC, sortable, becomes the fragment's permanent ID: 20260927T194200Z
function idFromDate(d) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}

// Use Drafts' Base64 if present; otherwise a UTF-8-safe fallback.
function b64(str) {
  if (typeof Base64 !== "undefined" && Base64.encode) return Base64.encode(str);
  const bytes = unescape(encodeURIComponent(str));
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes.charCodeAt(i) << 16) | ((bytes.charCodeAt(i + 1) || 0) << 8) | (bytes.charCodeAt(i + 2) || 0);
    out += A[(n >> 18) & 63] + A[(n >> 12) & 63] +
      (i + 1 < bytes.length ? A[(n >> 6) & 63] : "=") +
      (i + 2 < bytes.length ? A[n & 63] : "=");
  }
  return out;
}

function buildBody(text, d) {
  if (!CONFIG.frontmatter) return text + "\n";
  return `---\ncreated: ${d.toISOString()}\n---\n\n${text}\n`;
}

function explain(status) {
  switch (status) {
    case 401: return "GitHub rejected the token (401). Re-enter it: Drafts › Settings › Credentials.";
    case 403: return "Token lacks permission (403). It needs Contents: read & write on this repo.";
    case 404: return "Repo, branch or path not found (404). Check owner/repo/branch, and that the token can see the repo.";
    case 409:
    case 422: return `GitHub refused the write (${status}). A file with this ID may already exist.`;
    default:  return `GitHub error ${status}. See the action log.`;
  }
}

function main() {
  if (CONFIG.owner.startsWith("YOUR_") || CONFIG.repo.startsWith("YOUR_")) {
    return fail("Set owner and repo in the action's CONFIG first.");
  }

  const text = draft.content.trim();
  if (!text) return fail("Empty draft.");
  if (draft.hasTag(PUBLISHED_TAG)) return fail("Already published. Duplicate the draft to post again.");
  if (text.length > CONFIG.maxChars) {
    return fail(`${text.length} chars, over the ${CONFIG.maxChars} cap.`);
  }

  const cred = Credential.create(
    `GitHub blyg ${CONFIG.owner}/${CONFIG.repo}`,
    `Fine-grained token with access only to ${CONFIG.owner}/${CONFIG.repo}, Contents: read & write.`
  );
  cred.addPasswordField("token", "Token");
  if (!cred.authorize()) return fail("No GitHub token provided.");

  const now = new Date();
  const id = idFromDate(now);
  const path = `${CONFIG.dir.replace(/\/+$/, "")}/${id}${CONFIG.ext}`;

  const resp = HTTP.create().request({
    url: `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${path}`,
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${cred.getValue("token")}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    data: {
      message: CONFIG.commitPrefix + text.replace(/\s+/g, " ").slice(0, 60),
      content: b64(buildBody(text, now)),
      branch: CONFIG.branch,
    },
  });

  if (resp.success) {
    draft.addTag(PUBLISHED_TAG);
    draft.update();
    app.displaySuccessMessage(`Published ${id}`);
  } else {
    console.log(resp.responseText);
    fail(explain(resp.statusCode));
  }
}

main();
