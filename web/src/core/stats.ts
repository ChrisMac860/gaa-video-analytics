import { getRules, isScore } from './rules';
import type {
  AnalysisDocument,
  EventSource,
  EvidenceStatus,
  MatchEvent,
  ShotOutcome,
  ShotType,
  TaggingCoverage,
  TeamSide,
} from './types';

/**
 * A statistic with its evidence. `value === null` means UNKNOWN: the
 * category was not declared as fully tagged, so a count would be misleading.
 */
export interface Stat {
  value: number | null;
  /** ids of the events this value was computed from */
  evidence: string[];
  reason?: string;
}

export interface Ratio {
  num: number | null;
  den: number | null;
  /** 0..1, null when unknown or den === 0 */
  value: number | null;
  evidence: string[];
  reason?: string;
}

export interface TeamStats {
  side: TeamSide;
  name: string;
  goals: Stat;
  points: Stat; // one-point scores
  twoPointers: Stat; // two-point scores
  /** Points tally excluding goals (points + 2 x two-pointers), as written after the dash. */
  pointsTally: Stat;
  total: Stat;
  /** "G-P (T)" or "unknown" */
  scoreline: string;
  shots: Stat;
  scores: Stat;
  wides: Stat;
  short: Stat;
  saved: Stat;
  blocked: Stat;
  post: Stat;
  shotAccuracy: Ratio;
  shotsByType: Record<ShotType | 'unspecified', { shots: number; scores: number }> | null;
  freesConversion: Ratio;
  kickoutsTaken: Stat;
  kickoutsWon: Stat;
  kickoutsLost: Stat;
  kickoutRetention: Ratio;
  kickoutsShort: Stat;
  kickoutsLong: Stat;
  turnoversWon: Stat;
  turnoversConceded: Stat;
  freesWon: Stat;
  cards: Stat;
}

export interface TimelineEntry {
  event: MatchEvent;
  label: string;
  /** running score after this event, e.g. {home: "1-03 (6)", away: "0-02 (2)"} when scores are tagged */
  running?: { home: string; away: string };
}

export interface DataQuality {
  totalEvents: number;
  countedEvents: number;
  excludedUnknown: string[]; // ids excluded because status === 'unknown'
  bySource: Record<EventSource, number>;
  byStatus: Record<EvidenceStatus, number>;
  cvUnverified: number; // cv events not verified by a person
  warnings: Array<{ eventId: string; message: string }>;
  cvCandidates: { total: number; accepted: number; rejected: number; pending: number };
}

export interface MatchStats {
  home: TeamStats;
  away: TeamStats;
  timeline: TimelineEntry[];
  quality: DataQuality;
  ruleNotes: string[];
  coverage: TaggingCoverage;
}

const NOT_TAGGED = 'Category not marked as fully tagged';

function stat(events: MatchEvent[], covered: boolean): Stat {
  if (!covered) return { value: null, evidence: [], reason: NOT_TAGGED };
  return { value: events.length, evidence: events.map((e) => e.id) };
}

function ratio(num: Stat, den: Stat): Ratio {
  const evidence = Array.from(new Set([...den.evidence, ...num.evidence]));
  if (num.value === null || den.value === null)
    return { num: num.value, den: den.value, value: null, evidence, reason: num.reason ?? den.reason };
  return {
    num: num.value,
    den: den.value,
    value: den.value === 0 ? null : num.value / den.value,
    evidence,
    reason: den.value === 0 ? 'No attempts' : undefined,
  };
}

/** Events that count towards statistics. */
export function countedEvents(events: MatchEvent[]): MatchEvent[] {
  return events.filter((e) => e.provenance.status !== 'unknown');
}

export function formatScoreline(goals: number, pointsTally: number): string {
  return `${goals}-${String(pointsTally).padStart(2, '0')} (${goals * 3 + pointsTally})`;
}

function teamStats(doc: AnalysisDocument, side: TeamSide, events: MatchEvent[]): TeamStats {
  const rules = getRules(doc.match.ruleset);
  const cov = doc.coverage;
  const other: TeamSide = side === 'home' ? 'away' : 'home';
  const mine = events.filter((e) => e.team === side);
  const shots = mine.filter((e) => e.type === 'shot');
  const byOutcome = (o: ShotOutcome) => shots.filter((e) => e.outcome === o);

  const goalsE = byOutcome('goal');
  const pointsE = byOutcome('point');
  const twoE = byOutcome('two_point');
  const scoresE = shots.filter((e) => isScore(e.outcome));

  const goals = stat(goalsE, cov.scores);
  const points = stat(pointsE, cov.scores);
  const twoPointers = stat(twoE, cov.scores);
  const tally = pointsE.length * rules.scoreValue('point') + twoE.length * rules.scoreValue('two_point');
  const pointsTally: Stat = cov.scores
    ? { value: tally, evidence: [...pointsE, ...twoE].map((e) => e.id) }
    : { value: null, evidence: [], reason: NOT_TAGGED };
  const total: Stat = cov.scores
    ? { value: goalsE.length * rules.scoreValue('goal') + tally, evidence: scoresE.map((e) => e.id) }
    : { value: null, evidence: [], reason: NOT_TAGGED };

  const shotsStat = stat(shots, cov.shots);
  // "scores" as part of shooting stats requires full shot coverage, so accuracy is consistent.
  const scoresStat = stat(scoresE, cov.shots && cov.scores);

  let shotsByType: TeamStats['shotsByType'] = null;
  if (cov.shots) {
    shotsByType = { play: z(), free: z(), '45': z(), mark: z(), penalty: z(), sideline: z(), unspecified: z() };
    for (const s of shots) {
      const k = s.shotType ?? 'unspecified';
      shotsByType[k].shots++;
      if (isScore(s.outcome)) shotsByType[k].scores++;
    }
  }
  const frees = shots.filter((e) => e.shotType === 'free');
  const freesConversion = ratio(
    stat(frees.filter((e) => isScore(e.outcome)), cov.shots),
    stat(frees, cov.shots),
  );

  const kos = mine.filter((e) => e.type === 'kickout');
  const koWon = stat(kos.filter((e) => e.kickoutOutcome === 'won'), cov.kickouts);
  const koTaken = stat(
    kos.filter((e) => e.kickoutOutcome !== undefined),
    cov.kickouts,
  );

  return {
    side,
    name: doc.match[side].name,
    goals,
    points,
    twoPointers,
    pointsTally,
    total,
    scoreline:
      cov.scores && goals.value !== null && pointsTally.value !== null
        ? formatScoreline(goals.value, pointsTally.value)
        : 'unknown',
    shots: shotsStat,
    scores: scoresStat,
    wides: stat(byOutcome('wide'), cov.shots),
    short: stat(byOutcome('short'), cov.shots),
    saved: stat(byOutcome('saved'), cov.shots),
    blocked: stat(byOutcome('blocked'), cov.shots),
    post: stat(byOutcome('post'), cov.shots),
    shotAccuracy: ratio(scoresStat, shotsStat),
    shotsByType,
    freesConversion,
    kickoutsTaken: koTaken,
    kickoutsWon: koWon,
    kickoutsLost: stat(kos.filter((e) => e.kickoutOutcome === 'lost'), cov.kickouts),
    kickoutRetention: ratio(koWon, koTaken),
    kickoutsShort: stat(kos.filter((e) => e.kickoutLength === 'short'), cov.kickouts),
    kickoutsLong: stat(kos.filter((e) => e.kickoutLength === 'long'), cov.kickouts),
    turnoversWon: stat(mine.filter((e) => e.type === 'turnover'), cov.turnovers),
    turnoversConceded: stat(
      events.filter((e) => e.type === 'turnover' && e.team === other),
      cov.turnovers,
    ),
    freesWon: stat(mine.filter((e) => e.type === 'free_won'), cov.frees),
    cards: stat(mine.filter((e) => e.type === 'card'), cov.cards),
  };
}

function z() {
  return { shots: 0, scores: 0 };
}

export function formatClock(t: number): string {
  const s = Math.max(0, Math.floor(t));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  return `${h ? h + ':' : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

const OUTCOME_LABEL: Record<ShotOutcome, string> = {
  goal: 'Goal',
  two_point: 'Two-pointer',
  point: 'Point',
  wide: 'Wide',
  short: 'Dropped short',
  saved: 'Saved',
  blocked: 'Blocked',
  post: 'Off the post',
};

export function describeEvent(e: MatchEvent, doc: AnalysisDocument): string {
  const team = e.team ? doc.match[e.team].name : '';
  const who = e.player ? ` (${e.player})` : '';
  switch (e.type) {
    case 'shot': {
      const o = e.outcome ? OUTCOME_LABEL[e.outcome] : 'Shot';
      const st = e.shotType && e.shotType !== 'play' ? ` from ${e.shotType === '45' ? 'a 45' : e.shotType}` : '';
      return `${o}${st} – ${team}${who}`;
    }
    case 'kickout':
      return `Kick-out by ${team}: ${e.kickoutOutcome ?? 'outcome not recorded'}${e.kickoutLength ? `, ${e.kickoutLength}` : ''}`;
    case 'turnover':
      return `Turnover won by ${team}${e.cause ? ` (${e.cause.replace('_', ' ')})` : ''}${who}`;
    case 'free_won':
      return `Free won by ${team}${who}`;
    case 'card':
      return `${e.card ? e.card[0].toUpperCase() + e.card.slice(1) : ''} card – ${team}${who}`.trim();
    case 'period_start':
      return `Start of ${e.period ?? 'period'}`;
    case 'period_end':
      return `End of ${e.period ?? 'period'}`;
    default:
      return e.note ?? 'Note';
  }
}

const SIGNIFICANT = new Set(['period_start', 'period_end', 'card']);

export function computeStats(doc: AnalysisDocument): MatchStats {
  const rules = getRules(doc.match.ruleset);
  const sorted = [...doc.events].sort((a, b) => a.t - b.t);
  const counted = countedEvents(sorted);

  const home = teamStats(doc, 'home', counted);
  const away = teamStats(doc, 'away', counted);

  // Timeline: scores, cards and period markers, with running score when scores are fully tagged.
  const run = { home: { g: 0, p: 0 }, away: { g: 0, p: 0 } };
  const timeline: TimelineEntry[] = [];
  for (const e of counted) {
    const scoring = e.type === 'shot' && isScore(e.outcome);
    if (!scoring && !SIGNIFICANT.has(e.type)) continue;
    if (scoring && e.team) {
      if (e.outcome === 'goal') run[e.team].g++;
      else run[e.team].p += rules.scoreValue(e.outcome!);
    }
    timeline.push({
      event: e,
      label: describeEvent(e, doc),
      running: doc.coverage.scores
        ? { home: formatScoreline(run.home.g, run.home.p), away: formatScoreline(run.away.g, run.away.p) }
        : undefined,
    });
  }

  const bySource: Record<EventSource, number> = { manual: 0, cv: 0 };
  const byStatus: Record<EvidenceStatus, number> = { observed: 0, inferred: 0, verified: 0, unknown: 0 };
  const warnings: DataQuality['warnings'] = [];
  for (const e of sorted) {
    bySource[e.provenance.source]++;
    byStatus[e.provenance.status]++;
    for (const m of rules.checkEvent(e)) warnings.push({ eventId: e.id, message: m });
  }
  const cands = doc.cv?.candidates ?? [];

  return {
    home,
    away,
    timeline,
    quality: {
      totalEvents: sorted.length,
      countedEvents: counted.length,
      excludedUnknown: sorted.filter((e) => e.provenance.status === 'unknown').map((e) => e.id),
      bySource,
      byStatus,
      cvUnverified: sorted.filter((e) => e.provenance.source === 'cv' && e.provenance.status !== 'verified').length,
      warnings,
      cvCandidates: {
        total: cands.length,
        accepted: cands.filter((c) => c.review === 'accepted').length,
        rejected: cands.filter((c) => c.review === 'rejected').length,
        pending: cands.filter((c) => !c.review).length,
      },
    },
    ruleNotes: rules.notes,
    coverage: doc.coverage,
  };
}
