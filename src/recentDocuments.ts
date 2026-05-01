export type RecentDocumentSnapshot = {
  section: "notes" | "wiki" | "bookmarks" | "todo" | "starred" | "recent";
  selectedNoteNodeId: string | null;
  selectedBookmarkId: string | null;
  selectedTodoId: string | null;
};

export type RecentDocumentEntry = {
  id: string;
  documentId: string;
  kind: "note" | "wiki" | "todo";
  title: string;
  subtitle: string;
  preview: string;
  pinned: boolean;
  viewedAt: number;
  viewCount: number;
  lastEditedAt: number;
  lastCompletedAt: number;
  snapshot: RecentDocumentSnapshot;
};

export type RecentDocumentPayload = {
  entries: RecentDocumentEntry[];
};

export function pruneRecentDocuments(
  entries: RecentDocumentEntry[],
  {
    visibleNoteNodeIds,
    visibleTodoIds,
    visibleWikiNodeIds,
  }: {
    visibleNoteNodeIds: Set<string>;
    visibleTodoIds: Set<string>;
    visibleWikiNodeIds: Set<string>;
  },
) {
  return entries.filter((entry) => {
    if (entry.kind === "todo") {
      return Boolean(entry.snapshot.selectedTodoId && visibleTodoIds.has(entry.snapshot.selectedTodoId));
    }

    const nodeId = entry.snapshot.selectedNoteNodeId;
    if (!nodeId) {
      return false;
    }

    return entry.kind === "wiki" ? visibleWikiNodeIds.has(nodeId) : visibleNoteNodeIds.has(nodeId);
  });
}

export function toRecentDocumentPayload(entries: RecentDocumentEntry[]): RecentDocumentPayload {
  return {
    entries,
  };
}

export function mergeRecentDocuments(...groups: RecentDocumentEntry[][]) {
  const byKey = new Map<string, RecentDocumentEntry>();

  for (const group of groups) {
    for (const entry of group) {
      const current = byKey.get(entry.documentId);
      if (!current) {
        byKey.set(entry.documentId, entry);
        continue;
      }

      byKey.set(entry.documentId, {
        ...current,
        ...entry,
        id: getRecentActivityTimestamp(entry) >= getRecentActivityTimestamp(current) ? entry.id : current.id,
        title: entry.title || current.title,
        subtitle: entry.subtitle || current.subtitle,
        preview: entry.preview || current.preview,
        pinned: current.pinned || entry.pinned,
        viewedAt: Math.max(current.viewedAt, entry.viewedAt),
        viewCount: Math.max(current.viewCount, entry.viewCount),
        lastEditedAt: Math.max(current.lastEditedAt, entry.lastEditedAt),
        lastCompletedAt: Math.max(current.lastCompletedAt, entry.lastCompletedAt),
        snapshot: getRecentActivityTimestamp(entry) >= getRecentActivityTimestamp(current) ? entry.snapshot : current.snapshot,
      });
    }
  }

  return Array.from(byKey.values())
    .sort(
      (left, right) =>
        Number(right.pinned) - Number(left.pinned) ||
        getRecentActivityTimestamp(right) - getRecentActivityTimestamp(left) ||
        right.viewCount - left.viewCount,
    )
    .slice(0, 18);
}

export function getRecentActivityTimestamp(entry: RecentDocumentEntry) {
  return Math.max(entry.viewedAt, entry.lastEditedAt, entry.lastCompletedAt);
}

export function getRecentPrimaryActivity(entry: RecentDocumentEntry): "completed" | "edited" | "opened" {
  if (entry.lastCompletedAt >= entry.lastEditedAt && entry.lastCompletedAt >= entry.viewedAt) {
    return "completed";
  }

  if (entry.lastEditedAt >= entry.viewedAt) {
    return "edited";
  }

  return "opened";
}

export function togglePinnedRecentDocument(entries: RecentDocumentEntry[], entryId: string) {
  return entries.map((entry) => (entry.id === entryId ? { ...entry, pinned: !entry.pinned } : entry));
}

export function removeRecentDocumentById(entries: RecentDocumentEntry[], entryId: string) {
  return entries.filter((entry) => entry.id !== entryId);
}

export function recordRecentDocumentView(
  current: RecentDocumentEntry[],
  seed: Omit<RecentDocumentEntry, "id" | "pinned" | "viewedAt" | "viewCount" | "lastEditedAt" | "lastCompletedAt">,
  viewedAt: number,
) {
  const existingEntry = current.find((entry) => entry.documentId === seed.documentId);
  const nextViewCount = (existingEntry?.viewCount ?? 0) + 1;

  if (current[0] && current[0].documentId === seed.documentId) {
    return [
      {
        ...current[0],
        ...seed,
        viewedAt,
        viewCount: nextViewCount,
      },
      ...current.slice(1).filter((entry) => entry.documentId !== seed.documentId),
    ].slice(0, 18);
  }

  const nextEntry: RecentDocumentEntry = {
    ...seed,
    id: `${seed.documentId}-${viewedAt}`,
    pinned: existingEntry?.pinned ?? false,
    viewedAt,
    viewCount: nextViewCount,
    lastEditedAt: existingEntry?.lastEditedAt ?? 0,
    lastCompletedAt: existingEntry?.lastCompletedAt ?? 0,
  };

  return [nextEntry, ...current.filter((entry) => entry.documentId !== seed.documentId)].slice(0, 18);
}

export function hydrateRecentDocumentsState(current: RecentDocumentEntry[], pending: RecentDocumentEntry[]) {
  return mergeRecentDocuments(current, pending);
}
