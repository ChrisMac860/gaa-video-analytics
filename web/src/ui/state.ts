import { newDocument } from '../core/document';
import { computeStats, type MatchStats } from '../core/stats';
import type { AnalysisDocument, EventType, MatchEvent, TeamSide } from '../core/types';
import { h, toast } from './dom';

export type Tab = 'setup' | 'review' | 'cv' | 'stats' | 'report' | 'data';
export type ChangeKind = 'change' | 'replace';

const STORAGE_KEY = 'gaa-video-analytics:doc:v1';

let doc: AnalysisDocument = newDocument();
let version = 0;
let statsCache: { v: number; s: MatchStats } | null = null;
const listeners = new Set<(k: ChangeKind) => void>();
const tabListeners = new Set<(t: Tab) => void>();
let activeTab: Tab = 'setup';

export const getDoc = (): AnalysisDocument => doc;
export function getStats(): MatchStats {
  if (!statsCache || statsCache.v !== version) statsCache = { v: version, s: computeStats(doc) };
  return statsCache.s;
}

export function subscribe(fn: (k: ChangeKind) => void): void {
  listeners.add(fn);
}

function notify(k: ChangeKind): void {
  version++;
  for (const l of listeners) l(k);
  scheduleSave();
}

/** Call after mutating the document in place. */
export function commit(): void {
  notify('change');
}

/** Replace the whole document (import, demo, new, restore). */
export function setDoc(d: AnalysisDocument): void {
  doc = d;
  notify('replace');
}

// ---- tabs ----
export const getTab = (): Tab => activeTab;
export function setTab(t: Tab): void {
  activeTab = t;
  for (const l of tabListeners) l(t);
}
export function onTab(fn: (t: Tab) => void): void {
  tabListeners.add(fn);
}

// ---- video (one persistent element; the file never leaves the device) ----
export const video = h('video', { id: 'player', controls: true, playsinline: true, preload: 'metadata', 'aria-label': 'Match video' });
let objectUrl: string | null = null;
let videoLoaded = false;
const videoListeners = new Set<() => void>();
export const hasVideo = (): boolean => videoLoaded;
export function onVideoLoaded(fn: () => void): void {
  videoListeners.add(fn);
}

export function loadVideoFile(file: File): void {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(file);
  video.src = objectUrl;
  videoLoaded = true;
  doc.video.fileName = file.name;
}
video.addEventListener('loadedmetadata', () => {
  if (Number.isFinite(video.duration)) doc.video.durationSec = Math.round(video.duration * 10) / 10;
  if (video.videoWidth) {
    doc.video.width = video.videoWidth;
    doc.video.height = video.videoHeight;
  }
  commit();
  for (const l of videoListeners) l();
});

export function seek(t: number, opts: { lead?: number; switchTab?: boolean } = {}): void {
  if (!videoLoaded) {
    toast('Open the match video first (Match setup tab). The video stays on your device.', { kind: 'error' });
    return;
  }
  if (opts.switchTab !== false) setTab('review');
  video.currentTime = Math.max(0, t - (opts.lead ?? 3));
}

export function videoDuration(): number {
  if (Number.isFinite(video.duration) && video.duration > 0) return video.duration;
  const last = doc.events.reduce((m, e) => Math.max(m, e.t), 0);
  return doc.video.durationSec ?? Math.max(60, last + 30);
}

// ---- events ----
export function sortedEvents(): MatchEvent[] {
  return [...doc.events].sort((a, b) => a.t - b.t);
}
export function teamColour(side?: TeamSide): string {
  if (!side) return '#6b7280';
  return doc.match[side].colour || (side === 'home' ? '#1f6feb' : '#d1242f');
}
export function teamName(side?: TeamSide): string {
  return side ? doc.match[side].name : '';
}

let lastDeleted: { ev: MatchEvent; index: number } | null = null;
export function deleteEvent(id: string): void {
  const i = doc.events.findIndex((e) => e.id === id);
  if (i < 0) return;
  const [ev] = doc.events.splice(i, 1);
  lastDeleted = { ev, index: i };
  commit();
  toast('Event deleted.', {
    action: {
      label: 'Undo',
      run: () => {
        if (!lastDeleted) return;
        doc.events.splice(Math.min(lastDeleted.index, doc.events.length), 0, lastDeleted.ev);
        lastDeleted = null;
        commit();
      },
    },
  });
}

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  shot: 'Shot',
  kickout: 'Kick-out',
  turnover: 'Turnover',
  free_won: 'Free won',
  card: 'Card',
  period_start: 'Period start',
  period_end: 'Period end',
  note: 'Note',
};

// ---- persistence (document only; never the video) ----
let saveTimer: number | undefined;
let saveHeld = false;
/** Hold autosave while the restore offer is pending so a saved session is not overwritten. */
export function holdSaving(b: boolean): void {
  saveHeld = b;
}
function scheduleSave(): void {
  if (saveHeld) return;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
    } catch {
      /* storage unavailable or full: the app still works, export to keep your data */
    }
  }, 300);
}
export function readSaved(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
export function clearSaved(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
