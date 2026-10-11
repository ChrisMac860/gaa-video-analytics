import { formatStat } from '../core/export';
import { getRules } from '../core/rules';
import { formatClock, type Ratio, type Stat, type TeamStats } from '../core/stats';
import type { ShotType } from '../core/types';
import { h, replace } from './dom';
import { getDoc, getStats, subscribe } from './state';

const SHOT_LABELS: Array<[ShotType | 'unspecified', string]> = [
  ['play', 'From play'], ['free', 'Frees'], ['45', '45s'], ['mark', 'Marks'], ['penalty', 'Penalties'], ['sideline', 'Sideline kicks'], ['unspecified', 'Type not recorded'],
];
const PROFILE: Record<string, string> = { veo: 'Veo', generic_mp4: 'Generic MP4', phone: 'Phone', fixed_camera: 'Fixed camera', other: 'Other' };

export function mountReport(root: HTMLElement): void {
  const render = (): void => {
    const doc = getDoc();
    const stats = getStats();
    const q = stats.quality;
    const m = doc.match;
    const cov = doc.coverage;
    const rules = getRules(m.ruleset);

    const sv = (v: Stat | Ratio) => { const t = formatStat(v); return t === 'unknown' ? h('span', { class: 'is-unknown' }, 'unknown') : t; };
    const two = (label: string, key: keyof TeamStats) =>
      h('tr', null, h('th', { scope: 'row' }, label), h('td', { class: 'num' }, sv(stats.home[key] as Stat | Ratio)), h('td', { class: 'num' }, sv(stats.away[key] as Stat | Ratio)));
    const head = h('thead', null, h('tr', null, h('th', null, ''), h('th', { class: 'num' }, m.home.name), h('th', { class: 'num' }, m.away.name)));

    const details = [m.date, m.venue, m.competition].filter(Boolean).join(' • ');
    const covList = ([['scores', 'scores'], ['shots', 'shots'], ['kickouts', 'kick-outs'], ['turnovers', 'turnovers'], ['frees', 'frees'], ['cards', 'cards']] as const)
      .map(([k, l]) => `${l}: ${cov[k] ? 'fully tagged' : 'not declared (shown as unknown)'}`);

    replace(root,
      reportHeader(),
      h('article', { class: 'report', id: 'report-view' },
        doc.demo ? h('div', { class: 'watermark', 'aria-hidden': 'true' }, 'DEMO DATA') : null,
        doc.demo ? h('div', { class: 'banner warn-banner' }, h('strong', null, 'DEMO DATA. '), 'This is a fictional match supplied to demonstrate the software. It is not a real result.') : null,
        h('header', { class: 'rep-head' },
          h('p', { class: 'eyebrow' }, 'Match report'),
          h('h1', null, m.title || `${m.home.name} v ${m.away.name}`),
          h('div', { class: 'rep-score' },
            h('div', null, h('span', { class: 'rs-name' }, m.home.name), h('span', { class: 'rs-val' }, stats.home.scoreline)),
            h('div', { class: 'rs-v' }, 'v'),
            h('div', null, h('span', { class: 'rs-name' }, m.away.name), h('span', { class: 'rs-val' }, stats.away.scoreline))),
          stats.home.scoreline === 'unknown' ? h('p', { class: 'hint' }, 'Final score unknown: tagged scores were not declared complete (Tagging coverage → Scores).') : null,
          h('p', { class: 'hint' }, details || 'No date, venue or competition entered'),
          h('p', { class: 'hint' }, `Rules: ${rules.label}`)),

        h('section', null, h('h2', null, 'Key statistics'),
          h('table', { class: 'tbl' }, head, h('tbody', null,
            two('Goals', 'goals'), two('Points (1)', 'points'), two('Two-pointers (2)', 'twoPointers'), two('Total', 'total'),
            two('Shots', 'shots'), two('Scores from shots', 'scores'), two('Shot accuracy', 'shotAccuracy'), two('Wides', 'wides'),
            two('Frees won', 'freesWon'), two('Cards', 'cards')))),

        h('section', null, h('h2', null, 'Shooting by shot type'),
          stats.home.shotsByType && stats.away.shotsByType
            ? h('table', { class: 'tbl' },
              h('thead', null, h('tr', null, h('th', null, 'Shot type'), h('th', { class: 'num' }, `${m.home.name} scores/shots`), h('th', { class: 'num' }, `${m.away.name} scores/shots`))),
              h('tbody', null, ...SHOT_LABELS.filter(([k]) => k !== 'unspecified' || stats.home.shotsByType![k].shots + stats.away.shotsByType![k].shots > 0).map(([k, l]) => {
                const a = stats.home.shotsByType![k], b = stats.away.shotsByType![k];
                return h('tr', null, h('th', { scope: 'row' }, l), h('td', { class: 'num' }, `${a.scores}/${a.shots}`), h('td', { class: 'num' }, `${b.scores}/${b.shots}`));
              })))
            : h('p', { class: 'is-unknown' }, 'unknown — shots were not declared fully tagged.')),

        h('section', null, h('h2', null, 'Kick-outs'),
          h('table', { class: 'tbl' }, head, h('tbody', null,
            two('Taken', 'kickoutsTaken'), two('Won', 'kickoutsWon'), two('Lost', 'kickoutsLost'), two('Retention', 'kickoutRetention'),
            two('Short', 'kickoutsShort'), two('Long', 'kickoutsLong')))),

        h('section', null, h('h2', null, 'Turnovers'),
          h('table', { class: 'tbl' }, head, h('tbody', null, two('Turnovers won', 'turnoversWon'), two('Turnovers conceded', 'turnoversConceded')))),

        h('section', null, h('h2', null, 'Timeline of scores, cards and periods'),
          stats.timeline.length
            ? h('table', { class: 'tbl' },
              h('thead', null, h('tr', null, h('th', null, 'Time'), h('th', null, 'Event'), h('th', null, 'Score'))),
              h('tbody', null, ...stats.timeline.map((t) => h('tr', null,
                h('td', { class: 'nowrap' }, formatClock(t.event.t), t.event.period ? ` ${t.event.period}` : ''),
                h('td', null, t.label),
                h('td', { class: 'nowrap' }, t.running ? `${m.home.name} ${t.running.home} – ${m.away.name} ${t.running.away}` : '—')))))
            : h('p', { class: 'empty' }, 'No scores, cards or period markers tagged.')),

        h('section', { class: 'provenance' }, h('h2', null, 'Data provenance'),
          h('ul', null,
            h('li', null, `${q.totalEvents} events tagged: ${q.bySource.manual} manual, ${q.bySource.cv} from computer-vision candidates accepted or imported by a person.`),
            h('li', null, `Status: ${q.byStatus.verified} verified, ${q.byStatus.observed} observed, ${q.byStatus.inferred} inferred, ${q.byStatus.unknown} unknown (${q.excludedUnknown.length} excluded from statistics).`),
            h('li', null, `CV events not verified by a person: ${q.cvUnverified}.`),
            doc.cv ? h('li', null, `CV candidates: ${q.cvCandidates.accepted} accepted, ${q.cvCandidates.rejected} rejected, ${q.cvCandidates.pending} not reviewed. Candidates do not count unless accepted.`) : null,
            h('li', null, 'Tagging coverage declared — ', covList.join('; '), '.'),
            h('li', null, `Video source: ${PROFILE[doc.video.profile] ?? doc.video.profile}${doc.video.fileName ? `, file "${doc.video.fileName}"` : ''}.`),
            h('li', null, `Rule warnings on individual events: ${q.warnings.length}.`)),
          h('h3', null, 'Rule notes'),
          h('ul', null, ...stats.ruleNotes.map((n) => h('li', null, n)))),

        h('footer', { class: 'rep-foot' }, 'Generated by GAA Video Analytics (open source). Statistics computed from tagged events; see provenance section.'),
      ),
    );
  };
  subscribe(render);
  render();
}

export function reportHeader(): HTMLElement {
  return h('div', { class: 'noprint row' },
    h('button', { type: 'button', class: 'btn primary', onClick: () => window.print() }, 'Print / Save as PDF'),
    h('span', { class: 'hint' }, 'Use your browser’s print dialog; choose "Save as PDF" as the destination. A4, no app chrome.'));
}
