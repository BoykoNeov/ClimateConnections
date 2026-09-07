# CLAUDE.md — ClimateConnections

Conventions for any AI or human session working in this repo. Read
`docs/PLAN.md` before doing anything; it is the source of truth for scope,
schema, engine semantics, and milestones.

## What this project is
A static, browser-based teaching tool that draws known climate
teleconnections (version 1: ENSO only) on a Pacific-centered world map and
animates their arrival over a twelve-month timeline. It is a hand-curated,
cited causal graph. It is **not** a simulator and must never be presented as
one.

## Hard rules
- Climate facts live only in `data/*.yaml`. Never hard-code a fact in `src/`.
- No link without a resolvable source key and a `caveat`. The data build
  (`npm run build:data`) enforces this; do not weaken the validator.
- Uncertainty is always shown: confidence tier drives line style, every card
  has a "How sure are we?" section, the disclaimer is always visible. Do not
  hide contested links; that is the point of showing them.
- The engine (`src/engine/`) is pure and DOM-free. Three-level states only.
- Pacific-centered projection. Never ship a map that splits the Pacific.
- Scope is version 1 (`docs/PLAN.md` section 6–7) until the acceptance
  checklist is green. Do not start version 2 items without sign-off.
- Plain language in user-facing text. Students read the cards.

## Workflow
- Commit and push after every milestone or working unit. Short messages,
  prefixed with the milestone: `M3: propagation engine + tests`.
- Before marking a milestone done: `npm run build:data && npm test && npm run build`
  must pass, **and** the page must be checked in a browser against the
  milestone's acceptance criteria.
- Regenerated `public/data/graph.json` is committed alongside the YAML that
  produced it.
- Temp files go in `W:\temp\claude\ClimateConnections\`, never in the repo.

## Commands
```
npm install
npm run build:data     # validate YAML, write public/data/graph.json
npm test               # vitest
npm run dev            # Vite dev server
npm run build          # static site to dist/
```

## Layout (see docs/PLAN.md §2 for the full tree)
- `data/` — nodes.yaml, links.yaml, stories.yaml
- `scripts/build-data.mjs` — validator + converter
- `src/engine/` — propagate.ts and tests
- `src/ui/` — map, timeline, card, controls, legend
- `docs/` — PLAN.md, DATA_FORMAT.md
