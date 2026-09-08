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
  graph plus a scenario (driver id, phase, start month, since M11 other
  drivers chosen by hand with their phases, one until M33 and any number
  since, since M12 each one's own start month, since M15 whether that
  month lies before the first driver's, and since M32 how long each
  holds its phase) and returns a per-month state table.
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
  data/years.yaml              the table of real years (M34): which phase each driver held, from the index datasets
  scripts/build-data.mjs       validate YAML, emit public/data/graph.json
  scripts/years-schema.mjs     schema and checks for years.yaml, shared with the tests (M34)
  public/data/graph.json       generated; do not edit by hand; committed so the site builds without the script
  src/
    types.ts                   TypeScript types mirroring the schema
    engine/propagate.ts        scenario -> per-month states
    engine/propagate.test.ts
    engine/years.ts            one row of the years table as a scenario (M34)
    ui/map.ts                  projection, base map, node markers, arrows
    ui/timeline.ts             scrubber + play button
    ui/card.ts                 node info panel
    ui/year.ts                 real-year panel (M34)
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
  typical_duration_months: [8, 12]   # how long a real event usually lasts, each 1–12 (M32);
                               #   "Event lasts: typical" offers the middle of the range,
                               #   rounded up; [12, 12] for a driver that really lasts years
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
- `kind: driver` nodes must have `phases`, `onset_hint`,
  `default_start_month` and `typical_duration_months` (M32) and must not
  have `axis`/`labels`. Phase values are unique within a driver and one
  phase has value 0.
- Phase variants (M36, §4 rule 11). A phase may carry `variant_of: <phase
  id>` naming another phase of the same driver, its *parent*; it must
  then have the same `value` as its parent, and the uniqueness rule above
  is relaxed exactly for variants (values are unique among the phases
  that are not variants). A parent is never itself a variant. A variant is
  a phase in every other respect: its own `label`, `color` and `summary`
  (which starts with what is different), listed after its parent.
  Shipped: ENSO's `el_nino_central` ("El Niño, central Pacific"), a
  variant of `el_nino`.
- `kind: outcome` nodes must have `axis` and `labels` and must not have `phases`.
- `kind: impact` nodes (M37, §4 rule 12) are the third kind: something that
  happens to people because of the weather an outcome describes (a
  harvest, a disease season, fires, a river's flow, a catch). They have
  `axis: more_less`, a required `sector` from the fixed list
  `agriculture | health | water | energy | fisheries | fire | economy`,
  `labels` like an outcome (what more / near normal / less mean for this
  impact, in plain words), no `phases` and no `area` (an impact is not a
  region; its marker sits a few degrees from its outcome). Every impact
  node has at least one link into it, from an outcome, and never a link
  out of it.
- `kind: feature` nodes (M41, §4 rule 13) are the fourth kind: a
  recurring fixture of the year's weather that the links work through
  (the Aleutian Low, the Icelandic Low, the Azores High, the Siberian
  High, the stratospheric polar vortex). They have `symbol: high | low |
  vortex` (drawn as an H or L in a circle, as on a weather chart, or as
  a ring), `months` (the calendar months, 1–12, no duplicates, in which
  the feature is present; empty = all year) and may have an `area`; they
  have no `axis`, `labels`, `phases` or `sector`. No link ever starts or
  ends at a feature: a link names the features it works through in
  `via` (§3.2). Every feature has at least one link through it.
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
- `except` (M36, §4 rule 11): an optional list of phase ids, each a
  variant of the link's own `when` phase, for which the link does *not*
  hold. A link whose `when` is itself a variant cannot have `except`. A
  link with `except` needs an `evidence_note` saying in plain words why
  the effect is not expected in that kind. If a link from the same driver
  in a variant phase reaches the same target as a link in the parent
  phase, the parent link must list that variant in `except`, so a target
  is never reached twice by one driver in one phase.
- Impact links (M37, §4 rule 12). A link may start at an `outcome` node
  instead of a driver; its `to` must then be an `impact` node and its
  `when` is `plus` or `minus`, naming the state of the outcome (on the
  outcome's own axis) that the link follows from. Every other field is
  as above: `effect` on the impact's `more_less` axis, `lag_months`
  (counted from the first month the outcome holds that state), `season`,
  `confidence`, `mechanism`, `caveat`, `evidence_note`, sources. A link
  from a driver never points at an impact; a link never starts at an
  impact; `weakened_by` and `except` are not allowed on an impact link.
  The `season` of an impact link, when it is not empty, must share at
  least one month with the season of some link into its outcome,
  otherwise the impact could never be drawn. Only one link per (from,
  when, to) triple, as for every link, so an impact may follow from both
  states of its outcome through two links (a wet winter and a dry one).
  Curatorial rule, written into `docs/DATA_FORMAT.md`: an impact link is
  never rated `established` unless its source is a multi-decade study of
  study of the impact itself (yields, case counts, burned area, streamflow),
  not of the weather.
- `via` (M41, §4 rule 13): an optional list of `feature` node ids, the
  fixtures of the year's weather the studies describe this effect as a
  change in ("El Niño deepens the Aleutian Low"). Each must exist and be
  a feature, none twice; the link's `mechanism`, `caveat` or
  `evidence_note` must name the feature (its `label`, case-insensitive),
  so `via` is never a claim the text does not make; when both the link's
  `season` and the feature's `months` are given they must share a month;
  an impact link cannot carry `via`. The engine never reads it: a feature
  is drawn and filled in from it, and nothing else follows.

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
- **Arrival window** (M30): the lag on a link is a range, and the range is
  the timing uncertainty. The card always prints it; behind the "Show
  arrival window" toggle in the legend (off by default, rule 15 of
  `docs/PLAN_V3.md`) an applied link is drawn faint with an outlined
  arrowhead until the later end of its range has passed, and the card's
  timing line says "may arrive any time from month 0 to month 4; drawn
  faint until month 4".
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
   - Arrival window (M30, reporting only). `lag_months` is a range and the
     engine applies a link from its earliest month, as above; the latest
     month says nothing about when the link applies. It is reported: every
     entry in `MonthState.links[id]` carries `settled: boolean`, true once
     `index >= onset + lag_months[1]`, counted from the same onset as the
     lag (the chosen driver's own onset, negative for one that began
     before the first; the month a pushed driver was pushed; an outcome's
     first month in the state for an impact link, rule 12). Always true
     when the two ends of the range are equal. Reported on every status
     (`applied`, `pending`, `ghost`, `faded`) so the map can draw an
     applied link faint until it is settled and the card can say why.
     States, sums, tiers, conflicts, onsets and every status are
     unchanged: a link is still applied from `lag_months[0]`, and a
     scenario gives the same timeline as before this field existed apart
     from the field itself. Do not move the application to `lag_months[1]`
     or anywhere in between; that would change every scenario and story.
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
8. Any number of chosen drivers (M11 for one; rewritten in the plural in
   M33). The optional `others` scenario field lists every driver chosen
   by hand besides the first, each with its phase (`ScenarioDriver`):
   - Every chosen driver enters its phase at month 0 (or in its own start
     month, below) and holds it for the whole horizon (or its own hold,
     rule 9). Every chosen driver fires its links at the first hop, at
     full confidence; rules 3–5 apply unchanged, so at a shared target the
     chosen drivers' effects add up and opposite signs set `conflicting`.
     Three drivers on one place can conflict two against one and still
     clamp to ±1 with `conflicting` set; all three links are listed in
     `viaLinkIds`. No new combination rule.
   - A chosen driver is never pushed: a link into it from any other chosen
     driver (or from a pushed driver) is skipped and not reported, the same
     loop guard as rule 6. Drivers that are not chosen can still be pushed
     by any chosen driver and followed at depth.
   - The same driver cannot be chosen twice, the first driver included;
     the engine throws. There is no order among the other chosen drivers
     beyond their onsets.
   - A neutral phase applies nothing but still pins the driver: it cannot
     be pushed, so the result is the scenario without that driver, with
     the driver held out of play (its chain is cut).
   - Own start month (M12). `startMonth` on a `ScenarioDriver` (calendar
     month 1–12, optional) is read within the twelve months shown: the
     driver's onset is the first month index at or after 0 whose calendar
     month is `startMonth`, i.e. `(startMonth - scenario.startMonth + 12)
     % 12`, so a month earlier in the calendar than the scenario's falls
     in the following year. Omitted, or equal to the scenario's start
     month, means onset 0 and the M11 result exactly. Before its onset the
     driver holds no phase (value 0), fires nothing (its links are not
     reported, not even as pending) and is still pinned: a link into it is
     skipped and not reported, as above. From its onset it holds its
     phase to the end of the horizon and its links count their lag from
     that onset, as a pushed driver's do from the month it was pushed.
     Exported as `chosenOnset(scenario, driverId)` (0 for the first
     driver).
   - Begins before the first (M15). `startsBefore` (optional boolean)
     reads `startMonth` backwards instead: the onset is
     `(startMonth - scenario.startMonth + 12) % 12 - 12`, an index from -12
     (the same calendar month a year earlier; also the result when
     `startMonth` is omitted) to -1. Month index 0 is still the first
     driver's onset and the horizon is unchanged: the driver is simply
     already in its phase at month 0 and holds it to the end, and its
     links count their lag from the negative onset, so a link whose lag
     has already run is available (applied or pending) from month 0 and
     one whose lag is longer than the head start arrives at
     `onset + lag`. Everything else in rule 8 stands: never pushed, sum
     and clamp, one hop at full confidence. `startsBefore: false` is the
     M12 result exactly.
   - The pre-M33 spelling `secondary` (one `ScenarioDriver`) is read as
     the first entry of `others` for one milestone, so every M11–M32
     scenario gives the same timeline either way (a regression test runs
     every shipped story both ways); `chosenDrivers(scenario)` returns the
     first driver then `others` in order, and `otherDrivers(scenario)`
     the list alone.
9. Phase duration (M32). A chosen driver may carry `holdMonths` (an
   integer 1–12; `Scenario.holdMonths` for the first driver,
   `ScenarioDriver.holdMonths` for each other chosen driver; the engine throws on any
   other value). Omitted, the driver holds its phase to the end of the
   horizon: the behaviour of rules 2 and 8 exactly.
   - From month index `onset + holdMonths` (the *fade*, exported as
     `chosenFade(scenario, driverId)`, null without a hold) the driver
     holds no phase (value 0) and its links are not applied. A link
     already applied stops being applied; a link whose lag had not run by
     then never applies. In every month at or after the fade, every link
     of the ended phase is reported in `MonthState.links` with status
     `faded` (confidence as rated, depth 1) and listed in the target's
     `fadedLinkIds`, whether or not its lag had run, so the map can draw
     it and the card can say which of the two happened. A link the
     confidence filter leaves out stays a `ghost`. A link into a chosen
     driver is skipped and not reported, as before the fade.
   - Onsets are unchanged: the fade does not move anything. A driver
     pushed by the ended phase keeps its onset but, as rule 6 says, holds
     its phase only in months where the pushing link is applied, so the
     chain is cut at the same month: the pushed driver has no phase and
     its own links are not reported at all (not faded, not pending).
   - A hold of 12 from onset 0 fades the driver at month 12, the last
     month shown and the same calendar month a year on. A chosen driver
     that began before the first (M15) counts its hold from its negative
     onset, so its fade may be 0 or negative: it then holds no phase in
     any month shown and its links are faded from month 0.
   - Nothing new happens after a fade. The driver is not pushed back into
     a phase by its own fade and stays pinned (never pushed) to the end.
     Sums, clamps, conflicts, tiers, the season gate and `minConfidence`
     are unchanged. A fade *into the opposite phase* is not a hold; it
     is a push, drawn through the chain (M20) or as two chosen drivers.
   - Decided 2026-09-08 (`docs/PLAN_V3.md` M32): a link with
     `lag_months[0]` at or beyond the hold does **not** fire. The
     physical case, an effect carried by the ocean after the atmospheric
     phase has ended, would be a hidden memory the student cannot see;
     the honest way to show it is the chain, where the memory is a driver
     on the map. The card of such a link and the control's hint say so.

10. Modulation (M35): links that weaken other links. A link may carry
    `weakened_by`, a list of `{ driver, phase, sources }` entries naming a
    driver, one of its phases and the studies that found the weakening.
    - In a month where one of the listed drivers is a *chosen* driver
      (rule 8) holding the listed phase (at or after its onset, rule 8, and
      before its fade, rule 9; a neutral or unlisted phase does not count),
      the link's effective confidence is one tier lower than it would
      otherwise be: `downgrade` by one more step, floored at contested,
      computed after the per-hop downgrade and the cap at the source
      driver's confidence (rule 6) and before the `minConfidence` ghosting
      and rule 5. One tier only, however many of the listed drivers hold
      their phase this month.
    - Nothing else changes. The link is still applied, with the same
      effect, in the same months; sums, clamps, conflicts, onsets, the
      season gate and the fire-once rule are untouched. A modulated link
      can push a driver as before; the pushed driver's state simply
      carries the lower confidence (rule 6).
    - A pushed driver (rule 6) never modulates, whatever phase it holds:
      its state can depend on the hop being computed. Only the drivers
      the scenario fixes by hand count.
    - A faded link (rule 9) is reported as rated, whoever is chosen; it
      applies nothing anyway.
    - The entries in force are reported in `MonthState.links[id]` as
      `weakenedBy` (the link's own entries, in the link's order), present
      only when at least one is in force, so the card can say why the
      tier dropped and cite the studies; the map draws the effective
      tier exactly as it does for a hop (a solid line turns dashed).
    - Only the weakening direction exists, on purpose: three-level
      states cannot show "stronger", and "El Niño's effect is stronger
      when the PDO is warm" is the same fact as "weaker when the PDO is
      cool", so data authors write the weakening side only.
    - The validator requires the modulating driver to exist and to have
      that phase, to differ from the link's own `from`, no `(driver,
      phase)` pair twice, at least one resolvable source per entry, and an
      `evidence_note` on the link that says the weakening in plain words.
    - The story validator's copy of the engine rule ignores modulation:
      it changes no month in which a link is applied.

11. Phase variants (M36): El Niño flavours. A phase may be a *variant* of
    another phase of the same driver (`variant_of`, §3.1), with the same
    `value`; the phase it names is its *parent*. A variant is a phase: a
    scenario, a story or a year row may choose it, it has its own colour
    and summary, and everything in rules 1–10 applies to a driver holding
    it. Only two things are new:
    - Which links fire. A driver holding a phase P *matches* a phase name
      Q when P is Q or P's parent is Q. The links in force for a driver
      holding P are every link whose `when` is P, plus every link whose
      `when` is P's parent and whose `except` (§3.2) does not list P. An
      inherited link is reported under its own id exactly as it would be
      for the parent (same lag counted from the same onset, same season,
      same tier, `depth` 1 for a chosen driver); nothing in `LinkState`
      marks it inherited, the card reads that from the graph. A link
      excepted for P is not reported at all, as a link of another phase
      is not. This holds wherever the engine looks a phase's links up:
      the hops, the faded report of rule 9, `activeLinks` and
      `linksInPlay`. A `weakened_by` entry (rule 10) naming phase Q is in
      force when the chosen driver's phase matches Q; `except` never
      applies to modulation.
    - Where a push lands. A link into the driver (rule 6) pushes it into
      the phase with that `value` that is *not* a variant: the parent,
      never the variant (`phaseForValue` ignores variants). The map
      cannot know which kind a pushed event would be; the card of a
      variant says so.
    Nothing else changes: sums, clamps, conflicts, onsets, holds, the
    season gate, the fire-once rule, the loop guard and `minConfidence`
    are untouched, and a scenario in a parent phase gives the same
    timeline as before the variant existed (a regression test runs every
    shipped story and the real years). Region mode (M28, `influencesOn`)
    lists under a variant only the links whose `when` is the variant, and
    separately the parent's links that except it, so a place is not
    listed twice under one driver; a variant with neither is left out.
    The story validator's copy of the rule uses the same matching, and a
    story step may also focus a place that a parent link excepted for the
    chosen variant would have reached that month, so a story can say "the
    coast stayed dry". Strength (a strong versus a weak event) is
    deliberately not a variant: the map draws direction only (rule 13),
    and the card says a stronger event tends to give the same map more
    reliably.

12. The impact hop (M37): impacts on people. A third node kind, `impact`
    (§3.1), can be reached only from an outcome, through an impact link
    (§3.2: `from` an outcome, `when: plus | minus`, `to` an impact). The
    hop runs only when the scenario says so: `Scenario.impacts` (optional
    boolean, default false). With it off nothing in this rule happens, no
    impact link is ever reported, every impact node keeps the empty state,
    and the timeline is the one rules 1–11 give, byte for byte. With it
    on, in every month, after the last driver hop (rule 6) and the faded
    report (rule 9) are done:
    - Which impacts fire. For every outcome that holds a state this month
      (value +1 or −1 after sum and clamp, with at least one applied link
      in `viaLinkIds`; an outcome at 0, conflicting or not, holds no
      state), the outcome's *onset in that state* is the first month index
      it held it, fixed for the rest of the scenario (the fire-once rule
      of rule 6, keyed on outcome and state, `plus` or `minus`). Every
      impact link whose `from` is that outcome and whose `when` names
      that state is a candidate. It is available from `onset +
      lag_months[0]`, applied in a month where it is available and the
      season gate (rule 3) passes, and reported `pending` where it is
      available but out of season. In a month where the outcome does not
      hold the state (its season has passed, its driver has faded, the
      pushes cancel) the impact link is not reported at all, as a pushed
      driver's links are not (rule 6), and never `faded`: only a chosen
      driver's own links fade.
    - Depth and tier. The outcome's depth is the smallest `depth` among
      the links applied into it this month (1 when a chosen driver reaches
      it directly). An impact link is reported with `depth` one more than
      that, and its confidence is rule 6's formula for a hop at that depth:
      `downgrade(confidence, depth − 1)`, so at least one tier below its
      rating, and never above the outcome's own confidence (rule 5's
      lowest). An established impact of an established first-hop outcome
      is therefore drawn probable; an impact of a contested outcome is
      contested. `minConfidence` then ghosts as for any link (status
      `ghost`, nothing applied). `maxDepth` does not bound the impact hop:
      it counts driver hops, and the impact hop is the one extra hop after
      them, whatever the depth.
    - At the impact node rules 4 and 5 apply unchanged: the effects of the
      applied impact links add up and clamp, `conflicting` is set when
      they disagree, the node's confidence is the lowest among them,
      `viaLinkIds`, `pendingLinkIds` and `inSeason` are filled as for an
      outcome; `fadedLinkIds` stays empty. Several links into one impact
      (two dry regions into one wheat yield) add up the same way; two
      links from one outcome, one per state, never fire in the same month.
    - Nothing flows back. An impact node has no outgoing links (the
      validator refuses them), so there is no loop, no second impact hop
      and no push from an impact into anything. Every driver and outcome
      state, every link status of rules 1–11 and every onset are identical
      with the hop on and off (a regression test runs every shipped story
      and every real year both ways). Modulation (rule 10) and `except`
      (rule 11) do not apply to impact links; the validator refuses both
      fields on them.
    - What the rule cannot say, on purpose: nothing about size, money or
      lives (rule 13 of `docs/PLAN_V3.md`: three states only), nothing
      about impacts of impacts, and nothing about whether the push from
      the weather reaches people at all. The card of every impact node
      carries one fixed sentence, in the UI and not in the data: "How much
      of this reaches people depends on preparation, prices and policy;
      the map shows only the push from the weather." The layer that turns
      the hop on is off by default (rule 15 of `docs/PLAN_V3.md`).
13. Seasonal features (M41) are not part of propagation. A `feature` node
    (§3.1) is a fixture of the year's weather the links work through, and
    a link's `via` (§3.2) names the features it works through. The engine
    gives a feature the empty state like any node and never reads it; no
    link starts or ends at a feature (the validator refuses both), so no
    feature is ever pushed, holds a state, fires a link, adds anything up
    or changes a tier; `via` is never read by `propagate`. Every driver,
    outcome, impact and link state of rules 1–12 is identical with the
    features and every `via` stripped from the graph (a regression test
    runs every shipped story and every real year both ways). What is
    drawn from them is reporting only, read by pure helpers in
    `src/engine/features.ts`: whether a feature is present in a calendar
    month (its `months`, empty for all year), and which of the month's
    reported links list it in `via`, by status. Do not turn a feature
    into a waypoint the drivers push (rule 6's downgrade would then
    misstate the evidence for the direct link) and do not give one a
    state: "stronger than usual" is a driver, not a feature.

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
- Labels (added 2026-09-08, after M27): a marker carries its name only
  while the scenario affects it in the month shown (applied: filled or
  hatched; a marker whose arrow is expected but out of season stays
  unnamed, its faint ring is the hint), it is a chosen or pushed driver,
  it is selected, it is the story's focus, or it differs between
  compared scenarios. A "Label every
  region" checkbox (off by default) names them all; it is the fourth
  checkbox in the controls, after the chain box, so the browser scripts'
  indices still hold.
- Impact (M37, §4 rule 12): a small square a few degrees from its outcome,
  drawn only while the "Impacts on people" layer is on; hollow until
  reached, filled by state on its own two-colour scheme (more: deep
  pink; less: teal), hatched and dashed like an outcome when pushes
  cancel or conflict, labelled under the same rule as an outcome. Its
  arrow leaves the outcome's marker, not a driver's, in the tier the
  engine reports (at least one below the link's rating). With the layer
  off the square, its arrow and its label are not drawn at all, and the
  page is the one M36 shipped. Region mode never draws impacts.
- Feature (M41, §4 rule 13): drawn only while the "Seasonal features"
  layer is on, in the calendar months its `months` name (all year when
  empty), as its `symbol`: an H or L in a circle, as on a weather chart,
  or a ring for the vortex, always with its name. Never a state colour.
  Hollow with a dotted edge while no reported link works through it;
  filled dark slate while at least one applied link this month lists it
  in `via`, and then drawn even outside its months (the card says so);
  faintly filled while only pending links do. Its `area`, if any, is a
  dotted outline under it, lightly filled while it is filled. It is
  clickable and keyboard-focusable like a node and takes the selected
  ring; while it is selected every arrow that does not work through it
  is dimmed. No arrow starts or ends at it. Region mode draws, with the
  layer on, the features the listed links work through, filled, with no
  month. With the layer off nothing of this is drawn and the page is the
  one M30 shipped.
- Hiding the places nothing has reached (M42): with "Hide unaffected
  regions" on, a place's marker, its label, its area, its impact square and
  the arrows into it are drawn only while a connection has reached that
  place in the month on screen — the same test that decides a marker's
  name with "Label every region" off, an applied link ending there. A
  place whose arrows are only expected (pending, out of season), ended
  (faded, M32) or left out by the confidence filter (ghost) is not drawn
  at all, and those arrows go with it, so no arrowhead is left pointing at
  a marker that is not there; a place that has been reached keeps every
  arrow into it. Never hidden: every driver, the selected place, the place
  a playing story points at, and a place compare mode rings as differing.
  The seasonal features are their own layer and are not hidden. Nothing
  about the engine, the cards, the counts or the dial changes. Compare
  mode draws the union of the two sides, so both maps carry the same
  markers; region mode ignores the toggle. Off, the page is the one M41
  shipped.

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
- Arrival window (M30): with "Show arrival window" on, an applied link
  that is not yet `settled` (§4 rule 3) is drawn at reduced opacity with
  its arrowhead outlined (a white head with the arrow's colour as its
  edge, one extra SVG marker per colour), and takes the full style the
  first month at or after `onset + lag_months[1]`. Pending, faded and
  ghost arrows are unchanged, and so is everything with the toggle off.
  Region mode draws no scenario and so no window.

### 5.4 Timeline
- Horizontal scrubber, 0–12, labeled with calendar month names.
- A small mark (M32) on the tick where a chosen driver's phase ends, with
  a tooltip naming the driver; none when the hold is the whole year or
  the fade falls before month 0.
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
phase description and the timescale. Since M35 the "How sure are we?"
block also says when a chosen driver weakens the link (rule 10): "Weaker
this month: the Pacific Decadal Oscillation is in its Negative PDO phase,
chosen on the left, so this link is drawn one tier lower than its rating",
with the studies; a link that can be weakened but is not says "Weaker
when ..." so the student knows what to add; and a driver's own card lists
the links its phases weaken under "Links it weakens". Since M36 (rule
11) the card of a driver chosen in a variant phase starts with what is
different: under "What is different in this kind" it lists the variant's
own links (place, tendency, tier) and the parent's links that do not
hold for it, then one fixed sentence that strength is not a kind and the
map draws direction only; each link block on a place says "Holds for
both kinds of El Niño" or "Only for this kind", and a place reached by
an excepted link says "Not expected in this kind" with the parent link's
evidence note and sources. A driver pushed into a phase along the chain
is always shown in the parent phase, and the variant's card says the map
cannot tell which kind a pushed event would be. Since M37 (rule 12) the
card of an impact node leads with its sector ("Sector: agriculture") and
one fixed sentence, in the UI and not in the data: "How much of this
reaches people depends on preparation, prices and policy; the map shows
only the push from the weather." Then its state in plain words, and one
block per impact link acting on it: "What pushes it, from <the outcome>",
the outcome's state it follows from, the mechanism, the timing counted
from the month the outcome first held that state, and "How sure are we?"
saying the link is shown one tier below its rating because it is one
step further from the driver than the weather it follows from, and never
above that weather's own tier. An outcome's card lists, while the layer
is on, "Impacts on people that follow" from it (each with its tendency,
tier and whether it is drawn this month), and while the layer is off one
line saying how many follow and where to turn them on. Since M30 the
timing line of every link block, with "Show arrival window" on and a lag
range wider than one month, reads "May arrive any time from month 0 to
month 4 after onset; drawn faint until month 4" while the link is applied
and not yet settled, "Could have arrived any time from month 0 to month
4 after onset; month 4 has passed, so the arrow is drawn in full" once it
is settled, and for a pending link "may arrive any time from month 0 to
month 4 ... once in season"; a link whose two ends are equal says the
studies give one lag and no window. With the toggle off the line is the
pre-M30 "Expected from month 0–4 after onset". Since M41 (rule 13) the
card of a feature leads with one fixed sentence, in the UI and not in
the data: "A fixture of the year's weather, not a cause on this map:
nothing is computed from it and no arrow starts or ends at it. It is
filled in while an arrow drawn this month works through it." Then a
state line (filled: how many arrows drawn this month work through it;
present and idle; or outside its usual months and drawn because an arrow
works through it), the months it is present, its summary, "Arrows
through it this month" (each applied link's driver, place, tendency and
tier as reported; pending ones as expected, out of season), "Every arrow
that can work through it" (by driver and phase, with tier and season,
read from the data), and its sources. Every link block on a place, in
region mode too, says "Works through the Aleutian Low" when the link
carries `via`, with a pointer to the layer while it is off.

### 5.6 Controls (top-left)
- Phase buttons (M36): the buttons show the phases that are not variants;
  when the chosen phase, or its parent, has variants a second row opens
  beneath, "Which kind of El Niño?", with "Classic" (the parent) and one
  button per variant (its label with the parent's label trimmed off the
  front: "central Pacific"); the parent's button stays pressed while a
  variant is chosen, and the row closes when another phase is picked. The
  default is the parent, so the page opens as before. The same row sits
  under every other chosen driver's phase buttons. Titles, captions, the
  dial and the timeline name the variant by its full label.
- Real year (M34), under Stories: a dropdown of the years in
  `data/years.yaml` (1950–2025). Picking one runs `scenarioForYear`
  (`src/engine/years.ts`) on the row and sets the scenario from it: month
  0 is January of the year when a recorded driver allows it (a neutral
  phase, or one that began that January, is the first driver), otherwise
  the onset, in the year or the year before, whose twelve months cover
  most of the year; every other recorded driver is a chosen driver in its
  recorded phase from its own month, read backwards when it began earlier,
  with a hold where the record ends the phase inside the months shown. The
  scenario controls show the result and are locked (greyed and inert, as
  in region mode) until "Edit this scenario" in the year panel or "Leave
  the year" frees them; the story, year and region pickers stay live, and
  a story, region mode or Escape leaves the year. The year panel above the
  card gives the year's note, the window sentence ("The twelve months
  shown run from January 1997", or why not), a line per recorded driver
  with its phase, dates, duration and index note, the drivers not
  recorded, any phase the engine cannot place exactly, the honesty
  sentence ("The map shows the tendencies for the phases that were
  observed. It does not show what happened that year; where a story
  exists for this year it tells you where the real weather broke the
  pattern."), the stories about the year and the sources. The month
  display is dated ("September 1997"), the cards say "from the record"
  and "set from the record for 1997" instead of "chosen by hand" / "you
  chose", an unrecorded driver's card says so (a chain may still push it,
  a tendency), and a chosen driver's card adds what the record says where
  the engine reads it differently (a start read a year back, a hold it
  cannot place). A dated story offers "Compare with the record: every
  driver recorded for 1997". The print caption names the year, every
  phase, the drivers not recorded, the window and the index sources.
- Driver phase selector: three buttons (El Niño / Neutral / La Niña).
- Second driver (M11): a dropdown ("None" or any other driver) with its own
  phase buttons, and (M12) its own "Second driver begins in" month picker,
  shown only while a second driver is chosen and defaulting to that
  driver's `default_start_month`; a hint under it says how many months
  after the first driver that is ("in the following year" when the month
  wraps) and repeats the driver's onset hint. Picking the second driver as
  the main one empties the second slot. Since M33 this block is the first
  row of a list: once a second driver is chosen a collapsed "More
  drivers" line appears under it (closed by default, §0 rule 15 of
  `docs/PLAN_V3.md`, so the page opens as before) holding the "Third
  driver", "Fourth driver", ... rows, each the same block ("Third driver
  begins in", before/after, "Third driver lasts"), and a "+ Add a driver"
  button that appends the first driver not yet chosen in its first phase
  and usual start month (hidden once every driver is chosen). Every row's
  picker leaves out the drivers taken elsewhere; "None" on a row removes
  it and the rows after it move up; picking as the main driver one that
  is chosen elsewhere drops that row. A story with two or more other
  drivers opens the section; one with fewer closes it. Under the month picker (M15) two
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
  begins in", or "First driver begins in" while another driver is chosen.
- "Event lasts" (M32; "First driver lasts" with more than one driver), under
  the start month: "The whole year shown (default)", "Typical for this
  driver (N months)" read from `typical_duration_months` (the middle of
  the range, rounded up, at most 12), then 1–12 months. The hint gives
  the driver's typical range, the month and index the phase ends in
  ("Fades in December, month 6"), and always the one sentence: an effect
  that needs longer to arrive than the event lasts never arrives on this
  map; in reality the ocean can carry an effect past the end of an event.
  Picking a driver resets the hold to the whole year. Each other chosen
  driver's row gets its own "Second driver lasts" / "Third driver lasts"
  / ... picker and hint, counted from
  its own onset ("Over before the year shown begins" when the fade falls
  at or before month 0). From the fade the driver's marker takes the
  neutral style of a driver out of play (grey, unlabelled unless
  selected), its arrows are drawn like pending ones but grey with a grey
  arrowhead, a place only faded links reach is hollow, the pane title
  says "for 6 months", the print caption says how long and that faded
  arrows apply nothing, and the cards say "Faded: held El Niño from June
  for 6 months; no phase since December (month 6)", per link "Faded: the
  event has ended" with the ending month in the timing line, or "Never
  arrives: the event ended first" with "this effect needs N months to
  arrive and the event was set to last M, so on this map it never
  arrives; in reality the ocean can carry such an effect past the end of
  the event". A driver whose push came from the ended phase says "No
  phase: the push toward … has faded". The season dial is unchanged.
  Compare mode holds per side. A story sets the holds from
  `hold_months` / `second_hold_months`.
- Season dial (M13), under the start month: the calendar year as a circle
  of twelve month sectors, January at the top, clockwise. The month on
  screen is filled and follows the timeline; a dark triangle outside the
  ring marks where the year shown begins, a dot in the phase colour where
  each other chosen driver begins (hollow, M15, when it began before the
  year shown: the tooltip says since when; two beginning in the same month
  sit side by side within that month's sector, M33). Inside, one ring for the whole scenario: each
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
- "Impacts on people" (M37, rule 12): the fifth checkbox in the controls,
  under "Label every region" in the Map section so the browser scripts'
  indices still hold, **off by default** (rule 15 of `docs/PLAN_V3.md`).
  On, it sets `Scenario.impacts` for both sides and the squares, their
  arrows and their cards appear; its hint says what a square is, that it
  is drawn one tier lower and one hop further than the weather it follows
  from, and repeats the fixed sentence about preparation, prices and
  policy. Off, the engine runs rules 1–11 only and the page is unchanged.
  It is a way of looking, like the areas layer: switching it does not end
  a story or leave a real year. A story that points at an impact carries
  `impacts: true` and turns the layer on when it starts.
- Legend: confidence line styles and the state color scheme, and (M37) a
  square for an impact on people with its two colours and the note that
  it shows only with the layer on, and (M30) a row for an arrow within
  its arrival window (faint, outlined head) with the note that the map
  applies a connection from the earliest month of its lag range and
  draws it faint until the latest has passed.
- "Show arrival window" (M30): a checkbox under the Legend heading, the
  sixth checkbox in the controls (after "Impacts on people", so the
  browser scripts' indices still hold), **off by default** (rule 15 of
  `docs/PLAN_V3.md`). On, the map draws every applied arrow faint with an
  outlined head until its `settled` month, on both sides in compare mode,
  and the cards' timing lines say the window; its hint says the studies
  give a range, that the map applies a connection from the earliest month
  and that this toggle changes nothing about when, only how it is drawn.
  A way of looking, like the areas layer: switching it ends no story and
  leaves no year. The season dial is unchanged (it shows the season gate
  only). The print caption says what a faint arrow means while it is on.
- "Seasonal features" (M41, rule 13): a checkbox under the Legend
  heading, the seventh in the controls (after "Show arrival window", so
  the browser scripts' indices still hold), **off by default** (rule 15
  of `docs/PLAN_V3.md`). On, the map draws the features in their months
  (§5.2) on both sides in compare mode and in region mode, the cards
  open on them, and the print caption says what the symbols mean; its
  hint names the features from the data, says they are the machinery the
  arrows work through and not causes, that nothing is computed from them
  and no arrow starts or ends at one, and that a feature is filled in
  while an arrow drawn this month works through it. A way of looking,
  like the areas layer: switching it ends no story and leaves no year. A
  story with `features: true` turns it on when it starts. The legend
  gains a row with the symbol and a note.
- "Hide unaffected regions" (M42): a checkbox under the Legend heading,
  the eighth in the controls (after "Seasonal features", so the browser
  scripts' indices still hold), **off by default** (rule 15 of
  `docs/PLAN_V3.md`). On, the map draws only the places a connection has
  reached in the month on screen (§5.2), on both sides in compare mode and
  by the union of the two, so a class sees the places a driver is acting
  on instead of every dot on the map. Its hint says that only a place with
  a full arrow is drawn, that a place still out of season, one whose event
  has ended and one only the filter's grey lines touch is left off with its
  arrows until the month it is reached, which places are kept whatever
  happens, and the sentence that matters: a place is hidden because
  nothing on this map is acting on it in this month, not because nothing
  happens there. A way of looking, like the areas layer: switching
  it ends no story, leaves no year and changes no card. Region mode
  ignores it. The legend gains a note, and the print caption says while it
  is on that the places with no connection this month are left off.
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
A place hidden by "Hide unaffected regions" (M42, §5.2) draws no area
either, so the two layers never disagree.

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
  scenario of its own (driver, phase, start month, the other chosen
  drivers with their months and holds, confidence filter, chain); the
  areas toggle is shared. Switching compare on copies the whole list to
  B. The existing scenario controls, the dial, the timeline's ticks and
  onset marks and the card's details all follow the edited side.
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
- "Hide unaffected regions" (M42) is shared, like the areas toggle, and
  the two maps hide the same places: a place is drawn when *either* side
  has reached it this month, so the maps can always be read against each
  other and a dark ring is never left alone on one of them.

### 5.10 Region mode (M28)
- A "By region" section under Stories: a dropdown "Where I live…" of every
  outcome node, alphabetical by name, each option naming the place and its
  region. Picking one enters region mode; picking "Where I live…" again,
  Escape, a story, or a click on a driver marker leaves it.
- Region mode shows one map and no month: the timeline is hidden, the
  month display reads "By region", and every scenario control from Compare
  down to the map checkboxes is greyed out and inert (the legend stays).
  The scenario is kept, not drawn, and comes back as it was.
- The map draws the place selected and hollow with its own outline only,
  every driver that reaches it with a plain dark ring and its label ("can
  reach": no phase, no colour), the other drivers grey and unlabelled, the
  other places hollow and unlabelled. Each incoming link is an arrow in
  its own tier's line style, coloured by the phase that fires it and
  ending in that phase's arrowhead; arrows from one driver are spread
  sideways a few units so El Niño's and La Niña's both show. Nothing is
  computed: `src/engine/inverse.ts` reads the links into the node and
  groups them by driver and phase, with a twelve-month season strip per
  link; no scenario runs, no state is invented, nothing is added up.
- The card: the place, a line "Everything known to reach this place on
  this map: N drivers, M connections", a note that nothing is added up
  here, the place's summary, then one heading per driver and, phase by
  phase, each link as "El Niño: <the place's own label for the effect>",
  its tier badge, its season in words and its lag in words ("arriving 0–3
  months after the event begins"), the season strip, the mechanism, the
  usual "How sure are we?" block and the sources. Under each phase a
  button "Watch <phase> arrive" leaves region mode for the single-driver
  scenario of that driver and phase from its default start month, with
  the place selected and the timeline playing from month 0. A click on a
  reaching driver's marker does the same with the first of its phases
  that reaches the place; a click on another place switches the region.
- The URL hash carries region mode and nothing else: "#region=<node id>"
  is written on entering and cleared on leaving, a page opened with it
  starts in region mode, and a change to the hash is followed. Compare
  and stories are off in region mode. Print caption: "Everything that is
  known to reach <place> on this map: N drivers, …".
- "Hide unaffected regions" (M42) does not apply here: region mode has no
  month and no scenario, and draws every driver on purpose, the ones that
  reach the place with a ring and the rest in grey.

---

### 5.11 Seasonal features layer (M41)
A toggleable layer of its own, drawn between the arrows and the markers,
holding the `feature` nodes (§3.1): the fixtures of the year's weather
the links work through. Each is drawn in the months its `months` name as
its `symbol` with its name (§5.2), and its `area`, if any, as a dotted
outline under it. The layer reads the month's reported links: a feature
is filled while an applied link lists it in `via`, faintly filled while
only pending ones do, hollow otherwise, and it is drawn outside its
months only while an applied link works through it. Nothing else changes
with the layer on: no state, no arrow, no tier, no sum. The engine never
reads a feature (§4 rule 13); the helpers in `src/engine/features.ts`
only group what the engine reported. Off by default.

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
- The panel holds one height for the whole story, the tallest of its steps
  (measured on the way in, and again on a resize), with the Back / Next row
  at its foot: steps differ in length and only the first carries the intro,
  so without this the buttons rode up and down between steps, away from the
  reader's cursor. Reporting only, and dropped for print.

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
- Follow-up the same day, at the user's request, not a milestone: the
  map names only the markers the scenario reaches (§5.2), with a
  "Label every region" checkbox, off by default, to name them all.
- Not in M27: the five dropped candidates; Mongolia returns with M24.

### M23 — Twelfth driver: the Quasi-Biennial Oscillation (version 3, signed off 2026-09-08)
- Data: `qbo` driver node, label "QBO", three phases `westerly` (+1,
  "Westerly QBO", indigo #3730a3), `neutral` (0, labelled "Transition")
  and `easterly` (−1, "Easterly QBO", amber #d97706); no area (the wind
  circles the globe); `default_start_month` 11; marker at 7°S 175°W on
  an empty stretch of the central Pacific, not at 0°N 160°E as the plan
  proposed, because the tropical eruption (M26) took that spot and on
  the equator itself the Kiribati label ran into the circle (the South
  Pacific cyclones marker moved from 18°S to 21°S, still between Fiji
  and Tonga, to make room for the QBO's label); the card
  says the marker is a placeholder and that the map's phase is the wind
  at about 20–25 km up. No new outcome node. Four links, all from the
  QBO: the easterly phase pushes the NAO negative and the westerly
  positive (probable, lag 1–3, December–February, the Holton–Tan effect
  through the polar vortex; lag 1 so a November phase reaches December),
  and the westerly phase makes the Atlantic hurricane season busier, the
  easterly quieter (**contested**, lag 0–2, August–October, read in the
  season as Gray did in 1984; the caveat says the relationship held from
  the 1950s to the 1980s and vanished after about 1990, Camargo and
  Sobel 2010, and that the arrow is kept as a lesson). The Indian monsoon
  link the plan allowed "if at all" is not drawn: the two studies read
  the wind at different heights and months (Mukherjee 1985 at 30 hPa in
  the season, Claud and Terray 2007 at 15 hPa in the preceding winter),
  and with phases that descend about a kilometre a month their signs
  cannot be reconciled with the map's single phase; the card says so.
  Nothing pushes the QBO. Thirty-three new sources, thirty-two resolved
  on Crossref (abstracts read for all but Giorgetta 1999, dropped, and
  the 2022 Nature Reviews article, cited on its title) plus the Freie
  Universität Berlin wind record, which is the source for what the wind
  did in 2009–10. One story, "2009–10: a winter with the wind from the
  east" (the easterly QBO from November 2009, El Niño chosen as a second
  driver that began in June, `second_starts_before`), five steps: the
  Singapore balloons in November; December's push on the NAO and the Met
  Office analysis that names the El Niño–easterly QBO pairing; February's
  cold Europe with the two studies that credit autumn snow or plain
  chaos rather than the QBO; August 2010, where the map is wrong twice
  (both held phases had ended and the hurricane rule no longer works)
  and the marker is hatched with the chain on; November 2010, where the
  wind had turned westerly and the next December was bitter anyway.
- Honesty notes carried in the data: the driver card leads with "real on
  average and small in any one winter", says the QBO shifts the odds of
  a weak vortex as El Niño and volcanic winters also do, names the
  Madden–Julian Oscillation only to say the map does not draw it, and
  says in plain words that the QBO's best-known role, changing how
  strongly an El Niño reaches Europe, is a link that changes other links
  and waits for a later version (M35). The NAO links' caveats say the
  effect was nearly absent in 1978–1997, that models make it weaker than
  the record, and that a multi-century model run calls the NAO link
  probable but not certain. The 2015–16 disruption is one sentence on
  the card.
- What the engine shows, asserted in tests: from November the NAO is
  pushed December–February only and the link waits from March; the
  hurricanes are touched August–October only; with the chain on the
  NAO's winter map follows one tier down (northern Europe and Greenland
  probable, eastern North America contested) and the pushed NAO pushes
  the Atlantic meridional mode for the one month its lag allows
  (February, a third hop), so the QBO alone never hatches the
  hurricanes; "established only" ghosts every QBO arrow, since none is
  established. In the 2009–10 story the NAO carries the QBO's arrow
  alone in December and both drivers' arrows from January, northern
  Europe is cold through the pushed NAO at the probable tier, and in
  August the hurricanes are hatched with the chain on (the QBO and the
  El Niño say quieter, the meridional mode the El Niño pushed positive
  in March says busier) and plainly quieter with it off.
- Schema, engine, UI: unchanged. A driver is data.
- Tests: acceptance blocks for the QBO from November with direct links
  only (phases and tiers, the NAO push in both phases, the hurricane
  months, a June start, the NAO's regions hollow at depth 1, the neutral
  phase, "established only"), with the chain on (the NAO's map one tier
  down, the one-month meridional-mode push, never pushed back) and the
  2009–10 story (fields, five steps, the states at each step with the
  chain on and off). Existing expectations updated: twelve drivers,
  twenty-seven driver-to-driver links.
- Browser check (`W:\temp\claude\ClimateConnections\cdp-m23.mjs`):
  73 markers, the new marker placed with no label overlap (every label
  on), the driver dropdown jumping to November, three phase buttons,
  November with the NAO untouched and the hurricanes waiting, December
  with the chain on (the NAO induced in its negative colour, northern
  Europe cold and Greenland mild through it, the QBO's arrow dashed),
  March with the NAO waiting, August with the hurricanes quieter along a
  dotted arrow, the westerly phase turning the NAO positive, "established
  only" ghosting everything, the transition phase drawing nothing, the
  2009–10 story stepped to its end with the hatched hurricanes, the
  print caption.
- Not in M23: the QBO as a modulator of other links (M35); the monsoon
  link; the QBO's effect on West Pacific typhoons (Chan 1995), a
  candidate if the hurricane lesson proves useful; the solar cycle.

### M24 — Thirteenth driver: Barents–Kara autumn sea ice (version 3, signed off 2026-09-08)
- Data: `barents_kara_ice` driver node, label "Barents–Kara ice", three
  phases `high` (+1, "High ice", sky blue #0369a1), `neutral` (0, "Near
  normal") and `low` (−1, "Low ice", purple #a21caf); an area over the
  two seas (20–100°E, 68–81°N); `default_start_month` 10; marker at
  78°N 58°E in the Kara Sea, not 76°N 45°E as the plan proposed, because
  at 76°N 45°E the centred driver label ran two pixels into the Norway
  label. One new outcome node, **Central Siberia and Mongolia winter
  temperature** (`siberia_winter`, warm_cool, 60°N 95°E, moved to 65°N
  98°E in M25 to make room for the snow marker, label "Central
  Siberia"), which is where the Mongolia candidate M27 deferred now
  lives. Four links, all from the low phase, all **contested**, lag 1–3
  (so an October reading reaches December), December–February: central
  Siberia colder, western Russia colder, East Asia colder, and the NAO
  pushed negative. The high-ice phase draws nothing, as the plan's text
  implies (it lists links for low ice only): the argument is about ice
  loss, high-ice autumns are nearly all before 2005, and the card says
  that the mirror image is implied by the statistics but has never been
  offered as a forecast. Nothing pushes the ice; the card says the trend
  is not a driver this map draws. Fifty-five new sources: forty-nine
  papers resolved on Crossref (abstracts read for all but the ten Nature-
  family papers that carry none, cited on their titles and well-known
  findings), the NSIDC record-minimum and November 2012 analyses, the
  Japan Meteorological Agency's press note on the December 2012 cold
  wave, NASA Earth Observatory on the January 2013 cold in China, the
  Hadley Centre Central England Temperature series, the Rutgers Global
  Snow Lab record and three State of the Climate reports. One story,
  "2012–13: record-low ice, then a cold Eurasian winter" (low ice from
  October 2012, one driver, chain on), five steps: the record minimum
  and the open Kara Sea in October, with the note that October snow was
  wide too and that the two precursors are one signal; December's cold
  wave from central Siberia to north-eastern China (Astana below −40°C,
  Moscow below −25°C); January's twenty-eight-year cold in China and the
  6 January vortex split, whose wave forcing came mainly from the
  Pacific side; February, the last month the map draws, with Britain's
  coldest March since 1962 named as what the map's season cannot show
  (the step sits in February because the validator refuses a focus the
  scenario does not touch, and in March every arrow waits); October
  2013, the ice back to 5.10 million km², the mild Eurasian winter and
  the American "polar vortex" winter that the ice story predicted
  neither of, and the argument stated both ways, ending "one winter, and
  the argument is about whether it counts".
- Honesty notes carried in the data: the driver card leads with "on the
  map because the science is disputed", states the claim and the
  counter-claim in plain words (the same weather causes both, forty
  winters, ensembles that cool little or not at all, the wavier-jet
  evidence challenged), names the one thing sixteen models agree on (a
  weak negative-NAO push worth about a tenth of a winter), says only the
  low phase is drawn and why, that nothing pushes the ice and why, that
  the eastern US claims go through the Chukchi Sea and are not drawn,
  and that this driver and the October snow driver (M25) are largely one
  signal seen twice, so drawing both is not evidence they add up. Every
  link's caveat names both sides with their strongest papers; the
  Siberian caveat ends "if the link is real it is small in any one winter
  and the rest is chance".
- What the engine shows, asserted in tests: from October, Siberia,
  western Russia, East Asia and the NAO are touched December–February
  only, November waits and March onward waits; with the chain on the
  pushed NAO's winter map follows at the floor tier (every applied arrow
  on the map contested), western Russia carries two arrows from one
  cause and is not hatched; the high and neutral phases draw nothing;
  under "probable and above", not only "established only", every arrow
  from the ice is a ghost and the whole driver disappears, which is the
  lesson the plan asked the browser check to show; with El Niño chosen
  as a second driver that began in June, East Asia is hatched in winter
  (the ice says colder, the El Niño milder).
- Schema, engine, UI: unchanged. A driver is data.
- Tests: acceptance blocks for the ice from October with direct links
  only (phases, the four links and the new node, the winter months, the
  NAO's regions hollow at depth 1, the empty phases, the two filters),
  with the chain on (the floor-tier winter map, western Russia's two
  arrows, never pushed, El Niño as a second driver) and the 2012–13
  story (fields, five steps, the states at each step). Existing
  expectations updated: thirteen drivers, twenty-eight driver-to-driver
  links, sixty-two outcome regions.
- Browser check (`W:\temp\claude\ClimateConnections\cdp-m24.mjs`):
  75 markers, the two new markers placed with no label overlap (every
  label on), the driver dropdown jumping to October, three phase
  buttons, October with nothing available and November waiting,
  December with the chain on (Siberia, western Russia and East Asia
  cold, the NAO induced negative, its winter map one tier down, every
  arrow on the map dotted, western Russia not hatched), the Siberian and
  pushed-NAO cards, March waiting, "probable and above" ghosting the
  whole driver, high ice drawing nothing and its card saying so, the
  2012–13 story stepped to its end, the print caption.
- Not in M24: any link from the warming trend; Arctic sea ice elsewhere
  (Chukchi, Beaufort), so the eastern US is not reached from this
  driver; a high-ice link.

### M25 — Fourteenth driver: Eurasian October snow cover (version 3, signed off 2026-09-08)
- Data: `eurasian_october_snow` driver node, label "October snow", three
  phases `high` (+1, "High snow", slate #475569), `neutral` (0, "Near
  normal") and `low` (−1, "Low snow", brown #854d0e); an area over
  Siberia and European Russia (45–140°E, 48–72°N); `default_start_month`
  10; marker at 56°N 97°E in the Krasnoyarsk region, not 58°N 75°E as the
  plan proposed, because the band between the Urals and the Yenisei at
  55–65°N is taken by the "Western Russia" and "Central Siberia" labels
  and a driver's label sits centred under its circle; the placement was
  found by fitting the map's projection to a dump of the live layout and
  searching for clash-free positions (`W:\temp\claude\ClimateConnections\m25\place.py`),
  which also moved the Central Siberia marker (M24) from 60°N 95°E to
  65°N 98°E to make room. No new outcome node. Three links, all from the
  high phase, all **contested**, lag 2–3 as the plan asks (so an October
  reading reaches December through the stratosphere), December–February:
  the NAO pushed negative, the eastern United States colder, northern
  Europe colder. The low-snow phase draws nothing: the case studies and
  forecasts the argument is about are all on the wide-snow side, and the
  card says the index is used in both directions by its makers. Nothing
  pushes the snow. Twenty-four new sources: twenty-two papers resolved on
  Crossref (abstracts read for all but Furtado 2015 and Henderson 2018,
  cited on their titles), the NOAA National Centers for Environmental
  Information note on the winter of 2016–17, and one press article, The
  Weather Channel of 4 November 2016, kept because it is the record of
  the forecast made from that October's snow, quoted as it was made; the
  Rutgers Global Snow Lab record, added in M24, is the source for how
  wide each October was. One story, "2009–10: the snow came early, and
  the winter froze" (high snow from October 2009, one driver, chain on),
  five steps: the October advance, fifteen million km² in three weeks to
  the widest since 1976, and the real-time forecast; December, the six
  steps of the mechanism observed in order, with the note that the QBO
  story and the El Niño claim the same December ("three arrows, one
  December"); January, northern Europe cold twice over from one October
  and the study that found no single cause big enough; February, the
  second cycle, 135 cm of snow in seventeen days on the Mid-Atlantic
  coast and the lowest winter AO since 1950; October 2010, the record
  since: the link absent before the 1970s, the misses of 2016–17 (a wide
  October snow, then the sixth-warmest US winter) and 2019–20 (a wide
  October snow, then the strongest vortex and most positive AO on
  record), the chart artefact, ending "a real hypothesis, a famous
  success, and a decade of misses, all on one dotted arrow". The intro
  says the map now has four stories about one winter.
- Honesty notes carried in the data: the driver card gives the claim as
  a six-step chain and then the doubts one by one (not before the 1970s,
  weak or absent in models, the snow may be the effect not the cause,
  the chart artefact, the misses since 2010, the possible QBO dependence
  and the possible statistical accident); it says only the high phase is
  drawn and why, that nothing pushes the snow, and that the snow and the
  Barents–Kara ice are largely one signal seen twice, so picking both is
  not evidence that two signals add up. The NAO link's caveat repeats
  that; the eastern US caveat names 2016–17 as "the arrow with the most
  public record of failure"; the northern Europe caveat names 2019–20.
- What the engine shows, asserted in tests: from October, the NAO, the
  eastern United States and northern Europe are touched December–February
  only, and October and November have nothing available (lag 2, not even
  pending); with the chain on the two regions carry two arrows from one
  cause (the snow's own and the pushed NAO's) and are not hatched, and
  every applied arrow is contested; the low and neutral phases draw
  nothing; "probable and above" ghosts every arrow; with low Barents–Kara
  ice chosen as a second driver in the same October the NAO carries both
  precursors' arrows, agreeing, and nothing on the map is hatched, which
  is the "not evidence that they add up" lesson made visible.
- Schema, engine, UI: unchanged. A driver is data.
- Tests: acceptance blocks for the snow from October with direct links
  only (phases, the three links and no new node, the winter months, the
  empty phases, the filter), with the chain on (two arrows per region,
  never pushed, both precursors at once) and the 2009–10 story (fields,
  five steps, the states at each step). Existing expectations updated:
  fourteen drivers, twenty-nine driver-to-driver links.
- Browser check (`W:\temp\claude\ClimateConnections\cdp-m25.mjs`):
  76 markers, the new marker and the moved Central Siberia marker placed
  with no label overlap (every label on), the driver dropdown jumping to
  October, three phase buttons, October and November with nothing
  available, December with the chain on (the NAO induced negative,
  northern Europe and the eastern US applied along two arrows each and
  not hatched, every arrow dotted), the northern Europe and pushed-NAO
  cards, "probable and above" ghosting the whole driver, low snow
  drawing nothing and its card saying so, both precursors at once with
  the NAO card naming both and nothing hatched, the 2009–10 story
  stepped to its end, the print caption.
- Not in M25: any implication that the two precursors add up (the card
  and the two-driver test say the opposite); a low-snow link; November
  snow as a separate reading, which one study finds is the month that
  matters. Next in `docs/PLAN_V3.md`: the data-only drivers are done
  (M20–M27); what remains is UI (M28–M31), the engine extensions
  (M32–M37) and the roadmap items (M38–M40), each with its own sign-off.

### M28 — Region-first navigation, "where I live" (version 3, signed off 2026-09-08)
- The first UI item of version 3, taken at the user's "your choice" after
  the data-only drivers were done. No data change, no engine rule change:
  `src/engine/inverse.ts` (pure, additive) exports `influencesOn(graph,
  nodeId)`, every link into a node grouped by driver and then phase, in
  graph and phase order, each with its own tier and a twelve-month season
  strip built on `src/engine/season.ts`; `regionNodes(graph)`, the
  outcome nodes by name; `countInfluences`. Tests in
  `src/engine/inverse.test.ts` (eleven: grouping and order, empty for a
  node nothing reaches, a phase that fires nothing left out, the tier
  never downgraded, and on the shipped data: the monsoon reached by six
  drivers along eight links with ENSO both ways, the Sahel by five, a
  one-link place still carrying its caveat, every place reached by at
  least one driver, every link into a place listed exactly once).
- UI as §5.10: the "By region" picker, the inert scenario controls, the
  region map (`MapView.renderRegion`, sharing the arrow and marker joins
  with the scenario render through `drawArrows` / `drawNodes`; `arcPath`
  gained a sideways `spread` for arrows that share a path, fanning out
  over the first third of the way and running parallel into the target,
  and breaking at the seam as the projected path would), the region card
  (`renderRegionCard`), the "Watch … arrive" buttons, the hash.
- Departure from `docs/PLAN_V3.md`: its acceptance example says five
  drivers reach Kiribati; in the data one does. The check uses the Indian
  summer monsoon (six drivers, eight links, ENSO in both phases) and the
  Sahel (five drivers) instead, and East Asia summer for the one-link
  case. The card's per-link line uses the place's own outcome label
  ("Monsoon tends to be weaker than usual") rather than a bare "drier",
  since that is the word the scenario card uses for the same place.
- Also fixed on the way: the B map pane was never hidden outside compare
  mode (an author `display: flex` beats the browser's `[hidden]` rule),
  so an empty second map sat under the first since M14, and the pane's
  title strip kept its last compare-mode text after compare was switched
  off; `.pane[hidden]` and `.pane-head[hidden]` now say `display: none`.
  The timeline gets the same rule.
- Browser check `W:\temp\claude\ClimateConnections\cdp-m28.mjs`:
  plain load unchanged; the monsoon in region mode (hash, timeline
  hidden, controls inert, one map, month display, caption, the place
  selected and hollow, each of the fourteen drivers ringed or grey as the
  data says, the other places hollow and unlabelled, eight region arrows,
  ENSO's two in red and blue with their own arrowheads and about seven
  units apart at the middle and at the head, the IOD's contested and
  orange, the place's own area only, six driver headings on the card,
  eight "How sure are we?" blocks and strips, eight watch buttons, DOI
  links); East Asia summer with one link and its caveat; northern Europe
  with the NAO both ways across the seam drawn as two different paths;
  a click on the Sahel switching the region; a click on ENSO leaving into
  El Niño from June with the Sahel selected and the timeline playing; the
  eruption watch button; "#region=sahel_rainfall" on load, a bad id
  ignored, a hash change followed; a story leaving region mode and
  region mode ending a story; Escape; "Where I live…"; compare switched
  off by region mode; print with the watch buttons hidden.
- Not in M28: a search box; clicking the map background; a region view
  of a driver node (the driver card's "Feedback from other drivers"
  already lists what pushes it); showing the chain (a driver reaching the
  place through another driver), which the card says to look for under
  "Driver". Next in `docs/PLAN_V3.md`: M29 (sources page), M30 (arrival
  window), M31 (a second language) or the engine set from M32, each with
  its own sign-off.

### M32 — Phase duration (version 3, signed off 2026-09-08)
- The first engine extension of version 3, taken at the user's "work on
  M32". Section 4 rule 9 as written above: `Scenario.holdMonths` and
  `ScenarioDriver.holdMonths` (1–12), `chosenFade`, the `faded` link
  status and `NodeState.fadedLinkIds`. No hold is the pre-M32 timeline
  exactly (a regression test runs every shipped story without its hold
  and asserts no faded link and every chosen driver in phase from its
  onset through month 12). The 2026-09-08 decision on ocean memory (a lag
  at or beyond the hold never fires; the chain is the honest way to show
  memory) is in the rule and in the card and hint text. Engine tests in
  `src/engine/propagate.test.ts` (eleven: no hold, the fade with an
  applied link faded, a long lag never arriving, a pending link faded
  rather than pending in its season, a hold of 12 fading at month 12,
  the chain cut with the pushed driver's links not reported, a faded
  chosen driver still never pushed, a ghost staying a ghost, the second
  driver's hold from its own onset, from a negative onset and over
  before month 0, holds outside 1–12 refused); `linksInPlay` ignores a
  link only ever faded (season test); the 1998 scenario with the El Niño
  held twelve months from June 1997 shows no conflict at the typhoons
  (acceptance test).
- Data: every driver carries `typical_duration_months` (the validator
  errors without it): ENSO [8, 12], the IOD [4, 6], the NAO and SAM
  [1, 3] with the onset hint saying a phase here is a winter's or a
  season's average, the PDO, AMO and tropical eruption [12, 12] with
  hints saying they really last years, the Atlantic Niño [3, 5], the
  basin mode [4, 7], the AMM [3, 5], the PMM [3, 6], the QBO [10, 12],
  the Barents–Kara ice and the October snow [5, 6] (the autumn reading
  and the winter it shapes). Stories may carry `hold_months` and
  `second_hold_months`; the validator's copy of the engine rule honours
  them. The four card texts that apologised for the twelve-month hold
  (NAO, SAM, Atlantic Niño, the eruption's summary and phase) now
  explain the control instead. The 1998 Yangtze story holds the basin
  eight months, so it fades in October as the real warmth did; its intro
  and last step say so and the last step invites the student to set the
  whole year and see the difference.
- UI as §5.4 and §5.6 above: the "Event lasts" / "Second driver lasts"
  pickers and hints (`ControlsView.makeHoldSelect` / `reflectHold`,
  `typicalHold`, `durationWords`), `TimelineView.setFades`, faded arrows
  in `MapView.render` (grey stroke, neutral arrowhead, `.link.faded`),
  the `faded` marker class, the card's faded blocks and driver states,
  the pane title, the print caption; `ScenarioSettings.hold` and
  `second.hold`. Departure from `docs/PLAN_V3.md`'s text: "typical (N
  months)" is the middle of the range rounded up (ENSO 10, the IOD 5,
  the NAO 2), since the plan did not say which end to read, and the
  data range is capped at 12 rather than carrying the real years of the
  PDO and AMO, which the hints say in words.
- Browser check `W:\temp\claude\ClimateConnections\cdp-m32.mjs` (52
  checks): plain load unchanged (the NAO pushed in January); El Niño from
  June held six months (the hint, the tick mark and tooltip, the print
  caption, the marker grey at December and unlabelled unless selected,
  Indonesia hollow with class faded and its arrow grey with a neutral
  arrowhead at opacity 0.22, the Nordeste arrow reported though its lag
  never ran, every arrow faded, the ENSO card, the Indonesia card's
  "Faded: the event has ended" line, the Nordeste card's "Never arrives"
  with the ocean sentence, the NAO grey with class faded in January with
  its own arrows gone and its card saying the push has faded); "typical"
  reading 10 months and April; 12 months fading at month 12; a driver
  pick resetting the hold; the NAO's and PDO's typical text; the second
  driver's own hold from September (December, month 6), since March held
  two months (over before the year shown, no tick, the card) and held
  five (August, month 2); compare mode per side with the differing ring
  and the card's "faded: the event has ended"; the Yangtze story (hold 8,
  the tick at October, the grey basin and the card at the last step);
  print. The `#controls select` order is now 0 story, 1 region, 2
  driver, 3 second driver, 4 second month, 5 second hold, 6 month, 7
  hold, 8 filter.
- Not in M32: a fade into the opposite phase (a push; M20 or two chosen
  drivers); a hold for a pushed driver (rule 6 already ties it to the
  pushing link); a hold longer than the year shown; ocean memory past
  the fade (the chain). Next in `docs/PLAN_V3.md`: M33 (any number of
  chosen drivers) then M34 (a table of real years, which reads
  `hold_months` from its rows), or the UI items M29–M31, each with its
  own sign-off.

### M33 — Any number of chosen drivers (version 3, signed off 2026-09-08)
- The second engine extension of version 3, taken at the user's "work on
  M33". Section 4 rule 8 rewritten in the plural as above:
  `Scenario.others: ScenarioDriver[]` replaces `Scenario.secondary`, which
  the engine reads as a one-element `others` for one milestone (M34 may
  remove it); `otherDrivers(scenario)` merges the two spellings, and
  `chosenDrivers`, `chosenOnset` and `chosenFade` read the list. Every
  rule-8 statement about "the second driver" now holds for each chosen
  driver other than the first: its own onset (M12/M15 arithmetic
  unchanged), its own hold (M32), first hop at full tier, never pushed,
  the same driver never twice (the first driver included; the engine
  throws), no order beyond the onsets, sum and clamp unchanged so two
  against one clamps to ±1 with `conflicting` set. No new combination
  rule. Engine tests in `src/engine/propagate.test.ts` (eight: `secondary`
  as a one-element `others` giving the same timeline and chosen list
  across the M12/M15/M32 cases and an empty list the single-driver
  scenario; three drivers two against one and four drivers two against
  two; four drivers with three onsets, one negative; each driver's own
  hold from its own onset; no chosen driver pushed from any other or from
  a pushed driver, with the pushed driver still followed; a neutral phase
  among many pinning its driver; the same driver twice refused whichever
  way it is spelled; a bad hold on any of them refused); the story tests
  build `others` from the story's list, check that graph.json carries no
  old field, and run every shipped story with one other driver both ways
  for the same timeline; the acceptance and compare tests use `others`.
- Data: stories gain `drivers:` (a list of `driver`, `phase`, optional
  `start_month`, `starts_before`, `hold_months`), replacing
  `second_driver` / `second_phase` / `second_start_month` /
  `second_starts_before` / `second_hold_months`. The validator still
  accepts the old fields for one milestone, refuses the two spellings at
  once and any driver chosen twice (the story's own included), checks
  every listed driver and phase, and writes only `drivers` into
  graph.json, so the app and the tests read one shape. The eight shipped
  stories with a second driver were migrated (graph.json unchanged apart
  from the field name); no shipped story chooses three drivers yet.
- UI as §5.6 above: `ScenarioSettings.others: OtherDriver[]` replaces
  `second`; the "Second driver (optional)" block is row 0 of a list
  (`OtherRow` in `src/ui/controls.ts`), the rows after it and "+ Add a
  driver" behind a `<details class="more-drivers">` closed by default
  ("More drivers (N chosen)" once there are more); headings by ordinal
  ("Third driver", "Third driver begins in", "Third driver lasts";
  `ordinalWord`, `lastsControl`); the timeline's onset ticks carry the
  driver's name and merge when two begin in the same month
  (`TimelineView.setOtherOnsets`); the dial draws one dot per other
  driver (`DialModel.others`); the pane title adds one " + " per driver;
  the print caption lists them ("..., and A: x beginning in June and B: y
  already under way since May, 4 months earlier"); the card says "One of
  three drivers you chose" and names the row's own control when a driver
  has faded (`ChosenPhase.control`). Selects in `#controls` carry a
  `data-role` (story, region, driver, other-driver, other-month,
  other-hold, month, hold, filter) because the list moves the later ones.
- Browser check `W:\temp\claude\ClimateConnections\cdp-m33.mjs` (41
  checks): plain load as in M32 (one empty second-driver row, nine
  selects, no "More drivers"); the AMO as second driver showing the
  collapsed section and the first-driver headings; "+ Add a driver"
  appending the IOD as "Third driver" with its own month and hold pickers
  and every picker leaving out the drivers taken elsewhere; the QBO
  easterly from June as the third driver, so El Niño, the positive AMO
  and the QBO meet at the Atlantic hurricanes in August: quieter, two
  against one, conflicting ring, all three arrows applied and three
  "from" lines on the card; named ticks at September and December and two
  dial dots, side by side when both begin in September; the QBO's own
  hold from its own onset with the card naming "Third driver lasts"; a
  fourth driver ("Fourth driver", "One of four drivers you chose") and
  "None" removing it; "None" on the second row moving the QBO up with its
  month and hold; the QBO picked as the main driver dropping its row;
  compare mode copying the list to B, its titles with three drivers, and
  the IOD dropped from B alone; the 2016 story setting the dipole since
  May with the section closed and the 1997 story clearing the list;
  print. Screenshots `m33-01-three-drivers-august.png`,
  `m33-02-more-drivers-panel.png`, `m33-03-compare.png`.
- Not in M33: a new combination rule (two against one is drawn as the
  majority, hatched, not weighed); a story with three drivers (the data
  allows it; none was needed); removing `secondary` and the old story
  fields (one milestone of grace, as the plan says). Next in
  `docs/PLAN_V3.md`: M34 (a table of real years, whose rows are M33
  scenarios), or the UI items M29–M31, each with its own sign-off.

### M34 — A table of real years (version 3, signed off 2026-09-08)
- The first item to read the record rather than the literature, taken at
  the user's "work on M34" and done the way rule 16 of `docs/PLAN_V3.md`
  allows: a hand-curated, committed table, not a data feed.
  `data/years.yaml`: 76 rows, 1950–2025, 353 entries; ENSO alone before
  1980, the seven index drivers (ENSO, the Indian Ocean Dipole, the NAO,
  the SAM, the PDO, the AMO, the Atlantic Niño) from 1980, as decided on
  2026-09-08. Each entry is a driver, a phase, an `onset_month`, an
  `onset_year` when the phase began before the row's year,
  `duration_months` (uncapped: the 1998–2001 La Niña holds thirty-two), an
  `index_note` and a `source`; a neutral phase has no onset. Every phase
  was called from the index dataset named in its source by a threshold
  rule written into that source's citation, eight new sources:
  `noaa_oni_index` (NOAA's five-season ±0.5 °C rule on the ONI, ERSST v6),
  `psl_dmi_hadisst_index` (±0.35 °C for two overlapping seasons touching
  June–November on the HadISST dipole index; a little under the Bureau's
  ±0.4 because that index runs smaller than the Bureau's weekly one, and
  with it the Bureau's list since 1980 is reproduced except the weak
  negatives of 2014 and 2021), `cpc_nao_index` (December–February mean
  beyond ±0.5), `marshall_sam_index` (±1.5 for two overlapping seasons on
  the Marshall index, the first such run of the year), `ncei_pdo_index`
  and `psl_amo_kaplan_index` (calendar-year means beyond ±0.5 and ±0.1 °C,
  a run of same-phase years one phase), `ncei_amo_ersst_index` (the NCEI
  series, detrended, from 2023 where Kaplan ends) and `ersst_atl3_index`
  (±0.5 °C for one season on an ATL3 index computed from the ERSST v5
  grid, the literature's one-standard-deviation rule). The series were
  downloaded once (August 2026) and the rules applied by scripts under
  `W:\temp\claude\ClimateConnections\m34\` (`derive.py`, `assemble.py`,
  `notes.py`); the index notes are generated from the numbers, the year
  notes written by hand and kept to what the indices show plus events with
  a source in `links.yaml`. The reading is the same for every driver: the
  entry is the event that began earliest in the year, else the one already
  under way when the year began, else neutral; other events of the year
  are named in the index note (the second La Niña of 2011, say). The
  ERSST v6 ONI drops the 2016–17 La Niña the 2016 story tells of (four
  seasons, one short) and adds a weak El Niño in the winter of 2019–20;
  the 2016 and 2019 notes say so.
- Validator: `scripts/years-schema.mjs` (the schema and `checkYears`,
  shared with the tests): every driver and phase exists, a neutral phase
  has no onset or duration and any other phase has an onset month, an
  `onset_year` is earlier than the row's year, no driver twice, years
  unique and ascending, every source resolves. `graph.json` gains `years`.
- Engine: nothing new. `src/engine/years.ts` `scenarioForYear(graph, row)`
  turns a row into a rule-8 scenario: month 0 is January of the year when
  a recorded driver allows it (the first neutral or January-onset entry in
  row order is the first driver), otherwise the onset, in the year or the
  year before, whose twelve months cover most of the year (a tie goes to
  an onset in the year, then to row order; before 1980 an ENSO phase that
  simply continued gives the earlier year's window); every other entry is
  a chosen driver from its own month, `startsBefore` when it began before
  month 0 (an earlier start is read as at most a year back, rule 8), a
  neutral phase pinned from month 0, a duration a rule-9 hold when the
  phase ends within the months shown. Where rule 9 cannot place a fade (a
  phase over a year old at month 0 that ends later than twelve months
  after its read-back start) the closer of a capped hold and no hold is
  taken, a fade at the last month shown is held through, and an entry that
  begins as the months shown end is left out; `YearScenario.approximations`
  lists them and the panel says so. On the shipped table that is the
  1982–83 El Niño in 1983 (ends two months early), the El Chichón haze in
  1984 (three months early), the La Niña of 1988–89 in 1989 and the El
  Niño of 1991–92 in 1992 (one month each), the positive PMM of 2017–18
  in 2018 (two months early) and, in 2024, the dipole of 2023 (two months
  early) and the warm basin since November 2023 (one month early). Drivers absent from a
  row are not chosen: "not recorded", free to be pushed by a chain. 25
  tests in `src/engine/years.test.ts`: the table's coverage and order
  (all fourteen drivers from 1980, the meridional modes to 2024), every
  entry's source stating its rule, every dated story has a row, every row
  through the engine with each entry at its engine onset and fade, the
  approximations pinned, the anchors (January for every row from 1980,
  one of fourteen entries being always neutral; eight ENSO-alone years
  from the year before), 1997 in detail and through the engine (the
  neutral NAO pinned against El Niño's push), 1972, 1999, 2001, 1955 and
  1959, 1983, the seven added drivers (2012's ice held six months and
  read a year back in 2013, 2009's QBO and snow, the Pinatubo haze from
  July 1991 and its end in 1984 that the engine cannot place, 2025
  without the meridional modes), an all-neutral row's empty map, the tie
  rule, an entry left out, the function's refusals and the validator's.
- UI as §5.6 above: the "Real year" picker (`data-role="year"`), the
  locked scenario controls (`ControlsView.setLocked`), the year panel
  (`src/ui/year.ts`, `YearView`, `#year` above `#card`), the dated month
  display, `ChosenPhase.record` and `renderCard(..., year)` for the card
  wording, the story panel's "Compare with the record" button, the year
  caption. The `#controls select` order is now 0 story, 1 year, 2 region,
  3 driver, then the other-driver rows, month, hold, filter.
- Browser check `W:\temp\claude\ClimateConnections\cdp-m34.mjs` (36
  checks): the picker and its hint; 1997 (the panel with the note, the
  window sentence, seven lines with their index notes, the seven not
  recorded, the honesty sentence, two stories and the sources; the locked
  controls showing the NAO first with six rows, El Niño from May, the
  Atlantic Niña since October held ten months, the PDO since January; the
  dated month display, the named ticks and the fade mark; the caption;
  the map at month 0 and in September, with the cards for ENSO, the NAO,
  the faded Atlantic Niña, the basin mode pushed warm by the chain and
  the unrecorded QBO); "Edit this scenario" freeing the controls with the
  scenario kept; 1955 from May 1954; 2024 from December 2023 with its two
  approximations; 1983's El Niño ending early with the record on the
  card, and 2001's La Niña read a year back with its record start on the
  card; the 1997 story's "Compare with the record" and the year's story
  links; 2010's lines; region mode, Escape and a story leaving the year;
  compare off throughout; print. Screenshots `m34-01-1997-september.png`,
  `m34-02-year-panel.png`, `m34-03-2024-april.png`.
- The other seven drivers, added the same day (2026-09-08) from their
  own indices so that every row from 1980 records all fourteen: seven
  more index sources, each with its rule in the citation, and the same
  reading (the first event of the year, else the one under way, else
  neutral). `ersst_iobm_index`: the tropical Indian Ocean mean
  (20°S–20°N, 40–110°E) from the ERSST v5 grid, anomalies vs 1991–2020
  with the 1980–2025 linear trend removed (the mode is the swing on top
  of the warming), ±0.25 °C for two overlapping seasons. `psl_amm_index`
  and `psl_pmm_index`: the PSL meridional-mode SST indices, ±2.5 and ±3
  (about one standard deviation) for two seasons; both series end in
  August 2024, so 2025 has neither entry ("not recorded", the row note
  says why). `giss_glossac_aod_index`: the global mean of the GISS
  stratospheric aerosol optical depth by latitude (GloSSAC v2.24,
  1979–2025), an eruption in force while the monthly value is above 0.02
  (four times the quiet background): El Chichón May 1982 to July 1984
  and Pinatubo July 1991 to January 1994, nothing else; Hunga Tonga
  (January 2022) reached 0.015 and is not called, the 2022 note and a
  new source (`sellitto_2022`) saying why. `psl_qbo30_index`: the 30 hPa
  equatorial wind from the NCEP/NCAR reanalysis, the phase its sign,
  reversals under three months ignored, checked against the Singapore
  balloons at the same level for 1990–2021 (every change within three
  months; the balloons show the weak easterly of early 2020 as two
  months only, and the 2016 disruption cut through at 40 hPa, one level
  lower). `nsidc_barents_kara_index`: the Sea Ice Index v4 regional
  extent, Barents plus Kara, October–November mean, the 1979–2025 trend
  removed (the links describe the year-to-year swing, not the decline),
  ±0.2 million km²; `rutgers_eurasia_snow_index`: the Rutgers Eurasia
  October extent against the 1991–2020 mean, the 1980–2025 trend removed
  (a rise disputed as an artefact by Brown and Derksen 2013), ±1.5
  million km². Both autumn readings are dated from October and held six
  months, to March, the winter the links describe (the driver's typical
  duration; a two-month or one-month record would fade them before their
  lag-2 links fire, which is not what the record means), and a neutral
  October after a called one carries the previous autumn's phase as
  "already under way" to March, the note giving the new reading too.
  Scripts `derive2.py` and `rows2.py` beside the M34 ones, the year
  notes extended in `notes.py` (`EXTRA`) with a sentence per notable
  year and the new sources. Consequences: with fourteen entries some
  driver is always neutral, so every row from 1980 anchors January (2024
  now runs from January, its NAO winter placed); the approximations are
  the seven listed above; the 2009 row records the October snow extent
  as near normal while the 2009–10 story tells of a fast advance, and
  says so (the story reads Cohen's advance index, the table the month's
  extent). Browser check `cdp-m34b.mjs` (31 checks): 1997 with fourteen
  lines and no not-recorded list, "One of fourteen drivers", the QBO
  card from the record; 2012's ice line and tick; 1991's eruption line
  and card; 1984's approximation; 2009's QBO and snow lines; 2024 from
  January with its two approximations; 2025's not-recorded modes; the
  M34 flows (edit, 1955, 1983, 2001, stories, region, Escape, print)
  again. 769 tests.
- Not in M34: fetching anything at run time (the series were read once
  and the rows committed); monthly index values; years before 1950; a
  year in the URL hash; removing
  `Scenario.secondary` and the pre-M33 story fields (still accepted, one
  more milestone). Next in `docs/PLAN_V3.md`: the UI items M29–M31, or
  M35 (modulation), each with its own sign-off; M38 (quiz) can now draw
  on the years.

### M35 — Links that weaken other links (version 3, signed off 2026-09-08)
- The third engine extension of version 3, taken at the user's "M35".
  Section 4 rule 10 as above, written before the code (rule 14 of
  `docs/PLAN_V3.md`): `Link.weakened_by`, a list of `{ driver, phase,
  sources }` (`Modulation` in `src/types.ts`); in `propagate`, after the
  per-hop downgrade and the cap at the pushing driver's tier, a link whose
  listed driver is among the chosen drivers in phase this month
  (`inPhase`: at or after its onset, before its fade) is downgraded one
  more step, floored at contested, before the `minConfidence` ghosting
  and rule 5; the entries in force are reported as `LinkState.weakenedBy`
  (present only when non-empty, so every pre-M35 link state compares
  equal). Nothing else changes: same effect, same months, same sums,
  onsets and fire-once; a pushed driver never modulates; a faded link is
  reported as rated; one tier however many entries are in force. Engine
  tests in `src/engine/propagate.test.ts` (twelve: one tier down and the
  same months as without, in the pending months too; unchanged with the
  modulator absent, neutral, in another phase or another driver; unchanged
  with the modulator pushed rather than chosen; unchanged before its start
  month and from its fade, in force from month 0 when it began before the
  first; the floor; ghosted at the weakened tier, so applying nothing and
  pushing nothing; rule 5 at the node with sums and conflicts unchanged;
  stacking with the hop downgrade; one tier for two entries, both reported
  in order; a faded link as rated; a modulated link still pushing a driver
  at the lower tier with onsets unchanged; a link into the chosen modulator
  still skipped). Acceptance tests on the shipped data (nine: the ten
  links and their entries; the Northwest at established alone, probable
  and hatched with the negative PDO, established with the positive; the
  Gulf Coast at probable by rule 5 and California at the floor; the PDO
  from December weakening from month 6 and moving nothing; "established
  only" ghosting the weakened links; the chain pushing the PDO into the
  same-sign phase only, so a pushed PDO never weakens anything; La Niña's
  mirror; the real year 2023 from the record; no shipped story pairing
  ENSO with the opposite PDO).
- Data: `weakened_by: [{ driver: pdo, phase: negative | positive, sources:
  [gershunov_barnett_1998, mccabe_dettinger_1999, yu_zwiers_2007] }]` on
  ENSO's ten North American winter links (El Niño and La Niña to the Gulf
  Coast, California, the Pacific Northwest, the Prairies and the
  Southwest; the plan's "Alaska" has no ENSO link on the map, the
  Southwest stands in), the El Niño ones weakened by the negative PDO and
  the La Niña ones by the positive; each link's `evidence_note` gains, or
  is, a sentence saying so, and the two contested California links say the
  line does not change. Two new sources, both resolved on Crossref
  (McCabe & Dettinger 1999, Int. J. Climatol. 19, 1399–1410; Yu & Zwiers
  2007, Clim. Dyn. 29, 837–851); Gershunov & Barnett 1998 was already
  cited. The PDO node's summary now says what the map draws (the
  weakening) and what it cannot (the stronger side, and Australia); its
  two phase summaries say whose winter pattern comes through weakly.
  Validator: the driver exists with that phase, is not the link's own,
  no pair twice, every source resolves and is counted as cited, and the
  link has an `evidence_note`. 439 sources.
- UI as §5.5 above: `sureBlock` takes the node and source maps and adds
  "Weaker this month: ... chosen on the left, so this link is drawn one
  tier lower than its rating" (or "one tier lower still" behind a hop, or
  "already at the lowest tier, keeps its line style" at the floor),
  "It is still applied, with the same effect, in the same months", and
  the studies; a link with `weakened_by` not in force says "Weaker when
  the Pacific Decadal Oscillation in its Negative PDO phase: choose that
  driver too ..." (in region mode and on the feedback block as well); the
  hop sentence now appears only behind a hop. The driver card gains
  "Links it weakens" (`weakensBlock`), grouped by phase with each link's
  rating. The map draws the effective tier as it did for hops, so a solid
  line turns dashed when the PDO is added; the legend gains one sentence
  under the tiers. No new control, no new toggle: modulation is drawn
  only while the student has chosen both drivers, so a page without the
  PDO looks as it did (rule 15).
- Browser check `W:\temp\claude\ClimateConnections\cdp-m35.mjs` (15
  checks; screenshots `m35-01-northwest-negative-pdo.png`,
  `m35-02-pdo-card.png`, `m35-03-2023-november.png` under
  `W:\temp\claude\ClimateConnections\m35`): El
  Niño from June, January, the Pacific Northwest solid and established on
  the card with "Weaker when"; the negative PDO as second driver turning
  the arrow dashed (class probable) and the card saying "Weaker this
  month" with the three studies, the place hatched; the Gulf Coast at
  probable; the PDO's own card listing ten links under "Links it weakens";
  "established only" ghosting the Northwest arrow; the positive PDO
  restoring the solid line; region mode on the Gulf Coast showing "Weaker
  when"; the real year 2023 showing the Gulf Coast weakened from the
  record in November; the legend sentence; print.
- Not in M35: strengthening; modulation by an outcome; modulation of a
  driver-to-driver link (the schema allows it; none shipped); the two
  candidate cases in `docs/PLAN_V3.md` (El Niño → Atlantic hurricanes
  weakened by the warm AMO, contested; El Niño → NAO negative weakened by
  the westerly QBO), each for its own sign-off; the Australian case (Power
  et al. 1999, already a PDO source); removing `Scenario.secondary` and the
  pre-M33 story fields. Next in `docs/PLAN_V3.md`: the UI items M29–M31,
  M36 (flavours), M38 (quiz), each with its own sign-off.

### M36 — El Niño flavours (version 3, signed off 2026-09-08)
- The fourth engine extension of version 3, taken at the user's "M36 (El
  Niño flavours) - work on it". Section 4 rule 11 as above, written before
  the code (rule 14 of `docs/PLAN_V3.md`): `Phase.variant_of` (the same
  `value` as its parent, which is never a variant itself) and
  `Link.except` (variants of the link's own `when`). A driver holding a
  phase *matches* a named phase when it is that phase or a variant of it.
  The links in force for a phase are the links whose `when` names it,
  plus, for a variant, its parent's links that do not list it in
  `except`; `linksOfPhase` in `src/engine/propagate.ts` is the one place
  that reads this, used by `activeLinks`, the faded loop and every hop,
  memoised per driver and phase. A push (rule 6) lands on the parent:
  `phaseForValue` ignores variants. `weakened_by` (rule 10) matches
  through variants; `except` never applies to modulation. Nothing else
  changes: same lag, season, tier, depth, sums, holds, onsets and
  fire-once; a scenario in a phase without variants runs exactly as
  before. Region mode (`src/engine/inverse.ts`) lists under a variant its
  own links and, as `except`, the parent links it does not fire; a
  variant with neither is not listed. Engine tests in
  `src/engine/variants.test.ts` (twelve: the helpers; the inherited link
  applied exactly as for the parent; the excepted link never reported and
  the variant's own link never reported for the parent; a push landing on
  the parent so the variant's links never fire at a hop; a `weakened_by`
  entry naming the parent in force for the variant; a hold fading the
  inherited and own links and never the excepted one; the variant as
  another chosen driver with its own start month and read backwards; the
  confidence filter ghosting the own link at its own tier; regression
  against a graph with the variants stripped; the variant beside its
  parent refused as the same driver twice; region mode). Acceptance tests
  on the shipped data (eight: one variant, ENSO only, same value, own
  colour; the five own links and six excepted classic links with their
  evidence notes, four replacements and one new place, the coast and the
  fishery dropped without a replacement; the tiers and signs; the central
  kind from August month by month, the classic kind for contrast; the
  negative PDO weakening the kind's Gulf Coast link and the inherited
  Northwest link alike; a positive PMM pushing ENSO into the classic kind
  only; regression: every shipped classic story and every real year the
  same with the variants stripped; the 2009–10 story). The stories test
  allows a step on a place only an excepted parent link would have
  reached, and the M35 test now counts eleven weakened links.
- Data: ENSO gains the phase `el_nino_central` ("El Niño, central
  Pacific", `variant_of: el_nino`, value 1, colour `#d94801`) whose
  summary starts "What is different:" and ends with the continuum
  sentence and the chain caveat; the classic phase's summary says it is
  the classic kind. Five links of its own (`el_nino_central_indian_monsoon`
  established, Kumar and others 2006; `el_nino_central_us_gulf_coast`
  probable, weakened by the negative PDO like its classic twin;
  `el_nino_central_west_pacific_typhoons` probable, Kim, Webster and
  Curry 2011, Chen and Tam 2010; `el_nino_central_atlantic_hurricanes`
  contested, the sign the other way from the classic link, Kim, Webster
  and Curry 2009 against Lee, Wang and Enfield 2010 and Larson and others
  2012; `el_nino_central_eastern_north_america` contested, cold, Yu 2012,
  Yu and Zou 2013, Zou and others 2014, a place no classic El Niño link
  reaches). Six classic links carry `except: [el_nino_central]` with an
  evidence note saying why: the monsoon, the Gulf Coast, the hurricanes
  and the typhoons replaced by the links above; the coast of Peru and the
  fishery dropped without a replacement (Kao and Yu 2009; Takahashi and
  others 2011; Dewitte and others 2012; Espinoza-Morriberón and others
  2017). Three classic links (East Australia, the Pacific Northwest, the
  Southwest) keep firing for both kinds and their evidence notes say what
  the studies add or dispute. Twenty-six new sources, every DOI resolved
  on Crossref (Ashok and others 2007; Kao and Yu 2009; Kug, Jin and An
  2009; Capotondi and others 2015 on the ENSO node; the rest on the
  links). A new story `el_nino_central_2009_10`, "2009–10: an El Niño in
  the wrong place": the central kind from August 2009 (the record's ONI
  onset; the plan said July) held eight months, the negative NAO from
  December for three, seven steps ending on the coast of Peru in
  February, which the story is allowed to point at because a classic link
  would have reached it, and on ENSO faded in April. The 2009 row of
  `data/years.yaml` keeps `el_nino`, since the index cannot tell the
  kinds apart, and its note says the event was central-Pacific (Lee and
  McPhaden 2010). Validator: a variant's parent exists on the same
  driver, is not a variant and has the same value; unique values and the
  neutral phase are checked among non-variants; `except` needs an
  `evidence_note`, names variants of the link's own `when` only, never
  twice, never on a variant's link; a variant link to a place a parent
  link reaches requires the parent to except it; a driver target needs a
  non-variant phase for the effect; the story check reads rule 11 and
  allows an excepted place. 213 links, 465 sources, 19 stories.
- UI as §5.5–5.6 above: `PhasePicker` in `src/ui/controls.ts` draws the
  non-variant phases as before and, only while the chosen phase has
  variants, a second row "Which kind of El Niño?" with "Classic" and the
  variant's label trimmed of its parent's ("central Pacific"), on the
  first driver and on every other-driver row; La Niña hides the row; the
  default is the parent, so the page opens as before. The card of a
  variant phase starts with "What is different in this kind": its own
  links with "(replaces the El Niño link)" where one does, the classic
  links "Not expected in this kind, so not drawn", how many classic
  links are drawn for it too, the strength sentence and the chain
  sentence; the classic card says another kind can be picked and repeats
  the strength sentence. A link block says "Only for this kind" or
  "Holds for both kinds of El Niño"; an outcome the kind does not reach
  through an excepted classic link shows "Not expected in this kind"
  with the classic link's rating and evidence, and its empty state names
  the reason; region mode says the same under each place. The map
  colours the marker and the dial in the kind's own colour and draws its
  links as any others; the pane title, the year panel and the print
  caption name the kind; the real year picker presses "Classic" and locks
  the row like every other control; the legend gains one sentence.
- Browser check `W:\temp\claude\ClimateConnections\cdp-m36.mjs` (18
  checks; screenshots `m36-01-enso-card.png` … `m36-06-compare.png`
  under `W:\temp\claude\ClimateConnections\m36`): the kinds row
  appearing under El Niño with Classic pressed and hiding under La Niña;
  "central Pacific" picked from August turning the ENSO marker orange;
  the ENSO card's "What is different in this kind" with five own and two
  dropped links; India reached through the kind's own link with "Only
  for this kind", Indonesia through the inherited one with "Holds for
  both kinds"; the coast of Peru hollow in February with "Not expected in
  this kind"; the negative PDO drawing the kind's Gulf Coast link at
  contested with "Weaker this month"; region mode on the coast of Peru
  and the monsoon; the 2009–10 story with its Peru step, "Compare with
  the record" and the faded marker at the end; the real year 2009 with
  Classic pressed and the controls locked; compare mode naming the kind
  in the pane title; the legend sentence; the print caption.
- Not in M36: `la_nina_central` (the literature does not separate a
  central-Pacific La Niña's map cleanly enough for a link of its own);
  an East Australia link of its own (the map cannot draw "drier still",
  and the north-west of Australia has no node); the years table calling
  kinds (the index cannot); variants for any other driver; strength as a
  variant, refused on the card; removing `Scenario.secondary` and the
  pre-M33 story fields. Next in `docs/PLAN_V3.md`: the UI items M29–M31,
  M37 (impacts), M38 (quiz), each with its own sign-off.

### M37 — Impacts on people (version 3, signed off 2026-09-08)
- The fifth engine extension of version 3 and the last of the engine set,
  taken at the user's "m37". Section 4 rule 12 as above, written before
  the code (rule 14 of `docs/PLAN_V3.md`), with §3.1 (the `impact` node
  kind: `axis: more_less`, a `sector` from a fixed list, `labels`, no
  `area`, at least one link in and never one out) and §3.2 (the impact
  link: `from` an outcome, `when: plus | minus`, `to` an impact; never
  from a driver, never `weakened_by` or `except`; its season must overlap
  a link into its outcome; the curatorial rule on `established`). The
  hop runs only with `Scenario.impacts` (decided here rather than "always
  computed, not drawn", so the dial's count, compare mode's rings and the
  links in play are untouched with the layer off): after the driver hops
  and the faded report, every outcome holding a state fires its impact
  links for that state, from its first month in the state plus the lag
  (the fire-once rule keyed on outcome and state), in season, at rule 6's
  tier for a hop one deeper than the smallest depth applied into the
  outcome and never above the outcome's own tier; an outcome without the
  state reports nothing, never `faded`; sum, clamp and conflict at the
  impact as at an outcome; `maxDepth` does not bound it. `stateName` and
  `impactLinksOf` in `src/engine/propagate.ts`. Engine tests in
  `src/engine/impacts.test.ts` (52: the helpers; off by default the
  timeline identical to the hop on and to a graph without the impacts;
  on: the square reached the month its outcome holds the state at one
  tier down and depth 2, a link for the other state never firing, two
  links into one impact conflicting and cancelling to a hatch, the lag
  counted from the outcome's first month in the state and again at once
  when the state returns at month 12, an outcome out of its state
  reporting nothing (not faded), the season gate pending, a second-hop
  outcome giving depth 3 and two tiers down, a contested outcome capping
  an established link, `maxDepth` 1 still reaching the first-hop square,
  the confidence filter ghosting at the effective tier, a hold on the
  driver leaving no outcome with a state and so no impact link, a
  neutral scenario reaching nothing, the links in play including the
  impact links only with the hop on; on the shipped data: ten impacts
  with sectors, labels, sources and no area, thirteen links from outcomes
  only with evidence notes, five established, every impact link drawn in
  some single-driver scenario from the driver's usual start month, the
  story; El Niño from June with the chain on: the monsoon a tie against
  the dipole El Niño sets off so no harvest square, the harvest June to
  September and June again with direct links only, Indonesia's fires
  July to November and pending in December, Rift Valley fever November
  and December at contested, malaria and dengue January to April,
  Zimbabwe's maize December to March, the Pampas October to January,
  Australia's wheat through both links at depths 2 and 3, fishmeal from
  September, California's runoff December to March at contested, the
  Niger August and September; La Niña: the Pampas and the runoff down and
  no other square; regression: every shipped story and every real year
  identical with the hop on and off). `stories.test.ts` sets the flag from
  the story and requires an impact step to carry it and be reached. 902
  tests.
- Data: ten impact nodes (`india_foodgrain_output` agriculture,
  `indonesia_peat_fires` fire, `east_africa_rift_valley_fever` health,
  `peru_coast_malaria_dengue` health, `zimbabwe_maize_yield`,
  `pampas_grain_yields` and `australia_wheat_yield` agriculture,
  `peru_fishmeal_output` fisheries, `california_streamflow` and
  `niger_river_flow` water), each a few degrees from its outcome; thirteen
  links (`weak_monsoon_india_foodgrain` established, Krishna Kumar and
  others 2004, Prasanna 2014; `dry_indonesia_peat_fires` established,
  Field and others 2009 and 2016, Page and others 2002;
  `wet_short_rains_rift_valley_fever` probable, Anyamba and others 2009,
  Linthicum and others 1999; `wet_peru_coast_malaria_dengue` probable,
  Gagnon and others 2002 and 2001; `dry_southern_africa_maize` probable,
  Cane, Eshel and Buckland 1994, Phillips, Cane and Rosenzweig 1998;
  `wet_` and `dry_southeast_south_america_grain` probable, Podestá and
  others 1999; `dry_east_australia_wheat` and
  `dry_southeast_australia_wheat` probable, Nicholls 1985, Potgieter,
  Hammer and Butler 2002; `fishery_collapse_fishmeal` established, Ñiquen
  and Bouchon 2004; `wet_` and `dry_california_streamflow` established,
  Cayan, Redmond and Riddle 1999; `dry_sahel_niger_flow` probable, Mahé
  and Paturel 2009, Descroix and others 2009), every one with a caveat
  and an evidence note; seventeen new sources, every DOI resolved on
  Crossref. The story `el_nino_1997_98_impacts`, "1997–98: from the
  weather to the harvest and the haze", `impacts: true`, nine steps from
  May 1997: the fires in August, the monsoon tie in September (the map
  draws no harvest square with the chain on, and 1997's monsoon was near
  normal), Rift Valley fever in November, fishmeal and the Pampas in
  January, the coast's malaria and Zimbabwe's maize (less bad than
  feared) in February, California's runoff in March. Validator: the
  `ImpactNode` schema; a link from an outcome needs `when: plus | minus`,
  an impact target and no `weakened_by` or `except`, and its season must
  share a month with a link into the outcome; a driver never points at an
  impact; an impact never has a link out; every impact has a link in;
  `impacts` on a story, and a step on an impact needs it and must be
  reached by the hop's copy of the rule (no sum-and-clamp, so a tie
  passes the build and fails the engine test, which is why the monsoon
  step points at the monsoon). 86 nodes, 226 links, 482 sources, 20
  stories.
- UI as §5.2, §5.5 and §5.6 above: `AXIS_COLORS.more_less` (deep pink
  for more, teal for less), the marker a `rect.mark` beside a
  `circle.mark`, `drawNodes` taking the node list so the squares are
  removed with the layer and never drawn in region mode, arrows into an
  impact classed `to-impact`; the fifth checkbox "Impacts on people" in
  the Map section with its hint, `ControlState.showImpacts`, shared by
  both sides and set on the scenario in `scenarioFor`; the legend's square
  row and note; on the card `IMPACT_NOTE` (the fixed sentence, in the UI),
  `impactCard` (sector, sentence, state, "What pushes it from <the
  outcome>: <its state>", timing from the outcome's first month in the
  state, "How sure are we?" saying one step further and never above the
  weather's tier), `impactsFromBlock` on an outcome's card (the list with
  the layer on, one line with it off); a story with `impacts: true` turns
  the layer on and leaves it on; the selection is dropped when the layer
  goes off with an impact open; the print caption's sentence on squares
  in scenario and year mode alike.
- Browser check `W:\temp\claude\ClimateConnections\cdp-m37.mjs` (22
  checks; screenshots `m37-01-fires-card.png` … `m37-05-year-1997.png`
  under `W:\temp\claude\ClimateConnections\m37`): five checkboxes with
  the fifth off and no square on load; the Indonesia card's one line with
  the layer off; ten squares with it on; July's fires square pink,
  labelled, its arrow from Indonesia at probable; the monsoon tie and the
  hollow harvest with the chain on, the teal harvest with it off; the
  fires card and the Indonesia card's list; December's fever, maize and
  runoff (contested); the layer off again with the dial count as on
  load and the card dropped; the 1997–98 impacts story turning the layer
  on, its fires step, its monsoon step, its last step, and the layer
  staying on after it; compare mode with squares on both maps and the
  runoff pink against teal, ringed; region mode without squares; the
  legend; the print caption; the real year 1997 keeping the squares.
- Not in M37: impacts of impacts, any money or mortality figure, a
  strengthening or weakening side on impact links, impacts in region
  mode (the map and card there read links from drivers only), the years
  table saying anything about impacts, nodes in the `energy` and
  `economy` sectors (in the list, none written yet). Next in
  `docs/PLAN_V3.md`: the UI items M29–M31 and the roadmap items M38–M40,
  each with its own sign-off; M30 was taken next.

### M30 — Arrival window (version 3, signed off 2026-09-08)
- The second UI item of version 3, taken at the user's "work on M30
  (arrival window)". Timing uncertainty was the one kind the map did not
  show: `lag_months` is a range, the engine applies a link from its
  earliest month and the card printed the range as text. Section 4 rule 3
  gains the arrival-window bullet as above, written before the code (rule
  14 of `docs/PLAN_V3.md`), and §3.4 the bullet on timing.
- Engine, reporting only: `LinkState.settled`, true once `index >= onset
  + lag_months[1]`, computed in `propagate` beside the lag test for the
  driver hops, in the faded report (rule 9, from the chosen onset) and in
  the impact hop (rule 12, from the outcome's onset in the state); always
  true when the ends are equal. Nothing else in `propagate.ts` changed:
  a regression test runs every shipped story and every real year and
  checks the timeline is identical to before apart from the field, and
  that changing a link's later lag changes nothing but `settled`. Tests
  in `src/engine/window.test.ts` (17: false at the earliest lag, true at
  the latest, true throughout for equal ends, counted from a chosen
  driver's own start month and from a negative onset, from a pushed
  driver's onset, on pending, ghost and faded links, on an impact link
  from the outcome's onset, the season not delaying it, carried through
  modulation; the shipped data with El Niño's monsoon link (lag 0–3)
  settled at month 3 and the coast of Peru (4–8) at month 8, every
  reported link in every story and year carrying a boolean, every
  equal-ended link always settled; the regression on stories and years
  with every later lag pushed out). The 119 exact link-state assertions
  in the older test files are wrapped in a helper that admits any
  `settled`, so they still check every other field exactly.
- UI: `showWindow` in `ControlState`, the "Show arrival window" checkbox
  under the Legend heading (data-role `window`, off by default) with its
  hint; `RenderOptions.showWindow` and `ArrowDatum.settled` in the map,
  an applied unsettled arrow with the class `unsettled` (opacity 0.4)
  and an outlined arrowhead (`arrow-<colour>-open`: white fill, the
  colour as a 1.4 unit stroke); the card's timing line in the three
  forms of §5.5 (class `window` on the sentence) through a `window`
  argument of `renderCard`; the legend row and note; the print caption's
  sentence while the toggle is on. Compare mode shares the toggle;
  region mode ignores it; a story and a real year leave it alone.
- Browser check `W:\temp\claude\ClimateConnections\cdp-m30.mjs` (18
  checks; screenshots `m30-01-window-july.png` … `m30-04-compare.png`
  under `W:\temp\claude\ClimateConnections\m30`): six checkboxes with
  the sixth "Show arrival window" off on load and no unsettled arrow; the
  toggle on in July (month 1) drawing El Niño's monsoon arrow (lag 0–3)
  faint at opacity 0.4 with the open head and the Indonesia arrow (lag
  0–2) likewise, the monsoon card's "drawn faint until month 3"; month 3
  settling the monsoon arrow with the card saying "month 3 has passed",
  month 2 settling Indonesia; the coast of Peru arrow (lag 4–8) pending
  and untouched in October with the card's pending line, faint in
  December and full at month 8; the toggle off again restoring every
  arrow and the plain card line; the legend row; the print caption;
  compare mode with faint arrows on both maps (La Niña's monsoon arrow
  on B); the 1997–98 story leaving the toggle on; region mode without a
  faint arrow and the arrows back after it; the real year 1997 keeping
  the toggle with the caption naming both.
- Not in M30: any change to when a link applies (rule 3 stands: the
  earliest month); a window on pending, faded or ghost arrows; the season
  dial; a per-link "most likely" month (the data has a range, not a
  mode). Next in `docs/PLAN_V3.md`: M29, M31 and the roadmap items
  M38–M40, each with its own sign-off.

### M41 — Seasonal features: the machinery on the map (version 3, signed off 2026-09-08)
- The third UI item of version 3, added to `docs/PLAN_V3.md` §3 on
  2026-09-08 after the user asked whether the map held annual phenomena
  like the Siberian High and, told the three ways of putting them on it,
  chose the one recommended: fixtures drawn in their months, with the
  links naming what they work through, no engine change. The plan text
  (§3.1, §3.2, §4 rule 13, §5.2, §5.5, §5.6, §5.11 and the M41 section
  of `docs/PLAN_V3.md`) was written before the code (rule 14 of
  `docs/PLAN_V3.md`).
- Data: a fourth node kind, `feature` (`symbol: high | low | vortex`,
  `months`, a required `label`, an optional `area`; no axis, labels,
  phases or sector), five of them: the Aleutian Low (October–March), the
  Icelandic Low (October–March), the Azores High (all year), the Siberian
  High (November–March) and the Arctic polar vortex (November–March), each
  with a summary that ends by saying the map computes nothing from it.
  `Link.via`: fifty entries on thirty-five links, every one a link whose
  own text already named the feature (the PDO's eight winter links and
  ENSO's two pushes on the PDO through the Aleutian Low; the NAO's links
  to northern Europe, eastern North America, Greenland, Hudson Bay and the
  Mediterranean, the pushes on the NAO from ENSO, the AMO, the eruption,
  the QBO, the ice and the snow, and the NAO's pushes on the Atlantic
  Meridional Mode through the Icelandic Low and the Azores High; the
  negative NAO's arrow to western Russia and the four Arctic-precursor
  links through the Siberian High; the eruption's, the QBO's, the ice's
  and the snow's stratospheric routes through the polar vortex, never the
  SAM's southern vortex). Two wording fixes ("Iceland low" to "Icelandic
  low" on the eruption's and the easterly QBO's pushes on the NAO). Eight
  sources, all resolved on Crossref (Overland, Adams and Bond 1999;
  Trenberth and Hurrell 1994; Serreze et al. 1997; Davis et al. 1997;
  Rodwell and Hoskins 2001; Panagiotopoulos et al. 2005; Gong and Ho
  2002; Waugh, Sobel and Polvani 2017). One story, "Winter's machinery:
  how El Niño reaches Alaska and Europe" (`features: true`, six steps,
  the Aleutian Low in October and the Icelandic Low in February as
  focuses).
- Validator: the `FeatureNode` schema; `via` unique; no link from or to a
  feature; `via` never on an impact link; each entry an existing feature
  whose `label` the link's mechanism, caveat or evidence note names
  (case-insensitive); the link's season sharing a month with the
  feature's months when both are given; every feature with a link
  through it; `Story.features`; a step on a feature needs the flag and an
  applied link through the feature that month (`throughAt`, the copy of
  the rule beside `affectedAt`). Fifteen refusals checked by hand on
  mutated copies (`W:\temp\claude\ClimateConnections\m41\reject.py`).
- Engine: unchanged, by rule 13. `src/engine/features.ts` holds pure
  readers only: `featureNodes`, `featurePresent`, `linksThrough`,
  `featuresThisMonth` (the month's applied and pending links through each
  feature; ghosts and faded links never count) and `featureDrawn`.
  `src/engine/features.test.ts` (40 tests): presence by month; the
  shipped set; the grouping under El Niño from June with the chain on
  (the Aleutian Low filled from September through the push on the PDO,
  before it is back; present and filled in October; the PDO's winter
  arrows through it in December; the Atlantic pair filled in February
  through the push on the NAO, the Siberian High through the pushed
  NAO's arrow to western Russia, the polar vortex present and idle; a
  pending link pending, a ghost link nothing); and the regression: every
  shipped story and every real year gives the same timeline with the
  features and every `via` stripped, and a feature holds the empty state
  in every month. `stories.test.ts` checks a feature step through the
  engine. 968 tests.
- UI: `ControlState.showFeatures` and the "Seasonal features" checkbox,
  the seventh, under the Legend heading after "Show arrival window"
  (data-role `features`, off by default, rule 15), its hint naming the
  features from the data; the map's features layer between the arrows
  and the markers (`g.feature` with `circle.mark`, `text.glyph` H or L,
  `circle.ring` for the vortex, `text.name`; classes `active`, `pending`,
  `idle`, `offseason`, `selected`; `path.feature-area` outlines), drawn
  in slate and never a state colour; a feature's area kept out of the
  areas layer; `RenderOptions.showFeatures`, `ArrowDatum.dimmed` and the
  class `dimmed` (opacity 0.07) on every arrow that does not work through
  the selected feature; region mode drawing the features the listed
  links work through, filled; the feature card (`FEATURE_NOTE` in
  `card.ts`, the state line in three forms, the pending hint, "Arrows
  through it this month", "Every arrow that can work through it" read
  from the data, sources), the "Works through the Aleutian Low" line on
  every link block with `via` (pointing at the checkbox while the layer
  is off, at the map while it is on), in region mode and the feedback
  block too; a selected feature dropped when the layer goes off; a story
  with `features: true` turning the layer on; the legend row and note;
  the print caption's sentence in scenario, year and region mode.
- Browser check `W:\temp\claude\ClimateConnections\cdp-m41.mjs` (23
  checks; screenshots `m41-01-july-azores.png` … `m41-07-year-2009.png`
  under `W:\temp\claude\ClimateConnections\m41`): seven checkboxes with
  the seventh off on load and nothing drawn; the Azores High alone in
  July; the Aleutian Low filled off season in September with the card
  saying so; present, filled and selected in October with every other
  arrow dimmed and the card's "Two arrows drawn this month work through
  it"; the five in February with the vortex as a ring, no feature name
  overlapping a visible label; the vortex card; the "Works through" line
  on northern Europe's card in both layer states; the toggle off dropping
  the selection; the legend; the print caption; compare mode with the
  pair filled on both maps and the Siberian High on A only; the story's
  six steps; region mode for Alaska (the Aleutian Low alone, the region
  card's lines) and the monsoon (nothing); the real year 2009.
- Not in M41: features as pushed waypoints; a feature's strength as a
  driver; Southern Hemisphere and tropical fixtures (a later data-only
  batch); the subtropical jets; any arrow to or from a feature; a
  highlight of the arrows through a feature beyond dimming the rest.
  Next in `docs/PLAN_V3.md`: M29, M31 and the roadmap items M38–M40,
  each with its own sign-off.

---

### M42 — Hide unaffected regions (version 3, signed off 2026-09-08)
- The fourth UI item of version 3, added to `docs/PLAN_V3.md` §3 on
  2026-09-08 after the user asked to "hide regions that are currently not
  affected by the selected phenomena". One reading was put to them before
  any code was written and answered: *currently* is the month on screen,
  not the whole year. The plan text (§5.2, §5.6, §5.7, §5.9, §5.10 and the
  M42 section of `docs/PLAN_V3.md`) was written first (rule 14 of
  `docs/PLAN_V3.md`).
- Data, schema and engine: unchanged. Nothing new is computed and every
  timeline is the one M41 shipped.
- `src/engine/reached.ts`: one pure reader, `reachedThisMonth(graph,
  month)`, the ids of the nodes an `applied` link ends at this month — the
  map's own sense of "reached", the same test the marker labels use, so
  the layer hides exactly the markers "Label every region" leaves unnamed.
  A first pass counted every reported arrow (pending, faded and ghost
  too). Measured in the engine on El Niño from June with the chain on, it
  hid 13 of the 62 places in December against 30 for the rule shipped, and
  a pending arrow does not mean "currently affected", so it was dropped.
  (The browser check counts markers on the page in its default state,
  drivers included: 76 with the layer off, 43 with it on. The two numbers
  are of different things.)
- UI: `ControlState.hideUnaffected` and the "Hide unaffected regions"
  checkbox, the eighth, under the Legend heading after "Seasonal features"
  (data-role `hide`, off by default, rule 15), its hint saying which
  places are drawn, which are kept whatever happens, and that a place is
  hidden because nothing on this map is acting on it in this month, not
  because nothing happens there; `RenderOptions.visibleNodeIds` (null =
  draw everything) and one `hidden()` test in `MapView.render` used by the
  areas layer, the marker layer and the arrow list, so a hidden place
  takes its label, its area, its impact square and the arrows into it with
  it and no arrowhead is left pointing at nothing; a place that has been
  reached keeps every arrow into it, pending, faded and ghost included.
  Never hidden: the fourteen drivers, the selected place, a playing
  story's focus and a marker compare mode rings as differing. Compare mode
  passes the union of the two sides, so both maps carry the same markers.
  Region mode ignores it. The seasonal features are their own layer and
  are untouched. The legend note and the print caption's sentence. A way
  of looking, like the areas layer: it ends no story and leaves no year.
- Tests: `src/engine/reached.test.ts` (15): the reader on hand-built
  months (applied reaches, pending, faded and ghost do not, one applied
  arrow is enough, an unknown link id is skipped); the shipped data under
  El Niño from June (the set follows the month, the monsoon goes while its
  arrow waits out of season and comes back with it, a strict filter leaves
  fewer places, the chosen driver is not in the set, reading changes
  nothing); and the tie-down — the set equals the places with a non-empty
  `viaLinkIds`, month by month on every story, every recorded year, the
  impacts hop, a hold, a filter and the chain off. 983 tests.
- Browser check `W:\temp\claude\ClimateConnections\cdp-m42.mjs` (24
  checks; screenshots `m42-01-off.png` … `m42-07-off-again.png` under
  `W:\temp\claude\ClimateConnections\m42`): eight checkboxes with the
  eighth off on load and 76 markers; on in December, 43 markers, every one
  of them reached, no orphan arrow, pending arrows still drawn into places
  that are drawn; every driver kept; the areas layer following; month 0
  emptier than month 6 and consistent; a place hidden at month 0 drawn at
  month 6; the selected place staying while nothing reaches it and going
  again when unselected; the impact squares following; the five features
  untouched; compare mode with identical markers on both maps and every
  dark ring drawn; the print caption; a story keeping the toggle and its
  focus always drawn; a real year keeping the year with the toggle
  switched either way; region mode unchanged; the toggle off giving back
  all 76.
- Not in M42: hiding for the whole year; hiding drivers, features or an
  arrow into a place that is drawn; a count of what is hidden; a fade-out
  animation; region mode. The seasonal features layer is deliberately
  untouched: it reads what the month reports, not what is drawn, so a
  feature can be faintly filled by a pending link whose arrow the layer no
  longer draws; its card still lists that link as expected but out of
  season. Next in `docs/PLAN_V3.md`: M29, M31 and the
  roadmap items M38–M40, each with its own sign-off.

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

The Quasi-Biennial Oscillation (M23) adds no outcome node; it pushes the
NAO (easterly → negative, westerly → positive, both probable, the
Holton–Tan effect) and acts on atlantic_hurricanes (westerly +, easterly
−, both contested: a link that held until about 1990).

The Barents–Kara autumn sea ice (M24) adds one outcome node,
siberia_winter (warm_cool). Its low phase acts on siberia_winter,
western_russia_winter and east_asia_winter (−, all contested) and pushes
the NAO negative (contested). Its high phase draws nothing.

The Eurasian October snow (M25) adds no outcome node. Its high phase
pushes the NAO negative and acts on eastern_north_america_winter and
northern_europe_winter (−, all contested). Its low phase draws nothing.

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
  the Pacific Meridional Mode; M26: a large tropical volcanic eruption;
  M23: the Quasi-Biennial Oscillation; M24: the Barents–Kara autumn sea
  ice; M25: the Eurasian October snow); region-first navigation (done,
  M28: "By region", every driver that reaches a place); phase duration
  (done, M32: "Event lasts", the first engine extension of version 3);
  any number of chosen drivers (done, M33: "More drivers", rule 8 in the
  plural); the historical index overlay as a table of real years (done,
  M34: "Real year", 1950–2025 read from the index datasets as M33
  scenarios); spreadsheet-to-YAML importer if outside contributors join.
- **v3:** specified milestone by milestone in `docs/PLAN_V3.md`
  (M20–M41): seven more drivers that fit the current design (Indian Ocean
  Basin Mode, Atlantic and Pacific Meridional Modes, the QBO, two
  contested Arctic precursors, tropical eruptions) and a third batch of
  regions; region-first navigation, a sources page, an arrival window, a
  second language, seasonal features (done, M41: the fixtures of the
  year's weather the links work through, drawn and never computed),
  hiding the places no connection has reached in the month shown (done,
  M42); engine extensions for what does not fit today (phase
  duration, any number of chosen drivers, a hand-curated table of real
  years in place of the NOAA overlay, links that weaken other links, El
  Niño flavours, impacts on people); then quiz mode, the globe view and
  the importer. Each needs its own sign-off, as before.
