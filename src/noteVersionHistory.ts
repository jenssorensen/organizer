import type { NoteVersion } from "./appTypes";

const NOTE_VERSION_HISTORY_KEY_PREFIX = "organizer:history:";
const MAX_NOTE_VERSIONS = 10;

function getNoteVersionHistoryKey(sourcePath: string) {
  return `${NOTE_VERSION_HISTORY_KEY_PREFIX}${sourcePath}`;
}

export function loadNoteVersionHistory(sourcePath: string): NoteVersion[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(getNoteVersionHistoryKey(sourcePath));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveNoteVersionHistory(sourcePath: string, versions: NoteVersion[]) {
  try {
    window.localStorage.setItem(getNoteVersionHistoryKey(sourcePath), JSON.stringify(versions));
  } catch {
    // Ignore storage errors.
  }
}

export function snapshotNoteVersion(sourcePath: string, content: string, label: string) {
  const versions = loadNoteVersionHistory(sourcePath);
  const next: NoteVersion[] = [
    { savedAt: Date.now(), content, label },
    ...versions.slice(0, MAX_NOTE_VERSIONS - 1),
  ];
  saveNoteVersionHistory(sourcePath, next);
}
