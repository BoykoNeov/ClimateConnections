# Data format

The knowledge base is three YAML files. `npm run build:data` validates them and
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
    phases:                    # drivers only, at least 2
      - id: el_nino
        label: El Niño
        color: "#d7301f"
        summary: >
          ...

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
- Drivers have `phases` and `onset_hint` and no `axis`/`labels`; outcomes
  have `axis` and `labels` and no `phases`.
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
    to: indian_summer_monsoon           # an outcome node id (v1)
    effect: -1                          # +1 | -1 on the target's axis
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
- `from` must be a driver, `when` one of its phases, `to` an outcome.
  Driver-to-driver links are not supported yet (see docs/PLAN.md §10).
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
    steps:                              # at least three
      - month: 2                        # month index 0–12, never decreasing
        focus: indonesia_rainfall       # node to highlight and open in the card
        text: >                         # plain language, 2–4 sentences
          ...
        sources: [field_2009]           # at least one key from links.yaml
```

Rules enforced by the validator:
- `driver` must be a driver and `phase` one of its phases.
- Every `focus` must be a node id. If it is an outcome, it must actually be
  affected by that driver phase at that month: some link from `driver`/`phase`
  to it has `lag_months[0] <= month` and is in season for the calendar month.
  A story can never point at a hollow marker.
- Step months never go backwards.
- Every step cites at least one source key that resolves in `links.yaml`.
- `src/engine/stories.test.ts` re-checks every step through the real engine.

Historical facts in a story are illustrations of the map's tendencies. Where
a real event broke the pattern (the near-normal Indian monsoon of 1997, say),
say so in the text: that is the teaching point, not a problem to hide.

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

Month index 0 is the month the driver phase begins (the app defaults to
June, when ENSO events typically start to develop). A link with
`lag_months: [4, 8]` becomes available at index 4. It is drawn as applied in
any month at or after index 4 whose calendar month is in `season`, and as
pending (muted) in months where it is available but out of season.
