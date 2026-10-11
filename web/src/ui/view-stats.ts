import { formatStat, statsRows } from '../core/export';
import { describeEvent, formatClock, type Ratio, type Stat } from '../core/stats';
import { h, replace } from './dom';
import { getDoc, getStats, seek, subscribe } from './state';

let selected: { row: string; side: 'home' | 'away' } | null = null;

export function qualityPanel(): HTMLElement {
  const q = getStats().quality;
  const kv = (k: string, v: string | number) => [h('dt', null, k), h('dd', null, String(v))];
  return h('div', { class: 'card' },
    h('h2', null, 'Data quality'),
    h('dl', { class: 'kv' },
      ...kv('Events tagged', q.totalEvents),
      ...kv('Counted in statistics', q.countedEvents),
      ...kv('Excluded (status unknown)', q.excludedUnknown.length),
      ...kv('By source', `manual ${q.bySource.manual}, computer vision ${q.bySource.cv}`),
      ...kv('By status', `verified ${q.byStatus.verified}, observed ${q.byStatus.observed}, inferred ${q.byStatus.inferred}, unknown ${q.byStatus.unknown}`),
      ...kv('CV events not verified by a person', q.cvUnverified),
      ...(getDoc().cv ? kv('CV candidates', `${q.cvCandidates.total} total: ${q.cvCandidates.accepted} accepted, ${q.cvCandidates.rejected} rejected, ${q.cvCandidates.pending} pending`) : []),
    ),
    q.warnings.length
      ? h('div', { class: 'warnbox' }, h('h3', null, `Rule warnings (${q.warnings.length})`),
        h('ul', null, ...q.warnings.map((w) => {
          const ev = getDoc().events.find((e) => e.id === w.eventId);
          return h('li', null, ev ? h('button', { type: 'button', class: 'link', onClick: () => seek(ev.t) }, formatClock(ev.t)) : null, ' ', w.message);
        })))
      : h('p', { class: 'hint' }, 'No rule warnings.'),
  );
}

export function mountStats(root: HTMLElement): void {
  const render = (): void => {
    const doc = getDoc();
    const stats = getStats();
    const rows = statsRows(stats);

    const cell = (rowLabel: string, side: 'home' | 'away', v: Stat | Ratio): HTMLElement => {
      const text = formatStat(v);
      const unknown = text === 'unknown';
      const noAttempts = !unknown && 'den' in v && v.value === null && v.den === 0;
      return h('td', { class: 'num' },
        h('button', {
          type: 'button',
          class: `statbtn ${unknown ? 'is-unknown' : ''} ${selected?.row === rowLabel && selected.side === side ? 'sel' : ''}`,
          title: unknown ? `Unknown: ${v.reason ?? 'not enough evidence'}` : `Show ${v.evidence.length} evidence event(s)`,
          'aria-label': `${rowLabel}, ${doc.match[side].name}: ${text}. Show evidence.`,
          onClick: () => { selected = { row: rowLabel, side }; render(); document.getElementById('evidence')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); },
        }, noAttempts ? 'n/a' : text, unknown ? h('sup', null, '?') : null));
    };

    let evidence: HTMLElement;
    if (selected) {
      const sel = selected;
      const r = rows.find((x) => x.label === sel.row);
      const v = r ? r[sel.side] : undefined;
      if (!v) evidence = h('p', null, 'Select a figure to see the events behind it.');
      else {
        const events = v.evidence.map((id) => doc.events.find((e) => e.id === id)).filter((e) => !!e).sort((a, b) => a!.t - b!.t);
        evidence = h('div', null,
          h('h3', null, `Evidence: ${sel.row}, ${doc.match[sel.side].name}`),
          formatStat(v) === 'unknown' ? h('p', { class: 'notice' }, `Unknown. ${v.reason ?? ''} Tick this category in Match setup → Tagging coverage once every instance is tagged.`) : null,
          events.length ? h('ul', { class: 'evlist' }, ...events.map((e) => h('li', { class: 'ev' }, h('div', { class: 'ev-main' },
            h('button', { type: 'button', class: 'btn small jump', onClick: () => seek(e!.t) }, '▶ ', formatClock(e!.t)),
            h('span', { class: 'ev-desc' }, describeEvent(e!, doc)))))) : formatStat(v) === 'unknown' ? null : h('p', { class: 'empty' }, 'No events contribute to this figure.'));
      }
    } else evidence = h('p', { class: 'hint' }, 'Select any figure in the table to see the tagged events behind it, with links to the video.');

    const total = (side: 'home' | 'away') => stats[side].scoreline;
    replace(root,
      h('div', { class: 'card' },
        doc.demo ? h('p', { class: 'demo-note' }, 'DEMO DATA — fictional match, not real statistics.') : null,
        h('div', { class: 'scoreboard', 'aria-label': 'Scoreline' },
          h('div', { class: 'sb-team' }, h('span', { class: 'sb-name' }, doc.match.home.name), h('span', { class: `sb-score ${total('home') === 'unknown' ? 'is-unknown' : ''}` }, total('home'))),
          h('div', { class: 'sb-v' }, 'v'),
          h('div', { class: 'sb-team' }, h('span', { class: 'sb-name' }, doc.match.away.name), h('span', { class: `sb-score ${total('away') === 'unknown' ? 'is-unknown' : ''}` }, total('away')))),
        h('p', { class: 'hint center' }, 'Scoreline is goals-points (total), computed from tagged scores. Goal = 3, point = 1, two-pointer = 2.'),
        h('div', { class: 'tablewrap' },
          h('table', { class: 'tbl stats' },
            h('caption', { class: 'sr' }, 'Team statistics'),
            h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Statistic'), h('th', { scope: 'col', class: 'num' }, doc.match.home.name), h('th', { scope: 'col', class: 'num' }, doc.match.away.name))),
            h('tbody', null, ...rows.map((r) => h('tr', null, h('th', { scope: 'row' }, r.label), cell(r.label, 'home', r.home), cell(r.label, 'away', r.away)))))),
        h('p', { class: 'footnote' }, h('sup', null, '?'), ' ', h('strong', null, 'unknown'),
          ': this category is not marked as fully tagged (Match setup → Tagging coverage), so showing a count could mislead. Hover or select the figure for the reason. Kick-out figures are for the team taking the kick-out.'),
      ),
      h('div', { class: 'card', id: 'evidence', 'aria-live': 'polite' }, evidence),
      qualityPanel(),
    );
  };
  subscribe(render);
  render();
}
