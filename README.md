# Dive Mapping

A browser-based scuba dive-site mapping tool. Build bearing-graph maps the way
divers actually navigate underwater — points of interest joined by compass
bearings and distances — overlaid with depth contours, illustrations, and
annotations.

## Status

MVP — single-site editor + read-only viewer. Sites are stored locally in the
browser (`localStorage`) and shared via JSON / SVG / PNG export. No backend.

## Stack

- TypeScript + React + Vite
- Tailwind CSS
- Zustand state + Immer mutations
- Zod-validated JSON schema
- d3-delaunay (sounding → contour generation)
- Vitest (28 unit tests over the pure domain layer)

## Local development

```bash
npm install
npm run dev          # Vite dev server on http://localhost:5173
npm test             # run unit tests
npm run build        # type-check + production build → dist/
```

## Project layout

```
src/
  domain/          Pure data model (no UI deps)
    types.ts       Site + 7 layer types
    geometry.ts    bearing ↔ vector math
    layout.ts     bearing-graph → XY positions
    contours.ts    soundings → contour polylines
    serialize.ts  JSON in/out + zod schema
  state/           Zustand store + persistence
  components/
    Map/           SVG canvas + per-layer views
    Editor/        Toolbar, Inspector, LayersPanel
  pages/           HomePage, EditorPage, ViewerPage
  utils/           Coord conversions, smoothing, fit-viewport
```

## Layers

Maps are composed of seven independently-toggleable layers, rendered
bottom-to-top:

1. **Water body / area** — shorelines, lakes, caves
2. **Measurements** — depth soundings (point measurements)
3. **Depth** — contours + depth labels
4. **Illustrations** — boats, primitives, imported images
5. **POIs & bearings** — wrecks/features connected by compass bearings
6. **Sub-POIs** — fish, hazards, photo spots etc., attached to a parent POI
7. **Notes** — annotations

## Deployment

The build output is fully static. Drop `dist/` onto any static host
(Netlify / Vercel / Cloudflare Pages / GitHub Pages / S3). For a sub-route
deployment add `base: '/<your-prefix>/'` to `vite.config.ts` and configure
your server to fall back to `index.html` for unknown paths under that prefix
so client-side routing works on direct URL loads.

## License

MIT (suggested)
