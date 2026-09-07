# CLAUDE.md — ClimateConnections

Conventions for any AI or human session working in this repo. Read
`docs/PLAN.md` before doing anything; it is the source of truth for scope,
schema, engine semantics, and milestones.

## What this project is
A static, browser-based teaching tool that draws known climate
teleconnections (ENSO, since M8 the Indian Ocean Dipole, since M9 the
North Atlantic Oscillation, since M10 the links between those drivers,
since M11 two drivers chosen at once, since M12 a start month of its
own for the second one, since M13 a season dial showing the calendar
year as a circle, since M14 two scenarios compared side by side,
since M15 a second driver that may begin before the first, and since
M16 the Southern Annular Mode as a fourth driver, since M17 the
Pacific Decadal Oscillation as a fifth, since M18 the Atlantic
Multidecadal Oscillation as a sixth, since M19 the Atlantic Niño as a
seventh, and since M20 the Indian Ocean Basin Mode as an eighth) on a
Pacific-centered world map and
animates their arrival over a twelve-month timeline. It is a hand-curated,
cited causal graph. It is **not** a simulator and must never be presented as
one.

## Hard rules
- Climate facts live only in `data/*.yaml`. Never hard-code a fact in `src/`.
- No link without a resolvable source key and a `caveat`. The data build
  (`npm run build:data`) enforces this; do not weaken the validator.
- Uncertainty is always shown: confidence tier drives line style, every card
  has a "How sure are we?" section, the disclaimer is always visible. Do not
  hide contested links; that is the point of showing them.
- The engine (`src/engine/`) is pure and DOM-free. Three-level states only.
  Driver-to-driver links follow the loop rules in `docs/PLAN.md` §4 rule 6
  (fixed onset, loop guard, one tier down per hop); do not relax them. Two
  chosen drivers (§4 rule 8) add up under the same sum-and-clamp rule and
  are never pushed; no new combination rule. The second driver's own start
  month (M12) is read within the twelve months shown and the driver is held
  out of play (pinned, no phase) before it. With `startsBefore` (M15) that
  month is read backwards to a negative onset: month 0 stays the first
  driver's onset, the timeline is never moved or lengthened, and the
  second driver is simply in phase from month 0 with its lags counted
  from the earlier month. The season dial (M13) shows
  the season gate only, read from each link's `season`; it never
  recomputes states and must not hide the lag (its hint says a month can
  be in season and still empty). Compare mode (M14) runs the engine once
  per side on the same month index and only compares the results
  (`src/engine/compare.ts`); it never blends the two scenarios or invents
  a third state, and a story is one scenario, so it turns compare off.
- Pacific-centered projection. Never ship a map that splits the Pacific.
- Version 1 (`docs/PLAN.md` section 6–7) is complete. Version 2 items
  (`docs/PLAN.md` section 10) are taken one at a time, each with explicit
  sign-off; the Indian Ocean Dipole (M8), the North Atlantic Oscillation
  (M9), driver-to-driver links (M10), two chosen drivers (M11), the
  second driver's own start month (M12), the season dial (M13), compare
  mode (M14), a second driver that begins before the first (M15), the
  Southern Annular Mode as a fourth driver (M16) and the Pacific Decadal
  Oscillation as a fifth (M17) were signed off on 2026-09-07, and the
  Atlantic Multidecadal Oscillation as a sixth (M18) and the Atlantic
  Niño as a seventh (M19) on 2026-09-08, and the Indian Ocean Basin Mode
  as an eighth (M20, the first version 3 item, `docs/PLAN_V3.md`) on
  2026-09-08. A new driver is data only (a driver node, its outcome
  nodes, links, sources and a story); the engine and the UI read
  everything from the data. Do not start another version 2 or version 3
  item without sign-off.
- Plain language in user-facing text. Students read the cards.

## Workflow
- Commit and push after every milestone or working unit. Short messages,
  prefixed with the milestone: `M3: propagation engine + tests`.
- Before marking a milestone done: `npm run build:data && npm test && npm run build`
  must pass, **and** the page must be checked in a browser against the
  milestone's acceptance criteria.
- Regenerated `public/data/graph.json` is committed alongside the YAML that
  produced it.
- Temp files go in `W:\temp\claude\ClimateConnections\`, never in the repo.

## Commands
```
npm install
npm run build:data     # validate YAML, write public/data/graph.json
npm test               # vitest
npm run dev            # Vite dev server
npm run build          # static site to dist/
```

## Layout (see docs/PLAN.md §2 for the full tree)
- `data/` — nodes.yaml, links.yaml, stories.yaml
- `scripts/build-data.mjs` — validator + converter
- `src/engine/` — propagate.ts and tests
- `src/ui/` — map, timeline, card, controls, legend
- `docs/` — PLAN.md, DATA_FORMAT.md
