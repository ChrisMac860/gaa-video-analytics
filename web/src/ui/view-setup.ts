import type { SourceProfile, TaggingCoverage } from '../core/types';
import { getRules } from '../core/rules';
import { field, h, nextId, replace, select } from './dom';
import { commit, getDoc, hasVideo, loadVideoFile, subscribe } from './state';

const PROFILES: Array<[SourceProfile, string]> = [
  ['veo', 'Veo (or similar auto-tracking camera)'],
  ['generic_mp4', 'Generic MP4 recording'],
  ['phone', 'Phone / handheld'],
  ['fixed_camera', 'Fixed camera (e.g. sideline gantry)'],
  ['other', 'Other'],
];

const COVERAGE: Array<[keyof TaggingCoverage, string]> = [
  ['scores', 'Scores (goals, points, two-pointers)'],
  ['shots', 'Shots (including wides, saved, short, blocked)'],
  ['kickouts', 'Kick-outs'],
  ['turnovers', 'Turnovers'],
  ['frees', 'Frees won'],
  ['cards', 'Cards'],
];

export function mountSetup(root: HTMLElement): void {
  const render = (): void => {
    const doc = getDoc();
    const m = doc.match;
    const textField = (label: string, get: () => string, set: (v: string) => void, type = 'text', hint?: string) => {
      const i = h('input', { type, value: get(), onInput: () => { set(i.value); commit(); } });
      return field(label, i, hint);
    };
    const colourField = (label: string, get: () => string, set: (v: string) => void) => {
      const i = h('input', { type: 'color', value: get(), onInput: () => { set(i.value); commit(); } });
      return field(label, i);
    };

    const fileInput = h('input', {
      type: 'file', accept: 'video/*', id: 'video-file',
      onChange: () => {
        const f = fileInput.files?.[0];
        if (!f) return;
        loadVideoFile(f);
        status.textContent = `Loaded "${f.name}". Go to Review & tag.`;
        commit();
      },
    });
    const status = h('p', { class: 'hint', 'aria-live': 'polite', id: nextId('s') },
      hasVideo() ? `Video loaded: ${doc.video.fileName ?? ''}` : doc.video.fileName
        ? `This match was saved with the video "${doc.video.fileName}". Browsers cannot remember files, so open it again to continue tagging.`
        : 'No video loaded yet.');

    replace(root,
      h('div', { class: 'card' },
        h('h2', null, 'Match video'),
        h('p', { class: 'privacy' },
          h('strong', null, 'Your video never leaves this device. '),
          'It is played directly from your computer or phone by the browser. Nothing is uploaded; there is no server. Only the tags you add (not the video) are saved in this browser.'),
        field('Open a video file', fileInput, 'MP4, MOV or WebM. After reloading the page you must open the file again.'),
        status,
        field('Video source profile', select(PROFILES, doc.video.profile, (v) => { doc.video.profile = v as SourceProfile; commit(); }),
          'Recorded for later analysis; it does not change any statistic.'),
      ),
      h('div', { class: 'card' },
        h('h2', null, 'Teams'),
        h('div', { class: 'grid2' },
          h('fieldset', null, h('legend', null, 'Home'),
            textField('Team name', () => m.home.name, (v) => (m.home.name = v)),
            colourField('Colour', () => m.home.colour || '#1f6feb', (v) => (m.home.colour = v))),
          h('fieldset', null, h('legend', null, 'Away'),
            textField('Team name', () => m.away.name, (v) => (m.away.name = v)),
            colourField('Colour', () => m.away.colour || '#d1242f', (v) => (m.away.colour = v))),
        ),
      ),
      h('div', { class: 'card' },
        h('h2', null, 'Match details'),
        h('div', { class: 'grid2' },
          textField('Date', () => m.date ?? '', (v) => (m.date = v || undefined), 'date'),
          textField('Venue', () => m.venue ?? '', (v) => (m.venue = v || undefined)),
          textField('Competition', () => m.competition ?? '', (v) => (m.competition = v || undefined)),
          textField('Title (optional)', () => m.title ?? '', (v) => (m.title = v || undefined)),
        ),
        h('p', { class: 'hint' }, 'Rules: ', getRules(m.ruleset).label),
      ),
      h('div', { class: 'card' },
        h('h2', null, 'Tagging coverage'),
        h('p', null, 'Tick a category only if you tagged every instance of it in this match. ',
          h('strong', null, 'Statistics in unticked categories are shown as "unknown"'),
          ' instead of a misleading count.'),
        h('div', { class: 'checks' },
          ...COVERAGE.map(([k, label]) => {
            const cb = h('input', { type: 'checkbox', checked: doc.coverage[k], onChange: () => { doc.coverage[k] = cb.checked; commit(); } });
            return h('label', { class: 'check' }, cb, ' ', label);
          })),
      ),
    );
  };
  // Rebuild only when the document is replaced, so typing is never interrupted.
  subscribe((k) => { if (k === 'replace') render(); });
  render();
}
