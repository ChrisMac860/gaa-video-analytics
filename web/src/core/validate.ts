import { emptyCoverage } from './document';
import type { AnalysisDocument, MatchEvent } from './types';

/**
 * Structural validation for imported JSON. Hand-written (no runtime deps);
 * mirrors /schema/analysis.schema.json. Returns errors rather than throwing
 * so the UI can show all problems at once.
 */

const EVENT_TYPES = ['shot', 'kickout', 'turnover', 'free_won', 'card', 'period_start', 'period_end', 'note'];
const OUTCOMES = ['goal', 'two_point', 'point', 'wide', 'short', 'saved', 'blocked', 'post'];
const SHOT_TYPES = ['play', 'free', '45', 'mark', 'penalty', 'sideline'];
const STATUSES = ['observed', 'inferred', 'verified', 'unknown'];
const SOURCES = ['manual', 'cv'];
const TEAMS = ['home', 'away'];
const PERIODS = ['H1', 'H2', 'ET1', 'ET2'];

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  doc?: AnalysisDocument;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function checkEnum(errors: string[], where: string, v: unknown, allowed: string[], optional = true) {
  if (v === undefined && optional) return;
  if (typeof v !== 'string' || !allowed.includes(v)) errors.push(`${where}: "${String(v)}" is not one of ${allowed.join(', ')}`);
}

export function validateEvent(e: unknown, i: number): string[] {
  const errors: string[] = [];
  const w = `events[${i}]`;
  if (!isObj(e)) return [`${w}: not an object`];
  if (typeof e.id !== 'string' || !e.id) errors.push(`${w}.id: required string`);
  if (typeof e.t !== 'number' || !Number.isFinite(e.t) || e.t < 0) errors.push(`${w}.t: must be a non-negative number of seconds`);
  checkEnum(errors, `${w}.type`, e.type, EVENT_TYPES, false);
  checkEnum(errors, `${w}.team`, e.team, TEAMS);
  checkEnum(errors, `${w}.period`, e.period, PERIODS);
  checkEnum(errors, `${w}.outcome`, e.outcome, OUTCOMES);
  checkEnum(errors, `${w}.shotType`, e.shotType, SHOT_TYPES);
  checkEnum(errors, `${w}.kickoutOutcome`, e.kickoutOutcome, ['won', 'lost']);
  checkEnum(errors, `${w}.kickoutLength`, e.kickoutLength, ['short', 'long']);
  checkEnum(errors, `${w}.card`, e.card, ['yellow', 'black', 'red']);
  if (e.outsideArc !== undefined && typeof e.outsideArc !== 'boolean') errors.push(`${w}.outsideArc: must be boolean`);
  if (e.type === 'shot' && e.outcome === undefined) errors.push(`${w}: shot requires an outcome`);
  if ((e.type === 'shot' || e.type === 'kickout' || e.type === 'turnover') && e.team === undefined)
    errors.push(`${w}: ${String(e.type)} requires a team`);
  if (!isObj(e.provenance)) errors.push(`${w}.provenance: required`);
  else {
    checkEnum(errors, `${w}.provenance.source`, e.provenance.source, SOURCES, false);
    checkEnum(errors, `${w}.provenance.status`, e.provenance.status, STATUSES, false);
    const c = e.provenance.confidence;
    if (c !== undefined && (typeof c !== 'number' || c < 0 || c > 1)) errors.push(`${w}.provenance.confidence: must be 0..1`);
    if (e.provenance.source === 'manual' && (e.provenance.status === 'observed' || e.provenance.status === 'inferred'))
      errors.push(`${w}.provenance: a manual event cannot be "${e.provenance.status}" (that status is reserved for model output)`);
  }
  return errors;
}

export function validateDocument(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObj(input)) return { ok: false, errors: ['File is not a JSON object'] };
  if (input.sport !== undefined && input.sport !== 'gaelic_football') errors.push(`sport: unsupported "${String(input.sport)}"`);
  if (typeof input.schemaVersion !== 'string' || !input.schemaVersion.startsWith('1.'))
    errors.push(`schemaVersion: expected 1.x, got "${String(input.schemaVersion)}"`);
  const m = input.match;
  if (!isObj(m) || !isObj(m.home) || !isObj(m.away) || typeof m.home.name !== 'string' || typeof m.away.name !== 'string')
    errors.push('match.home.name and match.away.name are required');
  if (!Array.isArray(input.events)) errors.push('events: must be an array');
  else {
    const ids = new Set<string>();
    input.events.forEach((e, i) => {
      errors.push(...validateEvent(e, i));
      if (isObj(e) && typeof e.id === 'string') {
        if (ids.has(e.id)) errors.push(`events[${i}].id: duplicate "${e.id}"`);
        ids.add(e.id);
      }
    });
  }
  if (input.cv !== undefined) {
    if (!isObj(input.cv) || !Array.isArray(input.cv.candidates) || !isObj(input.cv.run))
      errors.push('cv: must contain run and candidates');
  }
  if (errors.length) return { ok: false, errors };

  const doc = input as unknown as AnalysisDocument;
  // Normalise optional parts so older/partial files load.
  doc.coverage = { ...emptyCoverage(), ...(isObj(input.coverage) ? (input.coverage as object) : {}) };
  doc.video = isObj(input.video) ? doc.video : { profile: 'generic_mp4' };
  doc.video.profile ??= 'generic_mp4';
  doc.match.ruleset ??= 'gaa-football-2025';
  doc.sport = 'gaelic_football';
  return { ok: true, errors: [], doc };
}

export function parseDocument(text: string): ValidationResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return { ok: false, errors: [`Invalid JSON: ${(err as Error).message}`] };
  }
  return validateDocument(raw);
}

export type { MatchEvent };
