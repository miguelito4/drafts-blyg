# drafts-blyg

Publish to your [Blygger](https://blygger.org) blyg from your phone as easily as posting a tweet: open a blank draft, type, tap **Blyg**.

Two [Drafts](https://getdrafts.com) actions, one per kind of blyg. Each is a single script with no server, no plugin and no app of its own.

| Your blyg runs on… | Use | How it publishes |
|---|---|---|
| **Blygger Studio** 0.9 or later (most blygs) | [`publish-to-studio.js`](src/publish-to-studio.js) — **Install:** [Drafts Directory](https://directory.getdrafts.com/a/27v) | Studio's documented owner API: signs in, creates the item, publishes it |
| **A static site built from a git repo** | [`publish-to-blyg.js`](src/publish-to-blyg.js) — **Install:** [Drafts Directory](https://directory.getdrafts.com/a/27p) | GitHub Contents API: commits a file, and your deploy does the rest |

Not sure? `curl -s https://your-blyg/blyg.json` and look at `generator`. `blygger-studio/…` means Studio.

## Studio action

```
Drafts → {blyg}/studio/login → POST /api/items → POST /api/items/{id}/publish → live
```

No build, no deploy wait: the item is live as soon as Studio publishes it. Tested end to end against Blygger Studio 0.21.

### What it does

- **A plain draft becomes a fragment.**
- **A draft whose first line is a blyg permalink becomes a response to that item** — the protocol-native quote-tweet. Put the link on line one and your commentary below it:

  ```
  https://venkateshrao.com/blyg/t/0y21j92gkdnw73nr7ryev4nncs/

  Your commentary here.
  ```

  The action reads the item's current version from its origin and creates a thread that declares `stub_of` that item. Studio composes the citation, and sends a Webmention if the other blyg accepts them. You don't have to subscribe to the other blyg first. The response cites the item; it doesn't transclude (quote) it — for that, subscribe in Studio and respond from there.
- **Draft mode** (`mode: "draft"`) saves to Studio without publishing, so you can finish on a bigger screen. Duplicate the action to have both.

### Setup

1. Install from the [Drafts Directory](https://directory.getdrafts.com/a/27v), or in Drafts: new action, one **Script** step, paste [`src/publish-to-studio.js`](src/publish-to-studio.js) into the step's editor (not the action's description box).
2. Edit `CONFIG`:

   | key | meaning |
   |---|---|
   | `blyg` | your blyg's public address, including any mount path: `https://blyg.example.com/` or `https://example.com/blyg/` |
   | `mode` | `"publish"` or `"draft"` |
   | `maxChars` | length cap; default 1,000, the spec's recommended studio cap |

3. Options: **Action Bar › Label** `Blyg`, **After Success › Move** Trash, *Confirm before running* off, *Allow asynchronous execution* off.
4. First run: Drafts asks for your **Studio password** once per device and keeps it in its credential store.
5. **Sanity check:** run it on an empty draft. A red **"Empty draft."** banner means the right script is wired to the button.

### How it signs in

Studio's API uses its owner session cookie (OAuth for external clients is on Studio's roadmap). The action signs in at `{blyg}/studio/login` on every run, the same way [Burrow](https://github.com/aneeshsathe/blygger-desktop) does, and never stores the session. The owner API is host-rooted (`https://host/api`), so path-mounted blygs work.

Your Studio password grants full owner access to your blyg. Drafts keeps it in the device keychain; still, only use this on devices you control. When Studio ships OAuth, this action will move to it.

### Errors

| Banner | Meaning |
|---|---|
| Wrong Studio password | Forget it under Drafts › Settings › Credentials and run again |
| …needs Blygger Studio 0.9 or later (404) | Your server predates the documented API, or `CONFIG.blyg` is wrong |
| Couldn't read the item you're responding to | Line one isn't a blyg permalink, or that origin is down |
| Publishing failed (draft … was saved in Studio) | The item exists as a draft; finish it in Studio |

## GitHub action (static blygs)

**Install:** [Publish to blyg in the Drafts Directory](https://directory.getdrafts.com/a/27p), then follow [Setup](#setup-1) to create a token and fill in `CONFIG`.

```
Drafts → GitHub Contents API (PUT) → commit to your site repo → your build/deploy → yoursite/blyg
```

Used in production at [caseyjr.org/blyg](https://caseyjr.org/blyg), an Astro site on Cloudflare.

### Requirements

- **Drafts Pro**, which you need to create custom actions. Actions sync between iPhone, iPad and Mac.
- **A GitHub repo whose build turns files in a folder into a conformant `/blyg`.** This action only writes the files; rendering the feed is your site's job.

### Which setup do you need?

| Your site… | Set `dir` to | Extra step |
|---|---|---|
| builds fragments from plain files and adds nothing at commit time | your fragments folder | none |
| stamps fragments at commit time (a pre-commit hook assigns ids, versions, hashes) | `blyg-inbox` | add the [inbox workflow](#sites-that-stamp-at-commit-time) |

If you're unsure, check for a `.githooks/`, `.husky/` or `pre-commit` setup that touches your fragments. **API commits never run local hooks.**

### Setup

Allow about 15 minutes. Do it on the Mac if you have Drafts there; the action syncs to your phone.

#### 1. Token

On GitHub, go to Settings › Developer settings › Personal access tokens › **Fine-grained tokens**, or go straight to `github.com/settings/personal-access-tokens/new`.

- **Repository access:** *Only select repositories*, then pick your site repo.
- **Permissions:** set *Contents* to **Read and write** and leave everything else at No access.
- Copy the token (it starts with `github_pat_`). You'll paste it the first time you run the action on each device.

#### 2. Action

1. In Drafts, open the action list, pick or create a group for it, then click **+** › **New Action**. Name it *Publish to blyg*.
2. **Steps** › **+** › **Script**. Then **click the Script step** and paste [`src/publish-to-blyg.js`](src/publish-to-blyg.js) into the step's editor. The large text box under the action name is the *description*, not the script.
3. Edit `CONFIG` at the top of the script:

   | key | meaning |
   |---|---|
   | `owner`, `repo` | where your site lives |
   | `branch` | branch your deploy builds from |
   | `dir` | fragments folder, or `blyg-inbox` (see the table above) |
   | `maxChars` | length cap; keep it at or below your site's own limit |
   | `frontmatter` | `true` only if your build needs frontmatter *and* nothing else adds it; writes `created:` |

4. Set the options:
   - **Action Bar › Label:** `Blyg`, and tick *Show icon*. Without a label, the action bar button renders blank.
   - **After Success › Move:** Trash. The editor then clears like a tweet composer.
   - Leave *Confirm before running* **off** and *Allow asynchronous execution* **off**.

#### 3. Phone

1. Open a draft and tap the icon at the far left of the row above the keyboard to switch the action bar to your action's group. The **Blyg** button should appear.
2. Optionally, go to Settings › Action Button › Shortcut and choose Drafts' **New Draft**.
3. **Sanity check:** tap **Blyg** on an *empty* draft. You should see a red **"Empty draft."** banner. A green check means the button is running some other action.

### Use

Press the Action Button, type, and tap **Blyg**. The fragment is live after your next deploy, usually a minute or two.

### Sites that stamp at commit time

Copy [`examples/blyg-inbox.yml`](examples/blyg-inbox.yml) to `.github/workflows/`, and fill in the `TODO`s: your fragments folder, your hooks directory, and the install step your stamper needs. Then set `dir: "blyg-inbox"` in the action.

On each push to the inbox, the workflow moves the files into your fragments folder and commits with your hooks enabled. That way the **same stamper** runs in CI as on your laptop. If the stamper rejects a fragment, the run goes red and the file waits in the inbox. Nothing broken reaches the site.

If you use Cloudflare Pages, exclude `blyg-inbox/**` in *Build watch paths* so the inbox commit doesn't trigger a no-op build.

#### Test without publishing anything

Published fragments are usually permanent. To test the whole pipeline safely, send a draft your build skips:

```
---
draft: true
---
pipeline test
```

Check that the workflow run is green and that the file landed in your fragments folder unstamped, then delete it.

### Guardrails

- The action refuses empty drafts, drafts over `maxChars`, drafts it has already published, and an unconfigured script.
- Each error has a plain reason: a bad token (401), missing permission (403), wrong repo, branch or path (404), or an existing file (422). Failed drafts are left untouched, so you can simply retry.
- The filename is a UTC timestamp (`20260927T194200Z.md`), which is unique and sortable. Never rename a published file if your build derives ids from it.

### Troubleshooting

| Symptom | Cause |
|---|---|
| Action does nothing, "succeeds" instantly | The script was pasted into the description, not the Script step; or the button belongs to a different, empty action |
| Button in the action bar is blank | Action Bar *Label* is empty |
| Action missing on the phone | iCloud sync lag (force-quit Drafts), or it's in a group that isn't selected in the action bar |
| No token prompt on a new device | Credentials are stored per device; forget it under Drafts › Settings › Credentials to re-enter |
| Build fails with "unstamped" or schema errors | Your site stamps at commit time; use the inbox workflow |

Don't delete a misbehaving action to "reset" it: deletions sync to every device.

## Development

```sh
npm test                      # unit tests for both actions against a mocked Drafts runtime
GITHUB_TOKEN=… TEST_OWNER=you TEST_REPO=blyg-sandbox npm run test:live
STUDIO_URL=http://localhost:8787/ STUDIO_PASSWORD=… npm run test:studio
```

`test:live` runs the GitHub action against a **throwaway** repo and cleans up after itself. `test:studio` runs the Studio action against a **local or throwaway** Studio (`wrangler dev` in a [blygger-studio](https://github.com/blygger/blygger-studio) checkout works): it publishes a fragment, responds to it, saves a draft and tries a wrong password, once with a client that exposes the login redirect's cookie and once with one that follows the redirect into a cookie store. It publishes real items, and published items are permanent, so never point it at your real blyg.

## Not yet

- Revising or withdrawing from the phone (Studio's API supports both; the action doesn't yet).
- OAuth sign-in for the Studio action, once Studio ships it.
- An iOS Shortcuts version.

## License and disclaimer

MIT. **No warranty of any kind. Use at your own risk.** This action commits to your repository with a token you supply, and you are responsible for that token, what it can access, and what gets published.
