# ArchiLab — architecture through play

A static, bilingual (FR/EN) architecture learning site for secondary school students. French is the default. No accounts, analytics, database, progression tracking, or user-data storage. Games execute entirely in the browser.

## Quick start

Requirements: Node.js 22+ and npm.

```bash
npm install --no-audit --no-fund
npm run dev
```

Open the local URL shown by Vite (typically http://localhost:5173/archilab/).

Production check:

```bash
npm run build
npm run preview
```

## Create the GitHub repository

1. On GitHub create a **public** repository named `archilab` (do not initialize it with a README).
2. In this folder:

```bash
git init
git add .
git commit -m "Initial ArchiLab V1"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/archilab.git
git push -u origin main
```

3. On GitHub open **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Check the **Actions** tab for the deployment. Your URL is `https://YOUR_USERNAME.github.io/archilab/`.
5. Future changes are published by `git add`, `git commit`, and `git push` to `main`.

If you use a custom domain at the root, change `GITHUB_PAGES_BASE` in `.github/workflows/deploy.yml` to `/` and configure your domain in GitHub Pages settings.

## Add a game

Create a new `.yaml` file in `activities/`. Copy an existing file and change its unique `id`, bilingual strings, dimensions, and constraints. Run `npm run generate` to validate and rebuild the catalogue. `npm run build` also runs this step. Committing the YAML automatically publishes it via GitHub Actions.

Supported constraint types: `area_equals`, `min_width`, `min_area`, `perimeter_equals`, `square`, `not_square`.

The current V1 implements the `dimensions` engine. Additional mechanics (3D, sunlight, furniture, etc.) will require additional JavaScript engines. YAML describes the mission, not executable code.

## Technical notes

- React + TypeScript + Vite; YAML compiled to JSON at build time.
- No backend, no accounts, no cookies, no localStorage/IndexedDB, no analytics.
- Only temporary React state; refreshing resets the challenge.
- The language switch uses in-memory state; FR is the default. No language preference is saved.
- Game links use `?game=GAME_ID`, compatible with GitHub Pages without server-side routing.
- The UI uses system fonts and local CSS/SVG assets; it does not request external fonts or analytics. Hosting itself can generate infrastructure access logs outside ArchiLab's control.
- Site graphics are CSS/SVG and do not require external images.
