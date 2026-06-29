# Releasing CheapBite

CheapBite ships to the Chrome Web Store via the
[`Release` workflow](../.github/workflows/release.yml). Pushing a `v*` tag
packages `extension/` and publishes it; a GitHub Release is created too.

## Cutting a release

1. Update [`CHANGELOG.md`](../CHANGELOG.md) (move items out of _Unreleased_).
2. Bump the version in **both** `extension/manifest.json` and `package.json`
   (they must match; the store only cares about the manifest). Each store upload
   must be a **strictly higher** version than the last published one.
3. Commit, then tag and push — the tag must equal the manifest version:
   ```bash
   git commit -am "Release v0.1.0"
   git tag v0.1.0
   git push origin main --tags
   ```
4. The workflow verifies tag ↔ manifest, zips the extension, uploads + publishes
   to the Chrome Web Store, and creates the GitHub Release.

**Dry run:** trigger the workflow manually (Actions → Release → _Run workflow_)
with **publish = false** to upload a draft to the dashboard without submitting
it for review.

## One-time setup

### Repository secrets

Add these under **Settings → Secrets and variables → Actions**:

| Secret | What |
| --- | --- |
| `CHROME_EXTENSION_ID` | The item ID from the Web Store dashboard URL |
| `CHROME_CLIENT_ID` | OAuth 2.0 client ID (Desktop app) |
| `CHROME_CLIENT_SECRET` | OAuth 2.0 client secret |
| `CHROME_REFRESH_TOKEN` | Long-lived refresh token |

### Getting the credentials

1. **Create the item once, by hand.** In the
   [Developer Dashboard](https://chrome.google.com/webstore/devconsole) (one-time
   $5 registration), *Add new item*, upload an initial zip (`npm run package`
   produces `dist/cheapbite.zip`), and save. **The API can only _update_ an
   existing item — it can't create the first version.** Copy the item ID →
   `CHROME_EXTENSION_ID`.
2. In [Google Cloud Console](https://console.cloud.google.com): create a project,
   then **APIs & Services → Library → enable "Chrome Web Store API"**.
3. **OAuth consent screen.** ⚠️ If you use a personal `@gmail.com` account, the
   consent screen is _External_ — you **must move it to "In production"** (not
   "Testing"), or the refresh token is **revoked after 7 days** and every release
   breaks until you regenerate it. (Workspace accounts can use _Internal_.)
4. **Credentials → Create credentials → OAuth client ID → Application type:
   Desktop app.** Save the client ID/secret → `CHROME_CLIENT_ID` /
   `CHROME_CLIENT_SECRET`.
5. Generate the refresh token locally:
   ```bash
   npx chrome-webstore-upload-keys
   ```
   Paste the client ID/secret when prompted; approve in the browser; copy the
   printed refresh token → `CHROME_REFRESH_TOKEN`.

## Notes & gotchas

- **Publishing ≠ live.** A successful run means "submitted"; Google review takes
  minutes to a few days.
- **Refresh-token 7-day death** is the #1 failure — see step 3 above.
- **Store-listing assets** (the 128px store icon, screenshots, promo tiles,
  category, and the privacy-policy URL — point it at this repo's
  [`PRIVACY.md`](../PRIVACY.md)) are managed in the dashboard, not this repo.
- The zip must contain `manifest.json` at its **root**; the workflow guarantees
  this by zipping from inside `extension/`. Never zip the repo root.
