import { computeStats, describeEvent, formatClock, type MatchStats, type Ratio, type Stat, type TeamStats } from './stats';
import type { AnalysisDocument } from './types';

/** RFC 4180 CSV field quoting, with a guard against spreadsheet formula injection. */
export function csvField(v: unknown): string {
  if (v === undefined || v === null) return '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n';
}

export const EVENT_CSV_HEADER = [
  'id', 'time_s', 'clock', 'period', 'team', 'team_name', 'type', 'outcome', 'shot_type', 'outside_arc',
  'kickout_outcome', 'kickout_length', 'contested', 'cause', 'card', 'player', 'pitch_x', 'pitch_y',
  'source', 'status', 'confidence', 'description', 'note',
];

export function eventsCsv(doc: AnalysisDocument): string {
  const rows: unknown[][] = [EVENT_CSV_HEADER];
  for (const e of [...doc.events].sort((a, b) => a.t - b.t)) {
    rows.push([
      e.id, e.t.toFixed(2), formatClock(e.t), e.period, e.team, e.team ? doc.match[e.team].name : '', e.type,
      e.outcome, e.shotType, e.outsideArc, e.kickoutOutcome, e.kickoutLength, e.contested, e.cause, e.card,
      e.player, e.pitch?.x, e.pitch?.y, e.provenance.source, e.provenance.status, e.provenance.confidence,
      describeEvent(e, doc), e.note,
    ]);
  }
  return toCsv(rows);
}

const STAT_ROWS: Array<[string, keyof TeamStats]> = [
  ['Goals', 'goals'], ['Points (1)', 'points'], ['Two-pointers (2)', 'twoPointers'], ['Total score', 'total'],
  ['Shots', 'shots'], ['Scores from shots', 'scores'], ['Wides', 'wides'], ['Dropped short', 'short'],
  ['Saved', 'saved'], ['Blocked', 'blocked'], ['Off the post', 'post'], ['Shot accuracy', 'shotAccuracy'],
  ['Free conversion', 'freesConversion'], ['Own kick-outs taken', 'kickoutsTaken'], ['Own kick-outs won', 'kickoutsWon'],
  ['Own kick-outs lost', 'kickoutsLost'], ['Kick-out retention', 'kickoutRetention'], ['Turnovers won', 'turnoversWon'],
  ['Turnovers conceded', 'turnoversConceded'], ['Frees won', 'freesWon'], ['Cards', 'cards'],
];

function isRatio(v: Stat | Ratio): v is Ratio {
  return 'den' in v;
}

export function formatStat(v: Stat | Ratio): string {
  if (isRatio(v)) {
    if (v.num === null || v.den === null) return 'unknown';
    if (v.value === null) return `${v.num}/${v.den}`;
    return `${Math.round(v.value * 100)}% (${v.num}/${v.den})`;
  }
  return v.value === null ? 'unknown' : String(v.value);
}

export function statsRows(stats: MatchStats): Array<{ label: string; home: Stat | Ratio; away: Stat | Ratio }> {
  return STAT_ROWS.map(([label, key]) => ({
    label,
    home: stats.home[key] as Stat | Ratio,
    away: stats.away[key] as Stat | Ratio,
  }));
}

export function statsCsv(doc: AnalysisDocument, stats = computeStats(doc)): string {
  const rows: unknown[][] = [['metric', doc.match.home.name, doc.match.away.name, 'home_evidence_event_ids', 'away_evidence_event_ids']];
  for (const r of statsRows(stats))
    rows.push([r.label, formatStat(r.home), formatStat(r.away), r.home.evidence.join(' '), r.away.evidence.join(' ')]);
  return toCsv(rows);
}

export function documentJson(doc: AnalysisDocument): string {
  return JSON.stringify(doc, null, 2);
}
