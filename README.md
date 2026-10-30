# Ora

A personal cycling dashboard built on [intervals.icu](https://intervals.icu): daily readiness and check-in, rides,
calendar, power analysis, and GPS segments with maps and altimetry.

Ora is a **web app (PWA)**. There is no server and no account: it runs in your browser, talks directly to
intervals.icu with your own API key, and keeps its data on your device. The same app works on Ubuntu, Android, iOS,
macOS and Windows.

> Tested so far in Firefox/Zen (Ubuntu) and Chromium at phone size. iOS, macOS and Windows should work the same way
> but haven't been tested yet.

---

## What you need

- An **intervals.icu account** and its **API key**: intervals.icu → Settings → *Developer Settings* → API key.
- The **web address of your Ora site**, e.g. `https://ora-xxxx.pages.dev`. See
  [Hosting](#hosting-your-own-copy) to set one up (free, about 10 minutes). Phones need it, because installing an app on
  a phone requires HTTPS.
- *(Optional)* A **GitHub token** to sync saved segments between your devices. See [First run](#first-run).

---

## Install on each platform

Open your Ora address in the browser, then:

### Ubuntu

| Browser | How |
|---|---|
| **Zen** | Right-click the tab → **Add to Essentials**. It stays one click away in every workspace. |
| **Firefox** | Right-click the tab → **Pin Tab**. |
| **Chrome / Chromium** | Click the install icon at the right of the address bar → **Install**. Ora opens in its own window and appears in the app launcher. |

Firefox-based browsers (Zen, Firefox) can't install web apps as separate windows on Linux, so a pinned tab is the way.
Offline use works the same.

### Android

| Browser | How |
|---|---|
| **Chrome** | Menu **⋮** → **Add to Home screen** → **Install**. |
| **Firefox** | Menu **⋮** → **Add to Home screen**. |

Ora then opens full-screen from its icon, like any app.

### iOS (iPhone / iPad)

1. Open the address in **Safari**.
2. Tap **Share** (square with arrow) → **Add to Home Screen** → **Add**.
3. Open Ora from the new icon.

Use the Home Screen icon rather than a Safari tab. iOS keeps Home Screen apps' storage more reliably than ordinary
websites, which Safari may clear after a few weeks without use. If that ever happens, nothing is lost: see
[Your data](#your-data).

### macOS

| Browser | How |
|---|---|
| **Safari** (macOS 14 Sonoma or later) | **File → Add to Dock**. |
| **Chrome / Edge** | Install icon at the right of the address bar → **Install**. |
| **Firefox** | Right-click the tab → **Pin Tab**. |

### Windows

| Browser | How |
|---|---|
| **Edge** | Menu **…** → **Apps** → **Install this site as an app**. Optionally pin it to the taskbar or Start. |
| **Chrome** | Install icon at the right of the address bar → **Install**. |
| **Firefox** | Right-click the tab → **Pin Tab**. |

---

## First run

Ora opens on **Settings** until it has a key.

1. **intervals.icu**: paste your API key → **Save & connect**. It shows "Connected as *your name*".
2. **Segment sync (GitHub Gist)** *(optional, recommended)*: create a token as described in
   [GitHub token for segment sync](#github-token-for-segment-sync), paste it → **Save & sync**. Ora creates a
   secret gist "Ora — saved segments". Use the same token on every device.
3. **Segment analysis**: choose how much history to analyse (1, 2, 5 years or all). The first time you open
   **Segments**, each outdoor ride is downloaded once and analysed on the device. More history takes longer, and on a
   phone it uses mobile data, so a Wi-Fi connection is better for the first run.

Repeat steps 1–2 on each device. Each device keeps its own copy of the key and token.

**Phone setup by QR:** once Ora is hosted, open **Settings → Copy setup to phone** on the PC, press **Show QR** and
scan it with the phone's camera. The phone opens Ora with the key, token and history setting already filled in. The
keys travel only inside the link (after `#`, never sent to any server), and the code hides itself after a minute. On
iPhone, Home Screen apps keep their own storage, so enter the keys in the installed app instead.

**Updates** reach every device automatically: when a new version is published, Ora shows a
"New version available → Reload" message.

### GitHub token for segment sync

Saved segments (stars, manual segments, names you type) sync between devices through a secret gist on your GitHub
account. It's free, and the token can only touch gists.

1. Sign in to [github.com](https://github.com) (create a free account if you don't have one).
2. Click your avatar (top right) → **Settings** → **Developer settings** (bottom of the left menu) →
   **Personal access tokens** → **Fine-grained tokens** → **Generate new token**
   (direct link: [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new)).
3. Fill in:
   - **Token name:** `Ora segments`
   - **Expiration:** 1 year. You'll create a new one when it expires.
   - **Repository access:** leave the default. Gists aren't repositories.
   - **Permissions → Account permissions → Gists:** **Read and write**. Leave everything else at *No access*.
4. Click **Generate token** and **copy it now**. It starts with `github_pat_` and GitHub shows it only once.
5. In Ora: **Settings → Segment sync (GitHub Gist)** → paste → **Save & sync**. You should see
   "Connected as *your-username*".
6. On your other devices, paste the **same token**. Ora finds the existing gist, so all devices share one list.

You can see the gist at [gist.github.com](https://gist.github.com): one file, `cadence-segments.json`, holding only
segment names and start/finish coordinates. Secret gists are unlisted, but anyone with the exact link can open one.

**When the token expires**, sync stops and Ora keeps working with what each device has. Create a new token
(steps 2–4) and paste it on each device; the existing gist is reused.

---

## Your data

| What | Where |
|---|---|
| Rides, wellness, check-ins, manual workouts | **intervals.icu**: the single source of truth. Ora reads it and writes check-ins and manual workouts there. |
| Saved segments (stars, manual segments, your names) | The browser on each device, **backed up to your private GitHub gist** when sync is on |
| Segment analysis, downloaded rides, offline copy of recent data | The browser on each device (IndexedDB), about 15 MB per year of riding plus about 20 MB of cache |
| API key and GitHub token | The browser on each device. They are never sent anywhere except intervals.icu and GitHub. |

The hosting site only serves the app's files; it never sees your data.

If a browser's storage is wiped, enter the key (and token) again and open Segments once. Everything comes back from
intervals.icu and the gist.

**Several people** can use the same Ora address, each on their own device or browser profile with their own key.
Two people sharing **one** browser profile isn't supported: their data would mix.

---

## Hosting your own copy

Ora is a static site. Any static host with HTTPS works; Cloudflare Pages is free and simple:

1. Put the code in a GitHub repository (this one).
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → pick the repository.
3. Build settings:
   - Framework preset: **Vite**
   - Build command: `npm run build`
   - Output directory: `dist`
   - Environment variable: `NODE_VERSION` = `22`
4. **Save and Deploy**. You get an address like `https://ora-xxxx.pages.dev`. Every push to `main` redeploys
   automatically, and installed copies pick up the update.

`public/_redirects` already sends every path to the app, so links like `/rides/123` work when opened directly.

---

## Running it locally (development)

Needs **Node.js 22**.

```bash
npm install          # Ubuntu's npm 9 crashes on this project: use `npx npm@10 install` instead
npm run dev          # http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run dev` | Development server with live reload |
| `npm run build` | Type-check and build the production site into `dist/` |
| `npm run preview` | Serve the production build locally (includes offline/PWA behaviour) |
| `npm test` | Unit tests (Vitest) |
| `npm run lint` | ESLint |
| `npm run icons` | Regenerate the app icons from `public/icon.svg` |

`.npmrc` sets `legacy-peer-deps=true` on purpose: npm's peer resolver crashes on this dependency tree.

### Project layout

```
src/
  routes/       pages (file-based routing: Today, Rides, Calendar, Analysis, Segments, Body, Settings)
  components/   UI pieces (maps, profiles, charts, check-in, …)
  hooks/        React hooks (segments, names, online state)
  lib/          logic: intervals.icu client, readiness, climbs, segment engine, analysis …
public/         icons, _redirects
```

---

## Troubleshooting

- **"intervals.icu didn't accept the API key"**: copy the key again from intervals.icu → Settings → Developer Settings.
- **A page is blank or "isn't cached yet" when offline**: Ora can only show offline what it fetched at least once.
  Open that page once while online.
- **Segments list is empty**: open Segments while online and wait for the analysis progress bar to finish.
  Auto-detected climbs need at least two rides through them.
- **Saved segments differ between devices**: check that both devices use a GitHub token (Settings → Segment sync)
  and press **Save & sync**.
- **Install option missing on the phone**: the site must be opened over `https://`; a local `http://` address can't be
  installed.
