// Left panel: stories, the region picker (M28), compare switch (M14), driver
// picker, phase buttons, optional second driver (M11), start month, a slot
// for the season dial (M13), confidence filter, legend.

import type { DriverNode, OutcomeNode, Story } from '../types';
import { MONTH_NAMES } from '../types';
import { renderLegend } from './legend';

export type ConfidenceFilter = 'all' | 'probable' | 'established';

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
  /** a second driver chosen by hand (M11) with its own calendar start month
   *  (M12; read within the twelve months shown, or backwards from the first
   *  driver's start when `startsBefore` is set, M15) and its own hold
   *  (M32, counted from its own onset); null = none */
  second: { driverId: string; phaseId: string; startMonth: number; startsBefore: boolean; hold: number | null } | null;
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
  return { driverId: s.driverId, phaseId: s.phaseId, startMonth: s.startMonth, hold: s.hold, filter: s.filter, chain: s.chain, second: s.second };
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
  const opp = want !== 0 ? driver.phases.find((p) => p.value === want) : driver.phases.find((p) => p.value !== 0);
  return (opp ?? driver.phases.find((p) => p.id !== phaseId) ?? driver.phases[0]).id;
}

export class ControlsView {
  private phaseButtons = new Map<string, HTMLButtonElement>();
  private phaseBox: HTMLDivElement;
  private driverSelect: HTMLSelectElement | null = null;
  private driverHeading: HTMLHeadingElement;
  /** second-driver picker and its phase buttons (only with more than one driver) */
  private secondSelect: HTMLSelectElement | null = null;
  private secondBox: HTMLDivElement | null = null;
  private secondPhaseButtons = new Map<string, HTMLButtonElement>();
  /** driver whose options the second-driver picker currently excludes */
  private secondOptionsFor: string | null = null;
  /** driver whose phase buttons are in the second box ('' = none) */
  private renderedSecondId: string | null = null;
  /** the second driver's own start month (M12): heading, picker and hint, shown only with a second driver */
  private secondMonthBox: HTMLDivElement | null = null;
  private secondMonthSelect: HTMLSelectElement | null = null;
  /** before / after the first driver (M15) */
  private orderButtons = new Map<'after' | 'before', HTMLButtonElement>();
  private secondOnsetHint: HTMLParagraphElement | null = null;
  /** the second driver's own hold (M32), in the same box */
  private secondHoldSelect: HTMLSelectElement | null = null;
  private secondHoldHint: HTMLParagraphElement | null = null;
  private onsetHint: HTMLParagraphElement;
  /** "Event lasts" (M32): heading, picker and hint under the start month */
  private holdHeading: HTMLHeadingElement;
  private holdSelect: HTMLSelectElement;
  private holdHint: HTMLParagraphElement;
  /** empty box under the start-month control for the season dial (M13) */
  readonly dialHost: HTMLDivElement;
  private monthHeading: HTMLHeadingElement;
  private monthSelect: HTMLSelectElement;
  private storySelect: HTMLSelectElement;
  /** region mode (M28): the place picker and the box of scenario controls it greys out */
  private regionSelect: HTMLSelectElement;
  private scenarioBox: HTMLDivElement;
  private filterSelect: HTMLSelectElement;
  private chainBox: HTMLInputElement;
  /** compare mode (M14): the switch, and the A/B side buttons shown while it is on */
  private compareBox: HTMLInputElement;
  private sideBox: HTMLDivElement;
  private sideButtons = new Map<Side, HTMLButtonElement>();
  /** live line under the side buttons: how many markers differ this month (set by the page) */
  readonly compareNote: HTMLParagraphElement;
  /** driver whose phase buttons are currently in the DOM */
  private renderedDriverId: string | null = null;
  onChange: (s: ControlState) => void = () => {};
  /** a story was picked from the dropdown (null = "none") */
  onStory: (storyId: string | null) => void = () => {};

  constructor(container: HTMLElement, private drivers: DriverNode[], stories: Story[], regions: OutcomeNode[], private state: ControlState) {
    container.innerHTML = '';

    const hs = document.createElement('h2');
    hs.textContent = 'Stories';
    container.append(hs);
    this.storySelect = document.createElement('select');
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

    // Region mode (M28): pick a place and see every driver that reaches it.
    // No scenario runs; the controls below are greyed out until "None".
    const hr = document.createElement('h2');
    hr.textContent = 'By region';
    container.append(hr);
    this.regionSelect = document.createElement('select');
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
        // was the second driver, the second slot empties: no driver twice.
        const d = this.driverById(sel.value);
        const second = this.edited().second?.driverId === d.id ? null : this.edited().second;
        this.updateScenario({ driverId: d.id, phaseId: d.phases[0].id, startMonth: d.default_start_month, hold: null, second });
      });
      container.append(sel);
      this.driverSelect = sel;
    }
    this.phaseBox = document.createElement('div');
    this.phaseBox.className = 'phase-buttons';
    container.append(this.phaseBox);

    // Second driver (M11): optional, chosen by hand, with a start month of its
    // own (M12). Offered only when there is more than one driver.
    if (drivers.length > 1) {
      const h2s = document.createElement('h2');
      h2s.textContent = 'Second driver (optional)';
      container.append(h2s);
      const sel2 = document.createElement('select');
      sel2.setAttribute('aria-label', 'Pick a second driver phenomenon, or none');
      sel2.addEventListener('change', () => {
        if (!sel2.value) { this.updateScenario({ second: null }); return; }
        // Like the main driver: first phase, and the month its events usually begin.
        const d = this.driverById(sel2.value);
        this.updateScenario({ second: { driverId: d.id, phaseId: d.phases[0].id, startMonth: d.default_start_month, startsBefore: false, hold: null } });
      });
      container.append(sel2);
      this.secondSelect = sel2;
      this.secondBox = document.createElement('div');
      this.secondBox.className = 'phase-buttons';
      container.append(this.secondBox);
      const hint2nd = document.createElement('p');
      hint2nd.className = 'hint';
      hint2nd.textContent = 'Each driver enters its phase in its own month, after or before the first, and holds it for as long as you set below (the whole year shown unless you say otherwise). Their effects add up: where they push a place opposite ways its marker is hatched and its card says "conflicting". A chosen driver is never pushed by the other; choose its neutral phase to hold it out of play.';
      container.append(hint2nd);

      // The second driver's own start month, read within the twelve months
      // shown (a month before the first driver's start falls in the next year)
      // or, with "Before the first driver" (M15), backwards from the start.
      const box2 = document.createElement('div');
      box2.className = 'second-month';
      box2.hidden = true;
      const h2m = document.createElement('h2');
      h2m.textContent = 'Second driver begins in';
      box2.append(h2m);
      const month2 = document.createElement('select');
      month2.setAttribute('aria-label', 'Calendar month the second driver enters its phase');
      MONTH_NAMES.forEach((name, i) => {
        const o = document.createElement('option');
        o.value = String(i + 1);
        o.textContent = name;
        month2.append(o);
      });
      month2.addEventListener('change', () => {
        const second = this.edited().second;
        if (!second) return;
        this.updateScenario({ second: { ...second, startMonth: Number(month2.value) } });
      });
      box2.append(month2);
      this.secondMonthSelect = month2;
      const order = document.createElement('div');
      order.className = 'phase-buttons second-order';
      order.setAttribute('role', 'group');
      order.setAttribute('aria-label', 'Does the second driver begin after or before the first?');
      for (const [key, label] of [['after', 'After the first driver'], ['before', 'Before the first driver']] as const) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'phase-btn order-btn';
        b.dataset.order = key;
        b.textContent = label;
        b.addEventListener('click', () => {
          const second = this.edited().second;
          if (!second) return;
          this.updateScenario({ second: { ...second, startsBefore: key === 'before' } });
        });
        order.append(b);
        this.orderButtons.set(key, b);
      }
      box2.append(order);
      this.secondOnsetHint = document.createElement('p');
      this.secondOnsetHint.className = 'hint';
      box2.append(this.secondOnsetHint);
      // The second driver's own hold (M32), counted from its own onset.
      const h2h = document.createElement('h2');
      h2h.textContent = 'Second driver lasts';
      box2.append(h2h);
      const hold2 = this.makeHoldSelect('How many months the second driver holds its phase');
      hold2.addEventListener('change', () => {
        const second = this.edited().second;
        if (!second) return;
        this.updateScenario({ second: { ...second, hold: this.holdFromSelect(hold2, this.driverById(second.driverId)) } });
      });
      box2.append(hold2);
      this.secondHoldSelect = hold2;
      this.secondHoldHint = document.createElement('p');
      this.secondHoldHint.className = 'hint';
      box2.append(this.secondHoldHint);
      container.append(box2);
      this.secondMonthBox = box2;
    }

    const h2 = document.createElement('h2');
    h2.textContent = 'Event begins in';
    container.append(h2);
    this.monthHeading = h2;
    const month = document.createElement('select');
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

    const h4 = document.createElement('h2');
    h4.textContent = 'Legend';
    h4.className = 'print-keep';
    this.scenarioBox.parentElement!.append(h4);
    const legend = renderLegend();
    legend.classList.add('print-keep');
    this.scenarioBox.parentElement!.append(legend);

    this.reflect();
  }

  private driverById(id: string): DriverNode {
    const d = this.drivers.find((x) => x.id === id);
    if (!d) throw new Error(`unknown driver ${id}`);
    return d;
  }

  /** A hold picker (M32): the whole year, the driver's typical length
   *  (its text is filled in by `reflectHold`), then 1–12 months. */
  private makeHoldSelect(label: string): HTMLSelectElement {
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

  private holdFromSelect(sel: HTMLSelectElement, driver: DriverNode): number | null {
    if (sel.value === '') return null;
    if (sel.value === 'typical') return typicalHold(driver);
    return Number(sel.value);
  }

  /** Reflect a hold in its picker and hint. `onset` is the driver's month
   *  index (0, or the second driver's own, possibly negative) so the hint
   *  can name the month the phase ends. */
  private reflectHold(sel: HTMLSelectElement, hint: HTMLParagraphElement, driver: DriverNode, hold: number | null, startMonth: number, onset: number): void {
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

  /** Reflect a state set from outside (a story) without firing onChange. */
  setState(patch: Partial<ControlState>): void {
    this.state = { ...this.state, ...patch };
    this.reflect();
  }

  /** Reflect which story is playing (null = none) without firing onStory. */
  setStory(storyId: string | null): void {
    this.storySelect.value = storyId ?? '';
  }

  /** Rebuild the second-driver picker's options: none, then every driver but the main one. */
  private renderSecondOptions(mainId: string): void {
    if (!this.secondSelect || this.secondOptionsFor === mainId) return;
    this.secondOptionsFor = mainId;
    this.secondSelect.innerHTML = '';
    const none = document.createElement('option');
    none.value = '';
    none.textContent = 'None';
    this.secondSelect.append(none);
    for (const d of this.drivers) {
      if (d.id === mainId) continue;
      const o = document.createElement('option');
      o.value = d.id;
      o.textContent = d.name.replace(/\s*\(.*\)$/, '');
      this.secondSelect.append(o);
    }
  }

  /** Rebuild the second driver's phase buttons (only when it changed); empty when none. */
  private renderSecondPhases(driver: DriverNode | null): void {
    if (!this.secondBox || this.renderedSecondId === (driver?.id ?? '')) return;
    this.renderedSecondId = driver?.id ?? '';
    this.secondBox.innerHTML = '';
    this.secondPhaseButtons.clear();
    if (!driver) return;
    for (const p of driver.phases) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'phase-btn';
      b.innerHTML = `<span class="swatch" style="background:${p.color}"></span><span>${p.label}</span>`;
      b.addEventListener('click', () => {
        const cur = this.edited().second;
        this.updateScenario({ second: { driverId: driver.id, phaseId: p.id, startMonth: cur?.startMonth ?? driver.default_start_month, startsBefore: cur?.startsBefore ?? false, hold: cur?.hold ?? null } });
      });
      this.secondBox.append(b);
      this.secondPhaseButtons.set(p.id, b);
    }
  }

  /** Rebuild the phase buttons for the current driver (only when it changed). */
  private renderPhases(driver: DriverNode): void {
    if (this.renderedDriverId === driver.id) return;
    this.renderedDriverId = driver.id;
    this.phaseBox.innerHTML = '';
    this.phaseButtons.clear();
    for (const p of driver.phases) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'phase-btn';
      b.innerHTML = `<span class="swatch" style="background:${p.color}"></span><span>${p.label}</span>`;
      b.addEventListener('click', () => this.updateScenario({ phaseId: p.id }));
      this.phaseBox.append(b);
      this.phaseButtons.set(p.id, b);
    }
    if (!this.driverSelect) this.driverHeading.textContent = driver.name.replace(/\s*\(.*\)$/, '');
    this.onsetHint.textContent = driver.onset_hint;
  }

  private reflect(): void {
    // Region mode (M28): the picker, and the scenario controls greyed out.
    this.regionSelect.value = this.state.region ?? '';
    this.scenarioBox.classList.toggle('off', !!this.state.region);
    this.scenarioBox.toggleAttribute('inert', !!this.state.region);
    this.scenarioBox.setAttribute('aria-hidden', String(!!this.state.region));

    // Compare switch and side buttons (M14).
    const compare = this.state.compare;
    this.compareBox.checked = !!compare;
    this.sideBox.hidden = !compare;
    this.compareNote.hidden = !compare;
    for (const [side, b] of this.sideButtons) b.setAttribute('aria-pressed', String(!!compare && compare.side === side));

    const s = this.edited();
    const driver = this.driverById(s.driverId);
    this.renderPhases(driver);
    if (this.driverSelect) this.driverSelect.value = driver.id;
    for (const [id, b] of this.phaseButtons) b.setAttribute('aria-pressed', String(id === s.phaseId));
    if (this.secondSelect) {
      this.renderSecondOptions(driver.id);
      const second = s.second ? this.driverById(s.second.driverId) : null;
      this.secondSelect.value = second?.id ?? '';
      this.renderSecondPhases(second);
      for (const [id, b] of this.secondPhaseButtons) b.setAttribute('aria-pressed', String(id === s.second?.phaseId));
      // The second driver's own start month (M12), only while one is chosen.
      if (this.secondMonthBox && this.secondMonthSelect && this.secondOnsetHint) {
        this.secondMonthBox.hidden = !second;
        if (second && s.second) {
          this.secondMonthSelect.value = String(s.second.startMonth);
          for (const [key, b] of this.orderButtons) b.setAttribute('aria-pressed', String((key === 'before') === s.second.startsBefore));
          let when: string;
          if (s.second.startsBefore) {
            // Read backwards (M15): the last time the month came up before the start.
            const back = (s.startMonth - s.second.startMonth + 12) % 12;
            const ago = back === 0 ? 'A year before the first driver' : back === 1 ? 'One month before the first driver' : `${back} months before the first driver${s.second.startMonth > s.startMonth ? ', in the previous year' : ''}`;
            when = `${ago}: already under way when the year shown begins, so its effects can be felt from month 0.`;
          } else {
            const offset = (s.second.startMonth - s.startMonth + 12) % 12;
            when = offset === 0 ? 'Same month as the first driver.' : offset === 1 ? 'One month after the first driver.' : `${offset} months after the first driver${s.second.startMonth < s.startMonth ? ', in the following year' : ''}.`;
          }
          this.secondOnsetHint.textContent = `${when} ${second.onset_hint}`;
          if (this.secondHoldSelect && this.secondHoldHint) {
            const after = (s.second.startMonth - s.startMonth + 12) % 12;
            this.reflectHold(this.secondHoldSelect, this.secondHoldHint, second, s.second.hold, s.startMonth, s.second.startsBefore ? after - 12 : after);
          }
        }
      }
      this.monthHeading.textContent = second ? 'First driver begins in' : 'Event begins in';
      this.holdHeading.textContent = second ? 'First driver lasts' : 'Event lasts';
    }
    this.monthSelect.value = String(s.startMonth);
    this.reflectHold(this.holdSelect, this.holdHint, driver, s.hold, s.startMonth, 0);
    this.filterSelect.value = s.filter;
    this.chainBox.checked = s.chain;
  }
}
