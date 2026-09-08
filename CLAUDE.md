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
seventh, since M20 the Indian Ocean Basin Mode as an eighth, since M21
the Atlantic Meridional Mode as a ninth, since M22 the Pacific
Meridional Mode as a tenth, since M26 a large tropical volcanic
eruption as an eleventh, the one driver that is an event rather than a
swing, since M23 the Quasi-Biennial Oscillation as a twelfth, a
band of wind in the stratosphere with no region of its own, since M24
the autumn sea ice of the Barents and Kara seas as a thirteenth, the
first driver whose every link is contested, and since M25 the October
snow across Siberia as a fourteenth, its matched pair, since M28 a
"By region" view that lists every driver known to reach one place, and
since M32 an "Event lasts" control that ends a chosen driver's phase after
a set number of months, the first engine extension, and since M33 any
number of drivers chosen at once behind a "More drivers" section, the
second, and since M34 a "Real year" picker that sets every recorded
driver from a hand-curated table of index readings, 1950–2025, the
first item to read the record) on a
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
  (fixed onset, loop guard, one tier down per hop); do not relax them. The
  chosen drivers (§4 rule 8: one, two since M11, any number since M33 as
  `Scenario.others`) add up under the same sum-and-clamp rule and are
  never pushed; no driver twice; no new combination rule. Each chosen
  driver's own start month (M12) is read within the twelve months shown
  and the driver is held out of play (pinned, no phase) before it. With
  `startsBefore` (M15) that month is read backwards to a negative onset:
  month 0 stays the first driver's onset, the timeline is never moved or
  lengthened, and the driver is simply in phase from month 0 with its
  lags counted from the earlier month. `Scenario.secondary` and the
  `second_*` story fields are the pre-M33 spelling, accepted for one
  milestone only; new code and data use `others` / `drivers`. The season dial (M13) shows
  the season gate only, read from each link's `season`; it never
  recomputes states and must not hide the lag (its hint says a month can
  be in season and still empty). Compare mode (M14) runs the engine once
  per side on the same month index and only compares the results
  (`src/engine/compare.ts`); it never blends the two scenarios or invents
  a third state, and a story is one scenario, so it turns compare off.
  Phase duration (M32, §4 rule 9) is a hold on a chosen driver only:
  from `onset + holdMonths` it has no phase and its links are reported
  `faded`, never applied; a lag at or beyond the hold never fires (no
  hidden ocean memory: the chain is the honest way to show it, and the
  card and hint say so); no hold is the old timeline exactly. Do not
  relax it into a fade into the opposite phase; that is a push.
- The table of real years (M34) is data: `data/years.yaml` holds one
  entry per driver per year, each called from the index dataset named in
  its `source` by the threshold rule written into that source's citation;
  the app fetches nothing. `src/engine/years.ts` only turns a row into a
  rule-8 / rule-9 scenario (month 0 January when a recorded driver allows
  it, else the start that covers most of the year; every other entry a
  chosen driver from its own month; a neutral entry pinned; a duration a
  hold) and reports what the engine cannot place; it invents no state and
  computes no climate fact. A driver absent from a row is "not recorded",
  not neutral. Do not add a year entry without an index source, and do not
  soften the year panel's honesty sentence.
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
  as an eighth (M20, the first version 3 item, `docs/PLAN_V3.md`), the
  Atlantic Meridional Mode as a ninth (M21), the Pacific Meridional
  Mode as a tenth (M22) and a large tropical volcanic eruption as an
  eleventh (M26, taken before M23–M25 as the plan's order suggests) on
  2026-09-08, the third batch of outcome regions (M27: Central Asia,
  the US Midwest, northeastern Canada, India's pre-monsoon heat, Tibetan
  snow; data only, no driver) on 2026-09-08, the Quasi-Biennial
  Oscillation as a twelfth driver (M23, taken after M26 and M27 as the
  plan's order suggests) on 2026-09-08, and the Barents–Kara autumn sea
  ice as a thirteenth (M24) and the Eurasian October snow as a
  fourteenth (M25), the two contested Arctic precursors as one matched
  lesson, on 2026-09-08, and region-first navigation (M28, the first UI
  item: `src/engine/inverse.ts` reads the links into a place, grouped by
  driver and phase; it runs no scenario, invents no state and adds
  nothing up, and the map and card in region mode draw only what it
  returns; the URL hash carries region mode and nothing else) on
  2026-09-08, and phase duration (M32, the first engine extension:
  `holdMonths`, the `faded` link status, `typical_duration_months`
  required on every driver, `hold_months` in stories, the "Event lasts"
  control) on 2026-09-08, and any number of chosen drivers (M33, the
  second engine extension: `Scenario.others`, rule 8 in the plural, the
  `drivers:` list in stories, the "More drivers" section) on 2026-09-08,
  and the table of real years (M34, the first item to read the record:
  `data/years.yaml`, `scripts/years-schema.mjs`, `src/engine/years.ts`,
  the "Real year" picker and panel; extended the same day from seven
  index drivers to all fourteen, the meridional modes to 2024) on
  2026-09-08.
  A new driver
  is data only (a driver node, its outcome
  nodes, links, sources and a story, and since M32 its
  `typical_duration_months`); the engine and the UI read
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
- `data/` — nodes.yaml, links.yaml, stories.yaml, years.yaml
- `scripts/build-data.mjs` — validator + converter; `scripts/years-schema.mjs` — the years table's checks
- `src/engine/` — propagate.ts, years.ts and tests
- `src/ui/` — map, timeline, card, controls, legend, story and year panels
- `docs/` — PLAN.md, DATA_FORMAT.md
