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

  - id: indian_summer_monsoon
    kind: outcome
    ...                        # same common fields as above
    axis: wet_dry              # wet_dry | warm_cool | active_quiet | high_low
    labels:                    # what +1 / 0 / -1 mean for this node
      plus: Monsoon tends to be stronger than usual
      zero: Monsoon near normal
      minus: Monsoon tends to be weaker than usual
    global: false              # optional; true for planet-wide outcomes
```

Rules enforced by the validator:
- Drivers have `phases`, `onset_hint`, `default_start_month` and
  `typical_duration_months` and no `axis`/`labels`; outcomes have `axis`
  and `labels` and no `phases`. Every phase has a `value`, unique within
  the driver, and one phase is 0.
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
    lag_months: [0, 3]                  # [min, max] months after onset, 0–24
    season: [6, 7, 8, 9]                # months 1–12 the effect is felt; [] = all year
    confidence: established             # established | probable | contested
    mechanism: >                        # plain-language "why", 1–2 sentences
      ...
    caveat: >                           # plain-language "why it might not happen"
      ...
    evidence_note: >                    # optional: where studies disagree, how often it shows up
      ...
    sources: [rasmusson_carpenter_1983, kumar_1999]   # at least one

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
  out). A story can never point at a hollow marker.
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
not the same as neutral: the map may still push it along a chain.

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
ocean can carry such an effect past the end of the event.
