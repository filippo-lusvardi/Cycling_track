# Cirmolo

A personal cycling dashboard built on [intervals.icu](https://intervals.icu): daily readiness and check-in, rides,
calendar, power analysis, and GPS segments with maps and altimetry.

Cirmolo is a **web app (PWA)**. You sign in with an email and password; it runs in your browser, talks directly to
intervals.icu with your own API key, and keeps your key and saved segments in your account (Firebase), so every
device you sign in on is ready at once. The same app works on Ubuntu, Android, iOS,
macOS and Windows.

> Tested so far in Firefox/Zen (Ubuntu) and Chromium at phone size. iOS, macOS and Windows should work the same way
> but haven't been tested yet.

---

## What you need

- An **intervals.icu account** and its **API key** (intervals.icu → Settings → *Developer Settings* → API key), **or**
  no intervals.icu at all: Cirmolo can keep your rides itself, from uploaded ride files (.fit)
  (see [Without intervals.icu](#without-intervalsicu)).
- The **web address of your Cirmolo site**, e.g. `https://ora-xxxx.pages.dev`. See
  [Hosting](#hosting-your-own-copy) to set one up (free, about 10 minutes). Phones need it, because installing an app on
  a phone requires HTTPS.

---

## Install on each platform

Open your Cirmolo address in the browser, then:

### Ubuntu

| Browser | How |
|---|---|
| **Zen** | Right-click the tab → **Add to Essentials**. It stays one click away in every workspace. |
| **Firefox** | Right-click the tab → **Pin Tab**. |
| **Chrome / Chromium** | Click the install icon at the right of the address bar → **Install**. Cirmolo opens in its own window and appears in the app launcher. |

Firefox-based browsers (Zen, Firefox) can't install web apps as separate windows on Linux, so a pinned tab is the way.
Offline use works the same.

### Android

| Browser | How |
|---|---|
| **Chrome** | Menu **⋮** → **Add to Home screen** → **Install**. |
| **Firefox** | Menu **⋮** → **Add to Home screen**. |

Cirmolo then opens full-screen from its icon, like any app.

### iOS (iPhone / iPad)

1. Open the address in **Safari**.
2. Tap **Share** (square with arrow) → **Add to Home Screen** → **Add**.
3. Open Cirmolo from the new icon.

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

Cirmolo opens on **Sign in**.

1. **Create account** with your email and a password (at least 8 characters). *Forgot password?* sends a reset link.
2. **intervals.icu**: paste your API key → **Save & connect**. It shows "Connected as *your name*". The key is saved
   in your account, so other devices pick it up when you sign in there.
3. **Segment analysis**: choose how much history to analyse (1, 2, 5 years or all). The first time you open
   **Segments**, each outdoor ride is downloaded once and analysed on the device. More history takes longer, and on a
   phone it uses mobile data, so a Wi-Fi connection is better for the first run.

On every other device, just sign in with the same account.

**Language:** Cirmolo is in English and Italian. It starts in the browser's language; switch it in
**Settings → Language** (each device remembers its own choice).

**Home** is the first page: your tree and your garden side by side, under the sky of the moment (the real time of
day, with the moon at night; the weather is your form). Tap the tree for the Tree, the garden for the Garden.

**The Garden** is where training off the bike grows (Settings → *How to read the garden*): every run, gym session,
yoga class, hike, swim or ski outing of the last 8 weeks is a plant in its sport's bed (tomatoes, pumpkins, flowers,
herbs, water lilies…), its fruit ripening over the week after. Older months go into the **Pantry**, a jar per month
(the *Garden · Pantry* switch at the bottom). Tap a plant to open its activity.
Settings → *What grows for each sport* picks the plants, and adds sports of your own (padel, tennis…) with a bed each.

**The Tree** grows from your rides only; other sports show as a small sprout on that day's bark and live in the
Garden. Trunk and crown still count all your training. Besides seasons, sky and branches (Settings → *How to read
the tree*), it shows:

- **Knots** for days ill or injured, from *Sick* / *Injured* events in the intervals.icu calendar. Mark today from
  the crown's sheet, or a past run of rest days by tapping it.
- **Wind** in the crown when a trend over several days is worth watching (HRV below your usual for a week, high
  fatigue or stress on most recent check-ins, short nights), before it shows in readiness.
- **Today's ceiling** on easy and endurance days: the power and heart rate to stay under, from your intervals.icu
  zones.
- **Quiet tree** (Settings → Tree) hides the scores on the tree until you tap.
- **Training focus**: what to train in the current block (base, high aerobic, VO2max, anaerobic, sprint). It weighs
  every race in the next 20 weeks (A more than B and C, nearer more than later) against the gaps in your own power
  curve, puts the base first when it's weak, and tapers around races. Add races in **Calendar → a day → Add race** with
  their discipline (road or MTB), kind, estimated time (time trials and hill climbs) and sprint finish; they're saved
  to intervals.icu as A/B/C races, with Cirmolo's details as readable lines in the description.

**Updates** reach every device automatically: when a new version is published, Cirmolo shows a
"New version available → Reload" message.

### Moving from the GitHub gist

Older versions synced saved segments through a secret GitHub gist. The first time you sign in on a device that still
has the GitHub token, Cirmolo copies the gist's segments and place names into your account and forgets the token.
The gist itself is left alone; delete it from [gist.github.com](https://gist.github.com) once you've checked.

---

## Without intervals.icu

In **Settings → No intervals.icu account? → Use Cirmolo without intervals.icu** (after agreeing that Cirmolo stores
your rides and health data), Cirmolo keeps everything in your account and computes what intervals.icu would:
training load (TSS from power and FTP, or from heart rate against threshold heart rate), fitness/fatigue/form,
zones, power curves and eFTP.

- **Settings → Athlete**: weight, FTP (leave empty to use the estimate from the last 42 days), threshold and max
  heart rate. After changing them, **Recalculate all rides**.
- **Ride files**: drop .fit files in Settings or in Calendar → *Log workout*. Garmin and Wahoo files, and Zwift's
  (`Documents/Zwift/Activities`), all work. Delete a wrong one from the ride's page.
- HRV is typed in the daily check-in (nothing brings it in from the watch without intervals.icu).

---

## Forest

**Forest** (the third option of the *Tree · Years · Forest* switch at the bottom of the Tree) is where friends and teammates grow their trees side by side. You can be in
several forests.

- **Plant a forest**, then **Members → Show invite link** and send it. Whoever opens it asks to join (with consent
  to share their tree), and any member lets them in. *New link* makes the old one stop working. Up to 30 trees.
- **Trees**: the forest's members as a little grove, each tree in today's season; tap one to see it whole.
- **What's shared**: each member's own app publishes a copy of their tree into each forest when they open Home or
  the Tree: the rides they show there (cycling only: the garden stays private), daily fitness/fatigue, sick days and today's crown. Heart rate and power
  appear only on ride pages, with **Show my heart rate and power** on (off unless turned on).
  Friends see that tree in plain bark, without numbers.
- **Ride pages**: with **Show my ride maps** on for a forest (asked when joining, or under Members), members can
  open your shared rides of the last year: route and altitude profile without the first and last kilometre.
  Per forest, **Members → Share new rides** and **Show rides from before I joined** (also asked when joining) set what
  shows; a ride's page has **Visible in** to show or hide that one ride, whatever those say.
- **Climbs**: any member adds one of their saved climbs; each member's app finds their efforts on it and publishes
  their best time from the rides they share there.

---

## Your data

| What | Where |
|---|---|
| Rides, wellness, check-ins, manual workouts, ill/injured days | **intervals.icu**: the single source of truth. Cirmolo reads it and writes check-ins, manual workouts and *Sick* / *Injured* calendar events there. |
| Saved segments (stars, manual segments, your names) | **Your account** (Firestore, readable only by you), with a copy on each device for offline use |
| OpenStreetMap place names of climbs | **Shared by all Cirmolo users** (they're public map data), so each climb is looked up once |
| Segment analysis, downloaded rides, offline copy of recent data | The browser on each device (IndexedDB), about 15 MB per year of riding plus about 20 MB of cache |
| intervals.icu API key | **Your account** (Firestore, readable only by you) and the browser on each device. Sent only to intervals.icu. |

The hosting site only serves the app's files; it never sees your data.

If a browser's storage is wiped, sign in again and open Segments once. Everything comes back from intervals.icu and
your account.

**Several people** can use the same Cirmolo address, each with their own account. **Sign out** (Settings → Account)
removes your data from the device, so the next person starts clean. **Delete account** removes your account and
saved segments; nothing on intervals.icu is touched.

---

## Hosting your own copy

Cirmolo is a static site plus a free Firebase project for accounts.

### Firebase (once)

1. [console.firebase.google.com](https://console.firebase.google.com) → **Add project**.
2. **Authentication → Sign-in method → Email/Password**: enable.
3. **Firestore Database → Create database** (production mode, a European region).
4. **Project settings → Your apps → Web app**: register it and copy `apiKey`, `authDomain`, `projectId`, `appId`
   into `.env.local` (not committed):

   ```bash
   VITE_FIREBASE_API_KEY=…
   VITE_FIREBASE_AUTH_DOMAIN=…firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=…
   VITE_FIREBASE_APP_ID=…
   ```

   These values aren't secret (every Firebase web app ships them); the security rules protect the data.
5. Deploy the security rules (set the project id in `.firebaserc` first):

   ```bash
   npm i -g firebase-tools
   firebase login
   firebase deploy --only firestore:rules
   ```

6. **Authentication → Settings → Authorized domains**: add your site's address (e.g. `ora-xxxx.pages.dev`).
   Speed measurements (startup and screen-open times, custom traces only) appear under **Performance** in the
   Firebase console by themselves, about a day after the first visits; users can turn them off in Settings → Account.
7. Set your name and a contact email at the top of `src/routes/privacy.tsx`: the privacy notice (linked from the
   sign-in page and the footer) names you as the one responsible for the account data.

### Cloudflare Pages

1. Put the code in a GitHub repository (this one).
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → pick the repository.
3. Build settings:
   - Framework preset: **Vite**
   - Build command: `npm run build`
   - Output directory: `dist`
   - Environment variables: `NODE_VERSION` = `22`, plus the four `VITE_FIREBASE_*` values from `.env.local`
4. **Save and Deploy**. You get an address like `https://ora-xxxx.pages.dev`. Every push to `main` redeploys
   automatically, and installed copies pick up the update.

No redirect rules are needed: Cloudflare Pages serves the app for every path, so links like `/rides/123` work when
opened directly. (Don't add a `/* /index.html 200` rule: it can make Pages return the page instead of the app's
manifest and service worker, and then the app can't be installed.)

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

To develop without touching the real project, run `firebase emulators:start` and start the app with
`VITE_USE_EMULATORS=1 npm run dev`.

`.npmrc` sets `legacy-peer-deps=true` on purpose: npm's peer resolver crashes on this dependency tree.

### Project layout

```
src/
  routes/       pages (file-based routing: Home, Tree, Garden, Rides, Calendar, Analysis, Segments, Body, Settings)
  components/   UI pieces (maps, profiles, charts, check-in, …)
  hooks/        React hooks (segments, names, online state)
  lib/          logic: intervals.icu client, Firebase (firebase, cloud, account), readiness, climbs, segment engine …
public/         icons, _redirects
```

---

## Troubleshooting

- **"intervals.icu didn't accept the API key"**: copy the key again from intervals.icu → Settings → Developer Settings.
- **A page is blank or "isn't cached yet" when offline**: Cirmolo can only show offline what it fetched at least once.
  Open that page once while online.
- **Segments list is empty**: open Segments while online and wait for the analysis progress bar to finish.
  Auto-detected climbs need at least two rides through them.
- **Segments show numbers instead of place names** (e.g. on a new device or address): Cirmolo looks names up on
  OpenStreetMap about one segment every few seconds, while it's open; the Segments page shows how many are left. Names
  found by anyone appear for everyone the next time they open Cirmolo.
- **Saved segments differ between devices**: check that both are signed in to the same account (Settings → Account).
  Changes made offline go out when the device is back online.
- **Install option missing on the phone**: the site must be opened over `https://`; a local `http://` address can't be
  installed.
