// Generates web/public/samples/demo-match.json: a FICTIONAL, hand-written
// event log used only to demonstrate the UI and report. It is not derived
// from any real match or footage. Deterministic: re-running gives the same file.
import { writeFileSync } from 'node:fs';

const ev = [];
let n = 0;
const add = (t, type, fields = {}) =>
  ev.push({ id: `demo_${String(++n).padStart(3, '0')}`, t, type, ...fields, provenance: { source: 'manual', status: 'verified' } });
const shot = (t, team, outcome, shotType = 'play', outsideArc, extra = {}) =>
  add(t, 'shot', { team, outcome, shotType, ...(outsideArc === undefined ? {} : { outsideArc }), period: t < 2100 ? 'H1' : 'H2', ...extra });
const ko = (t, team, kickoutOutcome, kickoutLength, contested) =>
  add(t, 'kickout', { team, kickoutOutcome, kickoutLength, contested, period: t < 2100 ? 'H1' : 'H2' });

add(30, 'period_start', { period: 'H1' });
shot(95, 'home', 'point', 'play', false, { player: '11' });
ko(120, 'away', 'won', 'short', false);
shot(210, 'away', 'wide', 'play', true);
ko(230, 'home', 'lost', 'long', true);
shot(330, 'away', 'two_point', 'play', true, { player: '12' });
ko(350, 'home', 'won', 'short', false);
shot(470, 'home', 'point', 'free', false, { player: '14' });
ko(490, 'away', 'won', 'long', true);
shot(600, 'away', 'saved', 'play', false);
shot(720, 'home', 'goal', 'play', false, { player: '13' });
ko(745, 'away', 'lost', 'long', true);
shot(800, 'home', 'wide', 'play', true);
add(860, 'card', { team: 'away', card: 'yellow', player: '6', period: 'H1' });
shot(905, 'home', 'two_point', 'free', true, { player: '14' });
ko(925, 'away', 'won', 'short', false);
shot(1040, 'away', 'point', 'play', false, { player: '10' });
ko(1060, 'home', 'won', 'short', false);
shot(1190, 'home', 'short', 'play', true);
shot(1300, 'away', 'wide', 'free', true);
shot(1420, 'away', 'point', 'mark', false, { player: '14' });
ko(1440, 'home', 'lost', 'long', true);
shot(1560, 'home', 'blocked', 'play', false);
shot(1700, 'home', 'point', 'play', false, { player: '9' });
ko(1720, 'away', 'won', 'long', true);
shot(1830, 'away', 'two_point', 'play', true, { player: '11' });
add(2070, 'period_end', { period: 'H1' });
add(2700, 'period_start', { period: 'H2' });
shot(2790, 'away', 'point', 'free', false, { player: '14', period: 'H2' });
ko(2810, 'home', 'won', 'short', false);
shot(2950, 'home', 'post', 'play', false);
shot(3080, 'home', 'point', 'play', false, { player: '11' });
ko(3100, 'away', 'lost', 'long', true);
shot(3240, 'home', 'wide', '45', true);
shot(3390, 'away', 'goal', 'penalty', false, { player: '14' });
ko(3410, 'home', 'won', 'long', true);
shot(3555, 'home', 'two_point', 'play', true, { player: '12' });
ko(3575, 'away', 'won', 'short', false);
shot(3700, 'away', 'wide', 'play', true);
add(3790, 'card', { team: 'home', card: 'black', player: '4', period: 'H2' });
shot(3900, 'home', 'point', 'free', false, { player: '14' });
ko(3920, 'away', 'lost', 'long', true);
shot(4050, 'away', 'point', 'play', false, { player: '15' });
ko(4070, 'home', 'won', 'short', false);
shot(4200, 'home', 'point', 'play', false, { player: '10' });
shot(4330, 'away', 'wide', 'play', false);
add(4420, 'note', { note: 'Example note: momentum shift after substitution (fictional).', period: 'H2' });
shot(4500, 'home', 'saved', 'play', false);
shot(4610, 'away', 'wide', 'free', true);
add(4700, 'period_end', { period: 'H2' });

const doc = {
  schemaVersion: '1.0',
  sport: 'gaelic_football',
  demo: true,
  match: {
    title: 'DEMO – fictional match for illustration only',
    date: '2026-05-17',
    venue: 'Fictional Park',
    competition: 'Demo League (fictional)',
    home: { name: 'Ballymore', colour: '#0b6e4f' },
    away: { name: 'Glenview', colour: '#b42318' },
    ruleset: 'gaa-football-2025',
  },
  video: { profile: 'veo', durationSec: 4800 },
  coverage: { scores: true, shots: true, kickouts: true, turnovers: false, frees: false, cards: true },
  events: ev.map((e) => ({ ...e, period: e.period ?? (e.t < 2100 ? 'H1' : 'H2') })),
};
writeFileSync(new URL('../public/samples/demo-match.json', import.meta.url), JSON.stringify(doc, null, 2) + '\n');
console.log(`wrote ${ev.length} events`);
