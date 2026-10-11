import { eventFromCandidate, manualEvent } from '../core/document';
import { getRules } from '../core/rules';
import { describeEvent, formatClock } from '../core/stats';
import type {
  CardColour, CvCandidate, EventType, KickoutLength, KickoutOutcome, MatchEvent, Period, ShotOutcome, ShotType, TeamSide, TurnoverCause,
} from '../core/types';
import { field, h, replace, select, toast } from './dom';
import {
  commit, deleteEvent, EVENT_TYPE_LABEL, getDoc, hasVideo, seek, setTab, sortedEvents, subscribe, teamColour,
  video, videoDuration, onVideoLoaded,
} from './state';
import { buildDetectPanel, detectOverlay } from './detect';

const FPS = 25;
let highlightId: string | null = null;

// ---------- provenance ----------
export function provenanceBadge(e: MatchEvent): HTMLElement {
  const p = e.provenance;
  let text: string;
  let cls: string;
  if (p.status === 'unknown') { text = 'Unknown (excluded from stats)'; cls = 'unknown'; }
  else if (p.source === 'manual' && p.status === 'verified') { text = 'Manual ✓ verified'; cls = 'verified'; }
  else if (p.source === 'cv' && p.status === 'verified') { text = 'CV candidate accepted'; cls = 'cv'; }
  else if (p.status === 'inferred') { text = `Inferred${p.confidence !== undefined ? ` (${Math.round(p.confidence * 100)}%)` : ''}`; cls = 'inferred'; }
  else { text = `${p.source === 'cv' ? 'CV ' : ''}${p.status}`; cls = 'inferred'; }
  return h('span', { class: `badge ${cls}` }, text);
}

// ---------- event form ----------
interface FormState {
  draft: MatchEvent;
  mode: 'edit' | 'candidate';
  candidate?: CvCandidate;
}
let form: FormState | null = null;
let formHost: HTMLElement;
let formFocus = false;

const OUTCOMES: Array<[ShotOutcome, string]> = [
  ['goal', 'Goal (3)'], ['point', 'Point (1)'], ['two_point', 'Two-pointer (2)'], ['wide', 'Wide'],
  ['short', 'Dropped short'], ['saved', 'Saved'], ['blocked', 'Blocked'], ['post', 'Off the post'],
];
const SHOT_TYPES: Array<[ShotType, string]> = [
  ['play', 'From play'], ['free', 'Free'], ['45', '45'], ['mark', 'Mark'], ['penalty', 'Penalty'], ['sideline', 'Sideline kick'],
];
const CAUSES: Array<[TurnoverCause, string]> = [
  ['tackle', 'Tackle'], ['interception', 'Interception'], ['handling_error', 'Handling error'], ['foul', 'Foul'],
  ['kick_away', 'Kick away'], ['other', 'Other'],
];
const NEEDS_TEAM: EventType[] = ['shot', 'kickout', 'turnover', 'free_won', 'card'];

export function openEditForm(e: MatchEvent): void {
  form = { draft: structuredClone(e), mode: 'edit' };
  highlightId = e.id;
  renderForm(true);
  renderList();
}

/** Accept flow: the person picks event type and team. Nothing is guessed from the CV cluster. */
export function openCandidateForm(c: CvCandidate): void {
  const draft: MatchEvent = {
    id: 'draft', t: c.t, type: 'shot',
    provenance: { source: 'cv', status: 'verified', candidateId: c.id },
  };
  form = { draft, mode: 'candidate', candidate: c };
  setTab('review');
  renderForm(true);
  seek(c.t);
}

function tidy(e: MatchEvent): MatchEvent {
  const keep = <K extends keyof MatchEvent>(...ks: K[]) => ks;
  const clean: MatchEvent = { id: e.id, t: e.t, type: e.type, provenance: e.provenance };
  const copy = (ks: Array<keyof MatchEvent>) => { for (const k of ks) if (e[k] !== undefined && e[k] !== '') (clean as unknown as Record<string, unknown>)[k] = e[k]; };
  copy(keep('period', 'team', 'player', 'note', 'pitch'));
  if (e.type === 'shot') copy(keep('outcome', 'shotType', 'outsideArc'));
  if (e.type === 'kickout') copy(keep('kickoutOutcome', 'kickoutLength', 'contested'));
  if (e.type === 'turnover') copy(keep('cause'));
  if (e.type === 'card') copy(keep('card'));
  return clean;
}

function triBool(v: boolean | undefined, set: (b: boolean | undefined) => void, labels: [string, string] = ['Yes', 'No']): HTMLSelectElement {
  return select([['', 'Not recorded'], ['y', labels[0]], ['n', labels[1]]], v === undefined ? '' : v ? 'y' : 'n', (x) => set(x === '' ? undefined : x === 'y'));
}

function renderForm(focus = false): void {
  if (!formHost) return;
  if (!form) { replace(formHost); formHost.hidden = true; return; }
  formHost.hidden = false;
  const f = form;
  const d = f.draft;
  const doc = getDoc();
  const teamOpts: Array<[string, string]> = [['', '— choose —'], ['home', doc.match.home.name], ['away', doc.match.away.name]];

  const timeInput = h('input', { type: 'number', min: 0, step: 0.1, value: d.t.toFixed(1), onInput: () => { const n = parseFloat(timeInput.value); if (Number.isFinite(n) && n >= 0) d.t = n; clock.textContent = formatClock(d.t); } });
  const clock = h('span', { class: 'hint' }, formatClock(d.t));

  const rows: HTMLElement[] = [
    field('Event type', select(Object.entries(EVENT_TYPE_LABEL) as Array<[string, string]>, d.type, (v) => { d.type = v as EventType; renderForm(); })),
    field('Team', select(teamOpts, d.team ?? '', (v) => { d.team = (v || undefined) as TeamSide | undefined; })),
    h('div', { class: 'field' }, h('label', { for: 'ef-time' }, 'Video time (seconds)'),
      h('div', { class: 'row' }, Object.assign(timeInput, { id: 'ef-time' }), clock,
        h('button', { type: 'button', class: 'btn small', onClick: () => { d.t = video.currentTime; timeInput.value = d.t.toFixed(1); clock.textContent = formatClock(d.t); } }, 'Set to current time'))),
    field('Period', select([['', 'Not set'], ['H1', 'First half'], ['H2', 'Second half'], ['ET1', 'Extra time 1'], ['ET2', 'Extra time 2']], d.period ?? '', (v) => { d.period = (v || undefined) as Period | undefined; })),
  ];
  if (d.type === 'shot')
    rows.push(
      field('Outcome', select([['', '— choose —'], ...OUTCOMES], d.outcome ?? '', (v) => { d.outcome = (v || undefined) as ShotOutcome | undefined; })),
      field('Shot type', select([['', 'Not recorded'], ...SHOT_TYPES], d.shotType ?? '', (v) => { d.shotType = (v || undefined) as ShotType | undefined; })),
      field('Taken from outside the 40m arc?', triBool(d.outsideArc, (b) => { d.outsideArc = b; }), 'Needed to check two-point scores.'),
    );
  if (d.type === 'kickout')
    rows.push(
      field('Result for the team taking it', select([['', 'Not recorded'], ['won', 'Won (kept possession)'], ['lost', 'Lost']], d.kickoutOutcome ?? '', (v) => { d.kickoutOutcome = (v || undefined) as KickoutOutcome | undefined; })),
      field('Length', select([['', 'Not recorded'], ['short', 'Short'], ['long', 'Long']], d.kickoutLength ?? '', (v) => { d.kickoutLength = (v || undefined) as KickoutLength | undefined; })),
      field('Contested?', triBool(d.contested, (b) => { d.contested = b; })),
    );
  if (d.type === 'turnover')
    rows.push(field('Cause', select([['', 'Not recorded'], ...CAUSES], d.cause ?? '', (v) => { d.cause = (v || undefined) as TurnoverCause | undefined; })));
  if (d.type === 'card')
    rows.push(field('Card colour', select([['', '— choose —'], ['yellow', 'Yellow'], ['black', 'Black'], ['red', 'Red']], d.card ?? '', (v) => { d.card = (v || undefined) as CardColour | undefined; })));
  const player = h('input', { type: 'text', value: d.player ?? '', placeholder: 'e.g. 11 or surname', onInput: () => { d.player = player.value || undefined; } });
  const note = h('textarea', { rows: 2, onInput: () => { d.note = note.value || undefined; } });
  note.value = d.note ?? '';
  rows.push(field('Player label (optional)', player), field('Note (optional)', note));

  const save = () => {
    if (NEEDS_TEAM.includes(d.type) && !d.team) { toast('Choose the team for this event.', { kind: 'error' }); return; }
    const cleaned = tidy(d);
    if (f.mode === 'candidate' && f.candidate) {
      const { id: _i, provenance: _p, t: _t, ...fields } = cleaned;
      void _i; void _p; void _t;
      const ev = eventFromCandidate(f.candidate, fields);
      ev.t = cleaned.t;
      doc.events.push(ev);
      f.candidate.review = 'accepted';
      highlightId = ev.id;
    } else {
      const i = doc.events.findIndex((x) => x.id === cleaned.id);
      if (i >= 0) doc.events[i] = cleaned; else doc.events.push(cleaned);
      highlightId = cleaned.id;
    }
    form = null;
    commit();
    renderForm();
    toast('Event saved.', { kind: 'ok' });
  };

  replace(formHost,
    h('h3', null, f.mode === 'candidate' ? 'Accept CV candidate as an event' : 'Edit event'),
    f.candidate ? h('p', { class: 'notice' },
      `Candidate at ${formatClock(f.candidate.t)}: ${f.candidate.detail}. `,
      f.candidate.teamCluster ? `Jersey cluster ${f.candidate.teamCluster} is only a colour group: you decide which team it is. ` : '',
      'Choose the event type and team yourself.') : null,
    h('form', { class: 'ev-form', onSubmit: (ev: Event) => { ev.preventDefault(); save(); } },
      h('div', { class: 'grid2' }, ...rows),
      h('div', { class: 'row end' },
        h('button', { type: 'submit', class: 'btn primary' }, f.mode === 'candidate' ? 'Accept and add event' : 'Save event'),
        h('button', { type: 'button', class: 'btn', onClick: () => { form = null; renderForm(); renderList(); } }, 'Cancel'),
        f.mode === 'edit' && doc.events.some((x) => x.id === d.id)
          ? h('button', { type: 'button', class: 'btn danger', onClick: () => { form = null; deleteEvent(d.id); renderForm(); } }, 'Delete') : null,
      )),
  );
  if (focus || formFocus) {
    formHost.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    (formHost.querySelector('select, input') as HTMLElement | null)?.focus({ preventScroll: true });
  }
}

// ---------- tagging ----------
function tag(side: TeamSide | undefined, build: () => Omit<MatchEvent, 'id' | 'provenance' | 't' | 'team'>): void {
  if (!hasVideo()) { toast('Open the match video first (Match setup tab).', { kind: 'error' }); return; }
  const ev = manualEvent({ ...build(), team: side, t: Math.round(video.currentTime * 10) / 10 });
  getDoc().events.push(ev);
  commit();
  openEditForm(ev);
  toast(`Tagged ${describeEvent(ev, getDoc())} at ${formatClock(ev.t)}`, { kind: 'ok' });
}

interface QuickDef { label: string; build: () => Omit<MatchEvent, 'id' | 'provenance' | 't' | 'team'>; cls?: string }
const QUICK: QuickDef[] = [
  { label: 'Goal', build: () => ({ type: 'shot', outcome: 'goal', shotType: 'play' }), cls: 'score' },
  { label: 'Point', build: () => ({ type: 'shot', outcome: 'point', shotType: 'play' }), cls: 'score' },
  { label: 'Two-pointer', build: () => ({ type: 'shot', outcome: 'two_point', shotType: 'play', outsideArc: true }), cls: 'score' },
  { label: 'Wide', build: () => ({ type: 'shot', outcome: 'wide', shotType: 'play' }) },
  { label: 'Short', build: () => ({ type: 'shot', outcome: 'short', shotType: 'play' }) },
  { label: 'Saved', build: () => ({ type: 'shot', outcome: 'saved', shotType: 'play' }) },
  { label: 'Blocked', build: () => ({ type: 'shot', outcome: 'blocked', shotType: 'play' }) },
  { label: 'Post', build: () => ({ type: 'shot', outcome: 'post', shotType: 'play' }) },
  { label: 'Kick-out won', build: () => ({ type: 'kickout', kickoutOutcome: 'won' }) },
  { label: 'Kick-out lost', build: () => ({ type: 'kickout', kickoutOutcome: 'lost' }) },
  { label: 'Turnover won', build: () => ({ type: 'turnover' }) },
  { label: 'Free won', build: () => ({ type: 'free_won' }) },
  { label: 'Card', build: () => ({ type: 'card', card: 'yellow' }) },
];

function tagPanel(): HTMLElement {
  const doc = getDoc();
  const col = (side: TeamSide) => {
    const title = h('h3', { class: 'team-h' }, h('span', { class: 'swatch', style: { background: teamColour(side) } }), doc.match[side].name);
    subscribe(() => { title.lastChild!.textContent = getDoc().match[side].name; title.firstElementChild!.setAttribute('style', `background:${teamColour(side)}`); });
    return h('div', { class: 'tagcol' }, title,
      h('div', { class: 'btns' }, ...QUICK.map((q) => h('button', { type: 'button', class: `btn tag ${q.cls ?? ''}`, onClick: () => tag(side, q.build) }, q.label))));
  };
  const periods = (kind: 'period_start' | 'period_end') =>
    (['H1', 'H2', 'ET1', 'ET2'] as Period[]).map((p) =>
      h('button', { type: 'button', class: 'btn small', onClick: () => tag(undefined, () => ({ type: kind, period: p })) }, `${kind === 'period_start' ? 'Start' : 'End'} ${p}`));
  return h('section', { class: 'card', 'aria-labelledby': 'tag-h' },
    h('h2', { id: 'tag-h' }, 'Tag at current video time'),
    h('div', { class: 'tagcols' }, col('home'), col('away')),
    h('div', { class: 'row wrap' }, h('strong', null, 'Periods:'), ...periods('period_start'), ...periods('period_end')),
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn small', onClick: () => tag(undefined, () => ({ type: 'note' })) }, 'Add note')),
  );
}

// ---------- timeline ----------
let timelineBar: HTMLElement;
let playhead: HTMLElement;
function renderTimeline(): void {
  if (!timelineBar) return;
  const dur = videoDuration();
  const marks = sortedEvents().map((e) => {
    const warn = getRules(getDoc().match.ruleset).checkEvent(e).length > 0;
    return h('button', {
      type: 'button',
      class: `mark ${e.id === highlightId ? 'hl' : ''} ${e.provenance.status === 'unknown' ? 'dim' : ''} ${e.team ? '' : 'neutral'}`,
      style: { left: `${Math.min(100, (e.t / dur) * 100)}%`, background: e.team ? teamColour(e.team) : '#6b7280' },
      title: `${formatClock(e.t)} ${describeEvent(e, getDoc())}${warn ? ' (rule warning)' : ''}`,
      'aria-label': `${formatClock(e.t)} ${describeEvent(e, getDoc())}`,
      onClick: (ev: Event) => { ev.stopPropagation(); highlightId = e.id; seek(e.t); renderList(); renderTimeline(); },
    });
  });
  replace(timelineBar, playhead, ...marks);
}

// ---------- list ----------
let listHost: HTMLElement;
const filters = { type: '', team: '', status: '' };
function renderList(): void {
  if (!listHost) return;
  const doc = getDoc();
  const rules = getRules(doc.match.ruleset);
  const all = sortedEvents();
  const shown = all.filter((e) => {
    if (filters.type && e.type !== filters.type) return false;
    if (filters.team === 'none' ? e.team : filters.team && e.team !== filters.team) return false;
    if (filters.status === 'warn') return rules.checkEvent(e).length > 0;
    if (filters.status && e.provenance.status !== filters.status) return false;
    return true;
  });
  const items = shown.map((e) => {
    const warns = rules.checkEvent(e);
    return h('li', { class: `ev ${e.id === highlightId ? 'hl' : ''}`, style: { borderLeftColor: e.team ? teamColour(e.team) : '#9ca3af' } },
      h('div', { class: 'ev-main' },
        h('button', { type: 'button', class: 'btn small jump', title: 'Jump to 3 seconds before this event', onClick: () => { highlightId = e.id; seek(e.t); renderList(); renderTimeline(); } }, '▶ ', formatClock(e.t)),
        h('span', { class: 'ev-desc' }, describeEvent(e, doc)),
        e.period ? h('span', { class: 'badge plain' }, e.period) : null,
        provenanceBadge(e)),
      e.note ? h('div', { class: 'hint' }, e.note) : null,
      ...warns.map((w) => h('div', { class: 'warn' }, '⚠ ', w)),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn small', onClick: () => openEditForm(e) }, 'Edit'),
        h('button', { type: 'button', class: 'btn small danger', onClick: () => { if (form?.draft.id === e.id) { form = null; renderForm(); } deleteEvent(e.id); } }, 'Delete')));
  });
  replace(listHost,
    h('p', { class: 'hint', 'aria-live': 'polite' }, `${shown.length} of ${all.length} events shown`),
    items.length ? h('ul', { class: 'evlist' }, ...items) : h('p', { class: 'empty' }, all.length ? 'No events match the filters.' : 'No events yet. Play the video and use the tag buttons.'));
}

function filterBar(): HTMLElement {
  const doc = getDoc();
  const typeSel = select([['', 'All types'], ...(Object.entries(EVENT_TYPE_LABEL) as Array<[string, string]>)], '', (v) => { filters.type = v; renderList(); });
  const teamSel = select([['', 'Both teams'], ['home', doc.match.home.name], ['away', doc.match.away.name], ['none', 'No team']], '', (v) => { filters.team = v; renderList(); });
  subscribe((k) => { if (k === 'replace') { teamSel.options[1].text = getDoc().match.home.name; teamSel.options[2].text = getDoc().match.away.name; } });
  const statusSel = select([['', 'Any status'], ['verified', 'Verified'], ['observed', 'Observed'], ['inferred', 'Inferred'], ['unknown', 'Unknown'], ['warn', 'With rule warnings']], '', (v) => { filters.status = v; renderList(); });
  return h('div', { class: 'filters' }, field('Type', typeSel), field('Team', teamSel), field('Status', statusSel));
}

// ---------- player controls ----------
function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && (el as HTMLInputElement).type !== 'checkbox' && (el as HTMLInputElement).type !== 'file' || el.isContentEditable;
}

function playerControls(): HTMLElement {
  const rate = select([['0.25', '0.25x'], ['0.5', '0.5x'], ['1', '1x'], ['1.5', '1.5x'], ['2', '2x']], '1', (v) => { video.playbackRate = parseFloat(v); });
  const time = h('span', { class: 'time', 'aria-live': 'off' }, '0:00 / 0:00');
  const upd = () => { time.textContent = `${formatClock(video.currentTime)} / ${formatClock(Number.isFinite(video.duration) ? video.duration : 0)}`; playhead.style.left = `${(video.currentTime / videoDuration()) * 100}%`; };
  video.addEventListener('timeupdate', upd);
  video.addEventListener('seeked', upd);
  video.addEventListener('loadedmetadata', () => { upd(); renderTimeline(); });
  const step = (s: number, label: string) => h('button', { type: 'button', class: 'btn small', onClick: () => nudge(s) }, label);
  return h('div', { class: 'controls' },
    h('button', { type: 'button', class: 'btn small', onClick: () => togglePlay() }, 'Play / pause'),
    step(-10, '−10s'), step(-2, '−2s'), step(2, '+2s'), step(10, '+10s'),
    step(-1 / FPS, '◀ frame'), step(1 / FPS, 'frame ▶'),
    field('Speed', rate), time,
    h('details', { class: 'keys' }, h('summary', null, 'Keyboard shortcuts'),
      h('p', null, 'Space play/pause; ← / → ±2s; Shift+← / → ±10s; , and . step one frame (25 fps). Shortcuts work when you are not typing in a field.')),
  );
}
function togglePlay(): void { if (video.paused) void video.play().catch(() => undefined); else video.pause(); }
function nudge(s: number): void {
  if (Math.abs(s) < 0.5) video.pause();
  video.currentTime = Math.max(0, Math.min(video.duration || Infinity, video.currentTime + s));
}

export function mountReview(root: HTMLElement, isActive: () => boolean): void {
  formHost = h('section', { class: 'card', hidden: true, 'aria-live': 'polite', id: 'event-form' });
  listHost = h('div', { id: 'event-list' });
  playhead = h('div', { class: 'playhead' });
  timelineBar = h('div', { class: 'timeline', role: 'group', 'aria-label': 'Event timeline. Click empty space to seek.', onClick: (ev: MouseEvent) => {
    if (!hasVideo()) return;
    const r = timelineBar.getBoundingClientRect();
    video.currentTime = ((ev.clientX - r.left) / r.width) * videoDuration();
  } });

  const left = h('div', { class: 'player-col' },
    h('div', { class: 'card nopad' },
      h('div', { class: 'video-wrap' }, video, detectOverlay),
      playerControls(),
      timelineBar,
      h('p', { class: 'hint tl-hint' }, 'Markers are coloured by team; grey = no team. Click one to jump to 3 s before it.')),
    buildDetectPanel(),
  );
  const right = h('div', { class: 'side-col' },
    tagPanel(),
    formHost,
    h('section', { class: 'card', 'aria-labelledby': 'list-h' }, h('h2', { id: 'list-h' }, 'Events'), filterBar(), listHost));
  replace(root, h('div', { class: 'review-grid' }, left, right));

  subscribe((k) => { if (k === 'replace') { form = null; renderForm(); highlightId = null; } renderList(); renderTimeline(); });
  onVideoLoaded(() => renderTimeline());
  renderList(); renderTimeline();

  document.addEventListener('keydown', (e) => {
    if (!isActive() || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
    const tgt = e.target as HTMLElement;
    if (e.key === ' ' && (tgt.tagName === 'BUTTON' || tgt.tagName === 'SUMMARY')) return;
    if (!hasVideo()) return;
    switch (e.key) {
      case ' ': e.preventDefault(); togglePlay(); break;
      case 'ArrowLeft': e.preventDefault(); nudge(e.shiftKey ? -10 : -2); break;
      case 'ArrowRight': e.preventDefault(); nudge(e.shiftKey ? 10 : 2); break;
      case ',': e.preventDefault(); nudge(-1 / FPS); break;
      case '.': e.preventDefault(); nudge(1 / FPS); break;
      default: return;
    }
  });
}
