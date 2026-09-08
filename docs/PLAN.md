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
  graph plus a scenario (driver id, phase, start month, since M11 an
  optional second driver and phase, since M12 that driver's own start
  month and since M15 whether that month lies before the first driver's)
  and returns a per-month state table.
  Fully unit-testable.
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
8. Two chosen drivers (M11). The optional `secondary` scenario field names a
   second driver and phase, chosen by hand:
   - Both chosen drivers enter their phase at month 0 and hold it for the
     whole horizon. Both fire their links at the first hop, at full
     confidence; rules 3–5 apply unchanged, so at a shared target the two
     drivers' effects add up and opposite signs set `conflicting`.
   - A chosen driver is never pushed: a link into it from the other chosen
     driver (or from a pushed driver) is skipped and not reported, the same
     loop guard as rule 6. Drivers that are not chosen can still be pushed
     by either chosen driver and followed at depth.
   - The same driver cannot be chosen twice; the engine throws.
   - A neutral second phase applies nothing but still pins the driver: it
     cannot be pushed, so the result is the single-driver scenario with that
     driver held out of play (its chain is cut).
   - Own start month (M12). `secondary.startMonth` (calendar month 1–12,
     optional) is read within the twelve months shown: the second driver's
     onset is the first month index at or after 0 whose calendar month is
     `startMonth`, i.e. `(startMonth - scenario.startMonth + 12) % 12`, so a
     month earlier in the calendar than the scenario's falls in the
     following year. Omitted, or equal to the scenario's start month, means
     onset 0 and the M11 result exactly. Before its onset the second driver
     holds no phase (value 0), fires nothing (its links are not reported,
     not even as pending) and is still pinned: a link into it is skipped
     and not reported, as above. From its onset it holds its phase to the
     end of the horizon and its links count their lag from that onset, as
     a pushed driver's do from the month it was pushed. Exported as
     `chosenOnset(scenario, driverId)` (0 for the main driver).
   - Begins before the first (M15). `secondary.startsBefore` (optional
     boolean) reads `startMonth` backwards instead: the onset is
     `(startMonth - scenario.startMonth + 12) % 12 - 12`, an index from -12
     (the same calendar month a year earlier; also the result when
     `startMonth` is omitted) to -1. Month index 0 is still the first
     driver's onset and the horizon is unchanged: the second driver is
     simply already in its phase at month 0 and holds it to the end, and
     its links count their lag from the negative onset, so a link whose lag
     has already run is available (applied or pending) from month 0 and
     one whose lag is longer than the head start arrives at
     `onset + lag`. Everything else in rule 8 stands: never pushed, sum
     and clamp, one hop at full confidence. `startsBefore: false` is the
     M12 result exactly.

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
- Conflicting nodes get a dashed ring, and the card says "conflicting
  influences". When the pushes cancel to 0 the fill is a grey hatch (M11),
  so a tie is not read as "near normal".

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
- The season dial in the controls panel (section 5.6, M13) is the
  timeline's calendar counterpart: it follows the month shown and jumps
  the scrubber by calendar month.

### 5.5 Card panel (right side)
On clicking a node show: name, region, current state in plain words, then for
every link currently affecting it: the mechanism, and a "How sure are we?"
block with the confidence badge and legend text, the caveat, the
evidence note if any, and sources as links. Out-of-season or pending links
are listed under "Not yet / out of season". For the driver node show the
phase description and the timescale.

### 5.6 Controls (top-left)
- Driver phase selector: three buttons (El Niño / Neutral / La Niña).
- Second driver (M11): a dropdown ("None" or any other driver) with its own
  phase buttons, and (M12) its own "Second driver begins in" month picker,
  shown only while a second driver is chosen and defaulting to that
  driver's `default_start_month`; a hint under it says how many months
  after the first driver that is ("in the following year" when the month
  wraps) and repeats the driver's onset hint. Picking the second driver as
  the main one empties the second slot. Under the month picker (M15) two
  buttons, "After the first driver" and "Before the first driver", say
  which way the month is read; with "before" the hint says how many
  months earlier that is ("in the previous year" when the month wraps, "A
  year before" for the same month) and that the driver is already under
  way at month 0. The timeline's first tick then carries a small arrow and
  a tooltip instead of an underlined later tick; the map colours the
  driver from month 0; the pane title says "since May" rather than "from
  May"; the print caption says "already under way since May, 4 months
  earlier".
- Start month selector (default: June, because El Niño events typically
  begin to develop in boreal late spring/summer). Its heading reads "Event
  begins in", or "First driver begins in" while a second driver is chosen.
- Season dial (M13), under the start month: the calendar year as a circle
  of twelve month sectors, January at the top, clockwise. The month on
  screen is filled and follows the timeline; a dark triangle outside the
  ring marks where the year shown begins, a dot in the phase colour where a
  second driver begins (hollow, M15, when it began before the year shown:
  the tooltip says since when). Inside, one ring for the whole scenario: each
  month shaded by how many of the links in play (applied or pending at
  some month; ghosts excluded) pass the season gate, against the busiest
  month, with the count "k of N in season now" in the centre. While a
  place is selected the inner area shows one ring per link acting on it
  instead, coloured by effect over its season months and grey outside
  them, with a tooltip naming the firing driver, the tendency, the season
  in words ("Dec–Mar") and the minimum lag. The dial shows the season gate
  only and its hint says so: a month can be in season and still empty
  while the lag runs. Clicking a sector (or Enter on it) jumps the
  timeline to the first month index with that calendar month, pauses play
  and leaves a running story alone, like the scrubber. Hidden in print.
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

### 5.9 Compare mode (M14)
- A "Compare" section at the top of the controls panel, under Stories: a
  checkbox "Two scenarios side by side" and, while it is on, two buttons
  "Edit A" / "Edit B" and a live line ("4 markers differ this month (dark
  rings)" or "The two maps agree this month.").
- Two maps side by side in the map area, each with a title strip: the side
  tag, the scenario in words ("El Niño from June + Negative IOD from
  September · direct links only"; the filter and chain are named only when
  they are not the defaults) and that map's calendar month and month index.
  The side being edited carries the accent; clicking a title makes that
  side the edited one.
- Both maps follow the one timeline by month index. Scenario B is a full
  scenario of its own (driver, phase, start month, second driver and its
  month, confidence filter, chain); the areas toggle is shared. The
  existing scenario controls, the dial, the timeline's ticks and
  second-onset mark and the card's details all follow the edited side.
  When the two start months differ the header shows "Month N" with both
  calendar months underneath.
- B starts as a copy of A with the opposite phase (El Niño → La Niña; from
  neutral, the driver's first non-neutral phase), so the maps differ from
  the start. Turning compare off keeps A.
- Each marker the two scenarios treat differently this month gets a dark
  outer ring on both maps. "Differently" is decided by
  `src/engine/compare.ts` from the engine's own states: none (neither acts),
  same (same value and conflict flag), opposite (nonzero, opposite sign),
  only A / only B (one acts, the other does not), differ (anything else:
  applied against pending, a push against a cancelled tie, a driver in a
  phase against one held out). No third state is invented and the two
  scenarios are never blended.
- The card, with a place selected, opens with a side-by-side block: the
  place's state under A and under B in plain words and colour, a one-line
  verdict in the words above, and a note that the details below are for
  the edited side. The rest of the card is unchanged.
- A story is one scenario: picking a story turns compare off; turning
  compare on ends a story, like any change to the scenario by hand.
- Print: both maps side by side with their titles, the side switch hidden,
  and the caption "Two scenarios compared. A: … B: …".

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

### M11 — Two chosen drivers (signed off 2026-09-07)
- Engine: section 4 rule 8. `Scenario.secondary` names a second driver and
  phase; both chosen drivers start at month 0, fire at the first hop at full
  confidence, add up under the existing sum-and-clamp rule, and are never
  pushed. No new combination rule: the conflict flag from rule 4 is the
  teaching point.
- Schema: a story may carry `second_driver` and `second_phase` (both or
  neither). The validator checks the driver exists, differs from the main
  one, and has the phase, and treats links from either chosen driver as
  direct when checking story steps.
- Data: one story, "2010–11: La Niña and a negative dipole together" (June
  2010 start), with one new source (Dutra et al. 2013 on the Horn of Africa
  drought). It shows two same-sign pushes on East Africa's short rains, a
  region lit by the second driver alone, one lit by the first alone, and
  says plainly that holding a chosen dipole for twelve months is a
  simplification.
- Rendering: `RenderOptions.chosen` (driver id to phase colour) replaces the
  single driver; a chosen driver keeps its plain white ring, a pushed one
  the dark dashed ring. Conflicting markers that cancel to 0 get a grey
  hatch fill and a dark dashed ring (legend row added).
- Cards: a chosen driver's card says "chosen by hand" when two are chosen;
  with two chosen drivers every link block says "from <driver>"; a
  feedback link whose source is the other chosen driver says it is skipped.
- Controls: "Second driver (optional)" dropdown and phase buttons; the print
  caption names both drivers.
- Tests: engine unit block (both held, first-hop links, sum and conflict,
  chosen drivers never pushed, neutral second driver, same driver twice
  refused), acceptance blocks for El Niño + negative dipole (conflicts in
  Indonesia and East Africa), La Niña + negative dipole (the story), and
  general cases (neutral, NAO chosen alongside El Niño); the stories test
  passes the second driver to the engine.
- Not in M11 (later v2 items): season dial, compare mode, a separate start
  month for the second driver (done in M12).

### M12 — The second driver's own start month (signed off 2026-09-07)
- Engine: section 4 rule 8, last bullet. `ScenarioDriver.startMonth`
  (calendar month, optional, second driver only) gives the second driver an
  onset of `(startMonth - scenario.startMonth + 12) % 12`; before it the
  driver is out of play and still pinned, from it its links count their
  lag. `chosenOnset(scenario, driverId)` is exported for the UI. Omitted
  or equal months reproduce M11 exactly.
- Schema: a story may carry `second_start_month` (needs `second_driver`;
  defaults to `start_month`). The validator's story-step check counts the
  second driver's lags from that onset.
- Data: no new facts. The 2010–11 story keeps its shared June start.
- Rendering: the map colours a chosen driver only once it is in its phase;
  before that it is drawn as an inactive (grey) driver. The timeline
  underlines the tick where the second driver begins.
- Cards: before its onset the second driver's card says "Not yet in play:
  enters <phase> in <month>, month N" and that nothing can push it; after
  it, the "chosen by hand" note says when it entered and that lags count
  from then. Each of its link blocks says "Month 0 here is <month>, when
  <driver> entered its phase (month N on the timeline)".
- Controls: "Second driver begins in" picker with a hint ("3 months after
  the first driver", "in the following year"); the main month heading
  becomes "First driver begins in" while a second driver is chosen. Picking
  a second driver sets its month to its `default_start_month`, so ENSO +
  NAO now starts the NAO in December rather than June. The print caption
  names both months when they differ.
- Tests: engine unit block (onset arithmetic including the year wrap, out
  of play before onset, lags from onset, conflict only after onset, never
  pushed before onset either, equal month = no month), acceptance blocks
  for El Niño + negative dipole from September (Indonesia conflict from
  September, East Africa conflict a month later than with a shared start,
  southeast Australia hollow while the pinned dipole waits), El Niño + a
  positive NAO from December (pinned through November, its links absent
  rather than pending), and the March wrap; the stories test passes the
  second start month.
- Not in M12 (later v2 items): season dial (done in M13), compare mode, a
  second driver that begins *before* the first (the timeline starts at the
  first driver's onset).

### M13 — Season dial (signed off 2026-09-07)
- Engine: `src/engine/season.ts`, pure helpers beside the engine, no change
  to `propagate`: `linksInPlay(graph, timeline)` (every link reported
  applied or pending in some month, graph order, ghosts excluded),
  `inSeason(link, calendarMonth)`, `seasonProfile(links)` (twelve
  `SeasonMonth` entries, January first, each listing the links in and out
  of season) and `indexForCalendarMonth(startMonth, calendarMonth)` (the
  first month index that shows the calendar month; the start month maps
  to 0).
- Schema and data: no change. The dial reads each link's `season`.
- Rendering: `src/ui/dial.ts`, section 5.6. The controls panel exposes an
  empty slot (`dialHost`) under the start-month hint; the page draws the
  dial into it and re-renders it with every month and every scenario
  change. Sectors are keyboard buttons (`role=button`, `aria-pressed` on
  the month shown, `aria-label` "Jump to March, month 9 after onset").
- Tests: `src/engine/season.test.ts`: the index mapping including the
  wrap, the season gate and the profile (empty season = all year, year
  wrap, no links), links in play (applied and pending, the other phase and
  a never-reached lag left out, ghosts left out, a second driver's links
  from its own month, a pushed driver's links with the chain on), and two
  blocks on the shipped data (monsoon a summer link and the Gulf Coast a
  winter one, every month has something in season; every applied link is
  in season in its calendar month and every pending one is not).
- Browser check (`W:\temp\claude\ClimateConnections\cdp-m13.mjs`, 30
  checks): sectors and labels, the current and start sector following the
  timeline, the onset triangle and second-driver dot, the heat ring's
  counts matching the distinct non-ghost arrows drawn over the year,
  click and Enter jumping by calendar month and pausing play, one ring
  for the monsoon with the chain off and two with it on, the Gulf Coast's
  winter ring wrapping the year, East Africa's two rings with a negative
  dipole from September, the fallback caption for a place nothing acts
  on, a story left open by a sector click, the NAO's December start, and
  the dial hidden in print.
- Not in M13 (later v2 items): compare mode (done in M14); a second driver
  that begins before the first.

### M14 — Compare mode (signed off 2026-09-07)
- Engine: `src/engine/compare.ts`, pure helpers beside the engine, no change
  to `propagate`: `acts(state)`, `compareNode(a, b)` (the verdicts in
  section 5.9), `compareMonth(a, b)` (a verdict per node of either month)
  and `differing(a, b)` (the ids whose verdict is neither none nor same).
  The page runs `propagate` once per side on the same month index.
- Schema and data: no change.
- Rendering: section 5.9. `MapView` takes an id prefix so two maps can share
  a page (arrowheads and the conflict hatch keep separate ids) and a
  `differs` set that adds the `differs` class and an outer ring. The
  controls' state carries `compare: { side, b }`; `ScenarioSettings` is
  the per-side part, `sideSettings` / `editedSide` / `oppositePhaseId`
  are exported for the page. `renderCard` takes an optional comparison
  (both months and titles, and the edited side).
- Tests: `src/engine/compare.test.ts`: the verdicts on hand-made states
  (acts, none / only, same regardless of which links produced it, opposite,
  differ for applied against pending and a push against a cancelled tie),
  and on the shipped data: a scenario against itself never differs; El Niño
  against La Niña (driver and Indonesia opposite, the monsoon a tie against
  wet with the chain on and opposite without it, the NAO untouched in
  August); El Niño against neutral (only A everywhere); El Niño alone
  against El Niño with a negative dipole from September (southeast
  Australia only A while the dipole is pinned, the dipole and southeast
  Australia opposite in October, Indonesia a tie in B, East Africa wet
  against a tie in December, the Gulf Coast never differing); the chain on
  against off (the pushed dipole itself the same, its own effects only A).
- Browser check (`W:\temp\claude\ClimateConnections\cdp-m14.mjs`, 39
  checks): one map and no rings at load; compare on gives two panes, B = La
  Niña from June, the drivers in their own colours, prefixed arrowhead ids,
  the live note matching the ringed markers on both maps and the engine
  (ENSO, Indonesia and eastern Australia ringed at month 0, the pending Gulf
  Coast not); the Indonesia card's two cells and "Opposite"; the side
  buttons and pane titles switching the edited side without changing either
  scenario; a second driver added to B only, with the timeline's Sep mark,
  the dial's dot and "Only scenario A" / "differ" verdicts (East Africa wet
  against a hatched tie in December); the NAO on B with the header "Month 1
  · A: July · B: January" and ticks from December; chain and filter per
  side named in the titles; ArrowRight moving both maps; a story turning
  compare off and compare ending a story; compare off keeping A; print with
  two columns, titles, hidden side switch and the two-part caption
  (`m14-print.pdf`).
- Not in M14 (later v2 items): a second driver that begins before the
  first (done in M15); the spreadsheet importer.

### M15 — A second driver that begins before the first (signed off 2026-09-07)
- Engine: section 4 rule 8, last bullet. `ScenarioDriver.startsBefore`
  reads the second driver's start month backwards, giving an onset from
  -12 to -1; `chosenOnset` returns it. Month 0 stays the first driver's
  onset (the timeline is not moved or lengthened): the second driver is in
  its phase from month 0 and its links count their lag from the negative
  onset, so lags that have already run are felt from the first frame.
  Nothing else in `propagate` changes.
- Schema: a story may carry `second_starts_before: true` (needs
  `second_driver`). The validator's story-step check reads the onset the
  same way.
- Data: one story, "2016: a negative dipole first, then a weak La Niña"
  (La Niña from September 2016, the dipole negative since May), with three
  new sources: Lim and Hendon 2017 on the 2016 dipole and its part in the
  La Niña, Uhe et al. 2018 on the 2016 Kenyan drought, and NOAA's ONI
  table. Its teaching point is East Africa: the dipole's arrow arrives in
  October because its three-month clock started in May, La Niña's only in
  December. It says plainly that a dipole held for sixteen months is a
  convenience.
- Rendering: the map needs no change (a negative onset is "in phase" from
  month 0). The timeline marks the first tick (`.second-before`, a small
  arrow and a tooltip) instead of underlining a later one. The dial's
  second-driver dot is hollow, with a "since May" tooltip. The pane title
  says "since May"; the print caption says "already under way since May,
  4 months earlier".
- Cards: the second driver's card says when it entered its phase, how many
  months before the year shown, how long it has held it so far, that its
  lags count from then, and, past twelve months, that no real event lasts
  that long. Each of its link blocks says "Month 0 here is May, when the
  dipole entered its phase, 4 months before the year shown begins".
- Controls: "After the first driver" / "Before the first driver" buttons
  under the second driver's month picker; the hint under it counts
  backwards ("4 months before the first driver: already under way when the
  year shown begins"). Compare mode carries the flag per side like any
  other scenario setting.
- Tests: engine unit block (onset arithmetic from -1 to -12 including the
  omitted month, in phase from month 0, lags that have and have not run,
  pending from the first frame, conflict from month 0, never pushed even
  with a short lag back into the first driver, `false` = M12 exactly),
  acceptance blocks for the 2016 scenario (the dipole from month 0 against
  month 8 with "after", southeast Australia at month 0, East Africa's two
  arrivals, Indonesia's two pushes, the next-year push skipped, agreement
  with a shared start from December on, the shipped story's fields), El
  Niño with a positive NAO since the previous December (in phase from
  June with its winter links pending, matching "after" in winter), and
  general cases (a year before changes only what is pending, a neutral
  driver still pinned, story fields); the stories test passes the flag.
- Browser check (`W:\temp\claude\ClimateConnections\cdp-m15.mjs`): the
  order buttons hidden without a second driver and defaulting to "after";
  "before" with May under a June start: the hint, the first tick's mark,
  the dipole coloured at month 0 with a plain ring, southeast Australia wet
  at month 0, the cards, the hollow dial dot, the pane title and print
  caption; the 2016 story's steps; switching back to "after" pins the
  dipole; compare mode with "before" on one side only.
- Not in M15: the spreadsheet importer (only if outside contributors join).

### M16 — Fourth driver: Southern Annular Mode (signed off 2026-09-07)
- Data: `sam` driver node with positive / neutral / negative phases (marker
  in the Southern Ocean at 58°S, area band across the Pacific sector;
  `default_start_month` 6); four new outcome nodes (southwest Western
  Australia winter rainfall, southern Chile and Patagonia rainfall,
  Antarctic Peninsula summer temperature, Western Cape winter rainfall);
  sixteen outcome links, eight per phase, on those four and on four
  existing nodes (southeast Australia winter rainfall, eastern Australia
  summer rainfall, New Zealand summer temperature, southeast South America
  spring rainfall). The sources describe regressions and composites that
  run both ways, so every target has a link per phase; seasons follow
  Hendon et al. (extended winter May–October, extended summer
  November–April), so the same region can lean one way in winter and the
  other in summer. Tiers: established for the Australian winter rain, the
  Cape's neighbour Patagonia and the Peninsula; probable for the east
  coast in summer, New Zealand and the Western Cape (whole-country studies
  find the opposite sign for South Africa); contested for southeast South
  America, whose sign changed between decades. Two driver-to-driver links,
  ENSO to the SAM in the austral summer (El Niño toward negative, La Niña
  toward positive; probable, lag 4–6, November–February), so El Niño with
  the chain on cools New Zealand twice over, same sign, one tier down.
  Nineteen sources, every one resolved on Crossref before use. One story,
  "2019: a broken polar vortex, a negative SAM and the Black Summer" (SAM
  negative from November 2019, the dipole positive since June with
  `second_starts_before`), six steps ending with a postscript in May 2020
  where the dipole's contested next-year link pushes the Pacific toward
  the La Niña that did form.
- Honesty note carried in the data, as for the NAO: the mode swings within
  weeks, so a phase held for a year is a simplification of a season that
  leans one way; the driver summary, the onset hint and the story's last
  step all say so.
- Schema, engine, UI: unchanged. A driver is data.
- Tests: acceptance blocks for positive SAM from June (winter links from
  month 0 and Patagonia all year, summer links pending in winter and
  applied in January with the winter ones pending in turn, the same region
  leaning both ways by season, tiers and their notes, other drivers'
  regions hollow), negative SAM (every target reversed, eastern Australia
  dry from November), El Niño pushing the SAM negative from November with
  its summer links one tier down and its winter links only ever pending,
  La Niña plus the pushed SAM on eastern Australia, and the 2019 scenario
  (dipole onset -5, eastern Australia through both without conflict,
  southeast Australia hollow in December, ENSO pushed toward La Niña at
  month 6, the shipped story's fields). Existing expectations updated: four
  drivers, eight driver-to-driver links, and the 2010–11 story's January
  eastern Australia now also carries the pushed SAM.
- Browser check (`W:\temp\claude\ClimateConnections\cdp-m16.mjs`): the five
  new markers placed with no label overlap (Patagonia moved to 44°S to
  clear the global-temperature label), the driver dropdown and phase
  buttons, positive SAM in June and January, a card, the negative
  reversal, El Niño pushing the SAM (induced marker, arrows, card), the
  2019 story stepped to its end, the print caption.
- Not in M16: the Pacific Decadal Oscillation (M17).

### M17 — Fifth driver: Pacific Decadal Oscillation (signed off 2026-09-07)
- Data: `pdo` driver node with positive / neutral / negative phases (marker
  in the North Pacific at 42°N 165°W, area across the basin from 145°E to
  125°W, `default_start_month` 11); one new outcome node (Alaska winter
  temperature); eight outcome links, four per phase, on Alaska and three
  existing nodes (Pacific Northwest winter, Canadian Prairies winter, US
  Southwest winter rainfall), all with lag 0–1 and winter seasons. None is
  rated established: the oscillation is a mix of processes and much of it
  is ENSO's footprint in the North Pacific (Newman et al. 2016), so the
  temperature links are probable and the Southwest rain links contested.
  Two driver-to-driver links, ENSO to the PDO through the atmospheric
  bridge (El Niño toward positive, La Niña toward negative; probable, lag
  3–6, all year), so El Niño with the chain on reaches Alaska through the
  PDO only, one tier down, and "established only" ghosts it. Thirteen
  sources, every one resolved on Crossref before use. One story, "2014–15:
  the North Pacific flips warm" (PDO positive from November 2014, El Niño
  from March 2015 as the second driver), five steps: the Blob, the
  Northwest snow drought, the Southwest where the pattern broke, El
  Niño's arrival as a chosen driver, and November 2015 with both arrows on
  the Southwest.
- Honesty note carried in the data: a phase lasts a decade or more, so the
  year shown is one year inside a phase (driver summary, onset hint, the
  story's first step), and the driver card says what the map cannot show,
  the PDO's modulation of ENSO's own effects (no new combination rule,
  section 4).
- Schema, engine, UI: unchanged. A driver is data.
- Tests: acceptance blocks for positive PDO from November (Alaska and the
  Southwest from month 0, the Northwest and the Prairies from December,
  nothing applied May–September but pending, no established tier, other
  drivers' regions hollow), the negative reversal, El Niño pushing the PDO
  from September with second pushes on the Northwest, the Prairies and the
  Southwest, Alaska via the PDO only at the downgraded tier, the ghost
  under "established only", La Niña's two dry pushes on the Southwest, and
  the 2014–15 scenario (El Niño onset 4 and never pushed, February through
  the PDO alone, November 2015 with both arrows rated by the weaker line,
  the shipped story's fields). Existing expectations updated: five
  drivers, ten driver-to-driver links.
- Browser check (`W:\temp\claude\ClimateConnections\cdp-m17.mjs`, 47
  checks): the two new markers placed with no label overlap, the driver
  dropdown jumping to November, positive PDO in November and February
  (pending markers, the dotted Southwest arrow), the Southwest and PDO
  cards, the negative reversal, El Niño pushing the PDO (induced marker,
  Alaska reached through it, the ghost under "established only"), the
  2014–15 story stepped to its end, the print caption.
- Not in M17: further drivers. Candidates that fit a monthly timeline are
  the Atlantic Multidecadal Oscillation (M18) and the Atlantic Niño; the
  Madden–Julian Oscillation does not (it swings within weeks). Each needs
  sign-off.

### M18 — Sixth driver: Atlantic Multidecadal Oscillation (signed off 2026-09-08)
- Data: `amo` driver node with positive / neutral / negative phases (marker
  in the central North Atlantic at 33°N 40°W, area over the whole basin
  from the equator to 60°N, `default_start_month` 6); two new outcome
  nodes (western Europe summer temperature, US Great Plains summer
  rainfall); twelve outcome links, six per phase, on those two and four
  existing nodes (Atlantic hurricanes, the Sahel, the Nordeste, the Indian
  monsoon), all with lag 0–1 and their own seasons. Tiers follow how many
  independent lines of evidence agree: hurricanes and the Sahel
  established (the 1995 shift, the drought decades, SST-forced model runs,
  a 1400-year model run), the Plains and Europe probable, the Nordeste and
  the monsoon contested. Two driver-to-driver links, the AMO tilting the
  winter NAO (positive toward negative, negative toward positive;
  contested, lag 0–3, December–March), so a positive AMO with the chain on
  cools northern Europe two hops down at the contested tier and
  "established only" ghosts it. Nothing pushes the AMO. Twenty-one
  sources, every one resolved on Crossref before use. One story, "1995:
  the Atlantic turns warm" (AMO positive from June 1995, La Niña from
  September as the second driver), five steps: the swing, the warmer
  European summers, the Sahel's partial recovery, October with both
  arrows on the hurricane region, and June 1996 with the open question of
  what drives the oscillation.
- Honesty note carried in the data: a phase lasts decades, so the year
  shown is one year inside a phase (driver summary, onset hint, the
  story's first step), and the cause of the oscillation is argued over
  (ocean overturning, aerosols, or atmospheric noise); the links run from
  the warm ocean to the weather and hold whichever camp is right.
- Schema, engine, UI: unchanged. A driver is data.
- Tests: acceptance blocks for positive AMO from June (hurricanes, the
  Plains, Europe and the monsoon from month 0, the Sahel from July, the
  Nordeste from February, summer links pending in December, the tiers,
  other drivers' regions hollow, the NAO pushed at depth 1 but its links
  not fired), the negative reversal, the AMO tilting the NAO with the
  chain on (negative from December, northern Europe cold two hops down and
  never above contested, the ghost under "established only", the negative
  phase tilting it positive, nothing pushing the AMO), and the 1995
  scenario (La Niña onset 3, October with both hurricane arrows rated
  established, the NAO pulled opposite ways by March and conflicting, the
  shipped story's fields). Existing expectations updated: six drivers,
  twelve driver-to-driver links.
- Browser check (`W:\temp\claude\ClimateConnections\cdp-m18.mjs`, 45
  checks): the three new markers placed with no label overlap (western
  Europe moved west of Ireland and the Plains to Wyoming to clear the
  Alpine, Pacific Northwest and Eastern US labels), the driver dropdown,
  positive AMO in June (contested monsoon arrow dotted) and July, February
  with the NAO pushed (induced marker, northern Europe cold, the ghost
  under "established only"), the Sahel and AMO cards, the negative
  reversal, the 1995 story stepped to its end, the print caption.
- Not in M18: the Atlantic Niño (M19).

### M19 — Seventh driver: Atlantic Niño (signed off 2026-09-08)
- Data: `atlantic_nino` driver node with warm (Atlantic Niño) / neutral /
  cool (Atlantic Niña) phases (marker in the Gulf of Guinea at 2°S 6°W,
  area along the equator from 30°W to 10°E, `default_start_month` 5); one
  new outcome node (Gulf of Guinea coast rainfall, May–July); five outcome
  links on the coast (+/−, established, lag 0–1, May–July), the Sahel
  (−/+, contested, lag 0–2, July–September: the coast–Sahel see-saw broke
  down after the 1970s) and the Indian monsoon (warm phase only, −,
  contested, June–September; the literature supports one sign, so only
  that one is shipped). Two driver-to-driver links, a summer Atlantic
  Niño nudging the Pacific toward La Niña the following winter and an
  Atlantic Niña toward El Niño (probable, lag 5–7, all year; seen since
  the late 1960s), so with the chain on the pushed La Niña arrives in
  October, after the Sahel and monsoon seasons, and fires its own links one
  tier down. Nothing pushes the Atlantic Niño (ENSO's reach into the
  Atlantic is fragile; said on the card, not drawn). Seventeen sources,
  every one resolved on Crossref before use. One story, "1984: the
  Atlantic's own Niño" (Atlantic Niño from May 1984, the cool AMO as a
  second driver that began a year earlier with `second_starts_before`),
  five steps: the 1984 event, the Guinea coast, August with both arrows on
  the Sahel rated by the weaker line, ENSO pushed toward La Niña in
  October, and May 1985 with the cautions.
- Honesty note carried in the data: a real event lasts three to five
  months and has faded by autumn, so the twelve-month hold is a
  simplification (driver summary, onset hint, the story's last step); the
  Sahel link is shown contested because the relationship is not steady.
- Schema, engine, UI: unchanged. A driver is data.
- Tests: acceptance blocks for the Atlantic Niño from May (the coast from
  month 0 and done by August, the monsoon from June, the Sahel from July,
  the tiers and the one-sided monsoon link, ENSO pushed at depth 1 without
  its links firing, other drivers' regions hollow), the Atlantic Niña
  (coast and Sahel reversed, the monsoon hollow, ENSO pushed toward El
  Niño), the chain (hurricanes active through the pushed La Niña in
  October at the probable tier, no conflict at the Sahel or the monsoon,
  the ghost under "established only" with the coast still applied,
  nothing pushing the Atlantic Niño), and the 1984 scenario (AMO onset
  -12, the coast through the Atlantic Niño alone in June, August with both
  Sahel arrows rated contested, ENSO pushed in October, the NAO tilted
  positive from December, the shipped story's fields). Existing
  expectations updated: seven drivers, fourteen driver-to-driver links.
- Browser check (`W:\temp\claude\ClimateConnections\cdp-m19.mjs`, 46
  checks): the two new markers placed with no label overlap and the
  driver label inside the map's left edge (the marker moved east to
  6°W to clear it), the driver dropdown jumping to May, the phase button
  labels, May and July states (dotted Sahel and monsoon arrows, solid
  coast arrow), the Sahel and driver cards, October with ENSO induced and
  the hurricanes reached through it, the ghost under "established only",
  the Atlantic Niña reversal with the monsoon hollow, the 1984 story
  stepped to its end with the "before" order set, the print caption.
- Not in M19: further drivers. The plan's candidates are now exhausted; the
  Madden–Julian Oscillation does not fit a monthly timeline. Anything else
  needs sign-off.

### M20 — Eighth driver: Indian Ocean Basin Mode (version 3, signed off 2026-09-08)
The first item of `docs/PLAN_V3.md`, recorded here so the list of shipped
drivers stays in one place.
- Data: `indian_ocean_basin` driver node with warm / neutral / cool phases
  (marker in the central Indian Ocean at 13°S 87°E, clear of the IOD at
  4°S 70°E; area the whole tropical Indian Ocean 40°E–100°E, 15°N–15°S;
  `default_start_month` 2). Two new outcome nodes: Yangtze valley summer
  rainfall (wet_dry, June–August, marker 32.5°N 107°E, moved west twice
  to clear the East Asia winter marker) and North Indian Ocean
  pre-monsoon cyclones (active_quiet, April–June, marker in the Arabian
  Sea at 15.5°N 64°E). Nine outcome links: the Yangtze (+ established /
  − probable, lag 3–5, June–August), the western Pacific typhoons (−
  probable / + contested, lag 3–6, June–October), South China (+/−
  probable, lag 0–2, April–June, overlapping ENSO's own spring arrow),
  the Indian monsoon (warm only, + contested, June–September: the
  studies disagree on sign and size, said on the card) and the cyclones
  (warm only, − contested, April–June, the least certain arrow, with the
  short satellite-era record said on the node and the link). Three
  driver-to-driver links: El Niño pushes the basin warm (established, lag
  3–5, all year) and La Niña pushes it cool (probable, same lag), the
  atmospheric bridge; a warm basin nudges ENSO toward La Niña (probable,
  lag 4–8, all year). The cool basin does not push ENSO, because the
  Indian Ocean's feedback on a La Niña is weaker and La Niñas linger.
  Twenty sources, every one resolved on Crossref before use, fifteen with
  abstracts read. One story, "1998: the Yangtze floods" (warm basin from
  February 1998, no second driver, chain on), six steps: the capacitor,
  the contested cyclone arrow and the June 1998 Kandla cyclone that broke
  it, the June flood, ENSO pushed toward La Niña in July, August with both
  quiet-typhoon arrows, and February 1999 with the cautions.
- Departures from the version 3 plan, each for a reason: the Yangtze has
  its own node because `east_asia_summer` is a temperature axis over
  Japan and Korea and cannot say "wetter"; the monsoon link is drawn as
  heavier rain (+), not weaker, because the verified sources lean that
  way, with the delayed onset in the caveat; the story runs the basin
  alone rather than with the El Niño that began before, because the map
  would hold that El Niño through a summer in which it had ended and show
  false conflicts at the typhoons and the monsoon (the two-driver
  scenario is kept as an acceptance test, and M32's phase duration would
  let the story add it later).
- Honesty note carried in the data: the basin mode is mostly the echo of
  an El Niño, so choosing it alone is a way of looking at the second half
  of an El Niño story; the dipole and the basin mode are different things
  (a west–east contrast in autumn versus the whole ocean warming in
  spring); the real warmth fades by autumn while the map holds it.
- Schema, engine, UI: unchanged. A driver is data.
- Tests: acceptance blocks for the warm basin from February (the Yangtze
  from June and done by September, South China from April, the cyclones
  April–June, the monsoon from June, the tiers, the hollow ghosts under
  "probable and above", ENSO pushed at depth 1 without its links firing,
  the IOD not pushed at depth 1, other drivers' regions hollow), the cool
  basin (the Yangtze, typhoons and South China reversed, the monsoon and
  cyclones hollow, ENSO not pushed), the chain from an El Niño in June
  (the basin pushed in September at depth 1 rated established, the
  Yangtze pending until the last month shown and applied at month 12 one
  tier down, South China in April with both arrows rated by the weaker,
  the basin's monsoon arrow joining the dipole's conflict at month 12,
  the loop guard on ENSO, a La Niña pushing the basin cool), the basin's
  own chain (the pushed La Niña's typhoon arrow reinforcing in August,
  Indonesia wet in June, no conflict at the monsoon, the loop guard, the
  ghost under "established only"), and the 1998 two-driver scenario (ENSO
  onset -8, the Yangtze at full tier, the typhoon conflict that keeps it
  out of the story, the shipped story's fields). Existing expectations
  updated: eight drivers, seventeen driver-to-driver links.
- Browser check (`W:\temp\claude\ClimateConnections\cdp-m20.mjs`, 60
  checks): the three new markers placed with no label overlap, the driver
  dropdown jumping to February, the phase button labels, February, May and
  June states with the arrow styles, the cyclone, Yangtze, ENSO and basin
  cards, the ghost under "established only", the cool reversal, the El
  Niño chain with the basin induced in September and the Yangtze wet at
  month 12, the 1998 story stepped to its end, the print caption.
- Not in M20: any change to how the IOD is described; the Indian Ocean
  subtropical dipole.

### M21 — Ninth driver: Atlantic Meridional Mode (version 3, signed off 2026-09-08)
- Data: `atlantic_meridional_mode` driver node with positive / neutral /
  negative phases (label "AMM", like the other acronym drivers, because a
  centred full name is wider than the tropical Atlantic between Brazil and
  the map seam; marker at 7°N 26°W, clear of the hurricanes at 15°N 50°W,
  the Nordeste at 7°S 40°W and the AMO at 33°N 40°W; area the tropical
  Atlantic 62°W–12°W, 5°S–20°N; `default_start_month` 3). One new outcome
  node: the southwestern Amazon dry season (`southwest_amazon_dry_season`,
  wet_dry, June–October, marker in Acre at 9.2°S 69.5°W, the only slot
  between the Peru coast and Peru fishery labels). Nine outcome links:
  the hurricanes (+ / − established, lag 2–5, June–November), the
  Nordeste (− / + established, lag 0–1, February–May, the classic Moura &
  Shukla mechanism), the Sahel (+ / − probable, lag 3–5, July–September),
  the southwestern Amazon (− probable / + contested, lag 3–7, June–
  October, the 2005 and 2010 droughts) and Central America (positive
  only, + probable, lag 2–4, May–July, the early rainy season). Four
  driver-to-driver links, all into the mode: El Niño pushes it positive
  the following spring (established, lag 9–11, all year, the trade winds
  and evaporation) and La Niña negative (probable); a negative NAO winter
  pushes it positive in spring (probable, lag 2–4) and a positive NAO
  negative (probable). Nothing pushes it from the AMO, on purpose, and it
  pushes nothing. Twenty-four sources, every one resolved on Crossref,
  nineteen with abstracts read. One story, "2005: the Amazon dries
  without an El Niño" (the mode alone from March 2005), six steps: the
  warm north Atlantic in spring, the Nordeste mechanism, the record
  hurricane season, the September drought with the Solimões and Madeira
  at record lows, the teaching point that ENSO's marker is grey, and
  March 2006 with the cautions.
- Departures from the version 3 plan, each for a reason: the Amazon got
  its own southwestern node because `northern_amazon_rainfall` is the
  wet-season, northern-basin region El Niño dries, and the 2005 drought
  did not touch central or eastern Amazonia; the Central America link is
  probable rather than contested, because the early-season studies agree
  on the sign (the Pacific can cancel it, said in the caveat); the
  ENSO push lags 9–11 months rather than 3–6, matching the tropical North
  Atlantic warming four to five months after the El Niño peak and the
  data's own El Niño → Nordeste lag of 8–11; the label is "AMM". Two
  existing markers were nudged to clear the new labels: the Northern
  Amazon 5° west (4°N 68°W, still inside its region) and the Peru fishery
  3° south along the coast (15°S 77°W). The M9 test that nothing is
  applied under the NAO from April to October now excepts the mode's own
  marker, since a positive NAO winter holds it negative from February.
- What the chain shows, asserted in tests: from a June El Niño the mode
  is pushed in March and the Nordeste carries both arrows the same way,
  rated by the weaker; at month 12 (June) the pushed mode says active
  hurricanes while the El Niño says quiet, so the marker is hatched as
  conflicting, which is the compensation Patricola et al. (2014)
  describe. From a negative NAO in December the mode is pushed in
  February, the Nordeste dries February–May one tier down and the
  hurricane season fires from June.
- Honesty note carried in the data: the mode overlaps the AMO on the map
  and in its effects; the card says one is decades and the other a
  season, that a warm AMO decade makes positive springs more common, and
  that the AMO → mode chain is not drawn because the same tropical warmth
  would be counted twice on the hurricanes, the Sahel and the Nordeste;
  the map holds the mode a year while the real contrast fades by late
  summer (the story's last step says so).
- Schema, engine, UI: unchanged. A driver is data.
- Tests: acceptance blocks for the positive mode from March (the
  Nordeste March–May and again from February, the hurricanes June–
  November and pending in May, the Sahel, the Amazon, Central America,
  the tiers, the hollow ghosts under "established only", nothing pushed
  with the chain on), the negative mode (four reversed, Central America
  hollow), the El Niño chain (pushed in March at depth 1 rated
  established, both Nordeste arrows, the hurricane conflict at month 12,
  ENSO never pushed back, La Niña → negative probable), the NAO chain
  (pushed in February, the Nordeste and hurricanes one tier down, the
  ghost under "established only") and the 2005 story (fields, six steps,
  the hurricanes at full tier with ENSO hollow). Existing expectations
  updated: nine drivers, twenty-one driver-to-driver links.
- Browser check (`W:\temp\claude\ClimateConnections\cdp-m21.mjs`, 48
  checks): the two new markers placed with no label overlap, the driver
  dropdown jumping to March, the phase button labels, March, May, June
  and August states with the arrow styles, the Nordeste, Amazon and mode
  cards, the ghost under "established only", the negative reversal, the
  El Niño chain with the mode induced in March and the hurricane conflict
  at month 12, the NAO chain, the 2005 story stepped to its end, the
  print caption.
- Not in M21: any change to the AMO's links, even where the same outcome
  is now reachable two ways (two arrows on one region rated separately is
  the M11 behaviour).

### M22 — Tenth driver: Pacific Meridional Mode (version 3, signed off 2026-09-08)
- Data: `pacific_meridional_mode` driver node with positive / neutral /
  negative phases (label "PMM"; marker at 18°N 133°W, between Hawaii at
  21°N 157°W and the eastern Pacific hurricanes at 14°N 110°W, clear of
  both labels; area the subtropical north-east Pacific 150°W–110°W,
  8°N–25°N, butting against ENSO's box; `default_start_month` 3). No new
  outcome node. Three outcome links: the western Pacific typhoons (+
  probable / − contested, lag 2–5, June–November, the wind-shear response
  over the south-eastern breeding grounds) and the eastern Pacific
  hurricanes (positive only, + contested, lag 2–5, June–November, the
  2015 season's experiments). Two driver-to-driver links, both out of
  the mode into ENSO: a positive spring pushes ENSO toward El Niño
  (probable, lag 6–9, all year, the seasonal footprinting mechanism) and
  a negative spring toward La Niña (contested, as decided at sign-off:
  negative springs poorly predict La Niña in the record). Nothing pushes
  the mode; its trigger, the North Pacific Oscillation, is a
  month-to-month pressure pattern and not a driver, and the card says so.
  Hawaii has no supportable direct link and is left hollow (with the
  chain on it dries in winter through the pushed El Niño, one tier
  down). Twenty-five new sources, every one resolved on Crossref,
  twenty-three with abstracts read. One story, "2014–15: the spring
  warning that came true late" (the mode alone from March 2014, chain
  on), five steps: the warm spring after the Blob winter with the caveat
  first, the dashed typhoon arrow in June and why it is dashed, ENSO
  pushed in September against the real stall by the June easterly wind
  burst, the borderline winter with El Niño's map painted one tier down,
  and March 2015 when the El Niño was declared at last and the lesson
  that a precursor raises the odds.
- Honesty note carried in the data: the driver card leads with the
  failure rate (a positive spring is followed by an El Niño more often
  than not, about seven times in ten in the coupled-model experiments,
  so roughly one spring in three comes to nothing; 2014 was one), says
  that part of the mode is El Niño's own footprint, and every arrow of
  this driver is dashed or dotted, so under "established only" the
  driver shows nothing at all, which is the point. The typhoon link's
  caveat names the study that finds the year-to-year relation weak.
- What the chain shows, asserted in tests: from a March positive spring
  ENSO is pushed in September (lag 6) at depth 1, rated probable, and
  from then El Niño's own map follows one tier down: Indonesia and
  eastern Australia dry from September (Indonesia also through the
  pushed dipole at the third hop, so rated contested), the Gulf Coast
  and Peru wet from January, Hawaii dry from February rated contested;
  the typhoons and
  the eastern Pacific hurricanes carry both arrows the same way from
  September without conflict; the mode is never pushed back. The
  negative spring pushes ENSO toward La Niña rated contested, and the
  pushed La Niña's map follows at the floor tier.
- Schema, engine, UI: unchanged. A driver is data.
- Tests: acceptance blocks for the positive mode from March (the
  typhoons and hurricanes June–November and pending in May, the tiers,
  ENSO pushed in September and its outcomes one tier down, everything a
  ghost under "established only"), the negative mode (ENSO toward La
  Niña contested, the typhoons quiet, the hurricanes hollow until the
  pushed La Niña reaches them, the pushed La Niña's map at the floor), the no-links-in rule and the 2014–15
  story (fields, five steps, ENSO pushed at step three). Existing
  expectations updated: ten drivers, twenty-three driver-to-driver
  links.
- Browser check (`W:\temp\claude\ClimateConnections\cdp-m22.mjs`):
  the new marker placed with no label overlap, the driver dropdown
  jumping to March, the phase button labels, the dashed typhoon arrow
  in June, the induced ENSO marker in September and El Niño's map one
  tier down in December, everything ghosted under "established only",
  the negative reversal, the driver card with the failure rate, the
  2014–15 story stepped to its end, the print caption.
- Not in M22: the North Pacific Oscillation as a driver; any link from
  ENSO back into the mode (Stuecker's fast feedback is named in the
  caveat, not drawn, to keep the loop rules simple).

### M26 — Eleventh driver: a large tropical volcanic eruption (version 3, signed off 2026-09-08)
- Data: `tropical_eruption` driver node with two phases, `eruption`
  (value −1, the driver's own axis is "cooling forcing") and `neutral`
  (value 0, labelled "No eruption"; the id is `neutral` rather than the
  plan's `none` so the driver reads like every other in the data and the
  tests). Label "Tropical eruption", no area, `default_start_month` 6
  (Pinatubo, June 1991), marker at 0°N 158°E in the western Pacific east
  of New Guinea, not off the Philippines as proposed: the label-overlap
  check found every position in the Philippine Sea clashing with the
  Philippines, South China or typhoon labels. No new outcome node. Five
  outcome links, all from the eruption phase: the global temperature
  cooler (established, lag 3–12, all year); the Sahel and the Indian
  monsoon weaker (probable, lag 4–15, in their rainy seasons; lag 4 is
  the time the haze takes to spread and thicken, so a June eruption
  reaches the next June's monsoon at month 12 and the Sahel's July falls
  just past the year shown, which the Sahel caveat says); northern
  Europe and western Russia milder in the first winter (probable, lag
  2–8, December–February, the "winter warming"; lag 2 so an eruption late
  in the year still reaches the winter that follows). Two
  driver-to-driver links: the eruption pushes the NAO positive (probable,
  lag 2–8, December–March) and ENSO toward El Niño (**contested**, lag
  6–12, all year; Adams 2003 and Khodri 2017 for, Dee 2020 against).
  Nothing pushes the eruption. Forty-one new sources, thirty-nine
  resolved on Crossref (one DOI corrected after the check: Graf et al.
  1993), thirty-three with abstracts read, plus two USGS pages for the
  eruption itself. One story, "1991: Pinatubo" (the eruption from June
  1991, El Niño chosen by hand as a second driver from September 1991),
  five steps: the cloud circling the globe in three weeks; September's
  cooling with the forecast that predicted it; December's winter warming
  with the study that calls the 1991–92 winter chance; March 1992 at the
  El Niño, where the map draws no arrow from the volcano into the chosen
  El Niño and the text says why; June 1992 at the monsoon, where the
  map stops and the real story does not.
- Honesty notes carried in the data: the driver card says the map holds
  the eruption on for twelve months as a stand-in for a haze that fades
  over two years, that a high-latitude eruption behaves differently and
  is not on the map, and that the El Niño arrow is unsettled. The global
  temperature caveat says the map cannot weigh a cooling volcano against
  a warming El Niño. The winter links' caveats name the studies that find
  the winter warming weak in models and the 1991–92 case possibly
  chance. This driver is the most-cited reason for M32 (phase duration).
- What the engine shows, asserted in tests: from a June eruption the
  world cools from September to the end of the year shown; northern
  Europe and western Russia are mild in December–February only; the
  monsoon weakens at month 12 and the Sahel waits all year (an eruption
  in March reaches the Sahel's July); the NAO is pushed positive
  December–March and ENSO toward El Niño from December; with the chain
  on the NAO's winter map follows one tier down (the Mediterranean dry,
  northern Europe carrying two arrows the same way, the AMM pushed
  negative at a third hop) and El Niño's map follows at the floor tier;
  from March the pushed El Niño's warming arrow meets the volcano's
  cooling on the global temperature and the marker is hatched
  (conflicting), which is honest: the map has no magnitudes. In the
  Pinatubo story the two chosen drivers disagree about the global
  temperature from December, cancel each other on the NAO in March (El
  Niño's negative push meets the volcano's positive one), and in June
  the monsoon is hatched with the chain on (the El Niño's pushed positive
  dipole and warm basin say stronger) and weaker with it off; the story
  text says so. The "every driver has three phases" test now exempts the
  eruption.
- Schema, engine, UI: unchanged. A driver is data. The validator already
  allowed a two-phase driver (at least two phases, one of them 0).
- Tests: acceptance blocks for the eruption from June with direct links
  only (phases and tiers, the cooling, the first winter, the monsoon and
  the waiting Sahel, the NAO and ENSO pushes, a December eruption
  reaching February, the neutral phase touching nothing, "established
  only" leaving the cooling alone), with the chain on (the NAO's map one
  tier down, El Niño's at the floor, the global-temperature conflict
  from March, never pushed back) and the Pinatubo story (fields, five
  steps, the states at each step with the chain on and off). Existing
  expectations updated: eleven drivers, twenty-five driver-to-driver
  links, the three-phase rule with its one exception.
- Browser check (`W:\temp\claude\ClimateConnections\cdp-m26.mjs`):
  67 markers, the new marker placed with no label overlap, the driver
  dropdown keeping June, the two phase buttons, everything waiting in
  June, the solid cooling arrow in September, December with the chain on
  (northern Europe and western Russia mild, the NAO and ENSO induced,
  the NAO's map one tier down), the hatched global temperature in March,
  the monsoon hatched with the chain on and weaker with it off in June
  with the Sahel waiting, "established only" leaving the cooling alone,
  "No eruption" drawing nothing, the Pinatubo story stepped to its end,
  the print caption.
- Not in M26: high-latitude eruptions, the solar cycle, any
  climate-change framing, a fade of the haze (M32). Next in
  `docs/PLAN_V3.md`: M27, the third batch of outcome regions, or M23,
  the Quasi-Biennial Oscillation.

### M27 — Outcome regions, third batch (version 3, signed off 2026-09-08)
- Data only: five new outcome nodes and thirteen links from drivers
  already on the map; no new driver, no story, no change to `src/`. Of
  the ten candidates in `docs/PLAN_V3.md`, five shipped:
  `central_asia_winter` (Iran to southern Kazakhstan, November–April,
  wet_dry; El Niño wetter and La Niña drier, both probable, lag 4–10);
  `us_midwest_summer` (the upper Mississippi basin, May–August, wet_dry;
  La Niña drier probable, El Niño wetter contested, lag 0–2, the caveats
  saying the summer link has come and gone over the last century and that
  the map's held phase shades the following summer too);
  `hudson_bay_winter` (Hudson Bay, northern Quebec, Labrador, Baffin
  Island, December–March, warm_cool; the NAO positive colder and negative
  milder, both established, no lag; El Niño milder and La Niña colder,
  both contested, because one regression study confines ENSO's winter
  effect to western and central Canada and finds the east cool in El Niño
  winters with a neutral PDO); `india_premonsoon_heat` (northern and
  central India, March–May, warm_cool; El Niño hotter and La Niña cooler
  in the following spring, lag 8–11, contested, because the composites
  are not significant in that season and one study ties a heat-wave type
  to Pacific cooling; a warm Indian Ocean basin hotter, lag 0–3,
  contested, one source); `tibet_winter_snow` (November–March, high_low;
  El Niño deeper snow, lag 4–9, contested, because the relationship with
  spring snow cover changed sign in the early 2000s; a positive Indian
  Ocean Dipole deeper early-winter snow, November–January, lag 4–6,
  contested; no La Niña link, so Tibet stays untouched in a La Niña).
- Five candidates dropped, with the reason: Japan and Korea winter
  duplicates `east_asia_winter` (same region, same two links, same
  source); the Caribbean rainy season duplicates
  `central_america_rainfall`, whose name includes the Caribbean and which
  already carries both ENSO phases and the positive AMM, citing Giannini
  2000; Mongolia winter waits for M24, its only driver; southern Brazil
  winter's review sources verify only the spring signal the map already
  has in `southeast_south_america`; Iberian spring would sit on top of
  the Mediterranean winter node, whose season already includes March,
  and the AMO spring claim could not be verified from the abstracts. The
  PDO into the Midwest was not drawn: the PDO sources found are for
  winter precipitation.
- Sources: twenty-five new, all resolved on Crossref, twenty-two with
  abstracts read (Hurrell & van Loon 1997, Hoell et al. 2014 and You et
  al. 2020 carry no abstract on Crossref or OpenAlex and are cited for
  what their titles and companion papers establish). 309 in all.
- Markers: the label-overlap check moved three of the five. Central Asia
  to 40°N 69°E (from 36°N 62°E, under the Middle East label);
  northeastern Canada to 60°N 78°W (from 58°N, under the Prairies
  label); the Midwest to 36.15°N 89.7°W, the southern tip of Missouri,
  because no position in the Midwest's own latitude band clears the
  Pacific Northwest, Great Plains and Eastern US labels, and freeing one
  would have meant moving three existing markers with margins under a
  unit. Tibet's label is "Tibet" rather than "Tibet snow", which reaches
  the Yangtze marker from every position east of 79°E. All labels are
  drawn all the time; only the marker fill follows the scenario.
- Tests: an M27 block. The five nodes and thirteen links present, cited
  and caveated; El Niño from June with direct links (Central Asia wet
  months 5–10, the Midwest wet 0–2 and 11–12, northeastern Canada mild
  6–9, Tibet deep 5–9, India hot 9–11 and pending in February, the
  tiers); La Niña reversing all but Tibet, which stays untouched; the
  NAO on northeastern Canada with no lag, established, both phases; the
  positive dipole on Tibet in November–January and the warm basin on
  India in March–May; with the chain on, El Niño reaching Tibet (its own
  link plus the pushed dipole), northeastern Canada (its own plus the
  pushed negative NAO) and India (its own plus the pushed warm basin)
  twice each, the same way, never conflicting; "established only"
  ghosting the new El Niño links while the NAO still reaches
  northeastern Canada. The basin-mode link count updated to ten. 621
  tests.
- Browser check (`W:\temp\claude\ClimateConnections\cdp-m27.mjs`): 72
  markers, no label overlap, El Niño in June, November, December,
  January and March with the double arrows, cards for Central Asia,
  India's heat and northeastern Canada with the "How sure are we?" block
  and DOI links, the chain off, the La Niña reversal with Tibet hollow,
  "established only" ghosts, the NAO in both phases, the dipole on
  Tibet, the basin on India, the print caption; eleven screenshots under
  `W:\temp\claude\ClimateConnections\m27\`.
- Not in M27: the five dropped candidates; Mongolia returns with M24.
  Next in `docs/PLAN_V3.md`: M23, the Quasi-Biennial Oscillation.

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

Outcome nodes added on 2026-09-07 (content only: no engine or UI change;
every link cited and caveated as above, asymmetric where the literature is):

| id | region | axis | driver | main + phase tendency | main − phase tendency |
|---|---|---|---|---|---|
| canadian_prairies_winter | Prairies / N Plains | warm_cool | ENSO | El Niño mild (+), established | La Niña cold (−), probable |
| hawaii_winter_rainfall | Hawaii | wet_dry | ENSO | El Niño dry (−), probable | La Niña wet (+), probable |
| northern_amazon_rainfall | N Amazon, Colombia, Venezuela | wet_dry | ENSO | El Niño dry (−), established | La Niña wet (+), probable |
| central_america_rainfall | Central America / Caribbean | wet_dry | ENSO | El Niño dry (−), probable | La Niña wet (+), probable |
| us_southwest_winter | US Southwest / N Mexico | wet_dry | ENSO | El Niño wet (+), established | La Niña dry (−), established |
| south_pacific_cyclones | Fiji to French Polynesia | active_quiet | ENSO | El Niño more, further east (+), established | La Niña fewer (−), probable |
| north_australia_cyclones | Australian region | active_quiet | ENSO | El Niño fewer (−), established | La Niña more (+), probable |
| west_pacific_typhoons | Western North Pacific | active_quiet | ENSO | El Niño further east, stronger (+), probable | La Niña closer to Asia, weaker (−), probable |
| south_china_rainfall | Southern China | wet_dry | ENSO | El Niño wet winter–spring (+), established | La Niña dry (−), probable |
| ethiopia_summer_rains | Ethiopian highlands | wet_dry | ENSO | El Niño weak Kiremt (−), probable | La Niña full (+), probable |
| new_zealand_summer | New Zealand | warm_cool | ENSO | El Niño cool (−), probable | La Niña warm (+), probable |
| micronesia_dry_season | Guam to the Marshalls | wet_dry | ENSO | El Niño severe dry season next year (−), lag 7–11, probable | (no La Niña link) |
| nw_europe_winter_storms | British Isles / North Sea | active_quiet | NAO | positive more storms (+), established | negative fewer (−), established |
| alpine_snow | The Alps | high_low | NAO | positive scarce (−), probable | negative deep (+), probable |
| western_russia_winter | European Russia / W Siberia | warm_cool | NAO | positive mild (+), established | negative cold (−), probable |

Outcome nodes added with the Southern Annular Mode (M16); the SAM also acts
on southeast_australia_rainfall (winter, −/+, established),
east_australia_rainfall (summer, +/−, probable), new_zealand_summer (+/−,
probable) and southeast_south_america (spring, −/+, contested):

| id | region | axis | driver | main + phase tendency | main − phase tendency |
|---|---|---|---|---|---|
| southwest_australia_winter_rainfall | Perth / SW Western Australia | wet_dry | SAM | positive dry winter (−), established | negative wet winter (+), established |
| patagonia_rainfall | Southern Chile / Patagonia | wet_dry | SAM | positive dry, warm (−), established | negative wet (+), established |
| antarctic_peninsula_summer | Northern Antarctic Peninsula | warm_cool | SAM | positive warm summer (+), established | negative cool summer (−), established |
| western_cape_winter_rainfall | Cape Town / Western Cape | wet_dry | SAM | positive dry winter (−), probable | negative wet winter (+), probable |

Outcome nodes added with the Pacific Decadal Oscillation (M17); the PDO also
acts on pacific_northwest_winter (+/−, probable), canadian_prairies_winter
(+/−, probable) and us_southwest_winter (+/−, contested):

| id | region | axis | driver | main + phase tendency | main − phase tendency |
|---|---|---|---|---|---|
| alaska_winter | Alaska / Yukon | warm_cool | PDO | positive mild winter (+), probable | negative cold winter (−), probable |

Outcome nodes added with the Atlantic Multidecadal Oscillation (M18); the
AMO also acts on atlantic_hurricanes (+/−, established), sahel_rainfall
(+/−, established), northeast_brazil (−/+, contested) and
indian_summer_monsoon (+/−, contested):

| id | region | axis | driver | main + phase tendency | main − phase tendency |
|---|---|---|---|---|---|
| western_europe_summer | British Isles to Germany | warm_cool | AMO | positive warm summer (+), probable | negative cool summer (−), probable |
| us_great_plains_summer | Dakotas to Texas | wet_dry | AMO | positive dry summer (−), probable | negative wet summer (+), probable |

Outcome node added with the Atlantic Niño (M19); the Atlantic Niño also acts
on sahel_rainfall (−/+, contested) and indian_summer_monsoon (warm phase
only, −, contested):

| id | region | axis | driver | main warm-phase tendency | main cool-phase tendency |
|---|---|---|---|---|---|
| guinea_coast_rainfall | Liberia to Nigeria | wet_dry | Atlantic Niño | wet May–July (+), established | dry May–July (−), established |

Outcome nodes added with the Indian Ocean Basin Mode (M20); the basin also
acts on west_pacific_typhoons (−/+, probable/contested), south_china_rainfall
(+/−, probable) and indian_summer_monsoon (warm phase only, +, contested):

| id | region | axis | driver | main warm-phase tendency | main cool-phase tendency |
|---|---|---|---|---|---|
| yangtze_summer_rainfall | Sichuan basin to Shanghai | wet_dry | Indian Ocean basin | heavier Meiyu June–August (+), established | lighter (−), probable |
| north_indian_ocean_cyclones | Arabian Sea and Bay of Bengal | active_quiet | Indian Ocean basin | fewer pre-monsoon storms April–June (−), contested | none drawn |

Outcome node added with the Atlantic Meridional Mode (M21); the mode also
acts on atlantic_hurricanes (+/−, established), northeast_brazil (−/+,
established), sahel_rainfall (+/−, probable) and central_america_rainfall
(positive phase only, +, probable):

| id | region | axis | driver | main positive-phase tendency | main negative-phase tendency |
|---|---|---|---|---|---|
| southwest_amazon_dry_season | Acre, Rondônia, southern and western Amazonas | wet_dry | Atlantic meridional mode | harsher dry season June–October (−), probable | milder (+), contested |

The Pacific Meridional Mode (M22) adds no outcome node; it acts on
west_pacific_typhoons (+ probable / − contested) and
east_pacific_hurricanes (positive phase only, +, contested), and pushes
ENSO (positive → El Niño probable, negative → La Niña contested).

A large tropical volcanic eruption (M26) adds no outcome node either; its
one active phase acts on global_mean_temperature (−, established),
sahel_rainfall and indian_summer_monsoon (−, probable),
northern_europe_winter and western_russia_winter (+, probable), and
pushes the NAO positive (probable) and ENSO toward El Niño (contested).

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
| Two drivers pushing one region opposite ways (v2) | Sum-and-clamp with a "conflicting" flag; the flag is a teaching point (done in M11: two chosen drivers, hatched marker when the pushes cancel) |
| Students trust a polished map too much | Disclaimer, caveats, and the contested tier shown rather than hidden |
| Pacific split on standard maps | Rotated projection from day one |
| Wildly different time scales across phenomena | Monthly is the home scale; faster/slower phenomena are context nodes without animation |
| Sourcing effort | Start from review-level sources (NOAA CPC, BoM, Ropelewski & Halpert); the count of well-supported links is small, which limits scope naturally |

---

## 10. Roadmap beyond version 1 (do not start without sign-off)

- **v2:** Indian Ocean Dipole (done, M8) and North Atlantic Oscillation
  (done, M9) as drivers; driver-to-driver links (done, M10); multi-driver
  scenarios with conflict flags (done, M11: two chosen drivers; M12: the
  second driver's own start month; M15: a second driver that begins before
  the first); season dial (done, M13); compare mode (done, M14: two maps
  side by side); more drivers (done, M16: the Southern Annular Mode; M17:
  the Pacific Decadal Oscillation; M18: the Atlantic Multidecadal
  Oscillation; M19: the Atlantic Niño; M20: the Indian Ocean Basin Mode,
  the first version 3 driver; M21: the Atlantic Meridional Mode; M22:
  the Pacific Meridional Mode; M26: a large tropical volcanic eruption);
  spreadsheet-to-YAML importer if outside contributors join.
- **v3:** specified milestone by milestone in `docs/PLAN_V3.md`
  (M20–M40): seven more drivers that fit the current design (Indian Ocean
  Basin Mode, Atlantic and Pacific Meridional Modes, the QBO, two
  contested Arctic precursors, tropical eruptions) and a third batch of
  regions; region-first navigation, a sources page, an arrival window, a
  second language; engine extensions for what does not fit today (phase
  duration, any number of chosen drivers, a hand-curated table of real
  years in place of the NOAA overlay, links that weaken other links, El
  Niño flavours, impacts on people); then quiz mode, the globe view and
  the importer. Each needs its own sign-off, as before.
