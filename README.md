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

YAML describes the mission, not executable code. Each game picks an engine:

- **`dimensions`**: one rectangular room sized with two sliders. Constraints: `area_equals`, `min_width`, `min_area`, `perimeter_equals`, `square`, `not_square`.
- **`blocks`**: rebuild buildings by stacking cubes on a `grid` (up to `max_height`), shown in isometric 3D. Each of the `models` gives its target `heights` (rows north to south, columns west to east); the player's building is compared through its views. Constraint: `view_matches` with `view: top | south | east`, so any building with the same views is accepted. `reveal_model_hint` shows the target as a ghost from a given hint.
- **`floorplan`**: several rooms on a grid plan (1 m cells, north at the top). Two modes, set by `parameters.mode`:
  - `layout` (default): rooms can be moved and resized within their `width`/`depth` bounds, never overlapping or leaving the plan. Constraints: `min_area`, `max_area`, `adjacent`, `not_adjacent` (shared wall ≥ `min_shared`, default 1 m), `touches_side`.
    With `boundary: lot`, the plan is a piece of land: fixed `context` elements (`street`, `building`, `tree`, possibly outside the lot) are drawn around it, distances are shown as live dimension lines, and `reveal_zone_hint` draws the buildable zone from a given hint. Extra constraints: `min_setback` (distance to lot lines), `min_distance` (between a room and another room or context element), `max_coverage` (percentage of the lot). `scale` sets SVG units per metre for large sites. Trees can have a `root_radius` (drawn as the crown) and `blocking: false`: building inside the root zone kills the tree. Tree constraints: `keep_trees`, `min_trees_kept`; `best_possible` (verified by an exhaustive test) adds the `feedback.best` message when reached.
  - `furnish`: fixed-size `items` (furniture, or `fixed` built-ins) are moved and rotated a quarter turn on a `step` grid; each has `usage` zones (front/back/left/right, in metres) that must stay clear, and `openings` (doors with a `swing`, windows) sit on the walls. Constraints: `usage_clear`, `min_passage` (a walkable path of the given width from an opening to items), `min_distance`, `max_distance`. `reveal_passage_hint` shows the walkable area from a given hint.
  - `doors`: rooms are fixed and the free cells form a circulation space (`parameters.circulation` gives its name). The player opens doors in 1 m wall pieces. Constraints: `entrance`, `all_reachable`, `door_between`, `no_door_between`, `reachable_avoiding`, `max_doors`; `circulation` can be used as a room id.

See `activities/tetris-architectural.yaml`, `activities/ou-mettre-la-porte.yaml`, `activities/attention-aux-voisins.yaml`, `activities/preserve-les-arbres.yaml`, `activities/amenage-ton-studio.yaml` and `activities/architecte-en-blocs.yaml` for complete examples. Engines share the checklist and feedback panel in `src/components/Feedback.tsx`.

Each game has a `category`: `client`, `site`, `spaces`, `shapes`, `light`, `structure`, `materials`, `comfort`, `plans` or `city`. The catalogue shows a filter for each category that has at least one game (labels in `src/main.tsx`; the build checks the list in `scripts/build-activities.mjs`). Run `npm test` to check engine rules. Additional mechanics (3D, sunlight, furniture, etc.) will require additional engines.

## Technical notes

- React + TypeScript + Vite; YAML compiled to JSON at build time.
- No backend, no accounts, no cookies, no localStorage/IndexedDB, no analytics.
- Only temporary React state; refreshing resets the challenge.
- The language switch uses in-memory state; FR is the default. No language preference is saved.
- Game links use `?game=GAME_ID`, compatible with GitHub Pages without server-side routing.
- The UI uses system fonts and local CSS/SVG assets; it does not request external fonts or analytics. Hosting itself can generate infrastructure access logs outside ArchiLab's control.
- Site graphics are CSS/SVG and do not require external images.
