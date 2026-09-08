// Story panel: sits above the node card and walks through a story's steps.
// It owns only the step counter; main.ts applies each step to the scenario,
// timeline and selection through onStep.

import type { Source, Story, StoryStep } from '../types';
import { MONTH_NAMES } from '../types';
import { calendarMonth } from '../engine/propagate';

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

/** "December 1997" for a dated story, "December (month 7)" otherwise. */
export function stepWhen(story: Story, step: StoryStep): string {
  const cal = calendarMonth(story.start_month, step.month);
  const name = MONTH_NAMES[cal - 1];
  if (story.start_year === undefined) return `${name}, month ${step.month} after onset`;
  const year = story.start_year + Math.floor((story.start_month - 1 + step.month) / 12);
  return `${name} ${year}`;
}

export class StoryView {
  private story: Story | null = null;
  private stepIndex = 0;
  private resizeTimer = 0;
  onStep: (story: Story, step: StoryStep, stepIndex: number) => void = () => {};
  onExit: () => void = () => {};
  /** "Compare with the record" (M34): open the table's row for the story's year */
  onYear: (year: number) => void = () => {};

  /** `years`: the years the table of real years (M34) covers, for the
   *  "Compare with the record" button on a dated story */
  constructor(private container: HTMLElement, private sources: Map<string, Source>, private years: Set<number> = new Set()) {
    container.hidden = true;
    container.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
      if (!btn) return;
      if (btn.dataset.act === 'next') this.next();
      else if (btn.dataset.act === 'prev') this.prev();
      else if (btn.dataset.act === 'exit') this.exit();
      else if (btn.dataset.act === 'year') this.onYear(Number(btn.dataset.year));
    });
    // A narrower panel wraps the text differently, so the height a story
    // reserved is no longer the right one: measure it again.
    window.addEventListener('resize', () => {
      if (!this.story) return;
      window.clearTimeout(this.resizeTimer);
      this.resizeTimer = window.setTimeout(() => this.fixHeight(), 150);
    });
  }

  get active(): Story | null { return this.story; }

  start(story: Story): void {
    this.story = story;
    this.stepIndex = 0;
    this.apply();
    this.fixHeight();
  }

  next(): void {
    if (!this.story) return;
    if (this.stepIndex >= this.story.steps.length - 1) return;
    this.stepIndex++;
    this.apply();
  }

  prev(): void {
    if (!this.story || this.stepIndex === 0) return;
    this.stepIndex--;
    this.apply();
  }

  exit(): void {
    if (!this.story) return;
    this.story = null;
    this.container.hidden = true;
    this.container.style.minHeight = '';
    this.container.innerHTML = '';
    this.onExit();
  }

  /** Hold one height for the whole story, the tallest of its steps, so that
   *  Back and Next stay in the same place from step to step (the panel is a
   *  column with the buttons at its foot). Steps differ in length — only the
   *  first carries the intro — and without this the buttons rode up and down
   *  under the reader's cursor. Every step is laid out in the panel itself,
   *  at its real width, in one go: nothing is painted in between. */
  private fixHeight(): void {
    const story = this.story;
    if (!story) return;
    const el = this.container;
    const shown = el.innerHTML;
    const live = el.getAttribute('aria-live');
    el.setAttribute('aria-live', 'off');
    el.style.minHeight = '';
    let tallest = 0;
    for (let i = 0; i < story.steps.length; i++) {
      el.innerHTML = this.stepHtml(i);
      tallest = Math.max(tallest, el.offsetHeight);
    }
    el.innerHTML = shown;
    if (live !== null) el.setAttribute('aria-live', live);
    if (tallest > 0) el.style.minHeight = `${tallest}px`;
  }

  private apply(): void {
    if (!this.story) return;
    this.render();
    this.onStep(this.story, this.story.steps[this.stepIndex], this.stepIndex);
  }

  private render(): void {
    this.container.hidden = false;
    this.container.innerHTML = this.stepHtml(this.stepIndex);
    // Scroll the side panel (not the page) back to the top of the story.
    if (this.container.parentElement) this.container.parentElement.scrollTop = 0;
  }

  /** One step's markup. Used for what is on screen and, by `fixHeight`, to
   *  measure the steps that are not. */
  private stepHtml(stepIndex: number): string {
    const story = this.story!;
    const step = story.steps[stepIndex];
    const n = story.steps.length;
    const sources = step.sources.map((k) => {
      const s = this.sources.get(k);
      if (!s) return `<li>${esc(k)}</li>`;
      return s.url ? `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.citation)}</a></li>` : `<li>${esc(s.citation)}</li>`;
    });
    return `
      <div class="story-head">
        <span class="story-kicker">Story · step ${stepIndex + 1} of ${n}</span>
        <button type="button" data-act="exit" class="story-exit" aria-label="Leave the story">✕ Leave story</button>
      </div>
      <h3>${esc(story.title)}</h3>
      ${stepIndex === 0 ? `<p class="story-intro">${esc(story.intro.trim())}</p>` : ''}
      <p class="story-when">${esc(stepWhen(story, step))}</p>
      <p class="story-text">${esc(step.text.trim())}</p>
      <ul class="sources">${sources.join('')}</ul>
      ${story.start_year !== undefined && this.years.has(story.start_year) ? `<p class="story-year"><button type="button" data-act="year" data-year="${story.start_year}">Compare with the record: every driver recorded for ${story.start_year}</button></p>` : ''}
      <div class="story-nav">
        <button type="button" data-act="prev" ${stepIndex === 0 ? 'disabled' : ''}>◀ Back</button>
        <button type="button" data-act="next" ${stepIndex === n - 1 ? 'disabled' : ''}>${stepIndex === n - 1 ? 'The end' : 'Next ▶'}</button>
      </div>`;
  }
}
