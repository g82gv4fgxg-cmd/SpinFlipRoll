# SpinFlipRoll Web

The GitHub Pages version of SpinFlipRoll: spin a wheel, flip a coin or roll dice.

## Features

- **Wheel**: weighted options, no repeats, eliminate winners, pick several winners at once, split options into teams, templates, paste a whole list, import and export, share a wheel as a link, history and stats.
- **Coin**: your own labels and colours for each side, with a running heads/tails split.
- **Dice**: one to six dice from d4 to d20. Tap a die to hold it between rolls.
- **Enhanced visuals** (on by default, sparkle button to switch): a physics wheel you can grab and flick, with friction, a spring pointer that clacks on the pegs and motion blur; a 3D coin that's tossed, bounces and settles; and 3D dice (d4 to d20) that tumble, collide and come to rest in a felt tray. Results are still chosen fairly first, then the physics lands on them exactly. Turns off automatically if the device asks for reduced motion.
- **Everywhere**: Space to spin, flip or roll; presenter mode for big screens; sound on/off; light and dark themes (follows the device until you pick one); undo after removing or clearing things; the browser back button works.
- **Installable**: add it to a phone's home screen or install it from the browser, and it opens offline after the first visit.
- There's also something hidden to find.

Everything is stored in the browser with `localStorage`. Nothing is sent to a server; share links carry the wheel inside the link itself.

## Run locally

Install Node.js from https://nodejs.org, then run:

```sh
cd web
npm install
npm run dev
```

Vite will print a local URL, usually `http://localhost:5173`.

## Test

```sh
npm test            # unit tests (Vitest)
npm run test:e2e    # browser tests (Playwright) against a production build
```

The first time you run the browser tests on a new machine, install the browser with `npx playwright install chromium`.

## Build

```sh
npm run build
```

The production build is written to `web/dist`.

## Deploy to GitHub Pages

The repo includes `.github/workflows/pages.yml`. After pushing to GitHub:

1. Go to the repo on GitHub.
2. Open `Settings`.
3. Open `Pages`.
4. Under `Build and deployment`, set `Source` to `GitHub Actions`.
5. Push to the `main` branch.

GitHub runs the unit tests, builds the site and publishes it. `.github/workflows/ci.yml` runs the unit and browser tests on every pull request.
