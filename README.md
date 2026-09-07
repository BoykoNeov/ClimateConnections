# Climate Connections

An interactive teaching map of how the big climate oscillations affect
weather around the world. Pick a driver (ENSO, the Indian Ocean Dipole or
the North Atlantic Oscillation) and a phase (El Niño or La Niña, a positive
or negative dipole, a positive or negative NAO), press play, and watch the
known consequences arrive across a Pacific-centered world map over twelve
months. Click any region to read what tends to happen, why, how sure the
science is, and where that comes from.

The map currently holds three drivers, 30 outcome regions, 70 cited links
(six of them between the drivers) and five guided stories. Each scenario
is one driver in one phase; a driver can push another driver into a phase,
and the map then follows that driver's links too, but you cannot yet choose
two phases at once (see the roadmap in `docs/PLAN.md`).

## What it is

- A **hand-curated, cited causal graph** of published teleconnections.
  Every arrow was written down by a person from the literature, with a
  confidence rating, a plain-language mechanism, and a caveat saying why it
  might not happen.
- A **teaching tool**. The cards are written for students. Uncertainty is
  always on screen: the three confidence tiers have three visibly different
  line styles, every card has a "How sure are we?" section, contested links
  are shown rather than hidden, and a disclaimer sits under the title at all
  times.
- A **static site**. No server, no accounts, no tracking. The data is three
  YAML files you can read and edit.

## What it is not

- Not a climate model, a simulation, or a forecast. Nothing is computed from
  physics. The twelve-month animation shows *when published research says
  effects tend to arrive*, not what will happen this year.
- Not a statement about any single event. Each link is a tendency over many
  events, and the caveat on each card gives the exceptions.
- Not exhaustive. Links are included when they are well enough documented to
  cite, not because they are the only effects that exist.
- Not a source of precise boundaries. The "affected areas" layer is a set of
  rough, illustrative outlines, and the control that turns it on says so.

## Run it

Requires Node 20 or newer.

```
npm install
npm run build:data   # validate data/*.yaml and write public/data/graph.json
npm run dev          # start the dev server; open the printed URL
```

Other commands:

```
npm test             # engine and story tests (vitest)
npm run build        # data build + type check + static site in dist/
npm run preview      # serve dist/ locally
```

`dist/` is a plain static site. Copy it to any web host or open it through
any static file server.

## Use it

- **Driver** (top left) picks the phenomenon: ENSO, the Indian Ocean
  Dipole or the North Atlantic Oscillation. The other drivers' markers turn
  grey; their cards say they are not part of the scenario.
- **Phase buttons** pick the phase of that driver: El Niño, neutral or La
  Niña; positive, neutral or negative dipole; positive, neutral or negative
  NAO.
- **Event begins in** picks the calendar month of onset. Picking a driver
  moves it to that driver's usual start: June for ENSO and the dipole, which
  develop in late boreal spring or summer, and December for the NAO, which
  is a winter pattern. Both the default and the note under the control come
  from the data.
- **Show connections** filters by confidence. Hidden links stay on the map as
  faint grey lines so you can see what was left out.
- **Timeline** (bottom) scrubs from month 0 to month 12. Play advances one
  month every 1.2 seconds. The month is shown top right.
- **Click a region** to open its card: current state in plain words, then
  for each link acting on it the mechanism, a "How sure are we?" block with
  the confidence tier, caveat and evidence note, and the sources as links.
  Links that are available but out of season are listed separately.
- **Stories** (top of the left panel) play a guided walkthrough: the story
  sets the scenario, steps through the year, highlights one region at a
  time and explains what happened in that event. Changing the phase or start
  month by hand leaves the story.
- **Show affected areas** toggles the rough regional outlines under the
  arrows.
- **Follow links through other drivers** (on by default) lets a driver that
  the scenario driver has pushed into a phase fire its own links. El Niño,
  for example, tends to push the Indian Ocean Dipole positive from June and
  the NAO negative in late winter; with the box on, the dipole's and the
  NAO's own arrows then appear from their markers, one confidence tier
  lower. A pushed driver is drawn in its phase colour with a dark dashed
  ring; its card says who pushed it. Links that would push the scenario
  driver itself are never drawn; its card lists them under "Feedback from
  other drivers". With the box off, only direct links show.

Keyboard:

| key | does |
|---|---|
| ← → | previous / next month (or previous / next story step while a story plays) |
| Home / End | first / last month |
| Space | play / pause |
| Esc | leave the story |
| Tab | move between controls; the map markers are clickable |

Printing: `Ctrl+P` (or `Cmd+P`) gives a one-page landscape figure with the
title, disclaimer, map, a caption naming the scenario and month, the legend,
and whichever card is open. The interactive controls are dropped.

## How it works

```
data/nodes.yaml      the phenomena on the map (drivers and outcomes)
data/links.yaml      the causal edges, each with a source, confidence and caveat
data/stories.yaml    guided walkthroughs
scripts/build-data.mjs   validates the YAML and writes public/data/graph.json
src/engine/          pure propagation engine: scenario in, month-by-month states out
src/ui/              map, timeline, controls, legend, card, story panel
docs/PLAN.md         the plan: scope, schema, engine semantics, milestones
docs/DATA_FORMAT.md  field-by-field schema for the three data files
```

The engine takes a scenario (driver, phase, start month) and, for each of
the thirteen month indices from onset, decides which links apply: the link's
phase must match, the month must be at or past the link's minimum lag, and
the calendar month must be in the link's season. Applied links push the
target one step along its axis; the sum is clamped to a three-level state
(+1, 0, −1). A link that is past its lag but out of season is "pending" and
drawn muted. Opposite pushes on the same node are flagged as conflicting.

A link may also point at another driver. It pushes that driver into a phase
the same way, and the engine then follows that driver's own links for up to
three hops in all, with strict rules so the graph cannot run away: each
driver enters a phase once, its onset fixed at the first month it is pushed
and its links counting their lag from there; a driver that already holds a
phase is never pushed again, so the scenario driver is never fed back on;
and each hop lowers the confidence one tier, never above the link that set
the driver off. Nothing else happens: no randomness, and no loop is ever
animated. The rules are written out in docs/PLAN.md §4.

Climate facts live only in `data/`. Nothing in `src/` knows what El Niño,
the Indian Ocean Dipole or the North Atlantic Oscillation does to anyone;
even the "events usually begin in" note under the month control and the
month it defaults to are fields on the driver node.

One drawing rule is worth knowing. The map is Pacific-centered, so the
Atlantic is split at the edges and the NAO's marker sits right beside the
split. Its arrows to Europe leave the map at one edge and arrive from the
other, the same way the coastlines do, rather than sweeping across the
Pacific as a curve.

## Confidence tiers

| tier | meaning | drawn as |
|---|---|---|
| established | Found in most events and in most studies; textbook material. | solid line |
| probable | Found in a majority of events, but with notable exceptions or regional disagreement. | dashed line |
| contested | Reported by some studies, disputed or weak in others; shown so students see where the science is unsettled. | dotted, lighter line |

## Add or change a climate link

1. If the region is new, add a node to `data/nodes.yaml`: a permanent `id`,
   a `name`, a `kind` of `outcome`, an `axis` (`wet_dry`, `warm_cool`,
   `active_quiet` or `high_low`), marker `lat` and `lon`, and optionally a
   short `label` and a rough `area` polygon as `[lon, lat]` corners.
2. Add the link to `data/links.yaml`:

   ```yaml
   - id: el_nino_example_region       # unique, permanent
     from: enso                        # a driver id (enso, iod or nao)
     when: el_nino                     # a phase id of that driver
     to: example_region                # a node id: an outcome, or another driver
     effect: -1                        # +1 or -1 on the target's axis; for a driver
                                       #   target, the `value` of the phase to push it into
     lag_months: [2, 5]                # first and last month after onset it can start
     season: [12, 1, 2]                # calendar months when it is felt; [] = all year
     confidence: probable              # established | probable | contested
     mechanism: >
       One or two plain sentences on why this happens.
     caveat: >
       One or two plain sentences on why it might not.
     evidence_note: >                  # optional
       Where studies disagree, or how often it shows up.
     sources: [author_year]            # at least one key from the sources list
   ```

3. If the source is new, add it to the `sources` list at the bottom of
   `data/links.yaml` with a `key`, a full `citation` and, where possible, a
   DOI `url`.
4. Run `npm run build:data`. It refuses a link with an unknown node, an
   unknown source key, a missing caveat, or a malformed field, and says
   which one. Do not weaken the validator to get a link through.
5. Run `npm test` and `npm run build`, then look at the result in the
   browser. Adding a link can change what a story step is allowed to point
   at, and the story tests will say so.
6. Commit the YAML together with the regenerated `public/data/graph.json`.

The full schema is in `docs/DATA_FORMAT.md`.

## Add a story

Stories are guided walkthroughs in `data/stories.yaml`: a title, an intro, a
phase and start month (and optionally a start year for a real event), then a
list of steps, each with a month index, a node to focus, a short text and
sources. The validator refuses a step that points at a node the scenario
does not affect at that month, so a story cannot claim more than the links
support.

## License

MIT. See `LICENSE`.
