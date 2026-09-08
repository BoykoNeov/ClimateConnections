// Static legend: confidence line styles and state colours per axis.

import { CONFIDENCE_TEXT } from '../types';
import { AXIS_COLORS } from './map';

const AXIS_LABELS: Record<keyof typeof AXIS_COLORS, [string, string]> = {
  wet_dry: ['Wetter', 'Drier'],
  warm_cool: ['Warmer', 'Cooler'],
  active_quiet: ['More active', 'Quieter'],
  high_low: ['Higher', 'Lower'],
  more_less: ['More', 'Less'],
};

function square(color: string): string {
  return `<svg width="14" height="14"><rect x="1.5" y="1.5" width="11" height="11" rx="1.5" fill="${color}"/></svg>`;
}

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
  html += `<p class="legend-note weaker">A line can drop one tier while another driver you chose weakens it (the PDO on ENSO's winter links to North America); the card's "How sure are we?" says which driver and why.</p>`;
  html += `<p class="legend-note kinds">A phase can come in kinds (El Niño: classic, or central Pacific). A kind has its own colour and fires the classic links except the ones its card lists as not expected, plus links of its own; a driver set off along a chain is always drawn in the classic kind.</p>`;
  for (const [axis, colors] of Object.entries(AXIS_COLORS) as Array<[keyof typeof AXIS_COLORS, { plus: string; minus: string }]>) {
    if (axis === 'more_less') continue;
    const [plus, minus] = AXIS_LABELS[axis];
    html += `<div class="legend-row">${dot(colors.plus)}<span>${plus}</span>&nbsp;&nbsp;${dot(colors.minus)}<span>${minus}</span></div>`;
  }
  // Impacts on people (M37): squares, on their own two colours, only with the layer on.
  const [more, less] = AXIS_LABELS.more_less;
  html += `<div class="legend-row impacts">${square(AXIS_COLORS.more_less.plus)}<span>${more}</span>&nbsp;&nbsp;${square(AXIS_COLORS.more_less.minus)}<span>${less}</span>&nbsp;&nbsp;<span>on a square: an impact on people</span></div>`;
  html += `<p class="legend-note impacts">A square is a harvest, a disease season, fires, a river or a catch that tends to follow from the weather the circle beside it shows. It is drawn only with "Impacts on people" on, one tier less surely than that weather, and the map shows only the push from the weather: how much reaches people depends on preparation, prices and policy.</p>`;
  html += `<div class="legend-row"><svg width="14" height="14"><circle cx="7" cy="7" r="6" fill="#fff" stroke="#888" stroke-width="1.5"/></svg><span>No expected effect yet</span></div>`;
  html += `<div class="legend-row"><svg width="14" height="14"><circle cx="7" cy="7" r="6" fill="#2166ac" fill-opacity="0.25" stroke="#2166ac" stroke-width="1.5"/></svg><span>Effect expected, but out of season</span></div>`;
  html += `<div class="legend-row"><svg width="14" height="14"><circle cx="7" cy="7" r="5.5" fill="#e6550d" stroke="#1f2328" stroke-width="1.5" stroke-dasharray="2.5 1.5"/></svg><span>Driver pushed into a phase by another driver</span></div>`;
  html += `<div class="legend-row"><svg width="14" height="14"><defs><pattern id="legend-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="4" fill="#fff"/><rect width="2" height="4" fill="#9a9a9a"/></pattern></defs><circle cx="7" cy="7" r="5.5" fill="url(#legend-hatch)" stroke="#1f2328" stroke-width="1.5" stroke-dasharray="2 2"/></svg><span>Conflicting pushes that cancel out</span></div>`;
  el.innerHTML = html;
  return el;
}
