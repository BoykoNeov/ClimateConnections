# ClimateConnections — Version 3 plan (M20 onward)

This document extends `docs/PLAN.md`. Everything in that file still holds:
the rules for the implementer (§0), the schema (§3), the engine semantics
(§4) and the workflow in `CLAUDE.md`. Read it first. Where this document
adds a schema field or an engine rule, the wording here is the
specification; `docs/PLAN.md` §3–4 and `docs/DATA_FORMAT.md` get the same
text copied in when the milestone ships.

Version 2 is complete (M8–M19: seven drivers, driver-to-driver links, two
chosen drivers with their own onsets, the season dial, compare mode).
Version 3 is the set of milestones below. They are taken **one at a time,
each with explicit sign-off**, exactly as version 2 was. Milestone numbers
are fixed at planning time and are never reused; the suggested order in §7
is a recommendation, not a constraint.

The tool is a hand-curated, cited causal graph drawn on a map. It is not a
simulator and must never look like one. Every milestone below was checked
against that sentence; the ones that came closest to breaking it (M32
phase duration, M35 modulation, M37 impacts on people) carry an explicit
honesty note saying how they stay on the right side of the line.

---

## 0. What this plan covers

Three kinds of work, in rough order of cost:

1. **Phenomena that fit the current design** (§2). A driver is data: a
   driver node, its outcomes, links, sources, a story, tests, a browser
   check. The engine and UI are not touched. Five new drivers and one batch
   of outcome regions are specified.
2. **UI additions that need no engine change** (§3). Region-first
   navigation, a sources page, an arrival window on the arrows, a second
   language.
3. **Engine extensions for phenomena that do not fit today** (§4). Each
   one names the exact rule it adds, why the current rules cannot express
   the phenomenon, and what the honest limit of the new rule is. Phase
   duration, any number of chosen drivers, a table of real years, links
   that weaken other links, El Niño flavours, and impacts on people.
4. **Roadmap items inherited from version 2** (§5): quiz mode, globe view,
   the spreadsheet importer.

§6 lists what was considered and left out, with the reason, so the next
session does not re-derive it. §7 gives the suggested order and the
dependencies between milestones.

Each milestone has the same headings as the version-2 milestones: Data,
Schema/Engine/UI, Tests, Browser check, Honesty note, Not in this
milestone. Where a milestone needed a decision at sign-off, it is marked
**Decided 2026-09-08** with the answer; the five open questions in the
first draft were all answered by the user on that date.

---

## 1. Rules added for version 3

These are in addition to `docs/PLAN.md` §0.

12. **A new driver is still data only.** M20–M26 must not touch `src/`.
    If a driver seems to need an engine change, the driver is wrong for the
    tool or belongs to a later engine milestone; stop and say so.
13. **Every engine extension must keep three-level states.** No magnitudes,
    no probabilities, no continuous anything. If an extension cannot be
    expressed as "which links fire, at what tier, in which months", it is
    out.
14. **A new engine rule is a numbered addition to `docs/PLAN.md` §4.** It
    is written into that section before the code is written, in the same
    imperative style ("implement exactly this"). Existing rules are not
    relaxed; the loop guard, fire-once and one-tier-per-hop rules stand.
15. **Default off for anything that adds clutter.** Impacts on people, the
    arrival window, the globe: each ships behind a toggle whose default
    keeps the page looking as it does today, so the classroom projection
    does not change under a teacher who did not ask for it.
16. **Historical facts are hand-curated and committed.** No runtime fetch
    from NOAA or anywhere else. A table of past years is data in `data/`
    with a source per row, like everything else. The static-site rule
    (§0 rule 5) is unchanged.
17. **Sources are verified before use**, on Crossref or Semantic Scholar,
    as in M16–M19. A DOI that does not resolve is not a source.

---

## 2. Phenomena that fit the current design (data only)

Each of M20–M26 follows the M16–M19 recipe: a splice script under
`W:\temp\claude\ClimateConnections\m<NN>\apply.py`, a node, links,
sources, a story, acceptance tests in `src/engine/acceptance.test.ts`, a
browser check script `cdp-m<NN>.mjs` with the label-overlap check, docs
updated (`docs/PLAN.md` header list of drivers, `CLAUDE.md`,
`docs/DATA_FORMAT.md` default-start-month line, `README.md`).

Marker positions below are proposals. The label-overlap check in the
browser script decides the final position, as it did in M19.

### M20 — Eighth driver: the Indian Ocean Basin Mode

**Shipped 2026-09-08.** The record of what was built is in `docs/PLAN.md`
§10 under M20. Four departures from the text below, each with its reason
there: the Yangtze got its own outcome node (`east_asia_summer` is a
temperature axis over Japan and Korea and cannot say "wetter"); the
monsoon link is drawn as heavier rain, contested, because the verified
sources lean that way, with the delayed onset in the caveat; the story
runs the basin alone with the chain on, because holding the El Niño as a
second driver through the summer of 1998 would show conflicts at the
typhoons and the monsoon in a season the El Niño had already ended (the
two-driver scenario is an acceptance test instead, and M32's phase
duration would let the story add it); and the cool basin does not push
ENSO. One correction to the reasoning below: the timeline shows thirteen
months (index 0 to 12), so from a June El Niño the Yangtze link is
pending through the year and applied at month 12, the following June,
one tier down; the tests assert that.

The basin-wide warming (or cooling) of the whole tropical Indian Ocean that
follows an El Niño (or La Niña) by a few months, peaks in the spring, and
lasts into the summer. It is the textbook "capacitor": the Indian Ocean
stores the El Niño signal and releases it onto East Asia the following
summer, after the Pacific event itself has faded. It is the single best
example of the driver-through-driver chain the engine already handles, and
it fills the gap the M19 note left ("candidates exhausted").

- **Data.** Driver `indian_ocean_basin` with phases warm / neutral / cool
  (values +1 / 0 / −1). Marker in the central Indian Ocean away from the
  IOD marker (IOD is at 4°S 70°E; propose 12°S 85°E, label "Indian Ocean
  basin"), area the whole tropical Indian Ocean 40°E–100°E, 15°N–15°S.
  `default_start_month` 2 (the mode peaks in February–April after an El
  Niño winter). Timescale "Follows ENSO, one season behind".
  - Links out (warm phase; the cool phase mirrored only where the
    literature supports it):
    - East Asia summer (`east_asia_summer`): wetter Yangtze / Meiyu,
      established, lag 3–5, June–August (Xie et al. 2009; Yang et al.
      2007).
    - West Pacific typhoons (`west_pacific_typhoons`): fewer, probable, lag
      3–6, June–October, through the strengthened subtropical high (Du et
      al. 2011).
    - South China (`south_china_rainfall`): wetter early summer, probable.
    - Indian summer monsoon: weaker or later onset, contested, June–
      September (the literature disagrees on sign and size; show it
      contested, say so on the card).
    - New outcome node **North Indian Ocean cyclones** (Arabian Sea + Bay
      of Bengal, `north_indian_ocean_cyclones`, axis active_quiet, marker
      about 12°N 68°E): fewer pre-monsoon storms in a warm basin, contested.
      **Decided 2026-09-08: ship it**, contested, with a note on the node's
      card and in the link's evidence note saying the record is short
      (reliable storm counts start in the satellite era) and the studies
      few, so this is the least certain arrow from this driver.
  - Links in: ENSO El Niño → basin warm, established, lag 3–5, all year
    (Klein, Soden & Lau 1999; Xie et al. 2009); La Niña → basin cool,
    probable, same lag. These are the chain: with "Follow links through
    other drivers" on, an El Niño from June pushes the basin warm in
    September at depth 1. The Yangtze link then falls outside the twelve
    months shown (the following June is month index 12), which is the
    honest result and is asserted in the tests: the basin's own summer
    is seen by choosing the basin as the first driver with the El Niño as
    the one that began before (M15), which is how the story is built.
  - Links out onto ENSO: a warm basin hastens the El Niño's decay and the
    turn toward La Niña (Kug & Kang 2006; Ohba & Ueda 2007), probable, lag
    4–8, pushing ENSO to −1. With ENSO as the scenario driver the loop guard
    keeps this on the card, under "Feedback from other drivers". With the
    basin as the scenario driver it is drawn.
  - Sources: about fifteen. Start from Xie et al. 2009 (J. Climate, "Indian
    Ocean capacitor effect"), Klein et al. 1999, Du et al. 2009 and 2011,
    Yang et al. 2007, Kug & Kang 2006, the Annamalai group on the monsoon,
    and a review (Xie et al. 2016, Adv. Atmos. Sci.).
  - Story: **"1998: the Yangtze floods"**. Basin warm from February 1998,
    ENSO El Niño as a second driver that began before (June 1997,
    `second_starts_before`). Steps: the warm basin left behind, the Yangtze
    flood of June–August 1998, the quiet typhoon season, the El Niño's
    quick collapse into La Niña, and a closing caution (the 1998 flood also
    had a large share of chance and land-use in it; the map shows the
    tendency only).
- **Schema, engine, UI:** unchanged.
- **Tests:** acceptance blocks for the basin from February (Yangtze from
  June, typhoons quiet from June, the monsoon contested and hollow under
  "probable and above"); the chain from an El Niño in June (basin pushed
  in September at depth 1, its typhoon link one tier down from that
  month, the Yangtze link not reported because its season lies beyond
  the horizon, IOD and basin both pushed and not conflicting at the
  monsoon); the 1998 scenario (ENSO onset -8, the Yangtze from month 4 at
  full tier through the chosen basin); existing counts updated (eight
  drivers).
- **Browser check:** marker and label placement clear of the IOD and the
  South India / Indian monsoon labels; the dropdown jumping to February;
  the 1998 story stepped to the end.
- **Honesty note:** the basin mode is not independent of ENSO; the card
  says that most of its warm years are the year after an El Niño, and
  that choosing it alone is a way of looking at the second half of an El
  Niño story. The IOD and the basin mode are different things (a
  west-east contrast versus a basin-wide warming) and often occur in
  different seasons; the card says this in one sentence.
- **Not in M20:** any change to how the IOD is described; the Indian Ocean
  subtropical dipole (too weak a literature).

### M21 — Ninth driver: the Atlantic Meridional Mode

**Shipped 2026-09-08.** The record of what was built is in `docs/PLAN.md`
§10 under M21. Departures from the text below, each with its reason
there: the Amazon link goes to a new southwestern Amazon dry-season node
rather than `northern_amazon_rainfall` (that node is El Niño's wet-season
drought on the northern side of the basin; the 2005 drought did not
touch it); Central America is probable, not contested; the ENSO push
lags 9–11 months from a June onset, not 3–6, so that the mode arrives
the following March as the sources say; the label is "AMM". With the
chain on, an El Niño from June now shows the pushed mode and the El Niño
disagreeing at the hurricanes in the last month shown, which is the
compensation the literature describes and is asserted in the tests.

The spring-time north-south contrast in the tropical Atlantic: a warm
northern tropical Atlantic with the rain belt (ITCZ) shifted north, or the
reverse. It is the seasonal, year-to-year cousin of the AMO (M18), and it
is the mode that actually delivers ENSO's and the NAO's influence to the
Atlantic hurricane season, Northeast Brazil and the southern Amazon.

- **Data.** Driver `atlantic_meridional_mode` with phases positive (warm
  north, ITCZ north) / neutral / negative. Marker near 10°N 35°W (the AMO
  is at 33°N 40°W, hurricanes at 15°N 50°W, NE Brazil at 7°S 40°W; the
  overlap check decides), label "Atlantic meridional mode". Area the
  tropical Atlantic 5°S–20°N. `default_start_month` 3 (peaks March–May).
  - Links out, positive phase (negatives mirrored where supported):
    - Atlantic hurricanes: more active, established, lag 2–5, June–
      November (Vimont & Kossin 2007; Kossin & Vimont 2007).
    - Northeast Brazil: drier (the rain belt sits north of it), established,
      lag 0–1, February–May (Moura & Shukla 1981; Hastenrath & Greischar
      1993). Note the reversed sign for the negative phase is the classic
      "good year in the Nordeste".
    - Sahel: wetter, probable, lag 3–5, July–September.
    - Northern Amazon: drier in a warm north Atlantic, probable, June–
      October (Marengo et al. 2008; Yoon & Zeng 2010, the 2005 and 2010
      droughts).
    - Central America / Caribbean: wetter early rainy season, contested.
  - Links in: ENSO El Niño → positive mode the following spring,
    established, lag 3–6 (Enfield & Mayer 1997; Chiang & Vimont 2004);
    NAO negative winter → positive mode in spring, probable, lag 2–4
    (Czaja, van der Vaart & Marshall 2002). Nothing else pushes it. It
    pushes nothing (a proposed feedback onto ENSO through the Pacific is
    too thin; say so on the card).
  - Sources: about eighteen. Chiang & Vimont 2004 defines the mode.
  - Story: **"2005: the Amazon dries without an El Niño"**. Positive mode
    from March 2005, no second driver (ENSO was neutral, which is the
    point). Steps: the warm north Atlantic in spring, the record hurricane
    season, the southern Amazon drought of the autumn with river levels at
    record lows, and the teaching point that the usual suspect (El Niño)
    was absent.
- **Schema, engine, UI:** unchanged.
- **Tests, browser check:** as for M20. The 2005 story must show the
  hurricanes arrow at full tier with ENSO hollow.
- **Honesty note:** the AMO (M18) and this mode overlap on the map and in
  their effects; the card explains the difference (decades versus a
  season) and says that a warm AMO decade makes positive springs more
  common. The chain AMO → meridional mode is deliberately not drawn (the
  mode is defined with the decadal signal removed); that is told on the
  card.
- **Not in M21:** any change to the AMO's links, even where the same
  outcome is now reachable two ways. Two arrows on one region rated
  separately is the M11 behaviour and is correct.

### M22 — Tenth driver: the Pacific Meridional Mode

**Shipped 2026-09-08.** The record of what was built is in `docs/PLAN.md`
§10 under M22. As planned, with two things worth noting: the negative
typhoon link is shipped contested rather than left out (the composite
study supports the sign, the case studies do not cover it), and the
positive typhoon link's caveat names the study that finds the
year-to-year relation weak. The story runs the mode alone with the chain
on, so the pushed El Niño paints its own map one tier down from
September 2014 while the text tells how the real event stalled.

The north-east Pacific's spring pattern of weakened trade winds and warm
water off Baja California that often leads an El Niño by two to three
seasons. Its value is as a **precursor**: a driver whose main effect is to
push ENSO, so that with the chain on the student sees a spring signal turn
into a winter El Niño and its whole map.

- **Data.** Driver `pacific_meridional_mode`, phases positive / neutral /
  negative, marker about 18°N 135°W (Hawaii is at 21°N 157°W, the eastern
  Pacific hurricanes at 14°N 110°W; check overlap), area 5°N–25°N,
  150°W–110°W, `default_start_month` 3.
  - Links out, positive phase: ENSO → El Niño, probable, lag 6–9, all year
    (Chiang & Vimont 2004; Chang et al. 2007; Larson & Kirtman 2013);
    negative → La Niña, contested (the negative side is weaker in the
    record; **decided 2026-09-08: ship it contested**, with an evidence
    note saying the positive side is the well-studied one).
    West Pacific typhoons: more active, probable, lag 2–5, June–November
    (Zhang et al. 2016). Eastern Pacific hurricanes: more, contested.
    Hawaii: no supportable link; leave hollow.
  - Links in: none drawn. The NAO's Pacific analogue (the North Pacific
    Oscillation) is the usual trigger and is not a driver here; the card
    says so.
  - Story: **"2014–15: the spring warning that came true late"**. Positive
    mode from March 2014, chain on: ENSO pushed toward El Niño by
    September–December 2014, which in reality stalled and only became the
    big event in 2015. Steps end on that caution: a precursor raises the
    odds, it does not fix the outcome. This is the best single teaching
    example in the tool of "probable" meaning what it says.
- **Schema, engine, UI:** unchanged. The story leans on M10 (chain) and the
  validator's rule that a story step may point at a node reached through a
  pushed driver.
- **Honesty note:** the card leads with the failure rate (about one in
  three strong positive springs is not followed by an El Niño).
- **Not in M22:** the North Pacific Oscillation as a driver (it is a
  monthly atmospheric pattern; see §6).

### M23 — Eleventh driver: the Quasi-Biennial Oscillation

**Shipped 2026-09-08**, after M26 and M27 as §7 suggests, so it is the
twelfth driver on the map. The record of what was built is in
`docs/PLAN.md` §10 under M23. Departures from the text below, each with
its reason: the marker is at 7°S 175°W, not 0°N 160°E, because the
tropical eruption (M26) took the western Pacific, and south of Kiribati
is the only empty stretch of the central Pacific left (on the equator
itself the Kiribati label ran into the circle); the label is "QBO" (the card explains the
stratosphere), since driver labels sit centred under the circle and the
short form matches ENSO, IOD and NAO; the transition phase's id is
`neutral` so the driver reads like every other in the tests; the
hurricane link ships in both phases (Gray 1984 found both), read in the
season with lag 0–2 in August–October; the Indian monsoon link is not
drawn at all, because the two studies read the wind at different
heights and months and their signs cannot be reconciled with one map
phase. The story is the real winter of 2009–10 with El Niño as a second
driver that began before, as the text prefers, and its last two steps
use the Singapore wind record to show the map's held phases ending
before the year does.

The stratospheric wind over the equator that swings between westerly and
easterly about every 28 months. It has clean phases, a phase lasts about a
year (so the twelve-month hold is for once nearly honest), and it has a
documented winter link to the polar vortex and so to the NAO. It is also
the phenomenon whose best-known role is *changing the strength of other
links*, which the engine cannot draw until M35; M23 ships the parts that
are pushes.

- **Data.** Driver `qbo`, phases westerly (+1) / transition (0) /
  easterly (−1). A marker has to sit somewhere: propose 0°, 160°E, label
  "QBO (stratosphere)", no area polygon (there is no region; the card
  explains the marker is a placeholder for a band of wind 20–30 km up).
  `default_start_month` 11 (its winter effects are the ones drawn;
  the phase at the surface-relevant level is usually read in autumn).
  Timescale "About 28 months per cycle".
  - Links out, easterly phase: NAO → negative, probable, lag 1–3, December–
    February (Holton & Tan 1980; Anstey & Shepherd 2014 review; the
    "Holton–Tan effect"). Westerly → NAO positive, probable, same.
    Atlantic hurricanes: westerly → more active, **contested** (Gray 1984
    found it; the relationship weakened or vanished after the 1990s,
    Klotzbach et al. 2019); ship it contested with an evidence note that
    says exactly that, because "a link that stopped working" is a lesson
    worth one arrow. Indian monsoon: contested, one phase only if at all.
  - Links in: none. Nothing on this map pushes the QBO (its 2015–16
    disruption was, if anything, El Niño-related and unique; one sentence
    on the card).
  - Story: **"A winter with the wind from the east"**, a composite rather
    than a single year, or the winter 2009–10 (easterly QBO, negative NAO,
    very cold Europe, with El Niño as the second driver). Prefer the real
    winter; the plan's stories have always been real years.
- **Schema, engine, UI:** unchanged.
- **Honesty note:** the Holton–Tan effect is real on average and small in
  any one year; the card says the QBO shifts the odds of a weak vortex
  and that El Niño and volcanic winters do the same thing more strongly.
  The card mentions the Madden–Julian Oscillation (non-goal) only to say
  the QBO affects it and that this tool does not draw it.
- **Not in M23:** the QBO as a *modulator* of ENSO's winter links; that is
  M35 and the M23 card says "see also" in plain words.

### M24 — Twelfth driver: autumn Arctic sea ice (Barents–Kara)

A **contested** driver, added because showing disputed science is the
point of the tool. Low autumn sea ice in the Barents and Kara seas has been
linked to cold Siberian winters and a weaker polar vortex; other studies
find the link is small or an artefact of the short record. Every link from
this driver is contested and the card's "How sure are we?" section is the
longest in the data.

- **Data.** Driver `barents_kara_ice`, phases low (−1) / normal (0) /
  high (+1), marker about 76°N 45°E (western Russia is at 55°N 54°E,
  Norway at 62°N 7°E), label "Barents–Kara sea ice", `default_start_month`
  10 (ice is read in October–November).
  - Links out, low ice: new outcome node **Central Siberia winter**
    (`siberia_winter`, axis warm_cool, marker about 60°N 95°E): colder,
    contested, lag 1–3, December–February (Cohen et al. 2014; Mori et al.
    2014; Kim et al. 2014; against: Screen & Blackport 2019, Blackport et
    al. 2019). NAO → negative, contested, lag 1–3. East Asia winter:
    colder, contested. Western Russia winter: colder, contested.
  - Links in: none drawn (the drivers of ice loss are the warming trend
    and the AMO, and the trend is a non-goal; the card says so).
  - Story: **"2012: record-low ice, then a cold Eurasian winter"**, with
    the honest ending that 2012–13 is one winter and the argument is about
    whether it counts.
- **Schema, engine, UI:** unchanged. The confidence filter's "probable and
  above" setting ghosts the whole driver's output, which is itself the
  lesson; the browser check must show it.
- **Honesty note:** the card names both sides and their strongest papers
  in plain words: "some studies find, others find not; models mostly do
  not reproduce it". The trend in ice is not a driver here and the card
  says why.
- **Not in M24:** any link from the warming trend; Arctic sea ice
  elsewhere (Chukchi, Beaufort).

### M25 — Thirteenth driver: October Eurasian snow cover

The second contested precursor: extensive October snow across Siberia has
been proposed as a lead indicator of a negative winter Arctic Oscillation
(here folded into the NAO, as the M9 card already does) and cold eastern
North America. It pairs with M24 as a matched teaching unit.

- **Data.** Driver `eurasian_october_snow`, phases high (+1) / normal /
  low (−1), marker about 58°N 75°E (must not clash with M24's Siberia
  node; the two milestones are placed together), `default_start_month`
  10. Links out, high snow: NAO negative, contested, lag 2–3, December–
  February (Cohen & Entekhabi 1999; Cohen et al. 2007; against: Peings et
  al. 2013; Furtado et al. 2015 on the relationship weakening after
  2010); Eastern US winter colder, contested; Northern Europe colder,
  contested. Links in: none. Story: **"2009–10 or 1976–77"**, pick the one
  with the cleaner record; the last step says that the relationship has
  been weak since about 2010 and that forecasters who used it were burnt.
- Everything else as M24.
- **Not in M25:** any implication that the two precursors add up; they are
  correlated with each other and the card says so.

### M26 — Fourteenth driver: a large tropical volcanic eruption

**Shipped 2026-09-08**, before M23–M25 as §7 suggests, so it is the
eleventh driver on the map. The record of what was built is in
`docs/PLAN.md` §10 under M26. Departures from the text below, each with
its reason: the quiet phase's id is `neutral`, not `none`, so the driver
reads like every other in the data and the tests (its label is "No
eruption"); the marker is at 0°N 158°E east of New Guinea, because every
position in the Philippine Sea failed the label-overlap check; the
monsoon links use lag 4–15 rather than 6–15 (the haze spreads and
thickens in three or four months, and lag 4 lets an April eruption reach
the same summer's monsoon) and the winter links lag 2–8 rather than 3–8
(so a December eruption still reaches February); the story's last step
is at month 12, not 11, because that is the first June after the
eruption, and it explains that with the chain on the monsoon marker is
hatched (El Niño's pushed dipole and basin argue with the volcano) while
with it off both chosen drivers say weaker. The NAO push and the winter
warming are shipped probable as planned, with caveats that name Driscoll
2012 and Polvani 2019.

An event, not an oscillation, but it fits the schema: the validator asks
only that a driver has at least two phases, one of them value 0. Phases:
`eruption` (value −1, the driver's own axis is "cooling forcing") and
`none` (0). It is the one driver where the twelve-month horizon cuts the
story short, and the card says so.

- **Data.** Driver `tropical_eruption`, marker where the label fits
  (propose the Philippines Sea near Pinatubo, about 18°N 125°E, checked
  against the Philippines and typhoon labels), label "Tropical eruption",
  no area, `default_start_month` 6 (Pinatubo, June 1991). Timescale "Rare;
  effects last two to three years".
  - Links out, eruption phase: global mean temperature cooler, established,
    lag 3–12, all year (Robock 2000; Hansen et al. 1992). Sahel and Indian
    monsoon weaker the following summer, probable, lag 6–15 (Iles &
    Hegerl 2014; Oman et al. 2006). Northern Europe and western Russia
    milder the first winter (the "winter warming"), probable, December–
    February, and the NAO pushed positive, probable, lag 3–8 (Robock &
    Mao 1992; Shindell et al. 2004; Fischer et al. 2007). ENSO pushed
    toward El Niño the following year, **contested** (Adams et al. 2003;
    Khodri et al. 2017; against: Dee et al. 2020), with lag 6–12.
  - Links in: none (obviously).
  - Story: **"1991: Pinatubo"**. Eruption from June 1991, ENSO El Niño as a
    second driver from September 1991 (chosen by hand, because the record
    has one and the map's push is contested). Steps: the cloud, the cool
    year, the mild winter, the weak monsoon, and the cut-off at month 11
    with a sentence about the two further years the map cannot show.
- **Schema, engine, UI:** unchanged. The phase button for `none` is a
  neutral phase like any other.
- **Honesty note:** the card says the map holds the eruption "on" for
  twelve months as a stand-in for a cloud that thins over two years, and
  that a high-latitude eruption (Iceland, Alaska) behaves differently and
  is not on this map. This driver is the most-cited reason for M32 (phase
  duration).
- **Not in M26:** high-latitude eruptions, the solar cycle (§6), any
  climate-change framing.

### M27 — Outcome regions, third batch

**Shipped 2026-09-08.** Five of the ten candidates below shipped: Central
Asia, the US Midwest, northeastern Canada (as `hudson_bay_winter`),
India's pre-monsoon heat and Tibetan snow, with thirteen links and
twenty-five sources. The record is in `docs/PLAN.md` §10 under M27, with
the reasons for the five dropped (Japan/Korea and the Caribbean duplicate
nodes already on the map; Mongolia waits for M24; southern Brazil in
winter and Iberia in spring could not be sourced beyond what the map
has) and the marker moves the label-overlap check forced. The PDO link
into the Midwest was not drawn: the PDO sources found are for winter
precipitation. Tibet gained a positive-IOD link the table below does not
list, from two recent studies, contested.

Data only, as in the fifteen-region batch before M16. Candidates, each with
the driver(s) that reach it and the review source to start from; ship the
ones whose links can be sourced, drop the rest:

| Node | Driver, phase → effect | Season | Start from |
|---|---|---|---|
| Japan and Korea winter (`japan_korea_winter`, warm_cool) | ENSO El Niño → milder; La Niña → colder | Dec–Feb | Wang, Wu & Fu 2000; JMA reports |
| Central Asia winter precipitation (`central_asia_winter`, wet_dry) | ENSO El Niño → wetter (Iran to Kazakhstan) | Nov–Apr | Mariotti 2007; Barlow et al. 2002 |
| Caribbean rainy season (`caribbean_rainfall`, wet_dry) | ENSO El Niño → drier; AMM positive → wetter | May–Nov | Giannini, Kushnir & Cane 2000 |
| US Midwest summer (`us_midwest_summer`, wet_dry) | ENSO La Niña → drier/hotter; PDO cool → drier | Jun–Aug | Hu & Feng 2001; Ting & Wang 1997 |
| Arctic Canada / Hudson Bay winter (`hudson_bay_winter`, warm_cool) | NAO negative → milder; ENSO El Niño → milder | Dec–Feb | Hurrell 1995; Shabbar & Khandekar 1996 |
| Mongolia winter (`mongolia_winter`, warm_cool; the dzud) | Siberian High / M24 low ice → colder, contested | Dec–Feb | Cohen et al. 2014 (with M24) |
| Southern Brazil winter (`south_brazil_winter`, wet_dry) | ENSO El Niño → wetter | Jun–Aug | Grimm, Barros & Doyle 2000 |
| Iberian spring (`iberia_spring`, wet_dry) | NAO positive → drier; AMO warm → drier | Mar–May | Trigo et al. 2004; Sutton & Dong 2012 |
| South Asian pre-monsoon heat (`india_premonsoon_heat`, warm_cool) | ENSO El Niño → hotter; IOB warm (M20) → hotter, contested | Mar–May | Rohini et al. 2016 |
| Tibetan Plateau winter snow (`tibet_winter_snow`, wet_dry) | ENSO El Niño → more snow, contested | Dec–Mar | Shaman & Tziperman 2005 |

About twenty links. No new drivers. The "global" node kind stays as it is.

---

## 3. UI additions that need no engine change

### M28 — Region-first navigation ("where I live")

Today the flow is driver → map. A student in Nairobi wants the inverse:
pick a place, see every driver that reaches it, in which phase, in which
months, and how surely. All of that is in the data already.

- **Engine (pure, additive).** `src/engine/inverse.ts` exports
  `influencesOn(graph, nodeId)`: every link into the node, grouped by
  driver and phase, each with its tier, effect, season and lag, plus a
  twelve-month strip per link saying which calendar months are in season
  (reusing `src/engine/season.ts`). No scenario, no propagation. Tests in
  `src/engine/inverse.test.ts`.
- **UI.** A third heading in the controls: "By region" with a dropdown of
  outcome nodes (alphabetical, with the region name). Choosing one enters
  *region mode*: the scenario controls grey out, the timeline hides, every
  driver that reaches the node is drawn as a marker in a neutral "can
  reach" style, and each incoming link is drawn ghosted in its tier's line
  style, coloured by the phase that fires it (so two arrows from ENSO, red
  and blue, both land on Nairobi). The card shows the node in region mode:
  one block per driver, "El Niño: drier, probable, October–December,
  arriving 0–2 months after the event begins", followed by the usual
  "How sure are we?" per link. Clicking a driver marker leaves region mode
  and sets up the single-driver scenario for that driver and phase with
  its default start month, so the student can go from "what reaches my
  home" to "watch it arrive" in one click. Compare mode and stories are
  off in region mode. Print caption: "Everything that is known to reach
  <region> on this map."
- **Acceptance.** For Kiribati (five drivers reach it) all five markers
  light up and the card lists them grouped; for a node with one incoming
  link the card still shows the caveat; the URL hash carries region mode
  so a teacher can link to it.
- **Not in M28:** a search box (the dropdown is enough for sixty nodes);
  clicking the map background to pick a region.

### M29 — Sources page and evidence tally

- A second static page `sources.html` built by Vite from the same
  `graph.json`: every source with its citation and link, followed by the
  links and stories that cite it, and, per driver, a tally of established
  / probable / contested links out. The card's citation lines link to the
  source's anchor on this page (open in a new tab). A short "How this map
  was built" paragraph at the top says the graph is hand-curated, that
  every arrow has a caveat, and how to propose a link (pointing at
  `README.md`). No new data fields. Tests: a build-time check that every
  source is cited at least once (already a validator warning; make it an
  error here if it is not).
- **Not in M29:** editing anything; a comment system.

### M30 — Arrival window

A link carries a lag *range* but the engine uses only the earliest month
and the card prints the range as text. Timing uncertainty is the one kind
of uncertainty the map does not yet show.

- **Engine (reporting only).** `MonthState.links[id]` gains
  `settled: boolean`: true once `index >= onset + lag_months[1]`. States,
  sums, tiers and conflicts are unchanged; a link is still applied from
  `lag_months[0]` (§4 rule 3 stands). Tests: settled false at lag[0],
  true at lag[1], always true when the two are equal, counted from the
  chosen or pushed onset.
- **UI.** Behind a legend toggle "Show arrival window" (default off, rule
  15): an applied link that is not yet settled is drawn at reduced opacity
  with its arrowhead outlined, and the card's timing line reads "may
  arrive any time from month 0 to month 4; drawn faint until month 4". The
  season dial is unchanged (it shows the season gate only).
- **Not in M30:** any change to when a link applies; that would be a
  behaviour change to every scenario and story.

### M31 — A second language

Students read the cards. All user-facing text lives in YAML (nodes, links,
stories, source citations stay as published) plus a small set of UI strings
in `src/ui/`.

- **Schema.** Every user-facing text field (`name`, `label`, `region`,
  `timescale`, `summary`, `onset_hint`, phase `label` and `summary`, outcome
  `labels`, link `mechanism`, `caveat`, `evidence_note`, story `title`,
  `intro`, step `text`) accepts either a string (English) or a map
  `{ en: ..., xx: ... }`. The validator requires `en`, warns on a language
  missing from a field when the same language is present elsewhere, and
  enforces the label length limit per language. `graph.json` carries all
  languages; the loader picks one. UI strings move to `src/i18n/en.ts` and
  `src/i18n/xx.ts` (plain objects, typed so a missing key is a compile
  error). A language dropdown in the title bar; the choice is kept in the
  URL hash, not in browser storage, so a projected link opens in the
  language the teacher chose.
- **Deliverable.** The plumbing plus one complete second language, chosen
  at sign-off. A machine draft is acceptable only if marked as such in
  the language dropdown ("draft translation") until a reader has checked
  it; the plain-language rule (§0 rule 9) applies in every language.
- **Validator.** The "will / always / causes" warning gets a per-language
  word list.
- **Not in M31:** right-to-left layout; translated map labels from
  `world-atlas` (country names are not drawn anyway).

---

## 4. Engine extensions for phenomena that do not fit today

Each of these adds one numbered rule to `docs/PLAN.md` §4. The existing
rules are not changed. Each keeps three-level states and fire-once.

### M32 — Phase duration

**Why it does not fit.** A driver holds its phase for the whole horizon.
Real El Niños fade by the following spring; an Atlantic Niño lasts three
to five months; a volcanic cloud (M26) thins over two years. Four driver
cards already carry an apology for this.

**Rule 9 (new).** A chosen driver may carry `holdMonths` (1–12, default
the full horizon, which is today's behaviour exactly). From month index
`onset + holdMonths` it holds no phase (value 0) and its links are not
applied. A link whose lag has not run by then never applies and is reported
with status `faded`; a link already applied stops being applied and is
reported `faded` too. Onsets are unchanged: a pushed driver's onset stays
the first month it was pushed, its links still count from there, and it
keeps its phase only in months where the pushing link is applied, as rule
6 says, so a fade upstream cuts the chain at the same month. Nothing new
happens after a fade; the driver is not pushed back into a phase by its own
fade. Sums, clamps, conflicts, tiers: unchanged.

**Decided 2026-09-08**: a link with `lag_months[0]` beyond the hold does
**not** fire (the physical case is an effect carried by the ocean after the
atmospheric phase has ended, such as a basin-mode link). The alternative
would reintroduce a hidden memory the student cannot see; the honest way to
show ocean memory is the M20 chain, where the memory is a driver on the
map. A note is required in the UI, not only in the data: the card of a
faded link says "this effect needs N months to arrive and the event was
set to last M, so on this map it never arrives; in reality the ocean can
carry such an effect past the end of the event", and the "Event lasts"
control's hint says the same in one sentence.

- **Data.** Drivers gain `typical_duration_months: [min, max]` (required
  once M32 ships; the validator errors on a driver without it). The
  Atlantic Niño gets `[3, 5]`, ENSO `[8, 12]`, the IOD `[4, 6]`, the NAO
  and SAM `[1, 3]` (with an onset hint saying a "phase" here is a winter's
  average), the PDO and AMO `[12, 12]` with a note that they really last
  years. Stories gain `hold_months` per driver (optional).
- **UI.** An "Event lasts" select under "Event begins in": "whole year
  (default)" and "typical (N months)" read from the driver, plus the
  numbers 1–12. The driver marker goes to its neutral style at the fade;
  the timeline gets a small tick at the fade month; faded links are drawn
  like pending ones but grey, with "faded" in the card's timing line. The
  season dial is unchanged. Compare mode works per side unchanged (a
  natural comparison: the same El Niño held six months versus twelve).
- **Tests.** Fade at the hold, faded status on a long-lag link, the chain
  cut when the pusher fades, the second driver's own hold counted from its
  onset (including a negative onset), default equal to today's timeline
  for every shipped story (a regression test that runs all eleven stories
  with and without the field and asserts identical timelines).
- **Honesty note.** This is the one extension that makes the map *less*
  wrong about time. The card text that apologised for the twelve-month
  hold is rewritten to explain the control instead.
- **Not in M32:** a fade *into the opposite phase* (an El Niño turning
  into a La Niña). That is a push and is drawn as one via M20 or by the
  student choosing two drivers with the M15 order.

### M33 — Any number of chosen drivers

**Why it does not fit.** Rule 8 is written for exactly two. The year table
(M34) needs all of them.

**Rule 8 generalised.** `scenario.secondary` becomes `scenario.others:
ScenarioDriver[]` (the engine accepts `secondary` as a one-element
`others` for one milestone, then it is removed). Every rule-8 statement
that says "the second driver" now says "each chosen driver other than the
first": each has its own onset (M12/M15 arithmetic unchanged), fires at
the first hop at full tier, is never pushed, and the same driver cannot
appear twice. There is no ordering among them beyond their onsets. Sum
and clamp is unchanged, so three drivers on one region can conflict two
against one and still clamp to ±1 with `conflicting` set; the card lists
all three. The loop guard, depth and downgrade rules are unchanged.

- **UI.** The "Second driver" block becomes a list with an "Add a driver"
  button (up to the number of drivers minus one). Each row is the current
  second-driver block (driver, phase, month, before/after). Rows beyond
  the second are collapsed behind "More drivers" by default (rule 15) so
  the page opens looking as it does today. Compare mode: each side keeps
  its own list; "copy A to B" copies all. Stories: `drivers:` list
  replaces the `second_*` fields, with the validator accepting the old
  fields for one milestone and the shipped stories migrated.
- **Tests.** Three drivers with a two-against-one conflict; four drivers
  with three onsets including one negative; the same driver twice throws;
  every shipped story gives the same timeline under `others` as under
  `secondary`.
- **Not in M33:** any new combination rule. The plan's rule-8 sentence
  "no new combination rule" still holds.

### M34 — A table of real years

The version-2 roadmap's "historical index overlay from NOAA", done in the
way rule 16 allows: a hand-curated, committed table, not a data feed.

- **Data.** `data/years.yaml`:
  ```yaml
  years:
    - year: 1997
      drivers:
        - driver: enso
          phase: el_nino
          onset_month: 5          # calendar month the phase began
          hold_months: 12         # optional, needs M32; how long it held
          index_note: "ONI peaked at +2.4 in November–January, the strongest on record at the time."
          source: noaa_oni
        - driver: iod
          phase: positive
          onset_month: 6
          index_note: "DMI above +1 from July to November."
          source: bom_dmi
        - driver: nao
          phase: neutral
          source: cpc_nao
      note: >          # one to three sentences on what the year was like, plain language
        ...
      sources: [mcphaden_1999]
  ```
  One row per driver per year; a driver absent from a year means "not
  recorded" and is shown as such, distinct from neutral. Sources are
  index datasets added to `links.yaml`'s source list (NOAA ONI, BoM DMI,
  CPC NAO, Marshall SAM, the NOAA PDO series, the Kaplan/ESRL AMO series,
  NOAA PSL ATL3 for the Atlantic Niño), each with the threshold used to
  call a phase written in the citation ("phase called when the
  three-month mean exceeded ±0.5 °C for five overlapping seasons", i.e.
  the NOAA definition). Coverage, **decided 2026-09-08**: 1980–2025 for
  all seven drivers, ENSO alone back to 1950; a driver whose index starts
  later than 1980 (none of the seven, as far as known) is "not recorded"
  for the missing years.
- **Validator.** Every driver and phase exists; years are unique and the
  onset month is 1–12; every row has a source that resolves; a year's set
  of chosen drivers is a valid M33 scenario (no driver twice).
- **Engine.** Nothing new. A year is turned into an M33 scenario by a pure
  function `scenarioForYear(graph, year)` in `src/engine/years.ts`: the
  first driver is the one with the earliest onset (ties: ENSO first), the
  others carry `startMonth` and `startsBefore` from the M15 arithmetic
  and `holdMonths` from the row if M32 has shipped.
- **UI.** A "Real year" dropdown beside the stories dropdown. Picking one
  sets the scenario, locks the driver controls (like a story does), shows
  the year's note in the card area with a line per driver ("ENSO: El Niño
  from May; ONI peaked at +2.4"), and unlocks with "Edit this scenario",
  which copies it into the free controls. The print caption names the
  year and the index sources. Stories that have a `start_year` get a
  "Compare with the record" link that opens the year.
- **Honesty note (required on the year card).** "The map shows the
  tendencies for the phases that were observed. It does not show what
  happened that year; where a story exists for this year it tells you
  where the real weather broke the pattern." A year with every driver
  neutral is a legitimate row and shows an empty map, which is a lesson in
  itself.
- **Tests.** The scenario built for 1997 (ENSO May, IOD June, NAO not in
  play), for a year where the earliest onset is not ENSO, for a year with
  a driver that began the previous autumn (negative onset), and the
  validator failures.
- **Not in M34:** fetching anything; monthly index values (a phase and an
  onset month per year is the resolution the engine can use); years
  before the index exists.

### M35 — Links that weaken other links (modulation)

**Why it does not fit.** The PDO changes how strongly ENSO reaches North
America; the QBO changes how strongly El Niño weakens the polar vortex;
the AMO changes how strongly El Niño suppresses hurricanes. The engine
only knows "push a node up or down". "Change the strength of another
link" is a different kind of edge.

**Rule 10 (new).** A link may carry
`weakened_by: [{ driver, phase }]`. In a month where the named driver is a
*chosen* driver holding that phase (pushed drivers never modulate; their
state can depend on the hop being computed), the link's effective
confidence is one tier lower (floored at contested), before rule 5 and
before the `minConfidence` ghosting. Nothing else changes: the link is
still applied, with the same effect, in the same months. Only the
*weakening* direction exists, on purpose: three-level states cannot show
"stronger", and "El Niño's effect is stronger when the PDO is warm" is
the same fact as "weaker when the PDO is cool", so data authors write the
weakening side only.

- **Data.** Validator: the modulating driver exists and has that phase,
  and is not the link's own `from`. First links: ENSO's North American
  winter links (California, Pacific Northwest, Gulf Coast, Prairies,
  Alaska) weakened by the PDO in its opposite-sign phase (Gershunov &
  Barnett 1998; McCabe & Dettinger 1999; Yu & Zwiers 2007); ENSO El
  Niño → Atlantic hurricanes weakened by the warm AMO (contested; check
  before shipping); El Niño → NAO negative weakened by the westerly QBO
  (Garfinkel & Hartmann 2007; Calvo et al. 2009, with M23 shipped).
  Each modulation needs its own source list and the link's evidence note
  gains a sentence saying so.
- **UI.** The card's "How sure are we?" gains a line "Weaker this month
  because the PDO is in its cool phase", with the source. The arrow is
  drawn at its effective tier, so the student sees a solid line turn
  dashed when they add the PDO as a second driver in the opposite phase.
  Legend: one sentence under the tiers. The confidence filter reads the
  effective tier (so "established only" can ghost a modulated link), which
  is the M10 behaviour for hops and needs no new code path.
- **Tests.** A weakened link one tier down with the modulator chosen,
  unchanged with the modulator pushed rather than chosen, unchanged in
  months before the modulator's onset (M12), floor at contested, ghosted
  under the filter, and rule 5 taking the weakened tier at the node.
- **Honesty note.** Modulation is exactly the kind of claim that decays
  over decades (the PDO–ENSO interference is well supported; the AMO
  case is not). The default data ships only the PDO case; the others are
  offered as candidates for their own sign-off.
- **Not in M35:** strengthening; modulation by an outcome; modulation of
  a driver-to-driver link (allowed by the schema but ship none until a
  case is sourced).

### M36 — El Niño flavours

**Why it does not fit.** A central-Pacific ("Modoki") El Niño and a
classic eastern-Pacific one have different maps: India drier under the
central kind, a different North American pattern, different typhoon
tracks. Three-level states cannot say which kind. A separate driver would
break "a driver cannot be chosen twice" and would let a student choose
both kinds at once.

**Rule 11 (new): phase variants.** A phase may carry `variant_of: <phase
id>` and must then have the same `value` as its parent (the uniqueness
rule in §3.1 is relaxed exactly for variants). A link fires for a phase
if `when` names that phase, or names its parent and the link does not list
the phase in `except`. A push into the driver (rule 6) always lands on the
parent, never a variant. Everything else is unchanged; a variant is a
phase.

- **Data.** ENSO gains `el_nino_central` (variant of `el_nino`, label
  "El Niño, central Pacific") and, if the literature supports it,
  `la_nina_central`. Links specific to the central kind: Indian monsoon
  weaker, established for the central kind (Kumar et al. 2006, Science);
  US winter pattern shifted (Yu et al. 2012; Weng et al. 2009); East
  Australia drier, probable (Taschetto & England 2009); West Pacific
  typhoon tracks shifted west, probable (Kim, Webster & Curry 2009). Links
  that do *not* hold for the central kind (the strong Peru coast rain,
  the Peru fishery collapse) get `except: [el_nino_central]` and, where
  sourced, a weaker replacement. Sources: Ashok et al. 2007 defines
  Modoki; Kao & Yu 2009; Capotondi et al. 2015 (BAMS review, which also
  says the two kinds are ends of a continuum, a sentence that goes on the
  card).
- **UI.** The phase buttons show "El Niño ▸ classic / central Pacific" as
  a sub-choice that opens only when El Niño is selected; the default is
  the parent, so the page opens as today. The card for the variant phase
  starts with what is different. Stories may name a variant (2004–05 and
  2009–10 were central-Pacific events). **Decided 2026-09-08**: add a
  2009–10 story, "2009–10: an El Niño in the wrong place", central-Pacific
  El Niño from July 2009, with a weak Indian monsoon in the summer of
  2009, the cold and snowy European and eastern US winter (the negative
  NAO doing more than the El Niño; use the NAO as a second driver from
  December) and the closing point that the Peru coast stayed dry.
- **Tests.** Parent links fire for the variant, `except` stops them,
  variant-only links do not fire for the parent, a push lands on the
  parent, validator errors for a variant with the wrong value or a
  variant of a variant.
- **Honesty note.** Strength (a "strong" versus "weak" El Niño) is
  deliberately *not* a variant. The card says a stronger event tends to
  produce the same map more reliably, and that the tool does not draw
  amplitude because it does not draw magnitude anywhere (rule 13).
- **Not in M36:** variants for any other driver (a "central" IOD is not
  established), strength, and the ENSO "continuum" beyond one sentence.

### M37 — Impacts on people (outcome → outcome links)

**Why it does not fit.** The validator requires every link to start at a
driver. "Weak monsoon → poor rice harvest", "dry Indonesia → peat fires
and haze", "wet East Africa → Rift Valley fever" are outcome-to-outcome
links. This is the largest jump for a teaching tool and the one that most
risks sounding like prediction, so it is the most fenced.

**Rule 12 (new): impact hop.** A third node kind `impact` (axis
`more_less`, plus a required `sector` from a fixed list: agriculture,
health, water, energy, fisheries, fire, economy). A link may go from an
outcome to an impact, with `when: plus | minus` naming the outcome's
state. Impact links fire in one extra hop after all driver hops are done,
from the outcome's state that month, at one tier below the outcome's
confidence (rule 6's downgrade), and are reported with `depth` one more
than the outcome's. An impact node cannot have outgoing links (validator),
so there are no loops and no depth question. Sum and clamp apply at an
impact node with several incoming links. Impact links honour the same
lag and season fields.

- **Data.** First set, each with a review-level source:
  Indian monsoon weak → India food-grain output down (Gadgil & Gadgil
  2006); Indonesia dry → peat fires and haze (Field et al. 2009, 2016);
  East Africa short rains wet → Rift Valley fever risk up (Anyamba et al.
  2009); Peru coast wet → dengue and malaria risk up (Gagnon, Smoyer-Tomic
  & Bush 2002); Southern Africa summer dry → maize yield down (Cane,
  Eshel & Buckland 1994, the Zimbabwe result); SE South America wet →
  soybean yield up (Podestá et al. 1999); Eastern Australia dry → wheat
  yield down (Nicholls 1985); Peru fishery down → fishmeal output down
  (the existing outcome, now feeding an impact); California wet →
  Sierra snowpack and hydropower up (Cayan et al. 1999); Sahel dry →
  Niger River flow down. About ten impact nodes, twelve links.
- **UI.** A layer toggle "Impacts on people" in the legend, **default
  off** (rule 15). On, impact nodes appear as square markers near their
  outcome with a short arrow, and the card for an impact leads with the
  sector and this sentence, fixed in the UI and not in the data: "How much
  of this reaches people depends on preparation, prices and policy; the
  map shows only the push from the weather." Stories may focus on an
  impact node only when the layer is on; the validator's "the marker would
  be hollow" check extends to the extra hop.
- **Tests.** An impact reached from an applied outcome one tier down; not
  reached when the outcome is 0 or conflicting; the validator rejecting an
  outgoing link from an impact and an impact link from a driver; all
  shipped stories unchanged with the layer off (impacts are computed but
  not drawn; the engine output for outcome nodes is identical).
- **Honesty note.** This is where a polished map is most likely to be
  over-trusted. Three defences: default off; the fixed sentence above; and
  a curatorial rule written into `docs/DATA_FORMAT.md` that an impact
  link is never rated established unless the source is a multi-decade
  study of the impact itself, not of the weather.
- **Not in M37:** impacts of impacts (prices → migration), any money
  figure, any mortality figure.

---

## 5. Roadmap items inherited from version 2

### M38 — Quiz mode: predict the map, then reveal

- **Data.** `data/quizzes.yaml`: each quiz fixes a scenario (the story
  fields, or a year from M34) and a month, and lists the outcome nodes to
  ask about. The validator checks each asked node is affected at that
  month (reusing the story check) or is explicitly listed as a
  distractor (`expected: none`).
- **Engine.** `src/engine/quiz.ts`: `score(graph, timeline, quiz, answers)`
  returns, per asked node, the student's answer, the map's state, the
  tier, and a verdict: `right`, `wrong`, or `open` when the tier is
  contested (a contested link is never marked wrong; the reveal says "the
  science is split, here is the debate"). Pure, tested.
- **UI.** A "Quiz" heading with a dropdown; on start the map shows the
  driver marker only, the timeline is fixed at the quiz month, every asked
  node is drawn as a "?" marker; clicking cycles wetter / normal / drier
  (per the node's axis labels); "Reveal" draws the real arrows and colours
  each guess. Score line: "5 right, 1 wrong, 2 open". Teacher use: the
  reveal is a projector moment.
- **Not in M38:** accounts, saved scores, timing.

### M39 — Globe view

- A toggle between the flat Pacific-centred map and an orthographic globe
  (`d3-geoOrthographic`) with drag to rotate, default rotation
  Pacific-centred, arrows as great-circle arcs (already the arrow
  geometry), the areas layer clipped to the visible hemisphere. Compare
  mode locks both globes to one rotation. Print always uses the flat map.
  Label overlap on the globe is handled by hiding labels beyond 70° from
  the centre. Rule 8 (§0) is satisfied by the default rotation.
- **Not in M39:** 3D terrain, animation of rotation on play.

### M40 — Spreadsheet-to-YAML importer

- `scripts/import-sheet.mjs`: reads a CSV whose header names match the
  link schema (one row per link, sources in a second sheet), writes
  candidate YAML into `W:\temp\claude\ClimateConnections\import\`, never
  into `data/` directly, and runs the validator on the merged result so a
  contributor sees the same errors a maintainer would. A template CSV in
  `docs/contrib/links-template.csv`. Only worth doing when an outside
  contributor actually appears; otherwise skip.

---

## 6. Considered and left out

| Phenomenon or feature | Why not | What would change the answer |
|---|---|---|
| Madden–Julian Oscillation | 30–60 day cycle; the monthly grid cannot hold it (non-goal since v1) | A weekly timeline, which is a different tool |
| Sudden stratospheric warmings, blocking | Events of days to weeks with no opposite phase; sub-monthly | Same |
| North Pacific Oscillation, Pacific–North American pattern, Pacific–South American pattern | Monthly atmospheric patterns that *are* the teleconnection rather than a driver of it; they would draw ENSO's links twice | Nothing; explain them on the ENSO and PDO cards instead |
| Arctic Oscillation as its own driver | Nearly the same thing as the NAO on this map; the M9 card already says so | Nothing |
| Atlantic meridional overturning, Kuroshio, Gulf Stream | Decades to centuries; no phase a student can pick for a year | Nothing within a twelve-month tool |
| Solar cycle | Eleven years, weak and disputed surface effects | Nothing |
| Long-term warming trend | Explicit non-goal; not a phase | A decision to add one explicitly sourced context node, which is a sign-off question, not a milestone |
| Marine heatwaves ("the Blob") | Events, regional, mostly a PDO-like pattern; the PDO card can mention them | Nothing |
| Event amplitude (strong versus weak El Niño) | Three-level states by design (rule 13) | Not planned; M36 explains why on the card |
| Strengthening modulation | Cannot be shown without magnitudes | Not planned; M35 writes the weakening side only |
| Multi-year events (triple-dip La Niña) | Fixed twelve-month horizon | A longer horizon is a UI change with wide blast radius on stories and the dial; not planned |
| Real-time or forecast data | Static site, no forecasting (non-goals) | Never |
| Mobile-first layout | Non-goal; must not break on a tablet, which the browser checks already cover | Nothing |

---

## 7. Suggested order and dependencies

```
Data only (no src/ change):   M20 → M21 → M22 → M26 → M27 → M23 → M24 → M25
UI only:                      M28, M29, M30 (any order, any time)
Engine, in dependency order:  M32 (duration) → M33 (N drivers) → M34 (years)
                              M35 (modulation) after M23 if the QBO case is wanted
                              M36 (flavours) independent
                              M37 (impacts) last of the engine set
Roadmap:                      M38 (quiz) after M34 if years are to be quizzed
                              M39 (globe), M40 (importer), M31 (language) when wanted
```

Reasoning for the order:

- **M20 first.** It is the best fit, the most-cited gap in the current
  data (ENSO's second summer), and it exercises the chain the engine
  already has. M21 and M22 follow the same pattern.
- **M26 before M23.** The volcano story is popular in classrooms and needs
  nothing new; the QBO is more abstract.
- **M24 and M25 together** as one matched lesson on contested science,
  after the well-established drivers, so the count of contested links in
  the data does not run ahead of the established ones.
- **M32 before M33 and M34.** Duration is small, self-contained, and the
  year table is much more honest with it (an El Niño that "held" for
  twelve months in 1983 is a real error; the record says it faded in
  June). M33 is mechanical once rule 8 is rewritten in the plural. M34 is
  data plus a small pure function once those two exist.
- **M28 and M29 any time.** They touch no engine rule and can go in
  between drivers when a change of pace is wanted.
- **M37 last** because it changes what the tool is about (weather to
  people) and should be decided with the rest of the map settled.

Each milestone ends as the version-2 ones did: `npm run build:data && npm
test && npm run build` green, a browser check script under
`W:\temp\claude\ClimateConnections\` with PASS/FAIL lines, docs updated,
committed and pushed with the milestone prefix.
