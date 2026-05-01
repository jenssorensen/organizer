import { createSyncEntryId, type SyncQueueEntry } from "./syncQueue";
import type { Note } from "./types";

export function buildQueuedNoteSaveEntry(note: Note, content: string, queuedAt: number): SyncQueueEntry | null {
  if (!note.sourcePath) {
    return null;
  }

  return {
    id: createSyncEntryId("note-save", note.sourcePath, queuedAt),
    kind: "note-save",
    resourceKey: note.sourcePath,
    queuedAt,
    payload: {
      sourcePath: note.sourcePath,
      content,
      expectedUpdatedAt: note.updatedAt ?? null,
    },
  };
}