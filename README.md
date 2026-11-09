# Cirmolo

A personal training dashboard for cycling or running, with or without [intervals.icu](https://intervals.icu): daily readiness and check-in, activities,
calendar, analysis, and GPS segments with maps and altimetry.

Cirmolo is a **web app (PWA)**. You sign in with an email and password; it runs in your browser, talks directly to
intervals.icu with your own API key, and keeps your key and saved segments in your account (Firebase), so every
device you sign in on is ready at once. The same app works on Ubuntu, Android, iOS,
macOS and Windows.

> Tested so far in Firefox/Zen (Ubuntu) and Chromium at phone size. iOS, macOS and Windows should work the same way
> but haven't been tested yet.

---

## What you need

- An **intervals.icu account** and its **API key** (intervals.icu → Settings → *Developer Settings* → API key), **or**
  no intervals.icu at all: Cirmolo can keep your activities itself, from uploaded activity files (.fit)
  (see [Without intervals.icu](#without-intervalsicu)).
- The **web address of your Cirmolo site**, e.g. `https://cirmolo-xxxx.pages.dev`. See
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
2. **intervals.icu**: paste your API key → **Save & connect**. It shows "Connected to intervals.icu as *your name*". The key is saved
   in your account, so other devices pick it up when you sign in there.
3. **Segment analysis**: choose how much history to analyse (1, 2, 5 years or all). The first time you open
   **Segments**, each outdoor activity is downloaded once and analysed on the device. More history takes longer, and on a
   phone it uses mobile data, so a Wi-Fi connection is better for the first run.

On every other device, just sign in with the same account.

**Language:** Cirmolo is in English and Italian. It starts in the browser's language; switch it in
**Settings → Language** (each device remembers its own choice).

**The Tree** is the first page. **The Garden** is one tap away, under the sky of the moment (the real time of day, with
the moon at night; the weather is your form). **Body** (weight and composition) is a view of **Analysis**.

**Getting around:** at the foot of the screen (at the top on a desktop, where `/` opens it) are the tree, a line to ask on,
and the sprout. Tap the line and type, in your own words and in either language: *sonno*, *vasi*, *marzo*, *gufo*, the
name of an activity or a climb. You get up to three alternatives to choose from, closest to your thumb, ordered in part by your
season of the moment. With nothing typed it offers what fits right now, and says when there's nothing left for today. It
all runs on the device, so it works offline and sends nothing anywhere.

Typing also gets answers. Parameters show their value in the row (*ftp*, *soglia*, *z2*, *fc max*, *fitness*, *peso*, *hrv*).
*Zone* opens Analysis → **Zones**: power and heart rate for cycling, pace and heart rate for running. A chart's name
(*eftp*, *durability*, *curva di potenza*, *sonno*) opens that chart alone. A stretch of time (*domani*, *sabato*, *ultimi 10
giorni*, *mese scorso*, *ottobre*, *2025*) opens a **recap**: what happened, how the body was and what's planned, with arrows
to the stretch before or after. A forest's name, once you've typed three letters, takes you into it.

It also answers your own records and saves what you tell it: *best* + a climb's name, *ultima* + a climb's name, *quante volte* + a climb's name, *best 20
min*, *best 10 km*, *ultima corsa*, *km quest'anno*, *uscita più lunga*, *prossima gara*, *cosa faccio oggi*, *perché*, *mangiare 3
ore*. And *peso 70*, *grasso 15*, *sonno 7h 30*, *malattia oggi*, *fine malattia*, *2 brioche* each offer a row saying what will be
saved; choosing it saves (to intervals.icu, if you use it), and the message that follows has **Undo**. Times come from the
activities already analysed on the device, within the history set in Settings.

*Plan domani* (or *plan sabato*, *plan 12 novembre*) opens the Calendar on that day, ready to choose a workout. *Guida* opens the
Legend, whose **Search** tab explains all of this.

**How it felt:** each activity's page asks how it went, from Strong to Weak (saved as intervals.icu's Feel; also *sensazione
buona* in the bar). The last three days' ratings, today's most, are a part of the crown, and they can move the sky by a few points of
form. Unrated, they have no say.

**Splits:** a run's page shows each kilometre's pace, net climb and heart rate, leaving out stops. With a threshold pace, each bar
takes the colour of its zone, measured on grade-adjusted pace like the zones panel.

**Your own pages:** the recap and activity pages have **Customize**: choose which sections and numbers show, in what order, and what
stays closed. A day, a week, a month, a longer stretch, and each sport keep their own layout, which follows your account.
On the Tree, a week's branch opens that week's recap, and a month's name that month's. **All** lists every page, sorted by today, before
and ahead. The **Legend** (type *legenda*, or a part of the tree) labels a sample tree and appears once on each device.

**The Garden** is where the sports you do grow (Settings → *How to read the garden*). It starts empty: the first activity
of a new sport gives it a bed, with a vegetable picked at random among those not in use. Every session of those sports
in the last 8 weeks is a plant in its bed, its fruit ripening over the week after. In Settings → *What grows in the
garden* you can change a sport's vegetable or remove it (it stays out until added again), and *Add a sport* adds one by
hand, from the list or by a name of your own (padel, tennis…). Older months go into the **Pantry**, a jar per month
(type *dispensa*, or pinch out from the Garden). Tap a plant to open its activity, or a jar to list that month's
activities and open it in the calendar.
Tracking one sport only? Settings → *Show the Garden* turns it off: the Garden leaves the app and the sprouts leave the
tree. Nothing is deleted.

**The Tree** grows from your main sport only; the Garden's sports show as a small sprout on that day's bark. Trunk and crown still count all your training. Besides seasons, sky and branches (Settings → *How to read
the tree*), it shows:

- **Knots** for days ill or injured, from *Sick* / *Injured* events in the intervals.icu calendar. Mark today from
  the crown's sheet, or a past run of rest days by tapping it.
- **Wind** in the crown when a trend over several days is worth watching (HRV below your usual for a week, high
  fatigue or stress on most recent check-ins, short nights), before it shows in readiness.
- **Today's ceiling** on easy and endurance days: the power (or pace) and heart rate to keep to, from your
  zones.
- **Quiet tree** (Settings → Tree) hides the scores on the tree until you tap.
- **Phone launcher** (Settings → Tree): **Create link** gives a link a phone launcher (like Minimal) reads today's season from, to take its colour. Whoever has the link sees the season and nothing else; **Stop** deletes it. The season goes out when Cirmolo works out today's tree, on any device, at most once a day unless it changes.
- **Morning check-in** (Settings → Tree) can be turned off: it's no longer asked, and the crown comes from HRV,
  sleep, form and how your activities felt. A check-in skipped for a day works the same way: its part drops out and the others share its weight.
- **Training focus**: what to train in the current block (base, high aerobic, VO2max, anaerobic, sprint). It weighs
  every race in the next 20 weeks (A more than B and C, nearer more than later) against the gaps in your own power
  curve, puts the base first when it's weak, and tapers around races. Add races in **Calendar → a day → Add race** with
  their discipline (road or MTB), kind, estimated time (time trials and hill climbs) and sprint finish; they're saved
  to intervals.icu as A/B/C races, with Cirmolo's details as readable lines in the description.

**Updates** reach every device automatically: when a new version is published, Cirmolo shows a
"New version available → Reload" message.

---

## Without intervals.icu

In **Settings → No intervals.icu account? → Use Cirmolo without intervals.icu** (after agreeing that Cirmolo stores
your activities and health data), Cirmolo keeps everything in your account and computes what intervals.icu would:
training load (TSS from power and FTP, or from heart rate against threshold heart rate), fitness/fatigue/form,
zones, power curves and eFTP.

- **Settings → Athlete**: weight, FTP (leave empty to use the estimate from the last 42 days), threshold and max
  heart rate. After changing them, **Recalculate all activities**.
- **Activity files**: drop .fit files in Settings or in Calendar → *Log workout*. Garmin and Wahoo files, and Zwift's
  (`Documents/Zwift/Activities`), all work. Delete a wrong one from the activity's page.
- HRV is typed in the daily check-in (nothing brings it in from the watch without intervals.icu).

---

## Thresholds and zones

| | With intervals.icu | Without it |
|---|---|---|
| **FTP, threshold and max heart rate** | Read from intervals.icu. Editing them in Settings writes them there, after showing what changes | Typed in Settings; FTP estimated from your last 42 days if empty |
| **Threshold pace** | Typed in Settings, or estimated from your last 90 days of runs | The same |
| **Power and heart-rate zones** | Edited on intervals.icu | Follow the threshold; Settings → *Zones* sets where each ends |
| **Pace zones** | Follow Cirmolo's threshold pace; Settings → *Zones* sets where each ends. Not sent to intervals.icu | The same |

Cirmolo has no connection to Garmin or other devices: neither reads zones from them nor sends any.

---

## Workouts

**Workouts** (type *allenamenti*, or find it under *All*) is your workout library, one for each sport. With intervals.icu it's your real intervals.icu
library, and new workouts go in a *Cirmolo* folder there; without it, the library is kept in your account. Write steps in
the intervals.icu builder's syntax and the blocks draw as you type:

```
Warmup
- 15m Ramp 50-75%

Main set 5x
- 4m 115%
- 4m 50%

Cooldown
- 10m 50%
```

Targets can be `60%`, `80-90%`, `Z2`, `200w`, `90% LTHR`, `95% Pace` or `4:30/km`. *Starter workouts*, listed by kind (recovery,
endurance, threshold…), are there to copy.
Tap a workout to add it to the calendar, or use **Plan a workout** on a day in the Calendar. Planned workouts show as
blocks in the Calendar and on the Tree; heart-rate targets are drawn approximately.

---

## Training plan

**Plan** (type *piano*) builds your cycling weeks from the days and hours you have, and adjusts them from how your rides went.
Sessions already on the calendar change only when you accept a proposal.

The goal can be one race, getting better, staying well, or **a season** (type *stagione*). Choose a season in winter, when the
calendars aren't out yet:

- **The months your goals are in**: tap them on the strip. Months next to each other make one period, and you can have more
  than one.
- **The kinds of race**, if you know them. They set what the hard sessions work on and how long the long ride is.
- **Hours a week**: where you start and how far you climb. The start is suggested from last year's best four weeks and the
  time left. You can aim 5–15% over that best month, shown in hours, and your free days limit it. The climb then happens by itself.

Add real races as they come out, and they take over from the guess. The plan only tapers for a real A race: a period with no dated race
stays sharp and doesn't taper. When you add or move a race, you see how the next days would change before anything does. Change the
months and kinds in **Plan → Settings**.

The volume rules are conventions, not proven numbers: see `Docs/workout-suggestions-evidence.md`, section 10. A device on an older
version of the app can't read a season plan, so update every device before you start one.

---

## Forest

**Forest** (type *bosco*, or find it under *All*) is where friends and teammates grow their trees side by side. You can be in
several forests.

- **Plant a forest** and choose its sport, cycling or running (forests planted before the choice are cycling; it can't
  be changed later). Everyone's tree and times there come from that sport, whatever their main sport is. Then **Members → Show invite link** and send it. Whoever opens it asks to join (with consent
  to share their tree), and any member lets them in. *New link* makes the old one stop working. Up to 30 trees.
- **Trees**: the forest's members as a little grove, each tree in today's season; tap one to see it whole.
- **What's shared**: each member's own app publishes a copy of their tree into each forest when they open
  the Tree: the activities of the forest's sport they show there (everything else stays private), daily fitness/fatigue, sick days and today's crown. Heart rate and power
  appear only on activity pages and as average power on forest climbs, with **Show my heart rate and power** on (off unless turned on).
  Friends see that tree in plain bark, without numbers.
- **Ride pages**: with **Show my ride maps** on for a forest (asked when joining, or under Members), members can
  open your shared rides of the last year: route and altitude profile without the first and last kilometre.
  Per forest, **Members → Share new rides** and **Show rides from before I joined** (also asked when joining) set what
  shows; a ride's page has **Visible in** to show or hide that one ride, whatever those say.
- **Climbs**: any member adds one of their saved climbs; each member's app finds their efforts on it and publishes
  their best time from the rides they share there. **Race** replays any two times on the climb's route, from the
  pacing (time and distance, no positions) published with each time.

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

Hosting a copy needs Filippo's permission (see [Licence](#licence)).

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

6. **Authentication → Settings → Authorized domains**: add your site's address (e.g. `cirmolo-xxxx.pages.dev`).
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
4. **Save and Deploy**. You get an address like `https://cirmolo-xxxx.pages.dev`. Every push to `main` redeploys
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
| `npm run icons` | Regenerate the app icons from `assets/icon-source.png` |

To develop without touching the real project, run `firebase emulators:start` and start the app with
`VITE_USE_EMULATORS=1 npm run dev`.

`.npmrc` sets `legacy-peer-deps=true` on purpose: npm's peer resolver crashes on this dependency tree.

### Project layout

```
src/
  routes/       pages (file-based routing: Tree, Garden, Activities, Calendar, Analysis, Segments, Settings)
  components/   UI pieces (maps, profiles, charts, check-in, …)
  hooks/        React hooks (segments, names, online state)
  components/nav/  the bar, the typed alternatives (logic in lib/ask.ts) and the legend
  lib/          logic: intervals.icu client, Firebase (firebase, cloud, account), readiness, climbs, segment engine …
public/         icons
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

---

## Licence

Cirmolo is proprietary: all rights reserved. See [LICENSE](LICENSE). Each build lists the licences of its third-party
components in `licenses.txt`.
