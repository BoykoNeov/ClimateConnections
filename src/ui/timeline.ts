// Timeline scrubber with play/pause. Emits month index changes.

import { MONTH_NAMES } from '../types';
import { calendarMonth } from '../engine/propagate';

export class TimelineView {
  private input: HTMLInputElement;
  private button: HTMLButtonElement;
  private ticks: HTMLDivElement;
  private timer: number | null = null;
  private horizon: number;
  /** month index at which a second driver enters its phase (M12), negative
   *  when it began before the first (M15); null = none or month 0 */
  private secondOnset: number | null = null;
  onChange: (index: number) => void = () => {};

  constructor(container: HTMLElement, horizon: number, private startMonth: number) {
    this.horizon = horizon;
    container.innerHTML = '';
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.textContent = '▶ Play';
    this.button.setAttribute('aria-label', 'Play or pause the twelve-month animation');
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
    this.input.setAttribute('aria-valuemin', '0');
    this.input.setAttribute('aria-valuemax', String(horizon));
    this.input.addEventListener('input', () => {
      this.pause();
      this.input.setAttribute('aria-valuetext', this.valueText(this.index));
      this.onChange(this.index);
    });
    // The range input handles arrow keys natively; keep Space consistent
    // with the rest of the page while it has focus.
    this.input.addEventListener('keydown', (e) => {
      if (e.key === ' ') { e.preventDefault(); this.timer ? this.pause() : this.play(); }
    });
    this.ticks = document.createElement('div');
    this.ticks.className = 'ticks';
    scrub.append(this.input, this.ticks);
    const hint = document.createElement('p');
    hint.className = 'key-hint';
    hint.innerHTML = '<kbd>←</kbd><kbd>→</kbd> step a month &nbsp; <kbd>Space</kbd> play / pause &nbsp; <kbd>Home</kbd><kbd>End</kbd> first / last month';
    scrub.append(hint);
    container.append(this.button, scrub);
    this.renderTicks();
  }

  /**
   * Keyboard control of the scrubber. Returns true when the key was used.
   * The page installs the document-level listener so it can decide who gets
   * the keys (a playing story takes the arrows for its own steps).
   */
  handleKey(e: KeyboardEvent): boolean {
    switch (e.key) {
      case 'ArrowRight': case 'ArrowUp': this.pause(); this.set(Math.min(this.horizon, this.index + 1)); return true;
      case 'ArrowLeft': case 'ArrowDown': this.pause(); this.set(Math.max(0, this.index - 1)); return true;
      case 'Home': this.pause(); this.set(0); return true;
      case 'End': this.pause(); this.set(this.horizon); return true;
      case ' ': this.timer ? this.pause() : this.play(); return true;
      default: return false;
    }
  }

  get index(): number { return Number(this.input.value); }

  setStartMonth(m: number): void {
    this.startMonth = m;
    this.renderTicks();
    this.input.setAttribute('aria-valuetext', this.valueText(this.index));
  }

  /** Mark the tick where a second driver enters its phase (null or 0 = no
   *  mark). A negative index (M15) marks the first tick instead: the driver
   *  was already under way when the year shown began. */
  setSecondOnset(index: number | null): void {
    this.secondOnset = index && index !== 0 ? index : null;
    this.renderTicks();
  }

  private renderTicks(): void {
    this.ticks.innerHTML = '';
    for (let i = 0; i <= this.horizon; i++) {
      const s = document.createElement('span');
      s.textContent = MONTH_NAMES[calendarMonth(this.startMonth, i) - 1].slice(0, 3);
      if (i === this.secondOnset) {
        s.className = 'second-onset';
        s.title = 'The second driver enters its phase here';
      } else if (i === 0 && this.secondOnset !== null && this.secondOnset < 0) {
        const ago = -this.secondOnset;
        s.className = 'second-before';
        s.title = `The second driver entered its phase ${ago === 1 ? 'a month' : `${ago} months`} before this and is already under way`;
      }
      this.ticks.append(s);
    }
  }

  set(index: number): void {
    this.input.value = String(index);
    this.input.setAttribute('aria-valuetext', this.valueText(index));
    this.onChange(index);
  }

  private valueText(index: number): string {
    return `${MONTH_NAMES[calendarMonth(this.startMonth, index) - 1]}, month ${index} after onset`;
  }

  /** Move the scrubber without firing onChange (caller redraws). */
  setIndex(index: number): void {
    this.input.value = String(index);
    this.input.setAttribute('aria-valuetext', this.valueText(index));
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
