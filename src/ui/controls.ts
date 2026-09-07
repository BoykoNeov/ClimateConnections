// Left panel: driver picker, phase buttons, optional second driver (M11),
// start month, confidence filter, legend.

import type { DriverNode, Story } from '../types';
import { MONTH_NAMES } from '../types';
import { renderLegend } from './legend';

export type ConfidenceFilter = 'all' | 'probable' | 'established';

export interface ControlState {
  driverId: string;
  phaseId: string;
  startMonth: number;
  filter: ConfidenceFilter;
  showAreas: boolean;
  /** follow links through drivers the scenario driver has pushed (M10) */
  chain: boolean;
  /** a second driver chosen by hand, entering its phase in the same month (M11); null = none */
  second: { driverId: string; phaseId: string } | null;
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
  private onsetHint: HTMLParagraphElement;
  private monthSelect: HTMLSelectElement;
  private storySelect: HTMLSelectElement;
  /** driver whose phase buttons are currently in the DOM */
  private renderedDriverId: string | null = null;
  onChange: (s: ControlState) => void = () => {};
  /** a story was picked from the dropdown (null = "none") */
  onStory: (storyId: string | null) => void = () => {};

  constructor(container: HTMLElement, private drivers: DriverNode[], stories: Story[], private state: ControlState) {
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
        const second = this.state.second?.driverId === d.id ? null : this.state.second;
        this.update({ driverId: d.id, phaseId: d.phases[0].id, startMonth: d.default_start_month, second });
      });
      container.append(sel);
      this.driverSelect = sel;
    }
    this.phaseBox = document.createElement('div');
    this.phaseBox.className = 'phase-buttons';
    container.append(this.phaseBox);

    // Second driver (M11): optional, chosen by hand, enters its phase in the
    // same month as the first. Offered only when there is more than one driver.
    if (drivers.length > 1) {
      const h2s = document.createElement('h2');
      h2s.textContent = 'Second driver (optional)';
      container.append(h2s);
      const sel2 = document.createElement('select');
      sel2.setAttribute('aria-label', 'Pick a second driver phenomenon, or none');
      sel2.addEventListener('change', () => {
        if (!sel2.value) { this.update({ second: null }); return; }
        const d = this.driverById(sel2.value);
        this.update({ second: { driverId: d.id, phaseId: d.phases[0].id } });
      });
      container.append(sel2);
      this.secondSelect = sel2;
      this.secondBox = document.createElement('div');
      this.secondBox.className = 'phase-buttons';
      container.append(this.secondBox);
      const hint2nd = document.createElement('p');
      hint2nd.className = 'hint';
      hint2nd.textContent = 'Both drivers enter their phase in the month below and hold it all year. Their effects add up: where they push a place opposite ways its marker is hatched and its card says "conflicting". A chosen driver is never pushed by the other; choose its neutral phase to hold it out of play.';
      container.append(hint2nd);
    }

    const h2 = document.createElement('h2');
    h2.textContent = 'Event begins in';
    container.append(h2);
    const month = document.createElement('select');
    MONTH_NAMES.forEach((name, i) => {
      const o = document.createElement('option');
      o.value = String(i + 1);
      o.textContent = name;
      month.append(o);
    });
    month.value = String(state.startMonth);
    month.addEventListener('change', () => this.update({ startMonth: Number(month.value) }));
    container.append(month);
    this.monthSelect = month;
    this.onsetHint = document.createElement('p');
    this.onsetHint.className = 'hint';
    container.append(this.onsetHint);

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
    filter.addEventListener('change', () => this.update({ filter: filter.value as ConfidenceFilter }));
    container.append(filter);
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
    const chainBox = document.createElement('input');
    chainBox.type = 'checkbox';
    chainBox.checked = state.chain;
    chainBox.addEventListener('change', () => this.update({ chain: chainBox.checked }));
    chainLabel.append(chainBox, document.createTextNode(' Follow links through other drivers'));
    container.append(chainLabel);
    const hint4 = document.createElement('p');
    hint4.className = 'hint';
    hint4.textContent = 'When this driver pushes another driver into a phase, keep following that driver\u2019s own links. Each extra step lowers the confidence one tier. Off: direct links only.';
    container.append(hint4);

    const h4 = document.createElement('h2');
    h4.textContent = 'Legend';
    h4.className = 'print-keep';
    container.append(h4);
    const legend = renderLegend();
    legend.classList.add('print-keep');
    container.append(legend);

    this.reflect();
  }

  private driverById(id: string): DriverNode {
    const d = this.drivers.find((x) => x.id === id);
    if (!d) throw new Error(`unknown driver ${id}`);
    return d;
  }

  private update(patch: Partial<ControlState>): void {
    this.state = { ...this.state, ...patch };
    this.reflect();
    this.onChange(this.state);
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
      b.addEventListener('click', () => this.update({ second: { driverId: driver.id, phaseId: p.id } }));
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
      b.addEventListener('click', () => this.update({ phaseId: p.id }));
      this.phaseBox.append(b);
      this.phaseButtons.set(p.id, b);
    }
    if (!this.driverSelect) this.driverHeading.textContent = driver.name.replace(/\s*\(.*\)$/, '');
    this.onsetHint.textContent = driver.onset_hint;
  }

  private reflect(): void {
    const driver = this.driverById(this.state.driverId);
    this.renderPhases(driver);
    if (this.driverSelect) this.driverSelect.value = driver.id;
    for (const [id, b] of this.phaseButtons) b.setAttribute('aria-pressed', String(id === this.state.phaseId));
    if (this.secondSelect) {
      this.renderSecondOptions(driver.id);
      const second = this.state.second ? this.driverById(this.state.second.driverId) : null;
      this.secondSelect.value = second?.id ?? '';
      this.renderSecondPhases(second);
      for (const [id, b] of this.secondPhaseButtons) b.setAttribute('aria-pressed', String(id === this.state.second?.phaseId));
    }
    this.monthSelect.value = String(this.state.startMonth);
  }
}
