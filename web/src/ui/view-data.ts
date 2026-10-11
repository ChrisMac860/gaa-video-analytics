import { documentJson, eventsCsv, statsCsv } from '../core/export';
import { mergeCvAnalysis, newDocument } from '../core/document';
import { parseDocument } from '../core/validate';
import { download, h, replace, toast } from './dom';
import { clearSaved, getDoc, getStats, setDoc, setTab } from './state';

function slug(): string {
  const m = getDoc().match;
  const base = `${m.home.name}-v-${m.away.name}${m.date ? '-' + m.date : ''}`;
  return base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'match';
}

export async function loadDemo(): Promise<void> {
  try {
    const res = await fetch(new URL('samples/demo-match.json', document.baseURI).href);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const r = parseDocument(await res.text());
    if (!r.ok || !r.doc) throw new Error(r.errors.join('; '));
    setDoc(r.doc);
    toast('Demo match loaded (fictional data).', { kind: 'ok' });
  } catch (e) {
    toast(`Could not load the demo: ${(e as Error).message}`, { kind: 'error' });
  }
}

export function newMatch(): void {
  if (getDoc().events.length && !confirm('Start a new match? Tagged events in this browser will be cleared. Export JSON first if you want to keep them.')) return;
  clearSaved();
  setDoc(newDocument());
  setTab('setup');
}

export function mountData(root: HTMLElement): void {
  const errBox = h('div', { class: 'errbox', role: 'alert', hidden: true });
  const showErrors = (errs: string[]) => {
    errBox.hidden = errs.length === 0;
    replace(errBox, h('strong', null, `Import failed: ${errs.length} problem(s)`), h('ul', null, ...errs.map((e) => h('li', null, e))));
  };

  const importJson = h('input', { type: 'file', accept: 'application/json,.json', id: 'import-json', onChange: async () => {
    const f = importJson.files?.[0];
    importJson.value = '';
    if (!f) return;
    const r = parseDocument(await f.text());
    if (!r.ok || !r.doc) { showErrors(r.errors); return; }
    if (getDoc().events.length && !confirm('Replace the current match with the imported file?')) return;
    showErrors([]);
    setDoc(r.doc);
    toast(`Imported ${r.doc.events.length} events.`, { kind: 'ok' });
  } });
  const importCv = h('input', { type: 'file', accept: 'application/json,.json', id: 'import-cv', onChange: async () => {
    const f = importCv.files?.[0];
    importCv.value = '';
    if (!f) return;
    const r = parseDocument(await f.text());
    if (!r.ok || !r.doc) { showErrors(r.errors); return; }
    try {
      const merged = mergeCvAnalysis(getDoc(), r.doc);
      showErrors([]);
      setDoc(merged);
      toast(`CV analysis imported: ${merged.cv?.candidates.length ?? 0} candidates to review. Your tagged events were not changed.`, { kind: 'ok' });
      setTab('cv');
    } catch (e) {
      showErrors([(e as Error).message]);
    }
  } });

  replace(root,
    h('div', { class: 'card' },
      h('h2', null, 'Export'),
      h('p', null, 'Downloads are created in your browser. Nothing is sent anywhere.'),
      h('div', { class: 'row wrap' },
        h('button', { type: 'button', class: 'btn primary', onClick: () => download(`${slug()}.json`, 'application/json', documentJson(getDoc())) }, 'Download match JSON'),
        h('button', { type: 'button', class: 'btn', onClick: () => download(`${slug()}-events.csv`, 'text/csv', eventsCsv(getDoc())) }, 'Download events CSV'),
        h('button', { type: 'button', class: 'btn', onClick: () => download(`${slug()}-stats.csv`, 'text/csv', statsCsv(getDoc(), getStats())) }, 'Download stats CSV')),
      h('p', { class: 'hint' }, 'The JSON file is the full record (events, coverage, CV analysis). Keep it: the browser copy can be lost if you clear site data.')),
    h('div', { class: 'card' },
      h('h2', null, 'Import'),
      h('div', { class: 'field' }, h('label', { for: 'import-json' }, 'Open a saved match (JSON)'), importJson),
      h('div', { class: 'field' }, h('label', { for: 'import-cv' }, 'Add computer-vision analysis from the local processor (JSON)'), importCv,
        h('small', { class: 'hint' }, 'Adds suggestions to review. It never changes events you tagged.')),
      errBox),
    h('div', { class: 'card' },
      h('h2', null, 'Demo and reset'),
      h('div', { class: 'row wrap' },
        h('button', { type: 'button', class: 'btn', onClick: () => void loadDemo() }, 'Load demo match'),
        h('button', { type: 'button', class: 'btn danger', onClick: newMatch }, 'New match')),
      h('p', { class: 'hint' }, 'The demo is a fictional match with made-up events, only to show how the tool works.'),
      h('p', { class: 'hint' }, 'Autosave: your tags are saved in this browser automatically (not the video). After reloading, open the video file again from Match setup.')),
  );
}
