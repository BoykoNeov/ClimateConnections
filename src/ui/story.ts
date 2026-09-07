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
  onStep: (story: Story, step: StoryStep, stepIndex: number) => void = () => {};
  onExit: () => void = () => {};

  constructor(private container: HTMLElement, private sources: Map<string, Source>) {
    container.hidden = true;
    container.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
      if (!btn) return;
      if (btn.dataset.act === 'next') this.next();
      else if (btn.dataset.act === 'prev') this.prev();
      else if (btn.dataset.act === 'exit') this.exit();
    });
  }

  get active(): Story | null { return this.story; }

  start(story: Story): void {
    this.story = story;
    this.stepIndex = 0;
    this.apply();
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
    this.container.innerHTML = '';
    this.onExit();
  }

  private apply(): void {
    if (!this.story) return;
    this.render();
    this.onStep(this.story, this.story.steps[this.stepIndex], this.stepIndex);
  }

  private render(): void {
    const story = this.story!;
    const step = story.steps[this.stepIndex];
    const n = story.steps.length;
    const sources = step.sources.map((k) => {
      const s = this.sources.get(k);
      if (!s) return `<li>${esc(k)}</li>`;
      return s.url ? `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.citation)}</a></li>` : `<li>${esc(s.citation)}</li>`;
    });
    this.container.hidden = false;
    this.container.innerHTML = `
      <div class="story-head">
        <span class="story-kicker">Story · step ${this.stepIndex + 1} of ${n}</span>
        <button type="button" data-act="exit" class="story-exit" aria-label="Leave the story">✕ Leave story</button>
      </div>
      <h3>${esc(story.title)}</h3>
      ${this.stepIndex === 0 ? `<p class="story-intro">${esc(story.intro.trim())}</p>` : ''}
      <p class="story-when">${esc(stepWhen(story, step))}</p>
      <p class="story-text">${esc(step.text.trim())}</p>
      <ul class="sources">${sources.join('')}</ul>
      <div class="story-nav">
        <button type="button" data-act="prev" ${this.stepIndex === 0 ? 'disabled' : ''}>◀ Back</button>
        <button type="button" data-act="next" ${this.stepIndex === n - 1 ? 'disabled' : ''}>${this.stepIndex === n - 1 ? 'The end' : 'Next ▶'}</button>
      </div>`;
    // Scroll the side panel (not the page) back to the top of the story.
    if (this.container.parentElement) this.container.parentElement.scrollTop = 0;
  }
}
