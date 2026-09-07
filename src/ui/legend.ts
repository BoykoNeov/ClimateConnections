// Static legend: confidence line styles and state colours per axis.

import { CONFIDENCE_TEXT } from '../types';
import { AXIS_COLORS } from './map';

const AXIS_LABELS: Record<keyof typeof AXIS_COLORS, [string, string]> = {
  wet_dry: ['Wetter', 'Drier'],
  warm_cool: ['Warmer', 'Cooler'],
  active_quiet: ['More active', 'Quieter'],
  high_low: ['Higher', 'Lower'],
};

function line(cls: string): string {
  const dash = cls === 'probable' ? 'stroke-dasharray="7 5"' : cls === 'contested' ? 'stroke-dasharray="1.5 4"' : '';
  const w = cls === 'established' ? 2.6 : cls === 'probable' ? 2.1 : 1.6;
  return `<svg width="44" height="10"><line x1="1" y1="5" x2="43" y2="5" stroke="#444" stroke-width="${w}" stroke-linecap="round" ${dash}/></svg>`;
}

function dot(color: string): string {
  return `<svg width="14" height="14"><circle cx="7" cy="7" r="6" fill="${color}"/></svg>`;
}

export function renderLegend(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'legend';
  let html = '';
  for (const c of ['established', 'probable', 'contested'] as const) {
    html += `<div class="legend-row">${line(c)}<span><strong>${c[0].toUpperCase() + c.slice(1)}</strong></span></div>`;
    html += `<p class="legend-note">${CONFIDENCE_TEXT[c]}</p>`;
  }
  for (const [axis, colors] of Object.entries(AXIS_COLORS) as Array<[keyof typeof AXIS_COLORS, { plus: string; minus: string }]>) {
    const [plus, minus] = AXIS_LABELS[axis];
    html += `<div class="legend-row">${dot(colors.plus)}<span>${plus}</span>&nbsp;&nbsp;${dot(colors.minus)}<span>${minus}</span></div>`;
  }
  html += `<div class="legend-row"><svg width="14" height="14"><circle cx="7" cy="7" r="6" fill="#fff" stroke="#888" stroke-width="1.5"/></svg><span>No expected effect yet</span></div>`;
  html += `<div class="legend-row"><svg width="14" height="14"><circle cx="7" cy="7" r="6" fill="#2166ac" fill-opacity="0.25" stroke="#2166ac" stroke-width="1.5"/></svg><span>Effect expected, but out of season</span></div>`;
  html += `<div class="legend-row"><svg width="14" height="14"><circle cx="7" cy="7" r="5.5" fill="#e6550d" stroke="#1f2328" stroke-width="1.5" stroke-dasharray="2.5 1.5"/></svg><span>Driver pushed into a phase by another driver</span></div>`;
  el.innerHTML = html;
  return el;
}
