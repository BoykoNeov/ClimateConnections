// Timeline scrubber with play/pause. Emits month index changes.

import { MONTH_NAMES } from '../types';
import { calendarMonth } from '../engine/propagate';

export class TimelineView {
  private input: HTMLInputElement;
  private button: HTMLButtonElement;
  private ticks: HTMLDivElement;
  private timer: number | null = null;
  private horizon: number;
  onChange: (index: number) => void = () => {};

  constructor(container: HTMLElement, horizon: number, private startMonth: number) {
    this.horizon = horizon;
    container.innerHTML = '';
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.textContent = '▶ Play';
    this.button.addEventListener('click', () => (this.timer ? this.pause() : this.play()));
    const scrub = document.createElement('div');
    scrub.className = 'scrubber';
    this.input = document.createElement('input');
    this.input.type = 'range';
    this.input.min = '0';
    this.input.max = String(horizon);
    this.input.step = '1';
    this.input.value = '0';
    this.input.setAttribute('aria-label', 'Month since onset');
    this.input.addEventListener('input', () => {
      this.pause();
      this.onChange(this.index);
    });
    this.ticks = document.createElement('div');
    this.ticks.className = 'ticks';
    scrub.append(this.input, this.ticks);
    container.append(this.button, scrub);
    this.renderTicks();
    document.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'ArrowRight') this.set(Math.min(this.horizon, this.index + 1));
      else if (e.key === 'ArrowLeft') this.set(Math.max(0, this.index - 1));
      else if (e.key === ' ') { e.preventDefault(); this.timer ? this.pause() : this.play(); }
    });
  }

  get index(): number { return Number(this.input.value); }

  setStartMonth(m: number): void {
    this.startMonth = m;
    this.renderTicks();
  }

  private renderTicks(): void {
    this.ticks.innerHTML = '';
    for (let i = 0; i <= this.horizon; i++) {
      const s = document.createElement('span');
      s.textContent = MONTH_NAMES[calendarMonth(this.startMonth, i) - 1].slice(0, 3);
      this.ticks.append(s);
    }
  }

  set(index: number): void {
    this.input.value = String(index);
    this.onChange(index);
  }

  play(): void {
    if (this.index >= this.horizon) this.set(0);
    this.button.textContent = '❚❚ Pause';
    this.timer = window.setInterval(() => {
      if (this.index >= this.horizon) { this.pause(); return; }
      this.set(this.index + 1);
    }, 1200);
  }

  pause(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.button.textContent = '▶ Play';
  }
}
