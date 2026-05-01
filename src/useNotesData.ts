import { useCallback, useRef, useState } from "react";
import { resolveSelectedNoteNodeId } from "./noteSelection";
import { buildQueuedNoteSaveEntry } from "./noteSave";
import { enqueueSyncEntry, loadSyncQueue } from "./syncQueue";
import type { DocsCreateFolderResponse, DocsCreateResponse, Note, NoteTreeNode, NotesResponse } from "./types";

export function useNotesData({
  apiBase,
  rootNodeId,
  currentSelectedNoteNodeId,
  onSelectedNoteNodeIdChange,
  onSyncQueueChange,
}: {
  apiBase: string;
  rootNodeId: string;
  currentSelectedNoteNodeId: string | null;
  onSelectedNoteNodeIdChange: (nodeId: string | null | ((current: string | null) => string | null)) => void;
  onSyncQueueChange?: (count: number) => void;
}) {
  const [notesTree, setNotesTree] = useState<NoteTreeNode[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [notesStatus, setNotesStatus] = useState("Loading notes...");
  const [hasLoadedNotes, setHasLoadedNotes] = useState(false);
  const [docsFolder, setDocsFolder] = useState<string | null>(null);
  const [isMultiRoot, setIsMultiRoot] = useState(false);

  const currentSelectedNoteNodeIdRef = useRef(currentSelectedNoteNodeId);
  currentSelectedNoteNodeIdRef.current = currentSelectedNoteNodeId;

  const loadNotes = useCallback(async () => {
    try {
      const response = await fetch(`${apiBase}/api/notes`);
      if (!response.ok) {
        throw new Error("Failed to load notes");
      }

      const data = (await response.json()) as NotesResponse;
      setNotesTree(data.tree);
      setNotes(data.notes);
      setDocsFolder(data.docsFolder);
      setIsMultiRoot(Array.isArray(data.additionalFolders) && data.additionalFolders.length > 0);
      setNotesStatus(`${data.notes.length} markdown files indexed`);
      onSelectedNoteNodeIdChange((current) =>
        resolveSelectedNoteNodeId({
          currentSelectedNoteNodeId: current ?? currentSelectedNoteNodeIdRef.current,
          rootNodeId,
          tree: data.tree,
        }),
      );
      return data;
    } catch {
      setNotesStatus("Notes API offline");
      return null;
    } finally {
      setHasLoadedNotes(true);
    }
  }, [apiBase, onSelectedNoteNodeIdChange, rootNodeId]);

  const createNoteDocument = useCallback(
    async (targetPath: string, fileName: string) => {
      try {
        const response = await fetch(`${apiBase}/api/docs/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetPath, fileName }),
        });

        const data = (await response.json()) as DocsCreateResponse & { error?: string };
        if (!response.ok) {
          throw new Error(data.error ?? "Failed to create document");
        }

        const notesData = await loadNotes();
        setNotesStatus(`Created ${data.fileName}`);
        return { ok: true as const, fileName: data.fileName, sourcePath: data.sourcePath, notesData };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to create document";
        setNotesStatus(message);
        return { ok: false as const, error: message };
      }
    },
    [apiBase, loadNotes],
  );

  const createNoteFolder = useCallback(
    async (targetPath: string, folderName: string) => {
      try {
        const response = await fetch(`${apiBase}/api/docs/create-folder`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetPath, folderName }),
        });

        const data = (await response.json()) as DocsCreateFolderResponse & { error?: string };
        if (!response.ok) {
          throw new Error(data.error ?? "Failed to create folder");
        }

        const notesData = await loadNotes();
        setNotesStatus(`Created ${data.folderName}`);
        return { ok: true as const, folderName: data.folderName, sourcePath: data.sourcePath, notesData };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to create folder";
        setNotesStatus(message);
        return { ok: false as const, error: message };
      }
    },
    [apiBase, loadNotes],
  );

  const toggleNoteStar = useCallback(
    async (note: Note, nextStarred: boolean) => {
      const previousStarred = note.starred;
      setNotes((current) =>
        current.map((item) => (item.id === note.id ? { ...item, starred: nextStarred } : item)),
      );

      try {
        const response = await fetch(`${apiBase}/api/notes/star`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourcePath: note.sourcePath,
            starred: nextStarred,
          }),
        });

        const data = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(data.error ?? "Failed to update note star");
        }

        setNotesStatus(nextStarred ? "Note starred" : "Star removed");
        void loadNotes();
        return { ok: true as const };
      } catch (error) {
        setNotes((current) =>
          current.map((item) => (item.id === note.id ? { ...item, starred: previousStarred } : item)),
        );
        const message = error instanceof Error ? error.message : "Failed to update note star";
        setNotesStatus(message);
        return { ok: false as const, error: message };
      }
    },
    [apiBase, loadNotes],
  );

  const saveNoteContent = useCallback(
    async (note: Note, content: string) => {
      const optimisticUpdatedAt = new Date().toISOString();
      setNotes((current) =>
        current.map((item) =>
          item.id === note.id
            ? {
                ...item,
                content,
                summary: content.replace(/^#+\s+/gm, "").trim().slice(0, 180),
                updatedAt: optimisticUpdatedAt,
              }
            : item,
        ),
      );

      if (typeof navigator !== "undefined" && navigator.onLine === false && note.sourcePath) {
        const queuedAt = Date.now();
        const nextEntry = buildQueuedNoteSaveEntry(note, content, queuedAt);
        const nextQueue = nextEntry ? enqueueSyncEntry(loadSyncQueue(), nextEntry) : loadSyncQueue();
        onSyncQueueChange?.(nextQueue.length);
        setNotesStatus("Note queued for sync");
        return { ok: true as const, queued: true as const };
      }

      try {
        const response = await fetch(`${apiBase}/api/notes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourcePath: note.sourcePath,
            content,
            expectedUpdatedAt: note.updatedAt ?? null,
          }),
        });

        const data = (await response.json()) as { error?: string; conflict?: boolean; note?: Note };
        if (!response.ok) {
          if (response.status === 409 && data.conflict && data.note) {
            return { ok: false as const, conflict: true as const, error: data.error ?? "Conflict detected", note: data.note };
          }

          throw new Error(data.error ?? "Failed to save note");
        }

        await loadNotes();
        return { ok: true as const };
      } catch (error) {
        if (note.sourcePath) {
          const queuedAt = Date.now();
          const nextEntry = buildQueuedNoteSaveEntry(note, content, queuedAt);
          const nextQueue = nextEntry ? enqueueSyncEntry(loadSyncQueue(), nextEntry) : loadSyncQueue();
          onSyncQueueChange?.(nextQueue.length);
          setNotesStatus("Note queued for sync");
          return { ok: true as const, queued: true as const };
        }

        const message = error instanceof Error ? error.message : "Failed to save note";
        setNotesStatus("Note save failed");
        return { ok: false as const, error: message };
      }
    },
    [apiBase, loadNotes, onSyncQueueChange],
  );

  return {
    notesTree,
    notes,
    notesStatus,
    hasLoadedNotes,
    docsFolder,
    isMultiRoot,
    setNotesStatus,
    loadNotes,
    createNoteDocument,
    createNoteFolder,
    toggleNoteStar,
    saveNoteContent,
  };
}
