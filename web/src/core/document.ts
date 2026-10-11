import { SCHEMA_VERSION } from './types';
import type { AnalysisDocument, CvCandidate, MatchEvent, TaggingCoverage } from './types';

export function emptyCoverage(): TaggingCoverage {
  return { scores: false, shots: false, kickouts: false, turnovers: false, frees: false, cards: false };
}

export function newDocument(home = 'Home', away = 'Away'): AnalysisDocument {
  return {
    schemaVersion: SCHEMA_VERSION,
    sport: 'gaelic_football',
    match: { home: { name: home, colour: '#1f6feb' }, away: { name: away, colour: '#d1242f' }, ruleset: 'gaa-football-2025' },
    video: { profile: 'generic_mp4' },
    coverage: emptyCoverage(),
    events: [],
  };
}

export function newId(prefix = 'ev'): string {
  const r =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${r}`;
}

/** A manually tagged event. */
export function manualEvent(partial: Omit<MatchEvent, 'id' | 'provenance'>): MatchEvent {
  return { ...partial, id: newId(), provenance: { source: 'manual', status: 'verified' } };
}

/**
 * Turn a reviewed CV candidate into an event. The person supplies what the
 * candidate cannot know (event type, team). The event keeps a link to the
 * candidate and is marked verified because a person confirmed it.
 */
export function eventFromCandidate(
  c: CvCandidate,
  fields: Omit<MatchEvent, 'id' | 'provenance' | 't'>,
): MatchEvent {
  return {
    ...fields,
    t: c.t,
    id: newId(),
    provenance: {
      source: 'cv',
      status: 'verified',
      confidence: c.confidence,
      candidateId: c.id,
      detail: `Accepted from CV candidate (${c.kind}): ${c.detail}`,
    },
  };
}

/** Merge an imported CV analysis into an existing document without touching human-tagged events. */
export function mergeCvAnalysis(doc: AnalysisDocument, cvDoc: AnalysisDocument): AnalysisDocument {
  if (!cvDoc.cv) throw new Error('The imported file contains no CV analysis section.');
  return {
    ...doc,
    video: { ...cvDoc.video, ...doc.video, profile: doc.video.profile ?? cvDoc.video.profile },
    cv: cvDoc.cv,
  };
}
