# SpinFlipRoll Web

This is the GitHub Pages friendly web version of SpinFlipRoll.

## Run Locally

Install Node.js from https://nodejs.org, then run:

```sh
cd web
npm install
npm run dev
```

Vite will print a local URL, usually `http://localhost:5173`.

## Build

```sh
cd web
npm run build
```

The production build is written to `web/dist`.

## Deploy To GitHub Pages

The repo includes `.github/workflows/pages.yml`. After pushing to GitHub:

1. Go to the repo on GitHub.
2. Open `Settings`.
3. Open `Pages`.
4. Under `Build and deployment`, set `Source` to `GitHub Actions`.
5. Push to the `main` branch.

GitHub will run the workflow and publish the site.

The app currently stores wheels, settings, and spin history in the browser with `localStorage`.
