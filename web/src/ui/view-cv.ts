import { formatClock } from '../core/stats';
import type { CvSummary } from '../core/types';
import { h, replace } from './dom';
import { commit, getDoc, seek, subscribe } from './state';
import { openCandidateForm } from './view-review';

const SVGNS = 'http://www.w3.org/2000/svg';

function sparkline(frames: CvSummary['frames']): SVGElement {
  const W = 600, H = 90, P = 4;
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'spark');
  svg.setAttribute('role', 'img');
  const maxV = Math.max(1, ...frames.map((f) => Math.max(f.persons, f.balls)));
  const t0 = frames[0]?.t ?? 0, t1 = frames[frames.length - 1]?.t ?? 1;
  svg.setAttribute('aria-label', `People and ball detected per sampled frame over ${formatClock(t1 - t0)}; most people in one frame: ${Math.max(0, ...frames.map((f) => f.persons))}`);
  const line = (key: 'persons' | 'balls', colour: string) => {
    const pts = frames.map((f) => `${(P + ((f.t - t0) / Math.max(1e-9, t1 - t0)) * (W - 2 * P)).toFixed(1)},${(H - P - (f[key] / maxV) * (H - 2 * P)).toFixed(1)}`).join(' ');
    const pl = document.createElementNS(SVGNS, 'polyline');
    pl.setAttribute('points', pts);
    pl.setAttribute('fill', 'none');
    pl.setAttribute('stroke', colour);
    pl.setAttribute('stroke-width', '1.6');
    pl.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.append(pl);
  };
  line('persons', '#0b6e4f');
  line('balls', '#b45309');
  return svg;
}

export function mountCv(root: HTMLElement): void {
  const render = (): void => {
    const doc = getDoc();
    const cv = doc.cv;
    if (!cv) { replace(root, h('p', { class: 'empty' }, 'No computer-vision analysis loaded.')); return; }
    const run = cv.run;
    const sw = (c?: string) => h('span', { class: 'swatch', style: { background: c ?? '#999' } });
    const caps = Object.entries(run.capabilities);
    const pending = cv.candidates.filter((c) => !c.review).length;
    replace(root,
      h('div', { class: 'banner warn-banner', role: 'note' },
        h('strong', null, 'Candidates are computer-vision suggestions. '), 'They do not count in statistics until you accept them.'),
      h('div', { class: 'card' },
        h('h2', null, 'CV run'),
        h('dl', { class: 'kv' },
          ...([
            ['Processor', `${run.processor} ${run.version}`],
            ['Detector', `${run.detector.model} (licence ${run.detector.licence}), input ${run.detector.inputSize}px, confidence ≥ ${run.detector.confThreshold}`],
            ['Tracker', run.tracker],
            ['Frames analysed', `${run.framesAnalysed} (every ${run.frameStride} frames), ${run.elapsedSec.toFixed(1)} s`],
            ['Tracks', `${cv.tracks.total} total (${cv.tracks.teamA} cluster A, ${cv.tracks.teamB} cluster B, ${cv.tracks.unassigned} unassigned)`],
          ] as Array<[string, string]>).flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v)])),
        h('h3', null, 'Capabilities'),
        h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', null, 'Capability'), h('th', null, 'Status'))),
          h('tbody', null, ...caps.map(([k, v]) => h('tr', null, h('td', null, k.replace(/_/g, ' ')), h('td', null, h('span', { class: `badge cap-${v}` }, v.replace(/_/g, ' '))))))),
        cv.warnings.length ? h('div', { class: 'warnbox' }, h('h3', null, 'Processor warnings'), h('ul', null, ...cv.warnings.map((w) => h('li', null, w)))) : null,
      ),
      h('div', { class: 'card' },
        h('h2', null, 'People and ball per sampled frame'),
        cv.frames.length > 1 ? sparkline(cv.frames) : h('p', { class: 'empty' }, 'Not enough frames to plot.'),
        h('p', { class: 'legend' }, h('span', { class: 'swatch', style: { background: '#0b6e4f' } }), ' people ', h('span', { class: 'swatch', style: { background: '#b45309' } }), ' ball'),
        cv.teamColours ? h('p', null, 'Jersey colour clusters (not teams): ', sw(cv.teamColours.A), ' A ', sw(cv.teamColours.B), ' B. You decide which cluster is which team when accepting a candidate.') : null,
      ),
      h('div', { class: 'card' },
        h('h2', null, `Candidates (${cv.candidates.length}, ${pending} awaiting review)`),
        cv.candidates.length === 0 ? h('p', { class: 'empty' }, 'No candidates.') :
          h('ul', { class: 'evlist' }, ...[...cv.candidates].sort((a, b) => a.t - b.t).map((c) =>
            h('li', { class: `ev ${c.review ?? ''}` },
              h('div', { class: 'ev-main' },
                h('button', { type: 'button', class: 'btn small jump', onClick: () => seek(c.t) }, '▶ ', formatClock(c.t)),
                h('span', { class: 'ev-desc' }, c.kind.replace(/_/g, ' '), c.teamCluster ? ` (cluster ${c.teamCluster})` : ''),
                h('span', { class: 'badge inferred' }, `${c.status}, ${Math.round(c.confidence * 100)}%`),
                c.review ? h('span', { class: `badge ${c.review === 'accepted' ? 'verified' : 'unknown'}` }, c.review) : null),
              h('div', { class: 'hint' }, c.detail),
              h('div', { class: 'row' },
                h('button', { type: 'button', class: 'btn small primary', disabled: c.review === 'accepted', onClick: () => openCandidateForm(c) }, 'Accept…'),
                h('button', { type: 'button', class: 'btn small', onClick: () => { c.review = c.review === 'rejected' ? undefined : 'rejected'; commit(); } }, c.review === 'rejected' ? 'Undo reject' : 'Reject'))))),
      ),
    );
  };
  subscribe(render);
  render();
}
