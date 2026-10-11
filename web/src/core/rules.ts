import type { MatchEvent, ShotOutcome, ShotType } from './types';

/**
 * Sport rules. Only Gaelic football is implemented; the interface is what a
 * future sport (hurling, ladies' football, rugby...) would implement.
 *
 * Sources and uncertainties: docs/research/gaa-rules.md
 */
export interface SportRules {
  id: string;
  label: string;
  /** Points awarded for a shot outcome; 0 for non-scores. */
  scoreValue(outcome: ShotOutcome): number;
  /** Rule-consistency warnings for a single event (never blocks saving). */
  checkEvent(e: MatchEvent): string[];
  /** Human-readable rule notes shown in the report. */
  notes: string[];
}

const SCORE_OUTCOMES: ReadonlySet<ShotOutcome> = new Set(['goal', 'two_point', 'point']);

export function isScore(outcome: ShotOutcome | undefined): boolean {
  return outcome !== undefined && SCORE_OUTCOMES.has(outcome);
}

/** Shot types from which a two-point score is possible under the 2026 rules. */
const TWO_POINT_SHOT_TYPES: ReadonlySet<ShotType> = new Set(['play', 'free', 'mark', 'sideline']);

/**
 * Men's Gaelic football, rules in force from 1 January 2026 (FRC changes
 * ratified at Special Congress, October 2025):
 * - goal = 3 points, point = 1
 * - a score kicked from outside the 40m arc = 2 points
 * - kick-outs from the 20m line must travel beyond the 40m arc
 * The id keeps the "2025" suffix because the arc was introduced for the
 * 2025 season as a trial; documents written by earlier versions still load.
 */
export const GAA_FOOTBALL_2025: SportRules = {
  id: 'gaa-football-2025',
  label: "Gaelic football (men's), 2025/2026 rules with the 40m two-point arc",
  scoreValue(outcome) {
    switch (outcome) {
      case 'goal':
        return 3;
      case 'two_point':
        return 2;
      case 'point':
        return 1;
      default:
        return 0;
    }
  },
  checkEvent(e) {
    const w: string[] = [];
    if (e.type !== 'shot') return w;
    if (!e.outcome) w.push('Shot has no outcome recorded.');
    if (e.outcome === 'two_point') {
      if (e.outsideArc === false) w.push('Two-point score recorded from inside the 40m arc.');
      if (e.shotType === 'penalty') w.push('A penalty cannot be a two-point score.');
      if (e.shotType === '45')
        w.push('45s are believed to score 1 point under current rules (check competition regulations).');
      else if (e.shotType && !TWO_POINT_SHOT_TYPES.has(e.shotType))
        w.push(`Two-point score from shot type "${e.shotType}" is unusual.`);
    }
    if (e.outcome === 'point' && e.outsideArc === true && e.shotType !== '45')
      w.push('Point kicked from outside the arc is normally worth 2 (unless a team-mate touched it or it was hand-passed).');
    if (e.outcome === 'goal' && e.outsideArc === true) {
      // legal, just rare — no warning
    }
    if (!e.team) w.push('Shot has no team.');
    return w;
  },
  notes: [
    'Goal = 3 points; point = 1; a score kicked from outside the 40m arc = 2 points.',
    'Score values come from the outcome recorded for each event; the software never infers a score from video.',
    'Shots include all attempts at a score: from play, frees, 45s, marks, penalties and sideline kicks.',
    'Kick-out "won" means the team taking the kick-out retained possession.',
  ],
};

const RULESETS: Record<string, SportRules> = {
  [GAA_FOOTBALL_2025.id]: GAA_FOOTBALL_2025,
};

export function getRules(id: string): SportRules {
  return RULESETS[id] ?? GAA_FOOTBALL_2025;
}
