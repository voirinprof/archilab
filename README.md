# ArchiLab — architecture through play

A static, bilingual (FR/EN) architecture learning site for secondary school students. French is the default. No accounts, analytics, database, progression tracking, or user-data storage. Games execute entirely in the browser.

## Quick start

Requirements: Node.js 22+ and npm.

```bash
npm install --no-audit --no-fund
npm run dev
```

Open the local URL shown by Vite (typically http://localhost:5173/).

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
4. Check the **Actions** tab for the deployment. The site is published at https://eduarchi.xyz/ (custom domain set in **Settings → Pages**).
5. Future changes are published by `git add`, `git commit`, and `git push` to `main`.

Because the site is served at the root of its domain, `base` is `/` in `vite.config.ts`. To publish under a sub-path instead (for example `https://USER.github.io/archilab/`), set `base` to that path.

## Add a game

Create a new `.yaml` file in `activities/`. Copy an existing file and change its unique `id`, bilingual strings, dimensions, and constraints. Run `npm run generate` to validate and rebuild the catalogue. `npm run build` also runs this step. Committing the YAML automatically publishes it via GitHub Actions.

YAML describes the mission, not executable code. Each game picks an engine:

- **`dimensions`**: one rectangular room sized with two sliders. Constraints: `area_equals`, `min_width`, `min_area`, `perimeter_equals`, `square`, `not_square`.
- **`blocks`**: rebuild buildings by stacking cubes on a `grid` (up to `max_height`), shown in isometric 3D. Each of the `models` gives its target `heights` (rows north to south, columns west to east); the player's building is compared through its views. Constraint: `view_matches` with `view: top | south | east`, so any building with the same views is accepted. `reveal_model_hint` shows the target as a ghost from a given hint.
- **`sun`**: turn a house (`house`: rooms with windows on their outer walls, in the house's own frame) on its site and see when each room gets direct sun. Simplified solar geometry for a `latitude` (solar time, three seasons) with shadows cast by `obstacles` (box and height). Constraints: `min_sun_hours` and `max_sun_hours` for some `rooms`, a `season` and a time range. `reveal_paths_hint` draws the winter and summer sun paths.
- **`truss`**: build a bridge with beams between grid points (`grid`, `max_length`), over a given `deck`, pinned `supports` and truck `loads`. A simplified plane-truss analysis (stiffness method, pinned joints) shows tension/compression live, finds the joints that can move when the structure is a mechanism, and breaks beams above `tension_limit` or their compression strength (`compression_limit` divided by the length squared, a simplified buckling rule). Constraints: `stable`, `strong`, `max_bars`. `reveal_pattern_hint` draws `pattern` faintly. `scene` is `ravine` (bridge) or `ground` (a structure standing on the ground); `load_direction` (unit vector, default downwards) and `load_label` describe the load, e.g. a sideways wind; `deck_strength` makes the given bars stronger than the player's beams.
- **`carbon`**: tune a house's design (`shapes`, `structures`, `insulations`, insulation `thickness`, `glazing`, `windows`, `heatings`) and see a simplified carbon footprint over its `lifetime`: embodied carbon of materials and equipment plus heating energy, from simple building physics (`physics`: U-values, ventilation, degree-hours, capped solar gains). Every factor is in the YAML. Constraints: `max`/`min` on a `metric` (`total`, `embodied`, `operational` in tonnes, `heating_need` in kWh/m²·year, `glazing` in %).
- **`district`**: paint plot types on a `grid` (top view) around `fixed` areas. Each tile type is pure data (`residents`, `service`, `walkable`, `permeable`, `green`, `screen`, `heat`, `next_to`). Walking distances are counted in plots through walkable tiles (you can't walk through a building), noise reaches `noise.reach` plots unless a screen is in between, and a heat layer is cooled by green neighbours. Constraints: `min_population`, `services_within`, `min_green_share`, `max_impermeable_share`, `no_noisy_homes`.
- **`sequence`**: put cards (`steps`, each with an `icon` and an illustration `layer`) in order. `dependencies` say which step must come `before` another, with the `reason` shown when the order is wrong; several orders can be right. "Start" runs the process step by step and stops at the first step whose prerequisite isn't done. `initial_order` is the fixed scrambled start (the build checks it is a permutation, not already solved, and that the dependencies have no cycle). `illustration: house` draws a house being built. Constraint: `respects_dependencies`.
- **`isocity`**: read a 2D `plan` and build the same neighbourhood in a fixed isometric view, in `steps`. See *Creating another neighbourhood* below. Constraints: `match_roads`, `no_dead_ends`, `match_elements`, `touch_road` (with `grouped` for green areas).
- **`floorplan`**: several rooms on a grid plan (1 m cells, north at the top). Two modes, set by `parameters.mode`:
  - `layout` (default): rooms can be moved and resized within their `width`/`depth` bounds, never overlapping or leaving the plan. Constraints: `min_area`, `max_area`, `adjacent`, `not_adjacent` (shared wall ≥ `min_shared`, default 1 m), `touches_side`.
    With `boundary: lot`, the plan is a piece of land: fixed `context` elements (`street`, `building`, `tree`, possibly outside the lot) are drawn around it, distances are shown as live dimension lines, and `reveal_zone_hint` draws the buildable zone from a given hint. Extra constraints: `min_setback` (distance to lot lines), `min_distance` (between a room and another room or context element), `max_coverage` (percentage of the lot). `scale` sets SVG units per metre for large sites. Accessibility: `accessible_width` checks that every room can be reached from a context element (e.g. `kind: entrance`) through free floor at least `width` metres wide, touching each room along an edge; the free floor is drawn as a wheelchair layer. Also `touches_any_side`, `max_distance` (from a room to rooms or context elements), `min_area`/`max_area` on several `rooms`, and `building` to name the building in the metrics. Trees can have a `root_radius` (drawn as the crown) and `blocking: false`: building inside the root zone kills the tree. Tree constraints: `keep_trees`, `min_trees_kept`; `best_possible` (verified by an exhaustive test) adds the `feedback.best` message when reached.
  - `furnish`: fixed-size `items` (furniture, or `fixed` built-ins) are moved and rotated a quarter turn on a `step` grid; each has `usage` zones (front/back/left/right, in metres) that must stay clear, and `openings` (doors with a `swing`, windows) sit on the walls. Constraints: `usage_clear`, `min_passage` (a walkable path of the given width from an opening to items, touching them along an edge: a gap at a corner lets nobody through), `min_distance`, `max_distance`. `reveal_passage_hint` shows the walkable area from a given hint.
  - `renovate`: an existing building given as wall runs (`load_bearing`, `water`, `partitions`, `doors`, `windows`). The player demolishes partitions, builds new walls and opens or closes doors (priced with `costs`), then gives each room one of the `uses`; rooms are the groups of cells no wall separates. Constraints: `use_count`, `use_min_area`, `use_has_window`, `use_touches_water`, `no_door_between_uses`, `reachable_avoiding_use`, `all_reachable`, `all_assigned`, `max_cost`. Reaching `good_cost` adds the `feedback.best` message.
  - `doors`: rooms are fixed and the free cells form a circulation space (`parameters.circulation` gives its name). The player opens doors in 1 m wall pieces. Constraints: `entrance`, `all_reachable`, `door_between`, `no_door_between`, `reachable_avoiding`, `max_doors`; `circulation` can be used as a room id.

See `activities/tetris-architectural.yaml`, `activities/ou-mettre-la-porte.yaml`, `activities/attention-aux-voisins.yaml`, `activities/preserve-les-arbres.yaml`, `activities/amenage-ton-studio.yaml`, `activities/le-batiment-transformable.yaml` `activities/architecte-en-blocs.yaml`, `activities/chasse-au-soleil.yaml`, `activities/le-pont-impossible.yaml`, `activities/la-tour-qui-penche.yaml`, `activities/mission-carbone.yaml`, `activities/construis-ton-quartier.yaml` `activities/une-ecole-pour-tous.yaml` `activities/chantier-en-desordre.yaml` and `activities/quartier-des-tilleuls.yaml` for complete examples. Engines share the checklist and feedback panel in `src/components/Feedback.tsx`.

Each game has a `category`: `client`, `site`, `spaces`, `shapes`, `light`, `structure`, `materials`, `comfort`, `plans` or `city`. The catalogue shows a filter for each category that has at least one game (labels in `src/main.tsx`; the build checks the list in `scripts/build-activities.mjs`). Run `npm test` to check engine rules. Additional mechanics (3D, sunlight, furniture, etc.) will require additional engines.

### Creating another neighbourhood (`isocity`)

Copy `activities/quartier-des-tilleuls.yaml`, change its `id` and texts, then edit three blocks. The engine never needs to change.

1. **`elements`**: what the player can place. `kind` drives the rules (`road`, `building`, `green`, `tree`, `signal`); `shape` only drives the drawing (`road`, `crosswalk`, `house`, `apartment`, `school`, `shop`, `park`, `green`, `tree`, `signal`). Also `color` (same colour on the plan and in 3D), `icon` (plan and legend), `size: [width, depth]` in cells, `height`, `rotatable`, and `connections` for road pieces (`n`, `e`, `s`, `w` before rotation).
2. **`symbols`** and **`plan`**: the plan is one string per row (north at the top), one character per cell; `.` is open ground. A symbol says what its cell holds: `road: true` (a road cell), `element` (a building, a lawn, or a special road piece such as a crosswalk), `overlay` (a tree or traffic light standing on the cell). You never write road shapes: the engine works them out from the neighbouring road cells (a road on the edge of the map continues off it), so the plan stays readable. Multi-cell elements (an apartment block, the school, the park) are drawn as a block of the same letter of exactly their size; keep two such blocks from touching.
3. **`steps`**: each step has `label`, `intro` (what to do), `explanation` (the idea, shown on success), its palette `elements`, the `constraints` ids it checks, its own `hints` and `success`. The last step has `final: true`: it offers every element and checks every constraint, with the activity's own hints and feedback.

`npm run generate` checks the scenario: every symbol is known, every road cell can be drawn with a piece, traffic lights sit on junctions, multi-cell blocks match their element's size, the solution read from the plan meets every constraint, and an empty grid does not. Placement rules are shared by every neighbourhood: nothing is built on a road or a tree, trees grow on grass or green spaces, traffic lights go on junctions, a road piece can replace another (to turn it into a crosswalk), and nothing leaves the grid.

## Technical notes

- React + TypeScript + Vite; YAML compiled to JSON at build time.
- No backend, no accounts, no cookies, no localStorage/IndexedDB, no analytics.
- Only temporary React state; refreshing resets the challenge.
- Addresses: `/` and `/fr/` (French home), `/en/` (English home), `/fr/activities/<id>/` and `/en/activities/<id>/`. The language is part of the address; no preference is saved. Old `?game=<id>` links redirect to the new addresses.
- SEO without a server: `npm run build` renders every page with React at build time (`src/entry-server.tsx`, `scripts/prerender.mjs`) and writes one static HTML file per address, each with its own title, description, canonical URL, `hreflang`, Open Graph/Twitter tags and JSON-LD, all taken from the YAML files (`src/seo.ts`). The browser then hydrates the page. `sitemap.xml` and `404.html` are generated the same way; `public/robots.txt` points to the sitemap. A new activity gets all of this automatically.
- Share images (1200 × 630) are `public/og/eduarchi-fr.png` and `-en.png`. An activity may set `share_image: /og/<file>.png` (file in `public/og/`) to use its own. The site images are drawn from `scripts/og/og.html`; see `scripts/og/render.mjs` to regenerate them.
- The UI uses system fonts and local CSS/SVG assets; it does not request external fonts or analytics. Hosting itself can generate infrastructure access logs outside EduArchi's control.
