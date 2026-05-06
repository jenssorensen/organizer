import { useEffect, useRef, useState } from "react";
import type { RecentDocumentEntry, RecentDocumentSeed } from "./types";
import {
  getRecentDocumentViewKey,
  hydrateRecentDocumentsState,
  pruneRecentDocuments,
  recordRecentDocumentView,
  removeRecentDocumentById,
} from "./recentDocuments";

export function useRecentDocumentsState({
  currentRenderedDocument,
  pendingRecentDocuments,
  onPendingRecentDocumentsConsumed,
  hasLoadedBookmarks,
  hasLoadedNotes,
  visibleNoteNodeIds,
  visibleTodoIds,
  visibleWikiNodeIds,
  persistRecentDocuments,
}: {
  currentRenderedDocument: RecentDocumentSeed | null;
  pendingRecentDocuments: RecentDocumentEntry[] | null;
  onPendingRecentDocumentsConsumed: () => void;
  hasLoadedBookmarks: boolean;
  hasLoadedNotes: boolean;
  visibleNoteNodeIds: Set<string>;
  visibleTodoIds: Set<string>;
  visibleWikiNodeIds: Set<string>;
  persistRecentDocuments: (entries: RecentDocumentEntry[]) => Promise<void>;
}) {
  const [recentDocuments, setRecentDocuments] = useState<RecentDocumentEntry[]>([]);
  const [hasLoadedRecentDocuments, setHasLoadedRecentDocuments] = useState(false);
  const lastRecordedDocumentKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!currentRenderedDocument) {
      lastRecordedDocumentKeyRef.current = null;
      return;
    }

    const nextDocumentKey = getRecentDocumentViewKey(currentRenderedDocument);
    if (lastRecordedDocumentKeyRef.current === nextDocumentKey) {
      return;
    }

    lastRecordedDocumentKeyRef.current = nextDocumentKey;

    setRecentDocuments((current) => recordRecentDocumentView(current, currentRenderedDocument, Date.now()));
  }, [currentRenderedDocument]);

  useEffect(() => {
    if (pendingRecentDocuments === null) {
      return;
    }

    setRecentDocuments((current) => {
      const nextEntries = hydrateRecentDocumentsState(current, pendingRecentDocuments);
      setHasLoadedRecentDocuments(true);
      return nextEntries;
    });
    onPendingRecentDocumentsConsumed();
  }, [onPendingRecentDocumentsConsumed, pendingRecentDocuments]);

  useEffect(() => {
    if (!hasLoadedNotes || !hasLoadedBookmarks) {
      return;
    }

    setRecentDocuments((current) => {
      const next = pruneRecentDocuments(current, {
        visibleNoteNodeIds,
        visibleTodoIds,
        visibleWikiNodeIds,
      });

      return next.length === current.length ? current : next;
    });
  }, [hasLoadedBookmarks, hasLoadedNotes, visibleNoteNodeIds, visibleTodoIds, visibleWikiNodeIds]);

  useEffect(() => {
    if (!hasLoadedRecentDocuments) {
      return;
    }

    void persistRecentDocuments(recentDocuments);
  }, [hasLoadedRecentDocuments, persistRecentDocuments, recentDocuments]);

  return {
    recentDocuments,
    hasLoadedRecentDocuments,
    setRecentDocuments,
    removeRecentDocument(entryId: string) {
      setRecentDocuments((current) => removeRecentDocumentById(current, entryId));
    },
  };
}
