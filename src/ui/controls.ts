// Left panel: stories, the real-year picker (M34), the region picker (M28), compare switch (M14), driver
// picker, phase buttons, the other chosen drivers (M11; a list since M33),
// start month, a slot for the season dial (M13), confidence filter, legend.

import type { DriverNode, OutcomeNode, Phase, Story } from '../types';
import { MONTH_NAMES } from '../types';
import { renderLegend } from './legend';

export type ConfidenceFilter = 'all' | 'probable' | 'established';

/** A driver chosen by hand besides the first (M11; any number since M33),
 *  with its own calendar start month (M12; read within the twelve months
 *  shown, or backwards from the first driver's start when `startsBefore` is
 *  set, M15) and its own hold (M32, counted from its own onset). */
export interface OtherDriver {
  driverId: string;
  phaseId: string;
  startMonth: number;
  startsBefore: boolean;
  /** how many months (1–12) it holds its phase; null = the whole year shown */
  hold: number | null;
}

/** Everything that defines one scenario: what the map on one side draws. */
export interface ScenarioSettings {
  driverId: string;
  phaseId: string;
  startMonth: number;
  /** how many months (1–12) the driver holds its phase (M32); null = the whole year shown */
  hold: number | null;
  filter: ConfidenceFilter;
  /** follow links through drivers the scenario driver has pushed (M10) */
  chain: boolean;
  /** every other driver chosen by hand, in the order they were added: the
   *  second driver first (M11), then the third and more (M33). Never the
   *  first driver, never the same driver twice. Empty = one driver. */
  others: OtherDriver[];
}

const ORDINALS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth', 'Eleventh', 'Twelfth', 'Thirteenth', 'Fourteenth', 'Fifteenth', 'Sixteenth'];

/** "First", "Second", ... for a chosen driver's place in the scenario
 *  (1 = the first driver, 2 = the first of `others`). */
export function ordinalWord(n: number): string {
  return ORDINALS[n - 1] ?? `${n}th`;
}

/** The name of the control that sets how long a chosen driver lasts:
 *  "Event lasts" alone, "First driver lasts" / "Second driver lasts" / ...
 *  with more than one driver. `place` is 1 for the first driver. */
export function lastsControl(place: number, total: number): string {
  return total > 1 ? `${ordinalWord(place)} driver lasts` : 'Event lasts';
}

/** The "typical" hold offered for a driver (M32): the middle of its typical
 *  duration range, rounded up, never more than the twelve months shown. */
export function typicalHold(driver: DriverNode): number {
  const [min, max] = driver.typical_duration_months;
  return Math.min(12, Math.ceil((min + max) / 2));
}

/** "8–12 months", "3 months", "the whole year shown or longer" for [12, 12]. */
export function durationWords(driver: DriverNode): string {
  const [min, max] = driver.typical_duration_months;
  if (min === 12 && max === 12) return 'the whole year shown or longer';
  if (min === max) return min === 1 ? 'about a month' : `about ${min} months`;
  return `${min}–${max} months`;
}

/** Calendar month (1–12) `index` months after `startMonth`, for any index. */
function calMonth(startMonth: number, index: number): number {
  return ((((startMonth - 1 + index) % 12) + 12) % 12) + 1;
}

/** The sentence every hold hint ends with: the honest limit of rule 9. */
const MEMORY_NOTE = 'An effect that needs longer to arrive than the event lasts never arrives on this map; in reality the ocean can carry an effect past the end of an event.';

export type Side = 'a' | 'b';

/** Scenario A (the fields inherited from `ScenarioSettings`) plus the settings
 *  shared by both maps and, in compare mode, scenario B. */
export interface ControlState extends ScenarioSettings {
  showAreas: boolean;
  /** name every marker; off, only the markers the scenario reaches this
   *  month (or the selected one) carry their name */
  showAllLabels: boolean;
  /** impacts on people (M37, rule 12): run the impact hop on both sides
   *  and draw the squares. Off by default; a way of looking, like the
   *  areas layer, so switching it ends no story and leaves no year. */
  showImpacts: boolean;
  /** the arrival window (M30, rule 3): draw an applied arrow faint with an
   *  outlined head until the later end of its lag range has passed, on
   *  both sides. Off by default; a way of looking, like the areas layer. */
  showWindow: boolean;
  /** compare mode (M14): a second scenario ("B") drawn beside this one ("A"),
   *  and which of the two the scenario controls edit; null = one map */
  compare: { side: Side; b: ScenarioSettings } | null;
  /** region mode (M28): the outcome node whose incoming links the map shows
   *  instead of a scenario; null = scenario mode. Compare and stories are
   *  off while it is set; the scenario settings are kept but not drawn. */
  region: string | null;
}

/** Scenario A's settings alone. */
export function scenarioSettings(s: ScenarioSettings): ScenarioSettings {
  return { driverId: s.driverId, phaseId: s.phaseId, startMonth: s.startMonth, hold: s.hold, filter: s.filter, chain: s.chain, others: s.others };
}

/** The settings on one side: A, or B in compare mode. */
export function sideSettings(s: ControlState, side: Side): ScenarioSettings {
  return side === 'b' && s.compare ? s.compare.b : scenarioSettings(s);
}

/** The scenario the controls edit right now. */
export function editedSide(s: ControlState): Side {
  return s.compare?.side ?? 'a';
}

/** The phase on the other side of the driver's axis (El Niño -> La Niña);
 *  from neutral, the first phase that is not neutral. The default for a new
 *  scenario B, so the two maps differ from the start. */
export function oppositePhaseId(driver: DriverNode, phaseId: string): string {
  const cur = driver.phases.find((p) => p.id === phaseId);
  const want = cur ? -cur.value : 0;
  // Never a variant (M36): the opposite of a kind of El Niño is La Niña.
  const main = driver.phases.filter((p) => !p.variant_of);
  const opp = want !== 0 ? main.find((p) => p.value === want) : main.find((p) => p.value !== 0);
  return (opp ?? main.find((p) => p.id !== phaseId) ?? driver.phases[0]).id;
}

/** The label of a variant phase with its parent's label trimmed off the
 *  front ("El Niño, central Pacific" under "El Niño" reads "central
 *  Pacific"); the whole label when it does not start that way. */
export function kindLabel(parent: Phase, variant: Phase): string {
  const prefix = `${parent.label}, `;
  return variant.label.startsWith(prefix) ? variant.label.slice(prefix.length) : variant.label;
}

/** The phase buttons of one chosen driver (M36, rule 11): one button per
 *  phase that is not a variant, and beneath them, only while the chosen
 *  phase or its parent has variants, a second row "Which kind of El
 *  Niño?" with "Classic" (the parent) and one button per variant. The
 *  parent's button stays pressed while a variant is chosen. */
class PhasePicker {
  /** the row of main phases; the element the page has always had */
  readonly box: HTMLDivElement;
  /** the row of kinds under it; hidden unless the chosen phase has variants */
  readonly kinds: HTMLDivElement;
  private heading: HTMLParagraphElement;
  private row: HTMLDivElement;
  private buttons = new Map<string, HTMLButtonElement>();
  private kindButtons = new Map<string, HTMLButtonElement>();
  /** driver whose main buttons are in the box ('' = none) */
  private renderedId: string | null = null;
  /** parent phase whose kinds are in the row */
  private kindsFor: string | null = null;

  constructor(private onPick: (phaseId: string) => void) {
    this.box = document.createElement('div');
    this.box.className = 'phase-buttons';
    this.kinds = document.createElement('div');
    this.kinds.className = 'phase-kinds';
    this.kinds.hidden = true;
    this.heading = document.createElement('p');
    this.heading.className = 'hint kinds-heading';
    this.kinds.append(this.heading);
    this.row = document.createElement('div');
    this.row.className = 'phase-buttons kinds-row';
    this.row.setAttribute('role', 'group');
    this.kinds.append(this.row);
  }

  /** Rebuild the main buttons (only when the driver changed); empty when none. */
  private renderMain(driver: DriverNode | null): void {
    if (this.renderedId === (driver?.id ?? '')) return;
    this.renderedId = driver?.id ?? '';
    this.box.innerHTML = '';
    this.buttons.clear();
    if (!driver) return;
    for (const p of driver.phases) {
      if (p.variant_of) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'phase-btn';
      b.innerHTML = `<span class="swatch" style="background:${p.color}"></span><span>${p.label}</span>`;
      b.addEventListener('click', () => this.onPick(p.id));
      this.box.append(b);
      this.buttons.set(p.id, b);
    }
  }

  /** Rebuild the kinds row for a parent phase (only when it changed). */
  private renderKinds(driver: DriverNode, parent: Phase): void {
    const key = `${driver.id}|${parent.id}`;
    if (this.kindsFor === key) return;
    this.kindsFor = key;
    this.row.innerHTML = '';
    this.kindButtons.clear();
    this.heading.textContent = `Which kind of ${parent.label}?`;
    const kinds: [Phase, string][] = [[parent, 'Classic'], ...driver.phases.filter((p) => p.variant_of === parent.id).map((p): [Phase, string] => [p, kindLabel(parent, p)])];
    for (const [p, label] of kinds) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'phase-btn kind-btn';
      b.dataset.kind = p.id;
      b.innerHTML = `<span class="swatch" style="background:${p.color}"></span><span>${label}</span>`;
      b.addEventListener('click', () => this.onPick(p.id));
      this.row.append(b);
      this.kindButtons.set(p.id, b);
    }
  }

  /** Reflect the driver and its chosen phase (null driver = no buttons). */
  render(driver: DriverNode | null, phaseId: string | null): void {
    this.renderMain(driver);
    const phase = driver?.phases.find((p) => p.id === phaseId);
    const parent = driver && phase ? (phase.variant_of ? driver.phases.find((p) => p.id === phase.variant_of) ?? phase : phase) : null;
    for (const [id, b] of this.buttons) b.setAttribute('aria-pressed', String(id === parent?.id));
    const hasKinds = !!driver && !!parent && driver.phases.some((p) => p.variant_of === parent.id);
    this.kinds.hidden = !hasKinds;
    if (!driver || !parent || !hasKinds) { this.kindsFor = null; this.row.innerHTML = ''; this.kindButtons.clear(); return; }
    this.renderKinds(driver, parent);
    for (const [id, b] of this.kindButtons) b.setAttribute('aria-pressed', String(id === phaseId));
  }
}

/** What one row of the other-driver list needs to draw itself. */
interface RowView {
  /** its place in the scenario: 2 for the second driver, 3 for the third, ... */
  place: number;
  /** the row's own settings, or null for the empty "Second driver (optional)" row */
  own: OtherDriver | null;
  /** ids the row's picker must not offer: the first driver and the other rows' drivers */
  taken: string[];
  /** the first driver's start month, for the onset and hold hints */
  startMonth: number;
}

/** One row of the other-driver list (M33): a driver picker with "None",
 *  its phase buttons and, once a driver is picked, its own start month
 *  (M12), before/after the first driver (M15) and its own hold (M32). Row
 *  0 is the "Second driver (optional)" block the page has had since M11;
 *  the rows after it sit behind "More drivers". */
class OtherRow {
  readonly el: HTMLDivElement;
  private heading: HTMLHeadingElement;
  private select: HTMLSelectElement;
  private phases: PhasePicker;
  /** ids the picker's options currently leave out, as a key */
  private optionsFor: string | null = null;
  private monthBox: HTMLDivElement;
  private monthHeading: HTMLHeadingElement;
  private monthSelect: HTMLSelectElement;
  private orderButtons = new Map<'after' | 'before', HTMLButtonElement>();
  private onsetHint: HTMLParagraphElement;
  private holdHeading: HTMLHeadingElement;
  private holdSelect: HTMLSelectElement;
  private holdHint: HTMLParagraphElement;

  constructor(private owner: ControlsView, private index: number) {
    this.el = document.createElement('div');
    this.el.className = 'other-driver';
    this.el.dataset.index = String(index);
    this.heading = document.createElement('h2');
    this.el.append(this.heading);
    this.select = document.createElement('select');
    this.select.dataset.role = 'other-driver';
    this.select.addEventListener('change', () => {
      if (!this.select.value) { this.owner.removeOther(this.index); return; }
      // Like the main driver: first phase, and the month its events usually begin.
      const d = this.owner.driverById(this.select.value);
      this.owner.setOther(this.index, { driverId: d.id, phaseId: d.phases[0].id, startMonth: d.default_start_month, startsBefore: false, hold: null });
    });
    this.el.append(this.select);
    this.phases = new PhasePicker((phaseId) => this.owner.patchOther(this.index, { phaseId }));
    this.el.append(this.phases.box, this.phases.kinds);
    if (index === 0) {
      const hint = document.createElement('p');
      hint.className = 'hint';
      hint.textContent = 'Each driver enters its phase in its own month, after or before the first, and holds it for as long as you set below (the whole year shown unless you say otherwise). Their effects add up: where they push a place opposite ways its marker is hatched and its card says "conflicting". A chosen driver is never pushed by another; choose its neutral phase to hold it out of play. "More drivers" below adds a third and more.';
      this.el.append(hint);
    }

    // The driver's own start month, read within the twelve months shown (a
    // month before the first driver's start falls in the next year) or,
    // with "Before the first driver" (M15), backwards from the start.
    this.monthBox = document.createElement('div');
    this.monthBox.className = 'second-month';
    this.monthBox.hidden = true;
    this.monthHeading = document.createElement('h2');
    this.monthBox.append(this.monthHeading);
    this.monthSelect = document.createElement('select');
    this.monthSelect.dataset.role = 'other-month';
    MONTH_NAMES.forEach((name, i) => {
      const o = document.createElement('option');
      o.value = String(i + 1);
      o.textContent = name;
      this.monthSelect.append(o);
    });
    this.monthSelect.addEventListener('change', () => this.owner.patchOther(this.index, { startMonth: Number(this.monthSelect.value) }));
    this.monthBox.append(this.monthSelect);
    const order = document.createElement('div');
    order.className = 'phase-buttons second-order';
    order.setAttribute('role', 'group');
    for (const [key, label] of [['after', 'After the first driver'], ['before', 'Before the first driver']] as const) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'phase-btn order-btn';
      b.dataset.order = key;
      b.textContent = label;
      b.addEventListener('click', () => this.owner.patchOther(this.index, { startsBefore: key === 'before' }));
      order.append(b);
      this.orderButtons.set(key, b);
    }
    this.monthBox.append(order);
    this.onsetHint = document.createElement('p');
    this.onsetHint.className = 'hint';
    this.monthBox.append(this.onsetHint);
    // The driver's own hold (M32), counted from its own onset.
    this.holdHeading = document.createElement('h2');
    this.monthBox.append(this.holdHeading);
    this.holdSelect = this.owner.makeHoldSelect('');
    this.holdSelect.dataset.role = 'other-hold';
    this.holdSelect.addEventListener('change', () => {
      const own = this.owner.other(this.index);
      if (own) this.owner.patchOther(this.index, { hold: this.owner.holdFromSelect(this.holdSelect, this.owner.driverById(own.driverId)) });
    });
    this.monthBox.append(this.holdSelect);
    this.holdHint = document.createElement('p');
    this.holdHint.className = 'hint';
    this.monthBox.append(this.holdHint);
    this.el.append(this.monthBox);
  }

  /** Rebuild the picker's options: none, then every driver not taken elsewhere. */
  private renderOptions(taken: string[]): void {
    const key = taken.join('|');
    if (this.optionsFor === key) return;
    this.optionsFor = key;
    this.select.innerHTML = '';
    const none = document.createElement('option');
    none.value = '';
    none.textContent = 'None';
    this.select.append(none);
    for (const d of this.owner.drivers) {
      if (taken.includes(d.id)) continue;
      const o = document.createElement('option');
      o.value = d.id;
      o.textContent = d.name.replace(/\s*\(.*\)$/, '');
      this.select.append(o);
    }
  }

  reflect(v: RowView): void {
    const word = ordinalWord(v.place);
    this.heading.textContent = `${word} driver${v.place === 2 ? ' (optional)' : ''}`;
    this.select.setAttribute('aria-label', `Pick a ${word.toLowerCase()} driver phenomenon, or none`);
    this.renderOptions(v.taken);
    const driver = v.own ? this.owner.driverById(v.own.driverId) : null;
    this.select.value = driver?.id ?? '';
    this.phases.render(driver, v.own?.phaseId ?? null);
    this.monthBox.hidden = !driver;
    if (!driver || !v.own) return;
    this.monthHeading.textContent = `${word} driver begins in`;
    this.monthSelect.setAttribute('aria-label', `Calendar month the ${word.toLowerCase()} driver enters its phase`);
    this.monthSelect.value = String(v.own.startMonth);
    for (const [key, b] of this.orderButtons) b.setAttribute('aria-pressed', String((key === 'before') === v.own.startsBefore));
    let when: string;
    if (v.own.startsBefore) {
      // Read backwards (M15): the last time the month came up before the start.
      const back = (v.startMonth - v.own.startMonth + 12) % 12;
      const ago = back === 0 ? 'A year before the first driver' : back === 1 ? 'One month before the first driver' : `${back} months before the first driver${v.own.startMonth > v.startMonth ? ', in the previous year' : ''}`;
      when = `${ago}: already under way when the year shown begins, so its effects can be felt from month 0.`;
    } else {
      const offset = (v.own.startMonth - v.startMonth + 12) % 12;
      when = offset === 0 ? 'Same month as the first driver.' : offset === 1 ? 'One month after the first driver.' : `${offset} months after the first driver${v.own.startMonth < v.startMonth ? ', in the following year' : ''}.`;
    }
    this.onsetHint.textContent = `${when} ${driver.onset_hint}`;
    this.holdHeading.textContent = `${word} driver lasts`;
    this.holdSelect.setAttribute('aria-label', `How many months the ${word.toLowerCase()} driver holds its phase`);
    const after = (v.own.startMonth - v.startMonth + 12) % 12;
    this.owner.reflectHold(this.holdSelect, this.holdHint, driver, v.own.hold, v.startMonth, v.own.startsBefore ? after - 12 : after);
  }
}

export class ControlsView {
  private phases: PhasePicker;
  private driverSelect: HTMLSelectElement | null = null;
  private driverHeading: HTMLHeadingElement;
  /** the other chosen drivers (M11; a list since M33), only with more than
   *  one driver: row 0 in `otherHost`, the rest behind "More drivers" */
  private rows: OtherRow[] = [];
  private otherHost: HTMLDivElement | null = null;
  private moreBox: HTMLDetailsElement | null = null;
  private moreSummary: HTMLElement | null = null;
  private moreHost: HTMLDivElement | null = null;
  private addButton: HTMLButtonElement | null = null;
  private onsetHint: HTMLParagraphElement;
  /** "Event lasts" (M32): heading, picker and hint under the start month */
  private holdHeading: HTMLHeadingElement;
  private holdSelect: HTMLSelectElement;
  private holdHint: HTMLParagraphElement;
  /** empty box under the start-month control for the season dial (M13) */
  readonly dialHost: HTMLDivElement;
  /** driver whose name and onset hint are shown ('' = none yet) */
  private shownDriverId: string | null = null;
  private monthHeading: HTMLHeadingElement;
  private monthSelect: HTMLSelectElement;
  private storySelect: HTMLSelectElement;
  /** real years (M34): the picker, and the lock it puts on the scenario controls */
  private yearSelect: HTMLSelectElement;
  private locked = false;
  /** region mode (M28): the place picker and the box of scenario controls it greys out */
  private regionSelect: HTMLSelectElement;
  private scenarioBox: HTMLDivElement;
  private filterSelect: HTMLSelectElement;
  private chainBox: HTMLInputElement;
  private impactsBox: HTMLInputElement;
  /** the arrival window (M30): the toggle under the Legend heading */
  private windowBox: HTMLInputElement;
  /** compare mode (M14): the switch, and the A/B side buttons shown while it is on */
  private compareBox: HTMLInputElement;
  private sideBox: HTMLDivElement;
  private sideButtons = new Map<Side, HTMLButtonElement>();
  /** live line under the side buttons: how many markers differ this month (set by the page) */
  readonly compareNote: HTMLParagraphElement;
  onChange: (s: ControlState) => void = () => {};
  /** a story was picked from the dropdown (null = "none") */
  onStory: (storyId: string | null) => void = () => {};
  /** a real year was picked from the dropdown (null = "none") (M34) */
  onYear: (year: number | null) => void = () => {};

  constructor(container: HTMLElement, readonly drivers: DriverNode[], stories: Story[], years: number[], regions: OutcomeNode[], private state: ControlState) {
    container.innerHTML = '';

    const hs = document.createElement('h2');
    hs.textContent = 'Stories';
    container.append(hs);
    this.storySelect = document.createElement('select');
    this.storySelect.dataset.role = 'story';
    this.storySelect.setAttribute('aria-label', 'Play a story');
    const none = document.createElement('option');
    none.value = '';
    none.textContent = 'Pick a guided walkthrough…';
    this.storySelect.append(none);
    for (const s of stories) {
      const o = document.createElement('option');
      o.value = s.id;
      o.textContent = s.title;
      this.storySelect.append(o);
    }
    this.storySelect.addEventListener('change', () => this.onStory(this.storySelect.value || null));
    container.append(this.storySelect);
    const hintS = document.createElement('p');
    hintS.className = 'hint';
    hintS.textContent = 'A story sets the scenario and steps through the year, one place at a time.';
    container.append(hintS);

    // Real years (M34): every recorded driver set to the phase the index
    // datasets show for that year, the scenario controls locked until "Edit
    // this scenario" in the year panel frees them.
    const hy = document.createElement('h2');
    hy.textContent = 'Real year';
    container.append(hy);
    this.yearSelect = document.createElement('select');
    this.yearSelect.dataset.role = 'year';
    this.yearSelect.setAttribute('aria-label', 'Show a real year from the record');
    const noYear = document.createElement('option');
    noYear.value = '';
    noYear.textContent = 'Pick a year from the record…';
    this.yearSelect.append(noYear);
    for (const y of years) {
      const o = document.createElement('option');
      o.value = String(y);
      o.textContent = String(y);
      this.yearSelect.append(o);
    }
    this.yearSelect.addEventListener('change', () => this.onYear(this.yearSelect.value ? Number(this.yearSelect.value) : null));
    container.append(this.yearSelect);
    const hintY = document.createElement('p');
    hintY.className = 'hint';
    hintY.textContent = 'Sets every recorded driver to the phase the index datasets show for that year, with its own start and length, and locks the controls below; "Edit this scenario" in the panel on the right frees them. The map then shows the tendencies for those phases, not what happened that year.';
    container.append(hintY);

    // Region mode (M28): pick a place and see every driver that reaches it.
    // No scenario runs; the controls below are greyed out until "None".
    const hr = document.createElement('h2');
    hr.textContent = 'By region';
    container.append(hr);
    this.regionSelect = document.createElement('select');
    this.regionSelect.dataset.role = 'region';
    this.regionSelect.setAttribute('aria-label', 'Pick a place to see every driver that reaches it');
    const noRegion = document.createElement('option');
    noRegion.value = '';
    noRegion.textContent = 'Where I live…';
    this.regionSelect.append(noRegion);
    for (const n of regions) {
      const o = document.createElement('option');
      o.value = n.id;
      o.textContent = `${n.name} · ${n.region}`;
      this.regionSelect.append(o);
    }
    this.regionSelect.addEventListener('change', () => this.update({ region: this.regionSelect.value || null, compare: this.regionSelect.value ? null : this.state.compare }));
    container.append(this.regionSelect);
    const hintR = document.createElement('p');
    hintR.className = 'hint';
    hintR.textContent = 'Every driver known to reach that place, in which phase, in which months and how surely. Nothing is animated: pick "Where I live…" again, or click a driver on the map, to go back to a scenario.';
    container.append(hintR);

    // Everything from here to the legend describes a scenario; region mode
    // greys it out (inert: no clicks, no focus) rather than hiding it, so the
    // panel keeps its shape.
    this.scenarioBox = document.createElement('div');
    this.scenarioBox.className = 'scenario-controls';
    container.append(this.scenarioBox);
    container = this.scenarioBox;

    // Compare mode (M14): two scenarios side by side on one timeline. The
    // scenario controls below edit the side picked here.
    const hc = document.createElement('h2');
    hc.textContent = 'Compare';
    container.append(hc);
    const compareLabel = document.createElement('label');
    compareLabel.className = 'check';
    this.compareBox = document.createElement('input');
    this.compareBox.type = 'checkbox';
    this.compareBox.checked = !!state.compare;
    this.compareBox.addEventListener('change', () => {
      if (!this.compareBox.checked) { this.update({ compare: null }); return; }
      // B starts as a copy of A with the opposite phase, so the maps differ from the start.
      const a = scenarioSettings(this.state);
      this.update({ compare: { side: 'a', b: { ...a, phaseId: oppositePhaseId(this.driverById(a.driverId), a.phaseId) } } });
    });
    compareLabel.append(this.compareBox, document.createTextNode(' Two scenarios side by side'));
    container.append(compareLabel);
    this.sideBox = document.createElement('div');
    this.sideBox.className = 'side-switch';
    this.sideBox.hidden = true;
    for (const side of ['a', 'b'] as Side[]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'side-btn';
      b.dataset.side = side;
      b.innerHTML = `<span class="side-tag">${side.toUpperCase()}</span><span>Edit ${side.toUpperCase()}</span>`;
      b.addEventListener('click', () => { if (this.state.compare) this.update({ compare: { ...this.state.compare, side } }); });
      this.sideBox.append(b);
      this.sideButtons.set(side, b);
    }
    container.append(this.sideBox);
    this.compareNote = document.createElement('p');
    this.compareNote.className = 'hint compare-note';
    this.compareNote.hidden = true;
    container.append(this.compareNote);
    const hintC = document.createElement('p');
    hintC.className = 'hint';
    hintC.textContent = 'Both maps follow the same timeline, month by month after onset. The controls below set the scenario you are editing; the other map keeps its own. B starts as a copy of A with the opposite phase. A dark ring marks a place where the two maps differ this month; click it to read both.';
    container.append(hintC);

    // Driver: a dropdown when there is more than one, otherwise just a heading.
    this.driverHeading = document.createElement('h2');
    container.append(this.driverHeading);
    if (drivers.length > 1) {
      this.driverHeading.textContent = 'Driver';
      const sel = document.createElement('select');
      sel.dataset.role = 'driver';
      sel.setAttribute('aria-label', 'Pick a driver phenomenon');
      for (const d of drivers) {
        const o = document.createElement('option');
        o.value = d.id;
        // Drop the "(ENSO)"-style abbreviation so long names fit the dropdown.
        o.textContent = d.name.replace(/\s*\(.*\)$/, '');
        sel.append(o);
      }
      sel.addEventListener('change', () => {
        // A new driver starts in its first phase and in the month its events
        // usually begin (a winter pattern should not start in June). If it
        // was one of the other chosen drivers, that row goes: no driver twice.
        const d = this.driverById(sel.value);
        const others = this.edited().others.filter((o) => o.driverId !== d.id);
        this.updateScenario({ driverId: d.id, phaseId: d.phases[0].id, startMonth: d.default_start_month, hold: null, others });
      });
      container.append(sel);
      this.driverSelect = sel;
    }
    this.phases = new PhasePicker((phaseId) => this.updateScenario({ phaseId }));
    container.append(this.phases.box, this.phases.kinds);

    // The other chosen drivers (M11; any number since M33), each with a
    // start month of its own (M12). Offered only when there is more than one
    // driver. The second driver's row is always there; the rows after it,
    // and the button that adds one, sit behind "More drivers", closed by
    // default so the page opens as it did with one optional second driver.
    if (drivers.length > 1) {
      this.otherHost = document.createElement('div');
      container.append(this.otherHost);
      this.moreBox = document.createElement('details');
      this.moreBox.className = 'more-drivers';
      this.moreBox.hidden = true;
      this.moreSummary = document.createElement('summary');
      this.moreBox.append(this.moreSummary);
      this.moreHost = document.createElement('div');
      this.moreBox.append(this.moreHost);
      this.addButton = document.createElement('button');
      this.addButton.type = 'button';
      this.addButton.className = 'add-driver';
      this.addButton.textContent = '+ Add a driver';
      this.addButton.addEventListener('click', () => this.addOther());
      this.moreBox.append(this.addButton);
      const hintMore = document.createElement('p');
      hintMore.className = 'hint';
      hintMore.textContent = 'Every driver you add is chosen by hand like the second: its own phase, start month and length, its links at full confidence, never pushed. Three or more pushes on one place still add up and clamp to one step; two against one is drawn as the majority, hatched, and the card lists all of them. There is no order among them beyond their start months.';
      this.moreBox.append(hintMore);
      container.append(this.moreBox);
    }

    const h2 = document.createElement('h2');
    h2.textContent = 'Event begins in';
    container.append(h2);
    this.monthHeading = h2;
    const month = document.createElement('select');
    month.dataset.role = 'month';
    MONTH_NAMES.forEach((name, i) => {
      const o = document.createElement('option');
      o.value = String(i + 1);
      o.textContent = name;
      month.append(o);
    });
    month.value = String(state.startMonth);
    month.addEventListener('change', () => this.updateScenario({ startMonth: Number(month.value) }));
    container.append(month);
    this.monthSelect = month;
    this.onsetHint = document.createElement('p');
    this.onsetHint.className = 'hint';
    container.append(this.onsetHint);

    // Event lasts (M32): how many months the driver holds its phase. The
    // whole year shown is the default and the pre-M32 behaviour; "typical"
    // reads the driver's usual duration from the data.
    this.holdHeading = document.createElement('h2');
    this.holdHeading.textContent = 'Event lasts';
    container.append(this.holdHeading);
    this.holdSelect = this.makeHoldSelect('How many months the driver holds its phase');
    this.holdSelect.dataset.role = 'hold';
    this.holdSelect.addEventListener('change', () => this.updateScenario({ hold: this.holdFromSelect(this.holdSelect, this.driverById(this.edited().driverId)) }));
    container.append(this.holdSelect);
    this.holdHint = document.createElement('p');
    this.holdHint.className = 'hint';
    container.append(this.holdHint);

    // Season dial (M13): the page draws it into this slot.
    const hd = document.createElement('h2');
    hd.textContent = 'Season dial';
    container.append(hd);
    this.dialHost = document.createElement('div');
    container.append(this.dialHost);
    const hintD = document.createElement('p');
    hintD.className = 'hint';
    hintD.textContent = 'The year as a circle: the month shown is filled, the triangle marks where the year shown begins. A connection is only felt in its season, so a month can be in season and still empty while the lag runs. Click a month to jump to it; click a place on the map to see the season of each connection acting on it.';
    container.append(hintD);

    const h3 = document.createElement('h2');
    h3.textContent = 'Show connections';
    container.append(h3);
    const filter = document.createElement('select');
    filter.dataset.role = 'filter';
    for (const [v, label] of [['all', 'All, including contested'], ['probable', 'Probable and established'], ['established', 'Established only']] as const) {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = label;
      filter.append(o);
    }
    filter.value = state.filter;
    filter.addEventListener('change', () => this.updateScenario({ filter: filter.value as ConfidenceFilter }));
    container.append(filter);
    this.filterSelect = filter;
    const hint2 = document.createElement('p');
    hint2.className = 'hint';
    hint2.textContent = 'Hidden connections stay on the map as faint grey lines, so you can see what was left out.';
    container.append(hint2);

    const h35 = document.createElement('h2');
    h35.textContent = 'Map';
    container.append(h35);
    const areaLabel = document.createElement('label');
    areaLabel.className = 'check';
    const areaBox = document.createElement('input');
    areaBox.type = 'checkbox';
    areaBox.checked = state.showAreas;
    areaBox.addEventListener('change', () => this.update({ showAreas: areaBox.checked }));
    areaLabel.append(areaBox, document.createTextNode(' Show affected areas'));
    container.append(areaLabel);
    const hint3 = document.createElement('p');
    hint3.className = 'hint';
    hint3.textContent = 'Rough outlines of the region each point stands for. Illustrative, not exact boundaries.';
    container.append(hint3);
    const chainLabel = document.createElement('label');
    chainLabel.className = 'check';
    this.chainBox = document.createElement('input');
    this.chainBox.type = 'checkbox';
    this.chainBox.checked = state.chain;
    this.chainBox.addEventListener('change', () => this.updateScenario({ chain: this.chainBox.checked }));
    chainLabel.append(this.chainBox, document.createTextNode(' Follow links through other drivers'));
    container.append(chainLabel);
    const hint4 = document.createElement('p');
    hint4.className = 'hint';
    hint4.textContent = 'When this driver pushes another driver into a phase, keep following that driver’s own links. Each extra step lowers the confidence one tier. Off: direct links only.';
    container.append(hint4);
    const labelsLabel = document.createElement('label');
    labelsLabel.className = 'check';
    const labelsBox = document.createElement('input');
    labelsBox.type = 'checkbox';
    labelsBox.checked = state.showAllLabels;
    labelsBox.addEventListener('change', () => this.update({ showAllLabels: labelsBox.checked }));
    labelsLabel.append(labelsBox, document.createTextNode(' Label every region'));
    container.append(labelsLabel);
    const hint5 = document.createElement('p');
    hint5.className = 'hint';
    hint5.textContent = 'Off: only the places this scenario reaches in the month shown keep their name, plus the one you have clicked; the rest stay as circles you can still click.';
    container.append(hint5);
    // Impacts on people (M37): the fifth checkbox, after the labels box so
    // the browser scripts' indices still hold. Off by default.
    const impactsLabel = document.createElement('label');
    impactsLabel.className = 'check';
    this.impactsBox = document.createElement('input');
    this.impactsBox.type = 'checkbox';
    this.impactsBox.checked = state.showImpacts;
    this.impactsBox.addEventListener('change', () => this.update({ showImpacts: this.impactsBox.checked }));
    impactsLabel.append(this.impactsBox, document.createTextNode(' Impacts on people'));
    container.append(impactsLabel);
    const hint6 = document.createElement('p');
    hint6.className = 'hint';
    hint6.textContent = 'Squares beside some places: harvests, disease seasons, fires, rivers and catches that tend to follow from the weather shown, drawn one confidence tier lower and one step further from the driver. How much of this reaches people depends on preparation, prices and policy; the map shows only the push from the weather.';
    container.append(hint6);

    const h4 = document.createElement('h2');
    h4.textContent = 'Legend';
    h4.className = 'print-keep';
    this.scenarioBox.parentElement!.append(h4);
    // The arrival window (M30): the sixth checkbox, under the Legend
    // heading, after "Impacts on people" so the browser scripts' indices
    // still hold. Off by default (rule 15 of docs/PLAN_V3.md).
    const windowLabel = document.createElement('label');
    windowLabel.className = 'check';
    this.windowBox = document.createElement('input');
    this.windowBox.type = 'checkbox';
    this.windowBox.dataset.role = 'window';
    this.windowBox.checked = state.showWindow;
    this.windowBox.addEventListener('change', () => this.update({ showWindow: this.windowBox.checked }));
    windowLabel.append(this.windowBox, document.createTextNode(' Show arrival window'));
    this.scenarioBox.parentElement!.append(windowLabel);
    const hintW = document.createElement('p');
    hintW.className = 'hint';
    hintW.textContent = 'The studies give each connection a range of months for when its effect arrives. The map applies a connection from the earliest month of that range, whether this is on or off; on, an arrow is drawn faint with an outlined head until the latest month has passed, so you can see where the timing is uncertain. The card gives the range either way.';
    this.scenarioBox.parentElement!.append(hintW);
    const legend = renderLegend();
    legend.classList.add('print-keep');
    this.scenarioBox.parentElement!.append(legend);

    this.reflect();
  }

  driverById(id: string): DriverNode {
    const d = this.drivers.find((x) => x.id === id);
    if (!d) throw new Error(`unknown driver ${id}`);
    return d;
  }

  // ---- the other chosen drivers (M33), edited by their rows
  /** The settings of the other driver in row `index`, or null for an empty row. */
  other(index: number): OtherDriver | null {
    return this.edited().others[index] ?? null;
  }

  /** Put a driver in row `index` (appending when the row was empty). */
  setOther(index: number, d: OtherDriver): void {
    const others = [...this.edited().others];
    others[Math.min(index, others.length)] = d;
    this.updateScenario({ others });
  }

  patchOther(index: number, patch: Partial<OtherDriver>): void {
    const own = this.other(index);
    if (own) this.setOther(index, { ...own, ...patch });
  }

  removeOther(index: number): void {
    this.updateScenario({ others: this.edited().others.filter((_, i) => i !== index) });
  }

  /** "Add a driver": the first driver not yet chosen, in its first phase
   *  and its usual start month, appended to the list. */
  private addOther(): void {
    const s = this.edited();
    const taken = new Set([s.driverId, ...s.others.map((o) => o.driverId)]);
    const d = this.drivers.find((x) => !taken.has(x.id));
    if (!d) return;
    if (this.moreBox) this.moreBox.open = true;
    this.updateScenario({ others: [...s.others, { driverId: d.id, phaseId: d.phases[0].id, startMonth: d.default_start_month, startsBefore: false, hold: null }] });
  }

  /** A hold picker (M32): the whole year, the driver's typical length
   *  (its text is filled in by `reflectHold`), then 1–12 months. */
  makeHoldSelect(label: string): HTMLSelectElement {
    const sel = document.createElement('select');
    sel.setAttribute('aria-label', label);
    const whole = document.createElement('option');
    whole.value = '';
    whole.textContent = 'The whole year shown (default)';
    sel.append(whole);
    const typical = document.createElement('option');
    typical.value = 'typical';
    typical.textContent = 'Typical for this driver';
    sel.append(typical);
    for (let n = 1; n <= 12; n++) {
      const o = document.createElement('option');
      o.value = String(n);
      o.textContent = n === 1 ? '1 month' : `${n} months`;
      sel.append(o);
    }
    return sel;
  }

  holdFromSelect(sel: HTMLSelectElement, driver: DriverNode): number | null {
    if (sel.value === '') return null;
    if (sel.value === 'typical') return typicalHold(driver);
    return Number(sel.value);
  }

  /** Reflect a hold in its picker and hint. `onset` is the driver's month
   *  index (0, or another chosen driver's own, possibly negative) so the
   *  hint can name the month the phase ends. */
  reflectHold(sel: HTMLSelectElement, hint: HTMLParagraphElement, driver: DriverNode, hold: number | null, startMonth: number, onset: number): void {
    const typical = typicalHold(driver);
    sel.options[1].textContent = `Typical for this driver (${typical === 1 ? '1 month' : `${typical} months`})`;
    sel.value = hold === null ? '' : hold === typical ? 'typical' : String(hold);
    const name = driver.name.replace(/\s*\(.*\)$/, '');
    const range = `${name} events typically last ${durationWords(driver)}.`;
    if (hold === null) {
      hint.textContent = `${range} Held for the whole year shown. ${MEMORY_NOTE}`;
      return;
    }
    const fade = onset + hold;
    const month = MONTH_NAMES[calMonth(startMonth, fade) - 1];
    const when = fade <= 0
      ? `Over before the year shown begins: it ended in ${month}, so it holds no phase in any month shown and every one of its arrows is drawn faded.`
      : `Fades in ${month}, month ${fade}: from then it holds no phase, its arrows are drawn grey and faded, and they apply nothing.`;
    hint.textContent = `${range} ${when} ${MEMORY_NOTE}`;
  }

  /** The scenario the controls edit: A, or B while compare mode edits B. */
  private edited(): ScenarioSettings {
    return sideSettings(this.state, editedSide(this.state));
  }

  private update(patch: Partial<ControlState>): void {
    this.state = { ...this.state, ...patch };
    this.reflect();
    this.onChange(this.state);
  }

  /** Change the scenario being edited (A, or B in compare mode). */
  private updateScenario(patch: Partial<ScenarioSettings>): void {
    if (this.state.compare?.side === 'b') this.update({ compare: { ...this.state.compare, b: { ...this.state.compare.b, ...patch } } });
    else this.update(patch);
  }

  /** Reflect a state set from outside (a story) without firing onChange.
   *  "More drivers" opens when the scenario has a third driver or more, so
   *  the student can see them, and closes otherwise (a story is a fresh
   *  scenario). */
  setState(patch: Partial<ControlState>): void {
    this.state = { ...this.state, ...patch };
    if (this.moreBox && 'others' in patch) this.moreBox.open = this.edited().others.length >= 2;
    this.reflect();
  }

  /** Reflect which story is playing (null = none) without firing onStory. */
  setStory(storyId: string | null): void {
    this.storySelect.value = storyId ?? '';
  }

  /** Reflect which real year is on show (null = none) without firing onYear (M34). */
  setYear(year: number | null): void {
    this.yearSelect.value = year === null ? '' : String(year);
  }

  /** Lock (grey out, inert) the scenario controls while a real year is on
   *  show (M34); the story, year and region pickers stay live. */
  setLocked(locked: boolean): void {
    this.locked = locked;
    this.reflect();
  }

  /** One row per other chosen driver, at least one (the optional second
   *  driver), the second and later rows behind "More drivers". */
  private reflectOthers(s: ScenarioSettings): void {
    if (!this.otherHost || !this.moreBox || !this.moreSummary || !this.moreHost || !this.addButton) return;
    const want = Math.max(1, s.others.length);
    while (this.rows.length > want) this.rows.pop()!.el.remove();
    while (this.rows.length < want) {
      const row = new OtherRow(this, this.rows.length);
      (this.rows.length === 0 ? this.otherHost : this.moreHost).append(row.el);
      this.rows.push(row);
    }
    const ids = [s.driverId, ...s.others.map((o) => o.driverId)];
    this.rows.forEach((row, i) => row.reflect({
      place: i + 2,
      own: s.others[i] ?? null,
      taken: ids.filter((id) => id !== s.others[i]?.driverId),
      startMonth: s.startMonth,
    }));
    // "More drivers" only once there is a second driver to add to; the
    // button only while a driver is left to add.
    const extra = Math.max(0, s.others.length - 1);
    this.moreBox.hidden = s.others.length === 0;
    this.moreSummary.textContent = extra === 0 ? 'More drivers' : `More drivers (${extra} chosen)`;
    this.addButton.hidden = ids.length >= this.drivers.length;
  }

  /** The phase buttons, name and onset hint for the current driver (the
   *  buttons are rebuilt only when it changed). */
  private renderPhases(driver: DriverNode, phaseId: string): void {
    this.phases.render(driver, phaseId);
    if (this.shownDriverId === driver.id) return;
    this.shownDriverId = driver.id;
    if (!this.driverSelect) this.driverHeading.textContent = driver.name.replace(/\s*\(.*\)$/, '');
    this.onsetHint.textContent = driver.onset_hint;
  }

  private reflect(): void {
    // Region mode (M28) and a real year (M34): the picker, and the scenario
    // controls greyed out.
    this.regionSelect.value = this.state.region ?? '';
    const off = !!this.state.region || this.locked;
    this.scenarioBox.classList.toggle('off', off);
    this.scenarioBox.toggleAttribute('inert', off);
    this.scenarioBox.setAttribute('aria-hidden', String(off));

    // Compare switch and side buttons (M14).
    const compare = this.state.compare;
    this.compareBox.checked = !!compare;
    this.sideBox.hidden = !compare;
    this.compareNote.hidden = !compare;
    for (const [side, b] of this.sideButtons) b.setAttribute('aria-pressed', String(!!compare && compare.side === side));

    const s = this.edited();
    const driver = this.driverById(s.driverId);
    this.renderPhases(driver, s.phaseId);
    if (this.driverSelect) this.driverSelect.value = driver.id;
    if (this.otherHost) {
      this.reflectOthers(s);
      this.monthHeading.textContent = s.others.length > 0 ? 'First driver begins in' : 'Event begins in';
      this.holdHeading.textContent = lastsControl(1, s.others.length + 1);
    }
    this.monthSelect.value = String(s.startMonth);
    this.reflectHold(this.holdSelect, this.holdHint, driver, s.hold, s.startMonth, 0);
    this.filterSelect.value = s.filter;
    this.chainBox.checked = s.chain;
    this.impactsBox.checked = this.state.showImpacts;
    this.windowBox.checked = this.state.showWindow;
  }
}
