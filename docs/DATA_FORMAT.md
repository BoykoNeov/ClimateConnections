# Data format

The knowledge base is two YAML files. `npm run build:data` validates them and
writes `public/data/graph.json`, which the app loads. The validator is
`scripts/build-data.mjs`; if this document and the validator disagree, the
validator wins and this document needs fixing.

## `data/nodes.yaml`

```yaml
nodes:
  - id: enso                   # lowercase snake_case, unique, permanent
    name: El Niño–Southern Oscillation (ENSO)
    kind: driver               # driver | outcome
    lat: -2                    # marker position, decimal degrees
    lon: -140
    region: Tropical Pacific Ocean
    timescale: Events every 2–7 years
    summary: >                 # 1–3 sentences, plain language
      ...
    sources: [key, key]        # optional; keys from links.yaml `sources`
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
- Drivers have `phases` and no `axis`/`labels`; outcomes have `axis` and
  `labels` and no `phases`.
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
- Only one link per (from, when, to) triple.
- Every source key must resolve; every link needs at least one.
- `mechanism` and `caveat` are at least 20 characters. Absolute wording
  ("will", "always", "causes", "guarantees") raises a warning unless
  negated. Prefer "tends to".
- Asymmetry is expected. El Niño and La Niña links are separate entries and
  are never derived from each other. If only one phase is supported by the
  literature, add only that one.

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
