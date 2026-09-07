// Left panel: phase buttons, start month, confidence filter, legend.

import type { DriverNode } from '../types';
import { MONTH_NAMES } from '../types';
import { renderLegend } from './legend';

export type ConfidenceFilter = 'all' | 'probable' | 'established';

export interface ControlState {
  phaseId: string;
  startMonth: number;
  filter: ConfidenceFilter;
}

export class ControlsView {
  private phaseButtons = new Map<string, HTMLButtonElement>();
  onChange: (s: ControlState) => void = () => {};

  constructor(container: HTMLElement, driver: DriverNode, private state: ControlState) {
    container.innerHTML = '';

    const h1 = document.createElement('h2');
    h1.textContent = driver.name.replace(/\s*\(.*\)$/, '');
    container.append(h1);
    const phases = document.createElement('div');
    phases.className = 'phase-buttons';
    for (const p of driver.phases) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'phase-btn';
      b.innerHTML = `<span class="swatch" style="background:${p.color}"></span><span>${p.label}</span>`;
      b.addEventListener('click', () => this.update({ phaseId: p.id }));
      phases.append(b);
      this.phaseButtons.set(p.id, b);
    }
    container.append(phases);

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
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'El Niño and La Niña events usually start to develop between May and July.';
    container.append(hint);

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

    const h4 = document.createElement('h2');
    h4.textContent = 'Legend';
    container.append(h4);
    container.append(renderLegend());

    this.reflect();
  }

  private update(patch: Partial<ControlState>): void {
    this.state = { ...this.state, ...patch };
    this.reflect();
    this.onChange(this.state);
  }

  private reflect(): void {
    for (const [id, b] of this.phaseButtons) b.setAttribute('aria-pressed', String(id === this.state.phaseId));
  }
}
