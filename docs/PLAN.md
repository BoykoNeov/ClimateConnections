# ClimateConnections — Implementation Plan

A teaching tool that draws known climate teleconnections on a world map. The user
picks a driver phenomenon (ENSO in version 1; the Indian Ocean Dipole was added
in M8 and the North Atlantic Oscillation in M9), sets its phase, and watches the
consequences ripple outward across the map over a twelve-month timeline.

This is **not** a climate simulator. Nothing is computed from physics. Every
effect shown comes from a hand-written, cited knowledge base. The app is a
*causal graph drawn on a map*, animated over time.

This document is written so that an implementer with no prior context can
execute it step by step. Read all of it before starting. Do not skip the
"Rules for the implementer" section.

---

## 0. Rules for the implementer

1. **The knowledge base is data, not code.** All nodes and links live in
   `data/nodes.yaml` and `data/links.yaml`. The app never hard-codes a climate
   fact. If you need a new fact, add it to the YAML with a source.
2. **No link without a source.** Every entry in `links.yaml` must have at
   least one entry in `sources`. If you cannot cite it, do not add it.
3. **Uncertainty is a first-class feature.** Every link carries a
   `confidence` value. The renderer must always encode it visually. Never
   draw a contested link the same way as an established one.
4. **Keep the propagation engine dumb.** Three-level qualitative states,
   bounded depth, each link fires at most once per scenario. Do not add
   continuous magnitudes, differential equations, or anything that looks
   like a model. See section 4.
5. **Static site only.** No backend, no database, no login. The build output
   must be a folder that can be served by any static host.
6. **Validate before you render.** `npm run build:data` must pass before the
   app is considered runnable. It checks the YAML against the schema and
   fails loudly on missing sources, unknown node ids, or bad coordinates.
7. **Do not widen scope.** Version 1 is ENSO-only. Do not add other drivers,
   the globe view, real data feeds, or quizzes until the version-1 acceptance
   checklist (section 7) is fully green.
8. **Pacific-centered map, always.** The default projection is rotated so the
   Pacific Ocean is in the middle. Never ship a map that splits the Pacific.
9. **Plain language in all user-facing text.** Info cards are read by
   students. Say "roughly two out of three El Niño winters" rather than
   "statistically significant positive anomaly".
10. **Check your work in a browser.** After every milestone, run `npm run dev`,
    open the page, and confirm the acceptance criteria for that milestone by
    looking at it. Do not mark a milestone done from a passing build alone.
11. **Commit and push after every milestone** (and after any smaller unit of
    work that leaves the tree in a working state). Conventional short commit
    messages: `M3: propagation engine + tests`.

---

## 1. Goals and non-goals

### Goals
- Show, on one map, how a phase of ENSO tends to affect weather and climate
  outcomes around the world.
- Show *when* those effects tend to arrive, using a scrubbable timeline.
- Show *how sure* the science is about each effect.
- Let a student click any node and read a short, cited explanation.
- Be usable by a teacher projecting it in a classroom, and by a student alone.

### Non-goals (for all versions unless stated)
- Numerical simulation of any kind.
- Forecasting. The tool shows tendencies from the past, never predictions.
- Sub-monthly time scales (the Madden-Julian Oscillation is context only).
- Any claim about long-term climate change trends, unless later added as an
  explicitly sourced node.
- Mobile-first layout. Desktop and projector first. Must not break on a
  tablet, but need not be optimized for it.

---

## 2. Architecture

Three layers, strictly separated:

```
data/*.yaml  --(scripts/build-data.mjs: validate + convert)-->  public/data/graph.json
                                                                       |
                                          src/engine/propagate.ts  <---+   (pure functions, no DOM)
                                                    |
                                          src/ui/*.ts  (map, timeline, cards, controls)
```

- **Data layer** (`data/`): YAML files edited by humans. Schema in section 3.
- **Build step** (`scripts/build-data.mjs`): reads YAML, validates with the
  schema, writes a single JSON file the app loads at startup. Fails the build
  on any error.
- **Engine** (`src/engine/`): pure TypeScript with no DOM access. Takes the
  graph plus a scenario (driver id, phase, start month) and returns a
  per-month state table. Fully unit-testable.
- **UI** (`src/ui/`): D3 for the map and arrows, hand-rolled DOM for the
  panels. Reads engine output; never reads YAML directly.

### Stack
| Concern | Choice | Reason |
|---|---|---|
| Language | TypeScript, strict mode | Catches schema drift at compile time |
| Bundler / dev server | Vite | Zero-config static site output |
| Map | D3 (`d3-geo`, `d3-selection`, `d3-transition`) | Full control, prints well, offline |
| Base map | `world-atlas` npm package (110m countries, TopoJSON) | Bundled, no CDN dependency |
| YAML parsing | `js-yaml` (build step only) | Standard |
| Schema validation | `zod` (build step only) | Readable schema that doubles as documentation |
| Tests | `vitest` | Same toolchain as Vite |
| Framework | none | Version 1 is small enough; add one only if the panels get unwieldy |

### File layout
```
ClimateConnections/
  CLAUDE.md                    conventions for AI/implementer sessions
  README.md                    what it is, what it is not, how to run, how to add a link
  LICENSE                      MIT
  docs/PLAN.md                 this file
  docs/DATA_FORMAT.md          schema reference for contributors (copy of section 3, kept in sync)
  data/nodes.yaml              all phenomena and outcomes
  data/links.yaml              all causal links + sources list
  data/stories.yaml            guided walkthroughs (milestone 6)
  scripts/build-data.mjs       validate YAML, emit public/data/graph.json
  public/data/graph.json       generated; do not edit by hand; committed so the site builds without the script
  src/
    types.ts                   TypeScript types mirroring the schema
    engine/propagate.ts        scenario -> per-month states
    engine/propagate.test.ts
    ui/map.ts                  projection, base map, node markers, arrows
    ui/timeline.ts             scrubber + play button
    ui/card.ts                 node info panel
    ui/controls.ts             driver phase selector, start month
    ui/legend.ts               confidence legend
    main.ts                    wires everything together
    style.css
  index.html
  package.json, tsconfig.json, vite.config.ts
```

---

## 3. Data schema

### 3.1 `nodes.yaml`

A list of nodes under a top-level `nodes:` key. Each node:

```yaml
- id: enso                     # lowercase, snake_case, unique, stable (never rename)
  name: El Niño–Southern Oscillation
  kind: driver                 # driver | outcome
  label: ENSO                  # optional short map label (max 24 chars)
  lat: -2                      # marker position, decimal degrees
  lon: -125
  area: [[-175, 8], [-85, 8], [-85, -8], [-175, -8]]   # optional rough outline, [lon, lat] corners
  region: Tropical Pacific     # short human label for the card
  timescale: 2–7 years         # free text, shown on card
  # drivers only:
  onset_hint: ...              # one sentence under the start-month control (M8)
  default_start_month: 6       # month the start-month control jumps to for this driver (M9)
  phases:
    - id: el_nino
      label: El Niño
      color: "#d7301f"
      value: 1                 # where the phase sits on the driver's own axis (M10):
      summary: >               #   a link into the driver with effect +1 pushes it here
        ...
    - id: neutral
      label: Neutral
      color: "#999999"
      value: 0
      summary: ...
    - id: la_nina
      label: La Niña
      color: "#2b8cbe"
      value: -1
      summary: ...
  # outcomes only:
  axis: wet_dry                # wet_dry | warm_cool | active_quiet | high_low
  labels:                      # what +1 / 0 / -1 mean for THIS node, in plain words
    plus: Wetter than usual
    zero: Near normal
    minus: Drier than usual
  summary: >                   # 1–3 sentences, plain language, shown on card
    ...
  sources: [key1, key2]        # keys from the sources list in links.yaml (optional for nodes)
```

Rules:
- `kind: driver` nodes must have `phases` and must not have `axis`/`labels`.
  Phase values are unique within a driver and one phase has value 0.
- `kind: outcome` nodes must have `axis` and `labels` and must not have `phases`.
- `lat` in [-90, 90], `lon` in [-180, 180].
- Ids are permanent. If a node needs renaming, change `name`, never `id`.

### 3.2 `links.yaml`

```yaml
links:
  - id: enso_el_nino_to_indian_monsoon      # unique
    from: enso
    when: el_nino                            # a phase id of the `from` node
    to: indian_summer_monsoon
    effect: -1                               # +1 | -1 on the target's axis
    lag_months: [0, 4]                       # [min, max] months after driver onset
    season: [6, 7, 8, 9]                     # months (1–12) in which the effect is felt; empty = all year
    confidence: established                  # established | probable | contested
    mechanism: >                             # 1–2 sentences, plain language
      ...
    caveat: >                                # 1 sentence: why it might NOT happen
      ...
    evidence_note: >                         # optional, 1–3 sentences: where studies disagree,
      ...                                    #   how often the effect actually shows up, known exceptions
    sources: [rasmusson_carpenter_1983, kumar_1999]

sources:
  - key: rasmusson_carpenter_1983
    citation: "Rasmusson, E. M., & Carpenter, T. H. (1983). ..."
    url: https://...
```

Rules:
- `from` must be a `driver` node; `when` must be one of its phase ids.
- `to` must be an existing node: an `outcome` (version 1) or, since M10,
  another `driver`. For a driver target `effect` names the phase to push it
  into (the phase whose `value` equals the effect), the target must have such
  a phase, and a driver cannot push itself. Loop safety is the engine's job
  (section 4).
- `lag_months[0] <= lag_months[1]`, both in [0, 24].
- `season` values are integers 1–12, no duplicates.
- Every link needs `confidence`, `mechanism`, `caveat`, and at least one source key
  that resolves in the `sources` list.
- Asymmetry is expected: El Niño and La Niña effects are separate links. Do
  not derive one from the other automatically. If the literature only
  supports one phase, only add that one.

### 3.3 Confidence meaning (show this text in the legend)
- **established** — found in most events and in most studies; textbook material.
- **probable** — found in a majority of events, but with notable exceptions or regional disagreement.
- **contested** — reported by some studies, disputed or weak in others; shown so students see where the science is unsettled.

### 3.4 Showing uncertainty (required in every version)
Many teleconnections are weak, hold only in some decades, or are disputed
between studies. The app must make this visible, never hide it:
- **Line style** on the map encodes the confidence tier (section 5.3).
- **Every card** has a section titled "How sure are we?" that shows the
  confidence tier with its legend text, the `caveat`, and the
  `evidence_note` if present. Even an established link shows this section.
- **Confidence filter** in the controls: "Show: all / probable and above /
  established only". Hidden links are drawn as faint grey ghosts, not
  removed, so the student sees that something was left out.
- **Permanent disclaimer** under the title (section 5.6).
- Effects are always phrased as tendencies ("tends to be drier") in
  `labels`, `mechanism`, and card text. The validator warns on the words
  "will", "always", "causes" in `mechanism` and `caveat`.

---

## 4. Propagation engine

`src/engine/propagate.ts` exports one main function:

```ts
export function propagate(graph: Graph, scenario: Scenario): Timeline
// Scenario  = { driverId: string; phaseId: string; startMonth: 1..12; horizonMonths: number }
// Timeline  = { months: MonthState[] }
// MonthState = { index: number; calendarMonth: 1..12; nodes: Record<nodeId, NodeState> }
// NodeState = { value: -1|0|1; confidence: Confidence|null; viaLinkIds: string[]; inSeason: boolean; conflicting: boolean }
```

Semantics (implement exactly this; do not improvise):

1. Month index 0 is the month the driver enters its phase. `calendarMonth`
   for index `i` is `((startMonth - 1 + i) % 12) + 1`.
2. The driver node holds its phase for the whole horizon (version 1: 12 months).
3. For each link whose `from`/`when` match the scenario:
   - The effect *becomes available* at month index `lag_months[0]`.
   - It is *applied* in a month if `lag_months[0] <= index` **and**
     (`season` is empty **or** `calendarMonth` is in `season`).
   - `inSeason` on the target is true in months where the season test passes
     for at least one available link.
   - A link that is available but out of season is reported in
     `pendingLinkIds` so the UI can draw it muted.
4. Combination rule at a target node in a given month: sum the `effect`
   values of all applied links, clamp to [-1, 1]. If the applied links have
   both positive and negative effects, set `conflicting: true`. (Version 1
   with a single driver will rarely conflict; the rule exists so version 2
   does not need a rewrite.)
5. Node confidence is the *lowest* confidence among the links that produced
   its state (order: established > probable > contested).
6. Depth is bounded to 1 hop by default (driver → outcome, version 1). The
   `maxDepth` scenario field (M10) lets links run through drivers:
   - A link into a driver pushes it like any other target (sum, clamp,
     conflict flag). A non-zero value puts the driver into the phase with
     that `value`; 0 (conflicting pushes) leaves it in no phase.
   - At each hop the drivers pushed into a phase at the previous hop fire
     their own links for that phase, up to `maxDepth` hops, breadth first.
   - Each link fires once: a driver's onset in a phase is the first month
     index it is pushed there, fixed for the rest of the scenario, and its
     links count their lag from that onset. A pushed driver holds its phase
     only in months where the pushing link is applied; outside them its
     links do not fire (they are not reported at all, not even as pending).
   - Loop guard: a link into a driver that already holds a phase this month
     (the scenario driver, or a driver pushed at a shallower hop) is skipped
     and not reported. Feedback onto the scenario driver is therefore told
     on its card, never drawn.
   - Confidence: a link fired at hop *d* is reported one tier lower per hop
     beyond the first (`downgrade`, floored at contested) and never above the
     confidence of the driver state it starts from. Rule 5 then applies to
     the effective confidences. The `minConfidence` field ghosts links whose
     effective confidence is below the tier: they are reported with status
     `ghost`, apply nothing and push nothing.
   - Sums accumulate across hops within a month: a first-hop and a
     second-hop push on the same node add up and may conflict.
   - Per-link status is reported in `MonthState.links[id]` as
     `{ status: applied | pending | ghost, confidence, depth }`.
   The app runs with `maxDepth` 3 (every driver can appear once) when
   "Follow links through other drivers" is on, and 1 when it is off.
7. The function is pure. No Date, no randomness, no DOM.

Unit tests must cover: lag gating, season gating including year wrap
(e.g. season `[12, 1, 2]` starting in October), clamping, the conflicting flag,
and lowest-confidence selection.

---

## 5. Rendering

### 5.1 Map
- Projection: `d3.geoNaturalEarth1()` (or `geoEquirectangular` if Natural
  Earth looks wrong with arrows) rotated with `.rotate([-160, 0])` so the
  Pacific is centered. Fit to the container width with `fitWidth`.
- Base map: countries from `world-atlas/countries-110m.json` via `topojson-client`.
  Neutral fill, thin borders, ocean slightly darker than land or vice versa;
  the map must never compete with the arrows for attention.
- Sphere outline and graticule at low opacity.

### 5.2 Node markers
- Driver: larger circle, filled with the current phase color.
- Outcome: circle filled by state: `+1` and `-1` use a two-color scheme per
  axis (wet/dry: blue/brown; warm/cool: red/blue; active/quiet: orange/grey;
  high/low: purple/green). `0` is neutral grey. Not yet affected: hollow.
- Out-of-season nodes are drawn at reduced opacity and their arrow is muted.
- Conflicting nodes get a hatched fill or a ring, and the card says
  "conflicting influences".

### 5.3 Arrows
- One arrow per active link, from driver to target, drawn as a great-circle
  path: build a GeoJSON `LineString` from `d3.geoInterpolate` samples (about
  40 points) and run it through `geoPath`, so the projection handles wrap
  and clipping. Do not draw straight screen-space lines.
- Seam rule: with the Pacific centred, the projection seam runs through the
  Atlantic (about 20°W). A great circle from the tropical Pacific to Africa
  crosses that seam and would wrap around the map edge, which confuses
  students. Detect the crossing (a large jump between consecutive projected
  sample points) and fall back to a gently bowed quadratic curve in screen
  space for that arrow only.
- Short-hop exception (M9): the North Atlantic sits on the seam, so an arrow
  from the NAO marker to Europe crosses it after a few degrees. For a
  crossing arc shorter than a quarter of the globe the bowed curve would
  sweep across the whole map, which is worse than the wrap; draw the
  great circle as the seam splits it (a stub leaving one edge, the rest
  arriving from the other), the same way the coastlines are split.
- Markers use the node's optional `label` field (short text) and fall back
  to `name`.
- Stroke by confidence: established = solid, 2.5px; probable = dashed, 2px;
  contested = dotted, 1.5px, 60% opacity.
- Color by effect sign, matching the target's marker color.
- Arrowhead via SVG marker.
- On arrival (first month the link is applied) animate the arrow drawing
  itself using stroke-dasharray/dashoffset over ~600ms.

### 5.4 Timeline
- Horizontal scrubber, 0–12, labeled with calendar month names.
- Play/pause button; play advances one month per ~1.2 s.
- Current month shown large in the corner of the map ("Month 4 — October").

### 5.5 Card panel (right side)
On clicking a node show: name, region, current state in plain words, then for
every link currently affecting it: the mechanism, and a "How sure are we?"
block with the confidence badge and legend text, the caveat, the
evidence note if any, and sources as links. Out-of-season or pending links
are listed under "Not yet / out of season". For the driver node show the
phase description and the timescale.

### 5.6 Controls (top-left)
- Driver phase selector: three buttons (El Niño / Neutral / La Niña).
- Start month selector (default: June, because El Niño events typically
  begin to develop in boreal late spring/summer).
- Confidence filter: all / probable and above / established only (section 3.4).
- Legend: confidence line styles and the state color scheme.
- A permanent one-line disclaimer under the title: "Shows historical
  tendencies from published research. Not a forecast, not a simulation."

### 5.7 Affected-areas layer
A separate, toggleable layer drawn between the base map and the arrows.
Each node may carry an `area` (rough polygon as [lon, lat] corners, see
section 3.1). The polygon is filled and outlined in the same colour and
state as the node's marker (translucent fill when active, faint dashed
outline when pending, grey dotted outline when inactive). A `global`
outcome has no polygon; instead the map's outer edge is tinted with its
state colour. The layer never restyles points or arrows; it is additive,
and the "Show affected areas" checkbox turns it off. Areas are
illustrative outlines, not scientific boundaries, and the control says so.

### 5.8 Accessibility and print
- All colors must also be distinguishable by line style or shape.
- The page must survive `Ctrl+P` as a legible one-page figure (add a print
  stylesheet that hides controls).

---

## 6. Milestones

Do them in order. Each has acceptance criteria; all must pass before moving on.

### M1 — Scaffold
- Vite vanilla-ts project, deps added, strict tsconfig.
- `npm run dev` shows an empty page titled "Climate Connections".
- `npm run build` produces `dist/`.

### M2 — Data + validation
- `data/nodes.yaml` with ENSO and ~20 outcome nodes (see section 8 for the list).
- `data/links.yaml` with El Niño and La Niña links, all sourced.
- `scripts/build-data.mjs` using zod; `npm run build:data` writes
  `public/data/graph.json`.
- Deliberately break a link (bad node id, missing source) and confirm the
  script fails with a clear message. Restore it.

### M3 — Engine
- `propagate.ts` implemented per section 4.
- `npm test` green with the test cases listed in section 4.

### M4 — Static map
- Pacific-centered base map renders and resizes with the window.
- All nodes drawn as hollow markers at the right places (sanity-check a few
  by eye: Peru coast, Indonesia, southeast Australia, Gulf of Mexico).

### M5 — Scenario rendering
- Phase buttons + timeline drive the engine; markers and arrows update.
- Scrubbing to month 12 in an El Niño scenario shows drier Indonesia and
  eastern Australia, wetter Peru coast and southern US, quiet Atlantic
  hurricane season. If it does not, the data or engine is wrong; fix that,
  not the renderer.
- Confidence line styles visible; legend present.

### M6 — Cards and stories
- Click a node, read the card, follow a source link.
- `data/stories.yaml` with two stories:
  1. "The 1997–98 El Niño": a sequence of {month, focusNodeId, text} steps.
  2. "A La Niña year in the Southern Hemisphere".
- A "Stories" dropdown that plays a story: sets the scenario, steps the
  timeline, highlights the focus node, shows the text.

### M7 — Polish
- Print stylesheet; disclaimer; keyboard support for the scrubber (arrow keys).
- README complete: what it is, what it is not, how to run, how to add a link.

Version 1 is done when M1–M7 pass and the acceptance checklist in section 7
is fully green.

### M8 — Second driver: Indian Ocean Dipole (first version-2 item; signed off 2026-09-07)
- Data: `iod` driver node with positive / neutral / negative phases; three new
  outcome nodes (southeast Australia winter–spring rainfall, south India and
  Sri Lanka northeast monsoon, East Asia summer temperature); ten cited links
  (six positive, four negative, asymmetric on purpose); one story (the 2019
  positive event).
- Schema: drivers carry `onset_hint`, the sentence shown under the start-month
  control, so no climate fact stays in `src/`.
- UI: driver dropdown above the phase buttons; phase buttons rebuild per
  driver; the driver not in play is drawn grey and its card says so; the
  print caption names the driver.
- Engine: unchanged. A scenario is still one driver in one phase.
- Tests: acceptance block for positive and negative IOD (June start), neutral
  phases apply nothing, ENSO-only regions stay hollow under the IOD.
- Not in M8 (later v2 items): driver-to-driver links, multi-driver scenarios
  with conflict flags, compare mode.

### M9 — Third driver: North Atlantic Oscillation (signed off 2026-09-07)
- Data: `nao` driver node with positive / neutral / negative phases; six new
  outcome nodes (northern Europe winter temperature, Norway and Scotland
  winter precipitation, Iberia and Mediterranean winter rainfall, eastern
  North America winter temperature, Greenland and Labrador winter
  temperature, Turkey and Middle East winter rainfall); twelve cited links,
  six per phase, all with zero lag and a winter-only season, because the
  sources describe a see-saw that works in both directions (established for
  the Europe–Greenland–Iberia core, probable for eastern North America,
  contested for the Middle East); one story (the record negative winter of
  2009–10).
- Schema: drivers carry `default_start_month`. Picking a driver moves the
  start-month control to it (ENSO and IOD: June; NAO: December), so a
  winter pattern is not shown starting in June and the "June" default
  leaves `src/`.
- Rendering: the short-hop seam exception in section 5.3, so the NAO's
  European arrows are not drawn as curves across the Pacific.
- Honesty note carried in the data: the NAO swings within weeks, so a
  twelve-month scenario "holding" a phase is a simplification of a winter
  that leans one way on average. The driver summary, the onset hint and the
  story's last step all say so, and the summer months show every NAO link
  as pending rather than applied.
- Engine: unchanged.
- Tests: acceptance block for positive and negative NAO (December start),
  nothing applied April–October, ENSO/IOD regions stay hollow, the default
  start months, neutral applies nothing for all three drivers.
- Not in M9 (later v2 items): driver-to-driver links (the NAO–ENSO winter
  interplay in the 2009–10 story is told in text, not drawn), multi-driver
  scenarios with conflict flags, compare mode.

### M10 — Driver-to-driver links (signed off 2026-09-07)
- Schema: every driver phase carries `value` (+1 / 0 / −1); a link's `to`
  may be a driver, and its `effect` then names the phase to push it into.
  The validator checks the phase exists, forbids self-pushes, and checks
  story steps through one pushed driver.
- Data: six cited links. El Niño → positive dipole and La Niña → negative
  dipole (probable, June–November, asymmetric in the evidence notes);
  El Niño → negative NAO (probable, January–March, with the caveat that the
  strongest events did not follow) and La Niña → positive NAO (contested);
  negative dipole → El Niño the following year and positive dipole → La Niña
  (both contested, lag 11–14 months, so they only show at the tail of the
  timeline). One story: the 1997 El Niño seen from the Indian Ocean, with
  the monsoon tug-of-war and the winter where the chain broke.
- Engine: section 4 rule 6 as written above: `maxDepth`, `minConfidence`,
  onset-based lag, loop guard, per-hop downgrade, `MonthState.links`.
  Sums accumulate across hops (found by the acceptance test: the monsoon
  gets El Niño's −1 and the dipole's +1 and must read as conflicting, 0).
- Rendering: arrows are drawn from the driver that fires them; an arrow
  into a driver is coloured with the phase it pushes toward; a pushed driver
  gets its phase colour with a dark dashed ring (legend row added), or a
  faded marker when its push is out of season; line style follows the
  effective confidence. The card for a pushed driver says who pushed it and
  lists the pushing links; an outcome card says "through <driver>" and
  explains the downgrade; the scenario driver's card lists incoming links
  from other drivers under "Feedback from other drivers", not drawn.
- Controls: "Follow links through other drivers" checkbox (on by default);
  the confidence filter now ghosts by effective confidence; the print
  caption names the setting.
- Tests: engine unit block (push, depth, onset lag, downgrade, cap, loop
  guard, conflict cancels a push, ghosts), acceptance blocks for El Niño
  and La Niña chains, the dipole → La Niña tail, and the data; stories test
  runs at depth 3 and accepts conflicting focus nodes.
- Not in M10 (later v2 items): multi-driver scenarios (two chosen phases at
  once), season dial, compare mode.

---

## 7. Version-1 acceptance checklist

- [x] Every link in `links.yaml` has a source that resolves and a caveat.
      (enforced by `npm run build:data`; re-checked by `src/engine/acceptance.test.ts`)
- [x] `npm run build:data`, `npm test`, `npm run build` all pass from a clean clone.
- [x] Map is Pacific-centered; no country is split at the screen edge in a way that hides a node.
- [x] El Niño, month 12, June start: Indonesia dry, eastern Australia dry, Peru coast wet, Gulf Coast wet, Atlantic hurricanes quiet, Indian monsoon weakened, East Africa short rains wet, southern Africa dry.
      Each effect appears with the right sign within the twelve months; the month-12 map is June again, so the winter effects (Peru coast, Gulf Coast, southern Africa, East Africa short rains) show as pending there, exactly as the season gate in section 4 says they should. Verified by `src/engine/acceptance.test.ts` and in the browser.
- [x] La Niña, month 12, June start: broadly the reverse where links exist; nodes with no La Niña link stay hollow (do not fake symmetry).
      Verified by `src/engine/acceptance.test.ts`.
- [x] Out-of-season effects are visibly muted and their card says so.
- [ ] Three confidence styles are visibly distinct on a projector at 3 m.
      Distinct on screen and in print (solid / dashed / dotted, three widths). Not yet checked on a real projector.
- [x] Two stories play end to end.
- [x] Disclaimer visible at all times (header on screen, header on the printed page).
- [x] Page prints legibly (landscape, one figure: title, disclaimer, map, caption, legend, open card).

---

## 8. Version-1 content list

Driver: **ENSO** (`enso`), phases el_nino / neutral / la_nina, marker in the
central equatorial Pacific.

Outcome nodes (ids are suggestions; keep them if nothing better):

| id | region | axis | main El Niño tendency | main La Niña tendency |
|---|---|---|---|---|
| indian_summer_monsoon | India | wet_dry | weaker (−) | stronger (+), weaker link |
| indonesia_rainfall | Maritime Continent | wet_dry | dry, fire risk (−) | wet (+) |
| east_australia_rainfall | Eastern Australia | wet_dry | dry (−) | wet, floods (+) |
| peru_coast_rainfall | Coastal Peru/Ecuador | wet_dry | very wet (+) | dry (−) |
| peru_fishery | Humboldt Current | active_quiet | collapse (−) | boost (+) |
| us_gulf_coast_winter | Southern US / Florida | wet_dry | wet (+) | dry (−) |
| california_winter | California | wet_dry | wet (+), contested | dry (−), contested |
| pacific_northwest_winter | PNW / W Canada | warm_cool | warm/dry (+) | cool/wet (−) |
| atlantic_hurricanes | Tropical Atlantic | active_quiet | suppressed (−) | enhanced (+) |
| east_pacific_hurricanes | Eastern Pacific | active_quiet | enhanced (+) | suppressed (−) |
| east_africa_short_rains | Horn of Africa | wet_dry | wet (+) | dry (−) |
| southern_africa_summer | Southern Africa | wet_dry | dry (−) | wet (+) |
| sahel_rainfall | Sahel | wet_dry | dry (−), probable | wet (+), probable |
| northeast_brazil | Nordeste | wet_dry | dry (−) | wet (+) |
| southeast_south_america | Uruguay / S Brazil / NE Argentina | wet_dry | wet (+) | dry (−) |
| central_chile_winter | Central Chile | wet_dry | wet (+) | dry (−) |
| philippines_rainfall | Philippines / SE Asia | wet_dry | dry (−) | wet (+) |
| central_pacific_islands | Kiribati / central Pacific | wet_dry | wet (+) | dry (−) |
| coral_bleaching_central_pacific | Central Pacific reefs | high_low | high (+) | low (−) |
| global_mean_temperature | Global | warm_cool | warm (+), lag 3–6 mo | cool (−) |
| east_asia_winter | Japan / E China | warm_cool | mild (+), probable | cold (−), probable |

Primary references to start from (the implementer should read these before
writing mechanism text):
- NOAA Climate Prediction Center, "ENSO impacts" pages and the classic
  El Niño / La Niña global impact maps (Ropelewski & Halpert 1987, 1989).
- Australian Bureau of Meteorology, ENSO and Australian climate pages.
- IRI (Columbia) ENSO teleconnection maps.
- Rasmusson & Carpenter (1983); Kumar, Rajagopalan & Cane (1999) for the
  Indian monsoon; Gray (1984) for Atlantic hurricanes; Trenberth et al. (2002)
  for global temperature response.

---

## 9. Known hurdles and the chosen answer

| Hurdle | Answer |
|---|---|
| Effects are tendencies, not certainties | Confidence tiers in data, line-style encoding, caveat on every card, permanent disclaimer |
| Feedback loops between drivers (v2) | Bounded depth, each link fires once, confidence downgrade per hop, loops explained in text not animated (done in M10: the scenario driver's card lists incoming links under "Feedback from other drivers") |
| Two drivers pushing one region opposite ways (v2) | Sum-and-clamp with a "conflicting" flag; the flag is a teaching point |
| Students trust a polished map too much | Disclaimer, caveats, and the contested tier shown rather than hidden |
| Pacific split on standard maps | Rotated projection from day one |
| Wildly different time scales across phenomena | Monthly is the home scale; faster/slower phenomena are context nodes without animation |
| Sourcing effort | Start from review-level sources (NOAA CPC, BoM, Ropelewski & Halpert); the count of well-supported links is small, which limits scope naturally |

---

## 10. Roadmap beyond version 1 (do not start without sign-off)

- **v2:** Indian Ocean Dipole (done, M8) and North Atlantic Oscillation
  (done, M9) as drivers; driver-to-driver links (done, M10); season dial;
  compare mode (two maps side by side); multi-driver scenarios with
  conflict flags; spreadsheet-to-YAML importer if outside contributors join.
- **v3:** globe view; historical index data overlay from NOAA (ONI, DMI,
  NAO); quiz mode ("predict the map, then reveal").
