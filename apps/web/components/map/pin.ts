import type { AgencyListingPin } from '@bongah/shared-types';
import { DEAL_COLOR } from '@/lib/labels';
import { tNow } from '@/i18n/active';

const SOLD = '#9CA3AF';
const GOLD = '#F59E0B';

/** Fill colour of a listing's marker: its deal's colour, grey once sold. */
export function pinColor(p: Pick<AgencyListingPin, 'deal_type' | 'status'>): string {
  return p.status === 'SOLD' ? SOLD : DEAL_COLOR[p.deal_type].main;
}

/**
 * A listing's marker element: a drop in the deal's colour, a gold ring when it is featured, grey when sold, bigger when
 * selected. Built from fixed markup (nothing from the listing is put into HTML); the title goes in as text attributes.
 */
export function pinElement(p: AgencyListingPin, selected: boolean): HTMLElement {
  const el = document.createElement('div');
  const scale = selected ? 1.25 : 1;
  el.style.cssText = `width:${30 * scale}px;height:${38 * scale}px;cursor:grab;touch-action:none;filter:none;`;
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', `${p.title}`);
  el.title = p.title;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 30 38');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  const drop = document.createElementNS(ns, 'path');
  drop.setAttribute('d', 'M15 1.5C7.5 1.5 2 7.2 2 14.2 2 24 15 36.5 15 36.5S28 24 28 14.2C28 7.2 22.5 1.5 15 1.5Z');
  drop.setAttribute('fill', pinColor(p));
  drop.setAttribute('stroke', p.is_featured && p.status === 'ACTIVE' ? GOLD : '#FFFFFF');
  drop.setAttribute('stroke-width', p.is_featured && p.status === 'ACTIVE' ? '3' : '2');
  const dot = document.createElementNS(ns, 'circle');
  dot.setAttribute('cx', '15');
  dot.setAttribute('cy', '14.5');
  dot.setAttribute('r', selected ? '6' : '4.5');
  dot.setAttribute('fill', '#FFFFFF');
  svg.append(drop, dot);
  el.append(svg);
  return el;
}

export function clusterElement(count: number): HTMLElement {
  const el = document.createElement('div');
  const size = count < 10 ? 34 : count < 50 ? 42 : 50;
  el.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;background:#0F172A;color:#fff;border:3px solid #fff;display:flex;align-items:center;justify-content:center;font:700 13px Vazirmatn,system-ui,sans-serif;cursor:pointer;`;
  el.textContent = new Intl.NumberFormat('fa-AF-u-nu-arabext').format(count);
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', tNow('map.pin.listings', { count }));
  return el;
}

export function officeElement(): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = 'width:34px;height:34px;border-radius:10px;background:#fff;border:2px solid #047857;display:flex;align-items:center;justify-content:center;';
  el.title = tNow('map.pin.office');
  el.setAttribute('aria-label', tNow('map.pin.office'));
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'M3 21V8l9-5 9 5v13h-6v-6H9v6H3Z');
  path.setAttribute('fill', '#047857');
  svg.append(path);
  el.append(svg);
  return el;
}
