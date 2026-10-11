/**
 * Data contract shared by the web app, the local CV processor and exports.
 * The JSON Schema in /schema/analysis.schema.json mirrors these types.
 *
 * Core rule: every statistic must be traceable to events, and every event
 * carries provenance. CV output never becomes an event until a person
 * accepts it (or it is explicitly imported as an unverified candidate).
 */

export const SCHEMA_VERSION = '1.0';

export type TeamSide = 'home' | 'away';

/** How much we trust an event. */
export type EvidenceStatus =
  | 'observed' // directly supported by model output or footage
  | 'inferred' // derived heuristically, with a confidence
  | 'verified' // confirmed or corrected by a person
  | 'unknown'; // insufficient evidence

export type EventSource = 'manual' | 'cv';

export interface Provenance {
  source: EventSource;
  status: EvidenceStatus;
  /** 0..1, only meaningful for source === 'cv'. */
  confidence?: number;
  /** id of the CV candidate this event came from, if any. */
  candidateId?: string;
  /** Free text: who verified it, which model produced it, etc. */
  detail?: string;
}

export type Period = 'H1' | 'H2' | 'ET1' | 'ET2';

export type EventType =
  | 'shot' // any attempt at a score (incl. frees, 45s, marks, penalties)
  | 'kickout' // restart from the goalkeeper; `team` = team TAKING the kick-out
  | 'turnover' // change of possession in open play; `team` = team that WON the ball
  | 'free_won' // `team` = team awarded the free
  | 'card' // `team` = team of the carded player
  | 'period_start'
  | 'period_end'
  | 'note';

export type ShotOutcome =
  | 'goal' // 3 points
  | 'two_point' // 2 points: kicked over the bar from outside the 40m arc (see rules)
  | 'point' // 1 point
  | 'wide'
  | 'short' // dropped short / into keeper's hands
  | 'saved'
  | 'blocked'
  | 'post'; // hit woodwork and stayed in play (no score)

export type ShotType = 'play' | 'free' | '45' | 'mark' | 'penalty' | 'sideline';

export type KickoutOutcome = 'won' | 'lost';
export type KickoutLength = 'short' | 'long';

export type TurnoverCause =
  | 'tackle'
  | 'interception'
  | 'handling_error'
  | 'foul'
  | 'kick_away'
  | 'other';

export type CardColour = 'yellow' | 'black' | 'red';

export interface MatchEvent {
  id: string;
  /** Seconds from the start of the video file. */
  t: number;
  period?: Period;
  team?: TeamSide;
  type: EventType;
  /** Optional player label (number or name). Never auto-filled by CV. */
  player?: string;

  // shot
  outcome?: ShotOutcome;
  shotType?: ShotType;
  /** true = taken from outside the 40m arc, false = inside, undefined = not recorded. */
  outsideArc?: boolean;

  // kickout
  kickoutOutcome?: KickoutOutcome;
  kickoutLength?: KickoutLength;
  contested?: boolean;

  // turnover
  cause?: TurnoverCause;

  // card
  card?: CardColour;

  /** Optional pitch location, normalised 0..1 (x along length towards the away goal). */
  pitch?: { x: number; y: number };

  note?: string;
  provenance: Provenance;
}

/** What a person has declared as fully tagged. Stats in an untagged category are reported as unknown. */
export interface TaggingCoverage {
  /** Every score (goal/point/two-pointer) is tagged. Required for the final score. */
  scores: boolean;
  /** Every shot, including misses, is tagged. Required for wides/accuracy. */
  shots: boolean;
  kickouts: boolean;
  turnovers: boolean;
  frees: boolean;
  cards: boolean;
}

export interface TeamInfo {
  name: string;
  colour?: string; // CSS colour for UI
}

export interface MatchInfo {
  title?: string;
  date?: string; // ISO date
  venue?: string;
  competition?: string;
  home: TeamInfo;
  away: TeamInfo;
  /** Ruleset id, see core/rules.ts */
  ruleset: string;
}

export type SourceProfile = 'veo' | 'generic_mp4' | 'phone' | 'fixed_camera' | 'other';

export interface VideoInfo {
  fileName?: string;
  durationSec?: number;
  fps?: number;
  width?: number;
  height?: number;
  profile: SourceProfile;
}

/** Event candidate produced by the CV processor. Not counted in stats. */
export interface CvCandidate {
  id: string;
  t: number;
  tEnd?: number;
  kind: 'possession_change' | 'ball_visible_segment' | 'activity_peak' | string;
  /** Team cluster label from jersey colour (A/B). Mapping to home/away is a human decision. */
  teamCluster?: 'A' | 'B';
  confidence: number;
  status: 'inferred' | 'observed';
  detail: string;
  /** Set by the web app when a person reviews it. */
  review?: 'accepted' | 'rejected';
}

export interface CvRunInfo {
  processor: string;
  version: string;
  detector: { model: string; licence: string; inputSize: number; confThreshold: number };
  tracker: string;
  frameStride: number;
  framesAnalysed: number;
  elapsedSec: number;
  /** Per-capability honest status. */
  capabilities: Record<string, 'implemented' | 'experimental' | 'not_implemented'>;
}

export interface CvSummary {
  run: CvRunInfo;
  /** Per sampled frame: time and counts. Small; full tracks go to a separate CSV. */
  frames: Array<{ t: number; persons: number; balls: number; teamA: number; teamB: number }>;
  tracks: { total: number; teamA: number; teamB: number; unassigned: number };
  teamColours?: { A: string; B: string };
  candidates: CvCandidate[];
  warnings: string[];
}

export interface AnalysisDocument {
  schemaVersion: string;
  sport: 'gaelic_football';
  match: MatchInfo;
  video: VideoInfo;
  coverage: TaggingCoverage;
  events: MatchEvent[];
  cv?: CvSummary;
  /** True for bundled demonstration data. Reports must say so. */
  demo?: boolean;
}
