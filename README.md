# drafts-blyg

Publish [Blygger](https://blygger.org) fragments from your phone as easily as posting a tweet: open a blank draft, type, tap **Blyg**.

It's a single [Drafts](https://getdrafts.com) action. It needs no server, no plugin, and no app of its own. The action commits your draft to your site's GitHub repo, and your existing deploy does the rest.

```
Drafts → GitHub Contents API (PUT) → commit to your site repo → your build/deploy → yoursite/blyg
```

Used in production at [caseyjr.org/blyg](https://caseyjr.org/blyg), an Astro site on Cloudflare Pages.

## Requirements

- **Drafts Pro**, which you need to create custom actions. Actions sync between iPhone, iPad and Mac.
- **A GitHub repo whose build turns files in a folder into a conformant `/blyg`.** This action only writes the files; rendering the feed is your site's job.

## Which setup do you need?

| Your site… | Set `dir` to | Extra step |
|---|---|---|
| builds fragments from plain files and adds nothing at commit time | your fragments folder | none |
| stamps fragments at commit time (a pre-commit hook assigns ids, versions, hashes) | `blyg-inbox` | add the [inbox workflow](#sites-that-stamp-at-commit-time) |

If you're unsure, check for a `.githooks/`, `.husky/` or `pre-commit` setup that touches your fragments. **API commits never run local hooks.**

## Setup

Allow about 15 minutes. Do it on the Mac if you have Drafts there; the action syncs to your phone.

### 1. Token

On GitHub, go to Settings › Developer settings › Personal access tokens › **Fine-grained tokens**, or go straight to `github.com/settings/personal-access-tokens/new`.

- **Repository access:** *Only select repositories*, then pick your site repo.
- **Permissions:** set *Contents* to **Read and write** and leave everything else at No access.
- Copy the token (it starts with `github_pat_`). You'll paste it the first time you run the action on each device.

### 2. Action

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

### 3. Phone

1. Open a draft and tap the icon at the far left of the row above the keyboard to switch the action bar to your action's group. The **Blyg** button should appear.
2. Optionally, go to Settings › Action Button › Shortcut and choose Drafts' **New Draft**.
3. **Sanity check:** tap **Blyg** on an *empty* draft. You should see a red **"Empty draft."** banner. A green check means the button is running some other action.

## Use

Press the Action Button, type, and tap **Blyg**. The fragment is live after your next deploy, usually a minute or two.

## Sites that stamp at commit time

Copy [`examples/blyg-inbox.yml`](examples/blyg-inbox.yml) to `.github/workflows/`, and fill in the `TODO`s: your fragments folder, your hooks directory, and the install step your stamper needs. Then set `dir: "blyg-inbox"` in the action.

On each push to the inbox, the workflow moves the files into your fragments folder and commits with your hooks enabled. That way the **same stamper** runs in CI as on your laptop. If the stamper rejects a fragment, the run goes red and the file waits in the inbox. Nothing broken reaches the site.

If you use Cloudflare Pages, exclude `blyg-inbox/**` in *Build watch paths* so the inbox commit doesn't trigger a no-op build.

### Test without publishing anything

Published fragments are usually permanent. To test the whole pipeline safely, send a draft your build skips:

```
---
draft: true
---
pipeline test
```

Check that the workflow run is green and that the file landed in your fragments folder unstamped, then delete it.

## Guardrails

- The action refuses empty drafts, drafts over `maxChars`, drafts it has already published, and an unconfigured script.
- Each error has a plain reason: a bad token (401), missing permission (403), wrong repo, branch or path (404), or an existing file (422). Failed drafts are left untouched, so you can simply retry.
- The filename is a UTC timestamp (`20260927T194200Z.md`), which is unique and sortable. Never rename a published file if your build derives ids from it.

## Troubleshooting

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
npm test                      # unit tests against a mocked Drafts runtime
GITHUB_TOKEN=… TEST_OWNER=you TEST_REPO=blyg-sandbox npm run test:live
```

The live test runs the real script against a **throwaway** repo, reads the file back to check it round-trips (including non-ASCII text), and deletes it.

## Not yet

- Revising or withdrawing a fragment from the phone.
- An iOS Shortcuts version.

## License and disclaimer

MIT. **No warranty of any kind. Use at your own risk.** This action commits to your repository with a token you supply, and you are responsible for that token, what it can access, and what gets published.
