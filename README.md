# Cirmolo

A training app for cycling or running. Your season grows as a tree; the other sports you do grow in a garden.

**Use it: https://cycling-track.pages.dev/** · [Wiki](https://github.com/filippo-lusvardi/Cycling_track/wiki)

Cirmolo is a web app (PWA) in English and Italian. It works with [intervals.icu](https://intervals.icu) or on its own, from your .fit files, on phone and desktop alike.

## What it does

- **The Tree**: your training as a living tree, with daily readiness, form, sick days and what to train next.
- **The Garden**: every other sport you do, as a vegetable bed.
- **A line to type on**: find any page, ask for your records or a chart, or save weight, sleep and more in plain words, offline.
- **Activities and analysis**: fitness and fatigue, power and pace curves, zones, Durability, recaps of any stretch of time.
- **Climbs**: found in your own rides, with every pass, your records, and races against your best.
- **Workouts and a training plan**: a library, suggestions for the day, and weeks built around your races or a whole season.
- **Routes** on the roads you already ride, sent to your Garmin as a FIT course.
- **Gear**: kilometres on bikes, shoes and components, with washes and services.
- **Forests**: trees side by side with friends, sharing only what you choose.

## Get started

Open https://cycling-track.pages.dev/, create an account, and connect intervals.icu with its API key (or skip it). Then install it from the browser as an app: see [Getting Started](https://github.com/filippo-lusvardi/Cycling_track/wiki/Getting-Started).

## Your data

Activities stay in intervals.icu; what Cirmolo saves lives in your own account, readable only by you, and on your devices. More in [Your Data and Privacy](https://github.com/filippo-lusvardi/Cycling_track/wiki/Your-Data-and-Privacy).

## Run your own copy

```bash
cp .env.example .env.local   # your Firebase project's web config
npm install
npm run dev                  # http://localhost:5173
npm test
```

Node.js 22. Hosting it for free on Firebase and Cloudflare Pages: [Self-Hosting](https://github.com/filippo-lusvardi/Cycling_track/wiki/Self-Hosting). Commands and project layout: [Development](https://github.com/filippo-lusvardi/Cycling_track/wiki/Development).

## Contributing

Issues and pull requests are welcome. Contributions are accepted under the same licence as the project.

## Licence

Copyright © 2026 Filippo Lusvardi. Cirmolo is free software under the [GNU GPL v3](LICENSE) or later, with an [additional permission](LICENSE-FIT-EXCEPTION) for the Garmin FIT SDK, which keeps its own licence. Each build lists its third-party licences in `licenses.txt`.
