import './styles.css';
import './print.css';
import { parseDocument } from './core/validate';
import { h, replace, toast } from './ui/dom';
import {
  clearSaved, getDoc, getTab, holdSaving, onTab, readSaved, setDoc, setTab, subscribe, type Tab,
} from './ui/state';
import { mountCv } from './ui/view-cv';
import { loadDemo, mountData } from './ui/view-data';
import { mountReport } from './ui/view-report';
import { mountReview } from './ui/view-review';
import { mountSetup } from './ui/view-setup';
import { mountStats } from './ui/view-stats';

const TABS: Array<[Tab, string]> = [
  ['setup', 'Match setup'],
  ['review', 'Review & tag'],
  ['cv', 'CV candidates'],
  ['stats', 'Statistics'],
  ['report', 'Report'],
  ['data', 'Export & import'],
];

const panel = (t: Tab) => document.getElementById(`panel-${t}`) as HTMLElement;

mountSetup(panel('setup'));
mountReview(panel('review'), () => getTab() === 'review');
mountCv(panel('cv'));
mountStats(panel('stats'));
mountReport(panel('report'));
mountData(panel('data'));

const tabsEl = document.getElementById('tabs')!;
function renderTabs(): void {
  const doc = getDoc();
  if (getTab() === 'cv' && !doc.cv) { setTab('setup'); return; }
  replace(tabsEl, ...TABS.filter(([t]) => t !== 'cv' || doc.cv).map(([t, label]) =>
    h('button', {
      type: 'button', role: 'tab', id: `tab-${t}`, class: 'tab', 'aria-selected': String(t === getTab()), 'aria-controls': `panel-${t}`,
      onClick: () => setTab(t),
      onKeydown: (e: KeyboardEvent) => {
        const btns = [...tabsEl.querySelectorAll<HTMLElement>('[role=tab]')];
        const i = btns.indexOf(e.currentTarget as HTMLElement);
        const n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : -1;
        if (n >= 0) { e.preventDefault(); btns[(n + btns.length) % btns.length].focus(); btns[(n + btns.length) % btns.length].click(); }
      },
    }, label)));
  document.getElementById('match-title')!.textContent = `${doc.match.home.name} v ${doc.match.away.name}${doc.demo ? ' (demo)' : ''}`;
}

function showTab(t: Tab): void {
  for (const [id] of TABS) panel(id).hidden = id !== t;
  renderTabs();
  if (location.hash.slice(1) !== t) history.replaceState(null, '', `#${t}`);
  document.getElementById(`tab-${t}`)?.scrollIntoView({ block: 'nearest', inline: 'center' });
}
onTab(showTab);
subscribe(() => renderTabs());

// Restore offer (never automatic, so a stale session cannot silently replace work).
const saved = readSaved();
const banners = document.getElementById('banners')!;
if (saved) {
  const r = parseDocument(saved);
  if (r.ok && r.doc && (r.doc.events.length || r.doc.cv)) {
    holdSaving(true);
    const doc = r.doc;
    const bar = h('div', { class: 'banner', role: 'region', 'aria-label': 'Restore previous session' },
      h('span', null, `Restore your previous session: ${doc.match.home.name} v ${doc.match.away.name}, ${doc.events.length} events? You will need to open the video file again.`),
      h('button', { type: 'button', class: 'btn small primary', onClick: () => { holdSaving(false); setDoc(doc); bar.remove(); toast('Session restored. Re-open your video file in Match setup.', { kind: 'ok' }); } }, 'Restore'),
      h('button', { type: 'button', class: 'btn small', onClick: () => { clearSaved(); holdSaving(false); bar.remove(); } }, 'Discard'));
    banners.append(bar);
  }
}
if (getDoc().demo !== true) {
  // Quick path for first-time visitors
  const first = h('div', { class: 'banner info', id: 'intro' },
    h('span', null, 'New here? Try it with a fictional match first.'),
    h('button', { type: 'button', class: 'btn small', onClick: () => { void loadDemo().then(() => { first.remove(); setTab('stats'); }); } }, 'Load demo match'));
  banners.append(first);
}

const initial = location.hash.slice(1) as Tab;
setTab(TABS.some(([t]) => t === initial) && initial !== 'cv' ? initial : 'setup');
