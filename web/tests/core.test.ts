import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { eventFromCandidate, manualEvent, mergeCvAnalysis, newDocument } from '../src/core/document';
import { csvField, eventsCsv, formatStat, statsCsv } from '../src/core/export';
import { GAA_FOOTBALL_2025 } from '../src/core/rules';
import { computeStats, formatClock, formatScoreline } from '../src/core/stats';
import type { AnalysisDocument, CvCandidate, MatchEvent } from '../src/core/types';
import { parseDocument, validateDocument } from '../src/core/validate';

const demo = (): AnalysisDocument =>
  JSON.parse(readFileSync(new URL('../public/samples/demo-match.json', import.meta.url), 'utf8'));

function doc(events: Array<Omit<MatchEvent, 'id' | 'provenance'>>, covered = true): AnalysisDocument {
  const d = newDocument('Ballymore', 'Glenview');
  d.events = events.map((e) => manualEvent(e));
  if (covered) d.coverage = { scores: true, shots: true, kickouts: true, turnovers: true, frees: true, cards: true };
  return d;
}

describe('GAA scoring', () => {
  it('values goal 3, two-pointer 2, point 1, misses 0', () => {
    expect(GAA_FOOTBALL_2025.scoreValue('goal')).toBe(3);
    expect(GAA_FOOTBALL_2025.scoreValue('two_point')).toBe(2);
    expect(GAA_FOOTBALL_2025.scoreValue('point')).toBe(1);
    for (const o of ['wide', 'short', 'saved', 'blocked', 'post'] as const) expect(GAA_FOOTBALL_2025.scoreValue(o)).toBe(0);
  });

  it('formats scorelines with two-pointers in the points tally', () => {
    const s = computeStats(
      doc([
        { t: 1, type: 'shot', team: 'home', outcome: 'goal' },
        { t: 2, type: 'shot', team: 'home', outcome: 'two_point', outsideArc: true },
        { t: 3, type: 'shot', team: 'home', outcome: 'point' },
        { t: 4, type: 'shot', team: 'away', outcome: 'point' },
      ]),
    );
    expect(s.home.scoreline).toBe('1-03 (6)');
    expect(s.home.goals.value).toBe(1);
    expect(s.home.twoPointers.value).toBe(1);
    expect(s.home.points.value).toBe(1);
    expect(s.home.total.value).toBe(6);
    expect(s.away.scoreline).toBe('0-01 (1)');
    expect(formatScoreline(2, 15)).toBe('2-15 (21)');
  });

  it('zero-zero is a known 0-00 (0) when scores are fully tagged', () => {
    const s = computeStats(doc([]));
    expect(s.home.scoreline).toBe('0-00 (0)');
    expect(s.home.total.value).toBe(0);
  });

  it('warns on rule-inconsistent tags but still counts the recorded outcome', () => {
    const d = doc([
      { t: 1, type: 'shot', team: 'home', outcome: 'two_point', outsideArc: false },
      { t: 2, type: 'shot', team: 'home', outcome: 'two_point', shotType: 'penalty' },
      { t: 3, type: 'shot', team: 'home', outcome: 'two_point', shotType: '45', outsideArc: true },
      { t: 4, type: 'shot', team: 'away', outcome: 'point', shotType: 'play', outsideArc: true },
    ]);
    const s = computeStats(d);
    const msgs = s.quality.warnings.map((w) => w.message).join('\n');
    expect(msgs).toMatch(/inside the 40m arc/);
    expect(msgs).toMatch(/penalty cannot/);
    expect(msgs).toMatch(/45s/);
    expect(msgs).toMatch(/normally worth 2/);
    expect(s.home.total.value).toBe(6);
  });
});

describe('aggregation', () => {
  it('computes shooting, kick-outs and turnovers with evidence ids', () => {
    const d = doc([
      { t: 1, type: 'shot', team: 'home', outcome: 'point', shotType: 'free' },
      { t: 2, type: 'shot', team: 'home', outcome: 'wide', shotType: 'free' },
      { t: 3, type: 'shot', team: 'home', outcome: 'wide' },
      { t: 4, type: 'shot', team: 'home', outcome: 'short' },
      { t: 5, type: 'kickout', team: 'home', kickoutOutcome: 'won', kickoutLength: 'short' },
      { t: 6, type: 'kickout', team: 'home', kickoutOutcome: 'lost', kickoutLength: 'long' },
      { t: 7, type: 'kickout', team: 'home', kickoutOutcome: 'won', kickoutLength: 'long' },
      { t: 8, type: 'turnover', team: 'away', cause: 'tackle' },
    ]);
    const s = computeStats(d);
    expect(s.home.shots.value).toBe(4);
    expect(s.home.scores.value).toBe(1);
    expect(s.home.wides.value).toBe(2);
    expect(s.home.short.value).toBe(1);
    expect(s.home.shotAccuracy.value).toBeCloseTo(0.25);
    expect(formatStat(s.home.shotAccuracy)).toBe('25% (1/4)');
    expect(s.home.freesConversion.value).toBeCloseTo(0.5);
    expect(s.home.shotsByType!.free).toEqual({ shots: 2, scores: 1 });
    expect(s.home.kickoutsTaken.value).toBe(3);
    expect(s.home.kickoutsWon.value).toBe(2);
    expect(s.home.kickoutsLong.value).toBe(2);
    expect(s.home.kickoutRetention.value).toBeCloseTo(2 / 3);
    expect(s.away.turnoversWon.value).toBe(1);
    expect(s.home.turnoversConceded.value).toBe(1);
    expect(s.home.wides.evidence).toHaveLength(2);
    for (const id of s.home.wides.evidence) expect(d.events.find((e) => e.id === id)?.outcome).toBe('wide');
  });

  it('reports untagged categories as unknown, never zero', () => {
    const d = doc([{ t: 1, type: 'shot', team: 'home', outcome: 'point' }], false);
    d.coverage.scores = true;
    const s = computeStats(d);
    expect(s.home.total.value).toBe(1);
    expect(s.home.shots.value).toBeNull();
    expect(s.home.wides.value).toBeNull();
    expect(s.home.shotAccuracy.value).toBeNull();
    expect(formatStat(s.home.shotAccuracy)).toBe('unknown');
    expect(s.home.kickoutRetention.value).toBeNull();
    expect(s.home.turnoversWon.value).toBeNull();
    expect(s.home.turnoversWon.reason).toMatch(/not marked/);
    expect(s.home.shotsByType).toBeNull();
  });

  it('final score is unknown when scores are not declared fully tagged', () => {
    const s = computeStats(doc([{ t: 1, type: 'shot', team: 'home', outcome: 'goal' }], false));
    expect(s.home.scoreline).toBe('unknown');
    expect(s.home.total.value).toBeNull();
    expect(s.timeline[0].running).toBeUndefined();
  });

  it('accuracy with no shots is not a fake 0%', () => {
    const s = computeStats(doc([]));
    expect(s.home.shotAccuracy.value).toBeNull();
    expect(formatStat(s.home.shotAccuracy)).toBe('0/0');
  });

  it('excludes events with status unknown and lists them', () => {
    const d = doc([
      { t: 1, type: 'shot', team: 'home', outcome: 'goal' },
      { t: 2, type: 'shot', team: 'home', outcome: 'point' },
    ]);
    d.events[0].provenance = { source: 'cv', status: 'unknown' };
    const s = computeStats(d);
    expect(s.home.total.value).toBe(1);
    expect(s.quality.excludedUnknown).toEqual([d.events[0].id]);
  });

  it('builds a timeline with running score, sorted by time', () => {
    const d = doc([
      { t: 50, type: 'shot', team: 'away', outcome: 'goal' },
      { t: 10, type: 'shot', team: 'home', outcome: 'point' },
      { t: 20, type: 'shot', team: 'home', outcome: 'wide' },
      { t: 0, type: 'period_start', period: 'H1' },
    ]);
    const tl = computeStats(d).timeline;
    expect(tl.map((x) => x.event.t)).toEqual([0, 10, 50]);
    expect(tl[2].running).toEqual({ home: '0-01 (1)', away: '1-00 (3)' });
  });

  it('demo match totals match a hand count', () => {
    const s = computeStats(demo());
    expect(s.home.scoreline).toBe('1-10 (13)');
    expect(s.away.scoreline).toBe('1-08 (11)');
    expect(s.home.shots.value).toBe(15);
    expect(s.home.scores.value).toBe(9);
    expect(s.away.shots.value).toBe(13);
    expect(s.away.wides.value).toBe(5);
    expect(s.home.kickoutsTaken.value).toBe(7);
    expect(s.home.kickoutsWon.value).toBe(5);
    expect(s.away.kickoutsTaken.value).toBe(8);
    expect(s.away.kickoutsWon.value).toBe(5);
    expect(s.home.turnoversWon.value).toBeNull(); // demo declares turnovers untagged
  });
});

describe('provenance and CV candidates', () => {
  const cand: CvCandidate = {
    id: 'cand_1', t: 12.5, kind: 'possession_change', teamCluster: 'A', confidence: 0.42, status: 'inferred',
    detail: 'nearest player changed cluster B→A for 6 frames',
  };

  it('candidates never count in stats until accepted', () => {
    const d = doc([]);
    d.cv = {
      run: { processor: 'gaa_cv', version: '0.1.0', detector: { model: 'yolox_s', licence: 'Apache-2.0', inputSize: 640, confThreshold: 0.3 }, tracker: 'ByteTrack', frameStride: 2, framesAnalysed: 10, elapsedSec: 1, capabilities: {} },
      frames: [], tracks: { total: 0, teamA: 0, teamB: 0, unassigned: 0 }, candidates: [cand], warnings: [],
    };
    let s = computeStats(d);
    expect(s.away.turnoversWon.value).toBe(0);
    expect(s.quality.cvCandidates.pending).toBe(1);

    d.events.push(eventFromCandidate(cand, { type: 'turnover', team: 'away' }));
    cand.review = 'accepted';
    s = computeStats(d);
    expect(s.away.turnoversWon.value).toBe(1);
    expect(s.quality.bySource.cv).toBe(1);
    expect(s.quality.cvCandidates.accepted).toBe(1);
    const ev = d.events[0];
    expect(ev.t).toBe(12.5);
    expect(ev.provenance).toMatchObject({ source: 'cv', status: 'verified', candidateId: 'cand_1' });
  });

  it('mergeCvAnalysis keeps human events and rejects files without cv', () => {
    const d = doc([{ t: 1, type: 'shot', team: 'home', outcome: 'point' }]);
    expect(() => mergeCvAnalysis(d, newDocument())).toThrow(/no CV analysis/);
  });
});

describe('validation', () => {
  it('accepts the demo and round-trips JSON', () => {
    const r = parseDocument(JSON.stringify(demo()));
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('rejects malformed documents with useful messages', () => {
    expect(parseDocument('{nope').errors[0]).toMatch(/Invalid JSON/);
    const bad = demo();
    (bad.events[1] as unknown as Record<string, unknown>).outcome = 'three_point';
    (bad.events[2] as unknown as Record<string, unknown>).t = -5;
    bad.events[3].id = bad.events[4].id;
    bad.events[5].provenance = { source: 'manual', status: 'inferred' };
    const r = validateDocument(bad);
    expect(r.ok).toBe(false);
    const all = r.errors.join('\n');
    expect(all).toMatch(/three_point/);
    expect(all).toMatch(/non-negative/);
    expect(all).toMatch(/duplicate/);
    expect(all).toMatch(/manual event cannot be "inferred"/);
  });

  it('fills defaults for missing coverage (unknown, not covered)', () => {
    const d = demo() as unknown as Record<string, unknown>;
    delete d.coverage;
    const r = validateDocument(d);
    expect(r.ok).toBe(true);
    expect(r.doc!.coverage.shots).toBe(false);
  });
});

describe('exports', () => {
  it('escapes CSV fields and neutralises formula injection', () => {
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvField('-3')).toBe('-3');
    expect(csvField(undefined)).toBe('');
  });

  it('events CSV has a header and one row per event', () => {
    const d = demo();
    const lines = eventsCsv(d).trim().split('\r\n');
    expect(lines[0].startsWith('id,time_s,clock')).toBe(true);
    expect(lines).toHaveLength(d.events.length + 1);
    expect(lines.some((l) => l.includes('Two-pointer'))).toBe(true);
  });

  it('stats CSV writes unknown for untagged categories and evidence ids', () => {
    const csv = statsCsv(demo());
    expect(csv).toMatch(/Turnovers won,unknown,unknown/);
    expect(csv).toMatch(/Goals,1,1,demo_/);
  });

  it('formats clock times', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(75.9)).toBe('1:15');
    expect(formatClock(3725)).toBe('1:02:05');
  });
});
