import type { BookmarkNode, RecentDocumentEntry, SectionId, TodoPayload } from "./types";

export type SyncQueueEntry =
  | {
      id: string;
      kind: "note-save";
      resourceKey: string;
      queuedAt: number;
      payload: {
        sourcePath: string;
        content: string;
        expectedUpdatedAt: string | null;
      };
    }
  | {
      id: string;
      kind: "bookmarks-save";
      resourceKey: "bookmarks";
      queuedAt: number;
      payload: {
        tree: BookmarkNode[];
      };
    }
  | {
      id: string;
      kind: "todo-save";
      resourceKey: "todo-items";
      queuedAt: number;
      payload: TodoPayload;
    }
  | {
      id: string;
      kind: "recents-save";
      resourceKey: "recent-documents";
      queuedAt: number;
      payload: {
        entries: RecentDocumentEntry[];
      };
    }
  | {
      id: string;
      kind: "sidebar-order-save";
      resourceKey: "sidebar-order";
      queuedAt: number;
      payload: {
        order: SectionId[];
      };
    };

const STORED_SYNC_QUEUE_KEY = "organizer:sync-queue:v1";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function sortSyncQueue(entries: SyncQueueEntry[]) {
  return [...entries].sort((left, right) => left.queuedAt - right.queuedAt || left.id.localeCompare(right.id));
}

export function sanitizeSyncQueueEntry(entry: unknown): SyncQueueEntry | null {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const candidate = entry as Partial<SyncQueueEntry> & { payload?: unknown };
  if (typeof candidate.id !== "string" || typeof candidate.resourceKey !== "string") {
    return null;
  }

  const queuedAt = Number(candidate.queuedAt ?? 0);
  if (!Number.isFinite(queuedAt)) {
    return null;
  }

  if (candidate.kind === "note-save") {
    const payload = candidate.payload as SyncQueueEntry["payload"] | undefined;
    if (!payload || typeof (payload as { sourcePath?: unknown }).sourcePath !== "string" || typeof (payload as { content?: unknown }).content !== "string") {
      return null;
    }

    return {
      id: candidate.id,
      kind: "note-save",
      resourceKey: candidate.resourceKey,
      queuedAt,
      payload: {
        sourcePath: (payload as { sourcePath: string }).sourcePath,
        content: (payload as { content: string }).content,
        expectedUpdatedAt: typeof (payload as { expectedUpdatedAt?: unknown }).expectedUpdatedAt === "string"
          ? (payload as { expectedUpdatedAt: string }).expectedUpdatedAt
          : null,
      },
    };
  }

  if (candidate.kind === "bookmarks-save" && candidate.resourceKey === "bookmarks") {
    const payload = candidate.payload as { tree?: BookmarkNode[] } | undefined;
    if (!payload || !Array.isArray(payload.tree)) {
      return null;
    }

    return {
      id: candidate.id,
      kind: "bookmarks-save",
      resourceKey: "bookmarks",
      queuedAt,
      payload: { tree: payload.tree },
    };
  }

  if (candidate.kind === "todo-save" && candidate.resourceKey === "todo-items") {
    const payload = candidate.payload as TodoPayload | undefined;
    if (!payload || !Array.isArray(payload.items)) {
      return null;
    }

    return {
      id: candidate.id,
      kind: "todo-save",
      resourceKey: "todo-items",
      queuedAt,
      payload,
    };
  }

  if (candidate.kind === "recents-save" && candidate.resourceKey === "recent-documents") {
    const payload = candidate.payload as { entries?: RecentDocumentEntry[] } | undefined;
    if (!payload || !Array.isArray(payload.entries)) {
      return null;
    }

    return {
      id: candidate.id,
      kind: "recents-save",
      resourceKey: "recent-documents",
      queuedAt,
      payload: { entries: payload.entries },
    };
  }

  if (candidate.kind === "sidebar-order-save" && candidate.resourceKey === "sidebar-order") {
    const payload = candidate.payload as { order?: SectionId[] } | undefined;
    if (!payload || !Array.isArray(payload.order)) {
      return null;
    }

    return {
      id: candidate.id,
      kind: "sidebar-order-save",
      resourceKey: "sidebar-order",
      queuedAt,
      payload: { order: payload.order },
    };
  }

  return null;
}

export function loadSyncQueue(): SyncQueueEntry[] {
  if (!canUseStorage()) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORED_SYNC_QUEUE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return sortSyncQueue(parsed.map(sanitizeSyncQueueEntry).filter((entry): entry is SyncQueueEntry => Boolean(entry)));
  } catch {
    return [];
  }
}

export function storeSyncQueue(entries: SyncQueueEntry[]) {
  if (!canUseStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(STORED_SYNC_QUEUE_KEY, JSON.stringify(sortSyncQueue(entries)));
  } catch {
    // Ignore storage failures.
  }
}

export function replaceSyncQueue(entries: SyncQueueEntry[]) {
  storeSyncQueue(entries);
  return sortSyncQueue(entries);
}

export function enqueueSyncEntry(currentEntries: SyncQueueEntry[], nextEntry: SyncQueueEntry) {
  const deduped = currentEntries.filter((entry) => !(entry.kind === nextEntry.kind && entry.resourceKey === nextEntry.resourceKey));
  const next = sortSyncQueue([...deduped, nextEntry]);
  storeSyncQueue(next);
  return next;
}

export function removeSyncEntry(currentEntries: SyncQueueEntry[], entryId: string) {
  const next = currentEntries.filter((entry) => entry.id !== entryId);
  storeSyncQueue(next);
  return next;
}

export function createSyncEntryId(kind: SyncQueueEntry["kind"], resourceKey: string, queuedAt: number) {
  return `${kind}:${resourceKey}:${queuedAt}`;
}
