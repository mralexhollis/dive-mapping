# Dive Mapping

A browser-based scuba dive-site mapping and route-planning tool. Build
bearing-graph maps the way divers actually navigate underwater — points of
interest joined by compass bearings and distances — overlaid with depth
contours, illustrations, satellite reference imagery, and annotations. Then
lay routes through those sites and get a first-pass read on gas, NDL and
decompression obligation.

## Status

In development — single-user, browser-only. Sites and routes live in
`localStorage`; export and re-import via JSON, or render a finished site to
SVG / PNG. No backend, no accounts. Cloud saving and sharing are on the
roadmap.

> Not a substitute for proper dive planning. The maps, distances, gas and
> deco numbers may be incomplete, inaccurate, or change without notice.
> Always plan real dives with appropriate training and verified tools.

## What's in it

- **Site mapping** — bearing-graph layout, depth contours from soundings,
  illustrations and imported images, satellite reference layer, points-of-
  interest with sub-POIs (fish, hazards, photo spots).
- **Routes** — sequence POIs or drop free waypoints into ordered dive
  routes with stops (safety, gas-check, observation), per-segment
  bearings/distances/depths.
- **Gas planning** — diver profiles with cylinder / SAC / start / reserve /
  rule (thirds, half, all-usable), Air or Nitrox (EAN). Per-route
  feasibility check + viewer-side "Plan this dive" overlay so a diver can
  evaluate any route against their own gear.
- **Deco model** — Bühlmann ZHL-16C tissue simulation along the planned
  depth profile. Surfaces a deco ceiling that "comes in from the top" as
  N2 loads accumulate and recedes as the diver off-gases. Ascents that
  pierce the ceiling are flagged on the chart and as warnings.
- **Viewer** — read-only mode with the diver's selected gas profile;
  sidebar shows depth-time profile chart with reserve / turn / out-of-air
  pressure lines.

## Stack

- TypeScript + React + Vite
- Tailwind CSS
- Zustand state + Immer mutations + undo / redo history
- React Router for the page routes
- Zod-validated JSON schema (forward-compatible site format)
- d3-delaunay (soundings → contour generation)
- Vitest (45 unit tests over the pure domain layer)

## Local development

```bash
npm install
npm run dev          # Vite dev server on http://localhost:5173
npm test             # run unit tests
npm run typecheck    # tsc --noEmit
npm run build        # type-check + production build → dist/
```

The home page has a "Load test map — Stoney" button that seeds a known-good
site (Stoney Cove draft) so you can poke at every feature without drawing
one from scratch.

## Pages

| Path | Purpose |
| --- | --- |
| `/` | Sites list, add / import / load test map, manage diver profiles. |
| `/edit/:siteId` | Map editor — draw POIs, contours, illustrations, etc. |
| `/plan/:siteId` | List of dive routes for a site. |
| `/plan/:siteId/:planId` | Single-route editor — itinerary + map + feasibility / profile / warnings. |
| `/view/:siteId` | Read-only viewer with diver-profile-driven gas planning. |
| `/profiles` | Diver gas profiles (cylinder, mix, SAC, reserve, rule). |

## Project layout

```
src/
  domain/             Pure data model (no UI deps)
    types.ts          Site + 7 layer types, GasPlan, Route, Stop, Waypoint
    geometry.ts       bearing ↔ vector math
    layout.ts         bearing-graph → XY positions
    contours.ts       soundings → contour polylines
    divePlan.ts       per-route metrics, turn pressure, warnings
    buhlmann.ts       ZHL-16C tissue compartments + deco ceiling
    serialize.ts      JSON in/out + zod schema (with version migrations)
  state/              Zustand store + localStorage persistence
  components/
    Map/              SVG canvas + per-layer views + routes overlay
    Editor/           Toolbar, Inspector, LayersPanel
    Plans/            Itinerary, PlanDetailPanel, depth-time profile chart
    Viewer/           ViewerSidebar, PlanThisDivePanel
  pages/              HomePage, EditorPage, ViewerPage,
                      PlanListPage, PlansPage, DiverProfilesPage
  hooks/              useResponsivePanels, useKeyboard, usePanZoom
  utils/              Coord conversions, smoothing, fit-viewport,
                      satellite-tile fetcher, diverProfiles persistence
```

## Layers

Maps are composed of seven independently-toggleable layers, rendered
bottom-to-top:

1. **Water body / area** — shorelines, lakes, caves
2. **Measurements** — depth soundings (point measurements)
3. **Depth** — contours + depth labels
4. **Illustrations** — boats, primitives, imported images
5. **POIs & bearings** — wrecks / features connected by compass bearings
6. **Sub-POIs** — fish, hazards, photo spots etc., attached to a parent POI
7. **Notes** — annotations

Routes render on top of the map as an overlay (not a layer in the
toggleable sense — they're scoped to the active route on the plan / viewer
pages).

## Storage

Today, everything is local to the browser:

- `dive-mapping:site-index` + `dive-mapping:site:{id}` — saved sites
- `dive-mapping:diver-profiles` + `dive-mapping:diver-profile-active` — profiles
- A handful of `dive-mapping:*` UI-state keys (split-pane sizes, section open/closed)

To move sites between browsers, export to JSON from the editor's "Export"
menu and import on the other end. Cloud saving and sharing are planned.

## Deployment

The build output is fully static. Drop `dist/` onto any static host
(Netlify / Vercel / Cloudflare Pages / GitHub Pages / S3). For a sub-route
deployment add `base: '/<your-prefix>/'` to `vite.config.ts` and configure
your server to fall back to `index.html` for unknown paths under that prefix
so client-side routing works on direct URL loads.

## License

MIT (suggested)
