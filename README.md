# Climate Connections

An interactive teaching map of how the big climate oscillations affect
weather around the world. Pick a driver (ENSO, the Indian Ocean Dipole,
the North Atlantic Oscillation, the Southern Annular Mode, the Pacific
Decadal Oscillation, the Atlantic Multidecadal Oscillation, the Atlantic
Niño, the Indian Ocean Basin Mode, the Atlantic Meridional Mode, the
Pacific Meridional Mode or a large tropical volcanic eruption) and a phase
(El Niño or La Niña, a positive or negative dipole, NAO, SAM, PDO, AMO, AMM
or PMM, an Atlantic Niño or Niña, a warm or cool Indian Ocean, an eruption
or none), press play, and watch the
known consequences arrive across a Pacific-centered world map over twelve
months. Click any region to read what tends to happen, why, how sure the
science is, and where that comes from.

The map currently holds eleven drivers, 61 outcome regions, 197 cited links
(twenty-five of them between the drivers) and fifteen guided stories. A scenario is
one driver in one phase, optionally with a second driver in a phase of its
own; a driver can also push another driver into a phase, and the map then
follows that driver's links too. Where two influences push a place
opposite ways the map says so rather than picking a winner. Two scenarios
can be compared side by side on one timeline.

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
  Dipole, the North Atlantic Oscillation, the Southern Annular Mode (the
  see-saw that tightens or loosens the belt of westerly winds around
  Antarctica), the Pacific Decadal Oscillation (the decade-long warm or
  cool pattern of the North Pacific; the year shown is one year inside
  such a phase), the Atlantic Multidecadal Oscillation (the slow warming
  and cooling of the whole North Atlantic over decades; again one year
  inside a phase), the Atlantic Niño (the equatorial Atlantic's smaller
  cousin of El Niño, peaking in the northern summer), the Indian Ocean
  Basin Mode (the whole tropical Indian Ocean warming or cooling together,
  the spring after an El Niño or La Niña, and carrying its signal into the
  East Asian summer), the Atlantic Meridional Mode (the spring contrast
  between a warm north and a cool south tropical Atlantic, or the
  reverse, with the rain belt shifted toward the warm side; the seasonal
  cousin of the AMO), the Pacific Meridional Mode (the spring pattern
  of weak trade winds and warm water off Baja California that often
  comes two or three seasons before an El Niño; with the chain on, the
  map pushes ENSO from it) or a large tropical volcanic eruption (an
  event rather than a swing: a haze of sulphuric acid in the stratosphere
  that cools the world for a year or two, gives northern Eurasia a mild
  first winter, weakens the next summer's monsoons and perhaps nudges the
  Pacific toward El Niño; it has no opposite phase). The other drivers'
  markers turn grey; their cards say they are not part of the scenario.
- **Phase buttons** pick the phase of that driver: El Niño, neutral or La
  Niña; positive, neutral or negative dipole; positive, neutral or negative
  NAO, SAM, PDO, AMO, AMM or PMM; Atlantic Niño, neutral or Atlantic Niña;
  warm, neutral or cool basin; eruption or no eruption.
- **Second driver (optional)** adds one more driver in a phase of your own
  choosing, for years when two patterns coincided (La Niña with a negative
  dipole in 2010, say). Each driver enters its phase in its own month (a
  **Second driver begins in** picker appears; it defaults to that driver's
  usual start) and holds it to the end of the year shown; both fire their
  own links at full confidence, with lags counted from their own start.
  Until its month comes the second driver is drawn grey and held out of
  play: no phase, no links, and nothing can push it. The month is read
  within the twelve months shown, so a month earlier than the first
  driver's start falls in the following year; the timeline underlines the
  tick where the second driver begins. Where they
  push a place the same way the state simply holds; where they push it
  opposite ways the marker gets a dashed ring, a grey hatch if the pushes
  cancel, and the card says "conflicting influences". A chosen driver is
  never pushed by the other one: you have set both phases, so the links
  between them are listed on the cards, not drawn. Choosing the second
  driver's neutral phase holds it out of play, which shows what a year
  looks like when the other driver does not respond.
- **Event begins in** (labelled **First driver begins in** while a second
  driver is chosen) picks the calendar month of onset. Picking a driver
  moves it to that driver's usual start: June for ENSO and the dipole, which
  develop in late boreal spring or summer, December for the NAO, which
  is a winter pattern, June for the SAM, whose winter rain effects come
  first, November for the PDO, ahead of its winter effects, June for the
  AMO, ahead of the hurricane season and the Sahel's rains, May for the
  Atlantic Niño, which peaks in June–August, February for the Indian
  Ocean basin mode, which peaks in February–April ahead of the East Asian
  summer, March for the Atlantic and Pacific meridional modes, which
  peak in March–May, ahead of the Nordeste's rains and the hurricane
  season for the one and of the Pacific's autumn tip toward El Niño for
  the other, and June for the tropical eruption, when Pinatubo erupted
  in 1991 (an eruption can happen in any month, and the month changes
  what the first year looks like). Both the default and the note under
  the control come from the data.
- **Season dial** (under the start month) shows the calendar year as a
  circle. The month on screen is filled and follows the timeline; a dark
  triangle marks where the year shown begins, and a dot in the phase
  colour marks where a second driver begins. The ring inside is shaded by
  how many of the scenario's connections are in season each month, with
  the count in the centre. Click a place on the map and the dial shows one
  ring per connection acting on it instead, coloured over the months it
  can be felt and grey outside them; hover a ring for the driver, the
  tendency and the season in words. The dial shows only the season gate:
  a connection also waits for its lag, so a month can be in season and
  still empty. Click a month (or press Enter on it) to jump the timeline
  there.
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
- **Compare** (under Stories) draws two scenarios side by side on the same
  timeline: El Niño against La Niña, a year with and without a second
  driver, the chain on against off, all links against established only.
  B starts as a copy of A with the opposite phase. The controls edit the
  side you pick with **Edit A** / **Edit B** (or by clicking a map's
  title); the other map keeps its own scenario, and each map's title says
  what it shows and which calendar month it is on. A dark ring marks every
  place the two scenarios treat differently this month, and a line under
  the switch counts them. Click a ringed place and the card opens with the
  place's state under A and under B and a one-line verdict (same,
  opposite, only one side acts, or differs in timing) before the usual
  details for the side you are editing. Picking a story turns compare
  off. Printing gives both maps with a caption naming both scenarios.
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
src/engine/          pure propagation engine: scenario in, month-by-month states out; season-dial and compare helpers
src/ui/              map (one per side), timeline, season dial, controls, legend, card, story panel
docs/PLAN.md         the plan: scope, schema, engine semantics, milestones
docs/DATA_FORMAT.md  field-by-field schema for the three data files
```

The engine takes a scenario (driver, phase, start month, and optionally a
second driver and phase) and, for each of the thirteen month indices from
onset, decides which links apply: the link's phase must match, the month
must be at or past the link's minimum lag, and the calendar month must be
in the link's season. Applied links push the target one step along its
axis; the sum is clamped to a three-level state (+1, 0, −1). A link that is
past its lag but out of season is "pending" and drawn muted. Opposite
pushes on the same node are flagged as conflicting. A second chosen driver
starts at month 0 like the first and is treated the same way; the two
drivers' pushes simply add up.

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
     from: enso                        # a driver id (enso, iod, nao, sam, pdo, amo, atlantic_nino, indian_ocean_basin, atlantic_meridional_mode, pacific_meridional_mode or tropical_eruption)
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
phase and start month (optionally a start year for a real event, and
optionally a second driver and phase chosen for the whole story, with a
start month of its own if it began in a different month), then a
list of steps, each with a month index, a node to focus, a short text and
sources. The validator refuses a step that points at a node the scenario
does not affect at that month, so a story cannot claim more than the links
support.

## License

MIT. See `LICENSE`.
