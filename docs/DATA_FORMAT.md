# Data format

The knowledge base is four YAML files. `npm run build:data` validates them and
writes `public/data/graph.json`, which the app loads. The validator is
`scripts/build-data.mjs`; if this document and the validator disagree, the
validator wins and this document needs fixing.

## `data/nodes.yaml`

```yaml
nodes:
  - id: enso                   # lowercase snake_case, unique, permanent
    name: El Niño–Southern Oscillation (ENSO)
    label: ENSO                # optional short map label (max 24 chars); falls back to name
    kind: driver               # driver | outcome
    lat: -2                    # marker position, decimal degrees
    lon: -125
    area: [[-175, 8], [-85, 8], [-85, -8], [-175, -8]]
                               # optional: rough outline of the region, 3+ [lon, lat] corners.
                               # Edges follow straight lon/lat lines; longitudes take the
                               # shorter way round, so crossing the date line is fine.
                               # Illustrative only, shown in the toggleable areas layer.
    region: Tropical Pacific Ocean
    timescale: Events every 2–7 years
    summary: >                 # 1–3 sentences, plain language
      ...
    sources: [key, key]        # optional; keys from links.yaml `sources`
    onset_hint: >              # drivers only: one plain sentence shown under the
      ...                      # "Event begins in" control, saying when events usually start
    default_start_month: 6     # drivers only, 1–12: the month "Event begins in" jumps to
                               # when this driver is picked (Indian Ocean basin February, Atlantic and Pacific meridional modes March, Atlantic Niño May, ENSO, IOD, SAM, AMO and the tropical eruption June, Barents–Kara ice and October snow October, PDO and QBO November, NAO December)
    typical_duration_months: [8, 12]
                               # drivers only (M32): how many months a real event usually
                               # lasts, [min, max], each 1–12, min <= max. "Event lasts:
                               # typical" offers the middle of the range rounded up (10 for
                               # ENSO). A driver that really lasts years (PDO, AMO, the
                               # eruption's haze) says [12, 12] and explains itself in
                               # onset_hint. The NAO and SAM say [1, 3]: a "phase" there is
                               # a winter's or a season's average.
    phases:                    # drivers only, at least 2 (an event such as the tropical
      - id: el_nino            #   eruption, M26, has just an active phase and a 0 one)
        label: El Niño
        color: "#d7301f"
        value: 1               # +1 / 0 / -1: where the phase sits on the driver's own
        summary: >             # axis. A link into this driver with effect +1 pushes it
          ...                  # into the phase with value 1 (M10). Values are unique
                               # within a driver and one phase has value 0.
      - id: el_nino_central    # a kind of a phase (M36, docs/PLAN.md §4 rule 11)
        variant_of: el_nino    #   the parent phase, on the same driver, never itself a
        label: El Niño, central Pacific   # variant; the same value as the parent (the
        color: "#d94801"       #   uniqueness rule is relaxed exactly for variants)
        value: 1               # A driver in this phase fires the parent's links, except
        summary: >             #   those that list it under `except`, plus the links whose
          What is different: … #   `when` names it. A push into the driver never lands on a
                               #   variant. Start the summary with what is different.

  - id: indian_summer_monsoon
    kind: outcome
    ...                        # same common fields as above
    axis: wet_dry              # wet_dry | warm_cool | active_quiet | high_low
    labels:                    # what +1 / 0 / -1 mean for this node
      plus: Monsoon tends to be stronger than usual
      zero: Monsoon near normal
      minus: Monsoon tends to be weaker than usual
    global: false              # optional; true for planet-wide outcomes

  - id: indonesia_peat_fires   # an impact on people (M37, docs/PLAN.md §4 rule 12)
    kind: impact
    sector: fire               # agriculture | health | water | energy | fisheries | fire | economy
    lat: -3                    # a few degrees from the outcome it follows from; no area
    lon: 105
    region: Sumatra and Borneo, with haze over Singapore and Malaysia
    timescale: The dry season, July–November
    axis: more_less            # always more_less
    labels:
      plus: Fires and smoke haze tend to be far worse than usual
      zero: Fire season near normal
      minus: Fires tend to be fewer than usual
    summary: >
      ...
    sources: [field_2009]

  - id: aleutian_low             # a seasonal feature (M41, docs/PLAN.md §4 rule 13)
    name: Aleutian Low
    label: Aleutian Low          # required on a feature: drawn beside the symbol
    kind: feature
    symbol: low                  # high | low | vortex: an H or L in a circle, or a ring
    lat: 52
    lon: -178
    area: [[160, 62], [-140, 62], [-140, 42], [160, 42]]   # optional, a dotted outline
    region: North Pacific, south of the Aleutian Islands
    timescale: Every winter, October–March; deepest in December–February
    months: [10, 11, 12, 1, 2, 3]   # the calendar months it is present; [] = all year
    summary: >
      ...
    sources: [overland_1999, trenberth_hurrell_1994]
```

Rules enforced by the validator:
- Drivers have `phases`, `onset_hint`, `default_start_month` and
  `typical_duration_months` and no `axis`/`labels`; outcomes have `axis`
  and `labels` and no `phases`. Every phase has a `value`, unique within
  the driver among the phases that are not variants, and one such phase
  is 0.
- An impact (M37) has `axis: more_less`, a `sector` from the list above
  and `labels`, no `phases` and no `area`; it is reached from an outcome
  only (see the impact links below), it has at least one link into it,
  and never a link out of it. The map draws it as a square beside its
  outcome, only while the "Impacts on people" layer is on, and its card
  always carries the sentence "How much of this reaches people depends on
  preparation, prices and policy; the map shows only the push from the
  weather", which lives in the UI, not here.
- A seasonal feature (M41) is a fixture of the year's weather the links
  work through, not a driver and not a place: it has `symbol`, `months`
  and a required `label`, may have an `area`, and has no `axis`, `labels`,
  `phases` or `sector`. No link starts or ends at it; a link names the
  features it works through in `via` (below), and every feature has at
  least one such link. The map draws it only with the "Seasonal features"
  layer on, in its months, as its symbol, filled while an applied arrow
  works through it; its card always carries the sentence "A fixture of the
  year's weather, not a cause on this map: nothing is computed from it and
  no arrow starts or ends at it. It is filled in while an arrow drawn this
  month works through it", which lives in the UI, not here. Shipped: the
  Aleutian Low, the Icelandic Low, the Azores High, the Siberian High and
  the Arctic polar vortex.
- A phase with `variant_of` (M36) names another phase of the same driver
  that is not itself a variant, and has the same `value`. The phase
  buttons show the parent, and a second row of kinds under it while it
  is chosen; the card of a kind starts with what is different. Strength
  is not a kind: do not add a "strong El Niño" variant.
- Any number of drivers is allowed. The app offers a driver dropdown when
  there is more than one; a scenario is always one driver in one phase.
- `lat` in [-90, 90], `lon` in [-180, 180].
- Unknown fields are errors (typos get caught).
- Ids are permanent. Rename via `name`, never via `id`.

## `data/links.yaml`

```yaml
links:
  - id: el_nino_indian_monsoon          # unique
    from: enso                          # a driver node id
    when: el_nino                       # a phase id of that driver
    to: indian_summer_monsoon           # an outcome node id, or another driver's id (M10)
    effect: -1                          # +1 | -1 on the target's axis; for a driver target,
                                        #   the value of the phase to push it into
    lag_months: [0, 3]                  # [min, max] months after onset, 0–24; the map applies the
                                        #   link from min and draws it faint until max (M30)
    season: [6, 7, 8, 9]                # months 1–12 the effect is felt; [] = all year
    confidence: established             # established | probable | contested
    mechanism: >                        # plain-language "why", 1–2 sentences
      ...
    caveat: >                           # plain-language "why it might not happen"
      ...
    evidence_note: >                    # optional: where studies disagree, how often it shows up
      ...
    sources: [rasmusson_carpenter_1983, kumar_1999]   # at least one
    except: [el_nino_central]           # optional (M36): kinds of `when` this link is NOT
                                        #   drawn for. Each must be a variant of `when`; the
                                        #   link then needs an evidence_note saying why. A
                                        #   link whose `when` is itself a variant cannot
                                        #   carry except.
    via: [aleutian_low]                 # optional (M41): the seasonal features this link works
                                        #   through. Each must be a feature the mechanism, caveat
                                        #   or evidence note names ("deepens the Aleutian low");
                                        #   never on an impact link. Drawing only: the engine
                                        #   never reads it.
    weakened_by:                        # optional (M35): drivers whose chosen phase weakens
      - driver: pdo                     #   this link. While that driver is chosen by hand
        phase: negative                 #   and holds that phase, the link is drawn one
        sources: [gershunov_barnett_1998]   # confidence tier lower (floored at contested)
                                        #   and its card says so. At least one source per
                                        #   entry; the link must then have an evidence_note
                                        #   saying what weakens it. Never the link's own driver.

  - id: dry_indonesia_peat_fires        # an impact link (M37, docs/PLAN.md §4 rule 12)
    from: indonesia_rainfall            # an OUTCOME node id
    when: minus                         # plus | minus: the state of that outcome it follows from
    to: indonesia_peat_fires            # an impact node id
    effect: 1                           # +1 | -1 on the impact's more_less axis
    lag_months: [1, 3]                  # counted from the first month the outcome holds the state
    season: [7, 8, 9, 10, 11]           # must share a month with some link into the outcome
    confidence: established             # see the curatorial rule below
    mechanism: >
      ...
    caveat: >
      ...
    evidence_note: >
      ...
    sources: [field_2009, field_2016]   # no weakened_by, no except on an impact link

sources:
  - key: rasmusson_carpenter_1983
    citation: "Rasmusson, E. M., & Carpenter, T. H. (1983). ... Monthly Weather Review, 111(3), 517–528."
    url: https://doi.org/...            # optional
```

Rules enforced by the validator:
- `from` must be a driver, `when` one of its phases, `to` an outcome or
  another driver. For a driver target the target must have a phase whose
  `value` equals `effect`, and a driver cannot push itself. How the engine
  follows such links (depth, one firing per link, loop guard, one
  confidence tier down per hop) is in docs/PLAN.md §4.
- Only one link per (from, when, to) triple.
- Every source key must resolve; every link needs at least one.
- `mechanism` and `caveat` are at least 20 characters. Absolute wording
  ("will", "always", "causes", "guarantees") raises a warning unless
  negated. Prefer "tends to".
- Asymmetry is expected. El Niño and La Niña links are separate entries and
  are never derived from each other. If only one phase is supported by the
  literature, add only that one.
- `weakened_by` (M35, docs/PLAN.md §4 rule 10): each entry names an
  existing driver and one of its phases, not the link's own `from`, no
  `(driver, phase)` pair twice, at least one resolvable source, and the
  link carries an `evidence_note`. Only chosen drivers modulate (a driver
  pushed by a link never does); the link still applies with the same
  effect in the same months, one tier lower however many entries are in
  force. Only the weakening side is written: "stronger when the PDO is
  warm" is the same fact as "weaker when the PDO is cool". Shipped: ENSO's
  five winter links to the Gulf Coast, California, the Pacific Northwest,
  the Prairies and the Southwest, each weakened by the opposite-sign PDO.
- `except` (M36, docs/PLAN.md §4 rule 11): a driver holding a kind of a
  phase fires the parent's links except those listing that kind, plus
  the links whose `when` names the kind itself. A link of a kind to a
  place the parent's link also reaches requires the parent's link to
  except the kind (the kind's link replaces it; two links from the same
  driver to one place would add up). A driver target's `effect` must
  match a phase that is not a variant, since a push always lands on the
  parent. `weakened_by` on a parent's link is in force for its kinds too;
  `except` never applies to modulation. Shipped: `el_nino_central` with
  five links of its own and six classic El Niño links excepting it.
- `via` (M41, docs/PLAN.md §4 rule 13): each entry names a feature node
  that the link's `mechanism`, `caveat` or `evidence_note` names by its
  `label` (case-insensitive), so `via` is never a claim the text does not
  make; none twice; when both the link's `season` and the feature's
  `months` are given they share a month; an impact link cannot carry it.
  The engine never reads it: the map fills the feature in while the link
  is applied, the card says "Works through the Aleutian Low", and nothing
  else follows. Two wording fixes came with it ("Iceland low" to
  "Icelandic low"). Shipped: fifty entries on thirty-five links.
- Impact links (M37, docs/PLAN.md §4 rule 12): a link may start at an
  outcome; its `to` must then be an impact and its `when` is `plus` or
  `minus`, the outcome's state it follows from. A link from a driver never
  points at an impact, a link never starts at an impact, and an impact
  link carries neither `weakened_by` nor `except`. Its `season`, when
  given, must share a month with some link into its outcome, or it could
  never be drawn. The engine fires it one extra hop after the driver hops,
  only in months where the outcome holds the state, from the outcome's
  first month in that state plus the lag, one tier below its rating and
  never above the outcome's own tier; nothing flows back. **Curatorial
  rule:** an impact link is never rated `established` unless its source
  is a multi-decade study of the impact itself (yields, case counts,
  burned area, streamflow, landings), not of the weather; a weather study
  that mentions harvests in passing rates `probable` at most. Shipped:
  thirteen links into ten impacts (India's harvest, Indonesia's fires,
  Rift Valley fever, malaria and dengue on the coast of Peru, Zimbabwe's
  maize, the Pampas harvests, Australia's wheat, Peru's fishmeal,
  California's runoff, the Niger's flow), five of them established.

## `data/stories.yaml`

A story is a guided walkthrough: it fixes a scenario and steps through the
timeline, pointing at one node at a time with a short text.

```yaml
stories:
  - id: el_nino_1997_98                # unique
    title: "The 1997–98 El Niño"
    intro: >                            # shown on the first step
      ...
    driver: enso                        # a driver node id
    phase: el_nino                      # a phase id of that driver
    start_month: 5                      # calendar month of month index 0
    start_year: 1997                    # optional; dates the steps ("December 1997")
    hold_months: 8                      # optional (M32), 1–12: how many months the story's own
                                        #   driver holds its phase; omitted = the whole year shown
    drivers:                            # optional (M11; any number since M33): the other drivers
      - driver: iod                     #   chosen by hand for the whole story, each with
        phase: negative                 #   its phase
        start_month: 9                  #   optional (M12): the month it enters its phase;
                                        #     defaults to start_month
        starts_before: true             #   optional (M15): read that month backwards, so the
                                        #     driver is already in its phase at month 0
        hold_months: 12                 #   optional (M32): how long it holds its phase, from
                                        #     its own onset
    impacts: true                       # optional (M37): the story turns the "Impacts on people"
                                        #   layer on; only such a story may point a step at an impact
    features: true                      # optional (M41): the story turns the "Seasonal features"
                                        #   layer on; only such a story may point a step at a feature
    steps:                              # at least three
      - month: 2                        # month index 0–12, never decreasing
        focus: indonesia_rainfall       # node to highlight and open in the card
        text: >                         # plain language, 2–4 sentences
          ...
        sources: [field_2009]           # at least one key from links.yaml
```

Rules enforced by the validator:
- `driver` must be a driver and `phase` one of its phases. Every entry of
  `drivers` must name a different driver (never the story's own, never
  the same one twice; the engine throws on a repeat, so the validator
  refuses it first) with `phase` one of its phases. The story's own
  driver enters its phase at month 0; each other one at month 0 too, or
  in its `start_month` (M12), read within the twelve months shown: the
  first time that calendar month comes up at or after the story's
  `start_month`, so a month earlier than that falls in the following
  year. Before it the driver is out of play (no phase, no links, still
  never pushed); from it its links count their lag. With `starts_before:
  true` (M15) the month is read backwards instead: the last time it came
  up before the story's `start_month`, so the driver is already in its
  phase at month 0 and its lags are counted from that earlier month (a
  lag that has already run is felt from month 0). The same month, read
  backwards, means a year earlier. There is no order among the listed
  drivers beyond their start months.
- `hold_months` on the story and on each listed driver (M32) end that
  driver's phase after that many months from its onset: from then it
  holds no phase and its links are faded, not applied (`docs/PLAN.md` §4
  rule 9). Omitted, the driver holds its phase to the end of the year
  shown, as before.
- The pre-M33 fields `second_driver`, `second_phase`,
  `second_start_month`, `second_starts_before` and `second_hold_months`
  are still accepted for one milestone and written into a one-element
  `drivers` list in `graph.json`; a story cannot give both spellings.
  New stories should use `drivers`.
- Every `focus` must be a node id. If it is not a chosen driver, it must
  actually be affected at that month: some link from a chosen driver/phase
  to it (or from a driver a chosen driver has pushed) has
  `lag_months[0] <= month`, is in season for the calendar month, and the
  chosen driver's phase has not ended (its hold, if any, has not run
  out). A story can never point at a hollow marker, with one exception
  (M36): a story in a kind of a phase may point at a place that only an
  excepted parent link would have reached that month, so the text can
  say the classic effect did not come (the 2009–10 story on the coast of
  Peru); the card there says "Not expected in this kind".
- A step may focus an impact on people (M37) only in a story with
  `impacts: true`, and the impact must be reached that month: some impact
  link into it follows from an outcome that is affected with the named
  state, the lag from the outcome's first month in that state has run and
  the month is in the link's season. The validator's copy of the rule has
  no sum-and-clamp, so a tie on the outcome (El Niño's drying of the
  monsoon against the wet push of the dipole it sets off) passes the
  build and fails the engine test; point such a step at the outcome and
  say why the square is empty, as the 1997–98 impacts story does.
- A step may focus a seasonal feature (M41) only in a story with
  `features: true`, and an arrow drawn that month must work through it:
  some link from a chosen driver, or from a driver a chosen driver has
  pushed, with the feature in `via`, applied at that month. The feature
  is then filled in on the map.
- Step months never go backwards.
- Every step cites at least one source key that resolves in `links.yaml`.
- `src/engine/stories.test.ts` re-checks every step through the real engine.

Historical facts in a story are illustrations of the map's tendencies. Where
a real event broke the pattern (the near-normal Indian monsoon of 1997, say),
say so in the text: that is the teaching point, not a problem to hide.

## `data/years.yaml`

The table of real years (M34): which phase each driver held in each year,
read from an index dataset by a threshold rule that is written into that
dataset's citation in `links.yaml`. One row per year, one entry per driver
per year. A driver absent from a row is "not recorded" that year, which is
not the same as neutral: the map may still push it along a chain. Coverage:
ENSO from 1950, every other driver from 1980, the Atlantic and Pacific
Meridional Modes to 2024, where their index ends.

```yaml
years:
  - year: 1997
    note: >                         # one to three plain sentences on what the year was like,
      ...                           #   kept to what the indices show and events with a source
    sources: [noaa_oni_index, mcphaden_1999]   # at least one key from links.yaml
    drivers:
      - driver: enso                # a driver node id, never twice in a row
        phase: el_nino              # a phase id of that driver
        onset_month: 5              # calendar month the phase began; required unless the
                                    #   phase is neutral, and forbidden when it is
        onset_year: 1996            # optional: the year it began, only when that is before
                                    #   this row's year (the phase was already under way)
        duration_months: 12         # optional, at least 1, uncapped: how many months the
                                    #   phase held from its onset; omitted = at least to the
                                    #   end of the twelve months shown
        index_note: "ONI peaked at +2.4 °C in October–December 1997; ..."   # optional
        source: noaa_oni_index      # the index dataset: a source key whose citation
                                    #   states the rule that called the phase
```

Rules enforced by the validator (`scripts/years-schema.mjs`, run by the
data build and again by `src/engine/years.test.ts`):
- `driver` must be a driver and `phase` one of its phases; no driver
  twice in a row. A neutral phase (value 0) has no `onset_month`,
  `onset_year` or `duration_months`; any other phase needs an
  `onset_month`. An `onset_year` must be earlier than the row's year.
- Years are unique and ascending. Every source key, on the row and on
  each entry, resolves in `links.yaml`.

How the app reads a row (`src/engine/years.ts`, `scenarioForYear`; the
engine itself is unchanged): month 0 is January of the year when a
recorded driver allows it, the first entry in row order that is neutral
or began that January being the first driver; otherwise month 0 is the
onset, in the year or the year before, whose twelve months cover most of
the year. Every other entry is a chosen driver in its phase from its own
month, read backwards (`startsBefore`) when it began before month 0, an
earlier start being read as at most twelve months before; a neutral entry
is pinned from month 0; a duration becomes a hold where the phase ends
within the months shown. Where the hold cannot be placed exactly (a phase
over a year old at month 0 that ends later than twelve months after its
read-back start) the closer of a capped hold and no hold is taken, and
the year panel and the driver's card say what the record has; an entry
that begins as the months shown end is left out and reported.

Coverage, decided 2026-09-08: ENSO 1950–2025; the Indian Ocean Dipole,
the NAO, the SAM, the PDO, the AMO and the Atlantic Niño 1980–2025; the
other drivers have no index in the table. The reading is the same for
every driver: the entry is the event that began earliest in the year,
else the one already under way when the year began, else neutral, with
other events of the year named in `index_note`. The thresholds are in the
index sources' citations (NOAA's five-season ±0.5 °C rule on the ONI, and
so on). The series were read once, in August 2026; the app fetches
nothing. To correct a call, edit the entry and, if the rule or the dataset
changed, the citation; the build refuses anything the rules above forbid.

## Confidence tiers

| tier | meaning |
|---|---|
| established | Found in most events and in most studies; textbook material. |
| probable | Found in a majority of events, but with notable exceptions or regional disagreement. |
| contested | Reported by some studies, disputed or weak in others; shown so students see where the science is unsettled. |

The map draws these as solid, dashed and dotted lines respectively, and the
card for every node shows a "How sure are we?" block built from
`confidence`, `caveat` and `evidence_note`.

## Month indexing

Month index 0 is the month the driver phase begins (the app starts at the
driver's `default_start_month`: February for the Indian Ocean basin mode,
March for the Atlantic and Pacific meridional modes, May for the Atlantic
Niño, June for ENSO, the IOD, the SAM, the AMO and the tropical eruption,
October for the Barents–Kara ice and the October snow, November for the
PDO and the QBO, December for the NAO). A link with
`lag_months: [4, 8]` becomes available at index 4. It is drawn as applied in
any month at or after index 4 whose calendar month is in `season`, and as
pending (muted) in months where it is available but out of season. If the
driver's phase has been set to end (the "Event lasts" control, or a
story's `hold_months`, M32), the link is drawn faded (grey, muted) from the
month the phase ends, and a link whose `lag_months[0]` is at or beyond the
hold never arrives at all: the card says so, and says that in reality the
ocean can carry such an effect past the end of the event. The later end of
the range is the arrival window (M30): it never changes when the link is
applied, but with "Show arrival window" on the arrow is drawn faint with an
outlined head until that month has passed, and the card's timing line says
"may arrive any time from month 4 to month 8". A link whose two ends are
equal has no window. Give the range the studies give, not a guess: a wide
range is honest, and the map shows it as such.
