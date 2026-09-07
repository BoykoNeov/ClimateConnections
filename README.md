# Climate Connections

An interactive teaching map of how the big climate oscillations affect
weather around the world. Pick a phase of ENSO (El Niño, neutral, La Niña),
press play, and watch the known consequences arrive across a Pacific-centered
world map over twelve months. Click any region to read what tends to happen,
why, how sure the science is, and where that comes from.

**What it is:** a hand-curated, cited graph of published teleconnections,
drawn on a map and animated over time.

**What it is not:** a climate model, a simulation, or a forecast. Nothing is
computed from physics. Every arrow was written down by a person from the
literature, with a confidence rating and a caveat.

## Status
Version 1 in progress. See `docs/PLAN.md` for the plan and milestones.

## Run it
```
npm install
npm run build:data   # validate data/*.yaml -> public/data/graph.json
npm run dev          # open the printed URL
```

## Add a story
Stories are guided walkthroughs in `data/stories.yaml`: a scenario plus a
list of steps, each with a month, a node to highlight, a short text and a
source. The validator refuses a step that points at a node the scenario does
not affect at that month. See `docs/DATA_FORMAT.md`.

## Add or change a climate link
1. Edit `data/links.yaml` (and `data/nodes.yaml` if the region is new).
2. Every link needs a source key that resolves in the `sources` list, a
   `confidence` (established / probable / contested), a plain-language
   `mechanism`, and a `caveat` saying why it might not happen.
3. Run `npm run build:data`. It refuses anything unsourced or malformed.
4. Commit the YAML together with the regenerated `public/data/graph.json`.

Schema reference: `docs/DATA_FORMAT.md`.

## License
MIT. See `LICENSE`.
