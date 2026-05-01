const validSections = new Set(["notes", "wiki", "bookmarks", "todo", "starred", "recent"]);
const validKinds = new Set(["note", "wiki", "todo"]);

export function sanitizeRecentDocumentsPayload(payload) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.entries)) {
    throw new Error("Invalid recent documents payload");
  }

  return {
    entries: payload.entries.slice(0, 18).map(sanitizeRecentDocumentEntry),
  };
}

function sanitizeRecentDocumentEntry(entry) {
  if (!entry || typeof entry !== "object") {
    throw new Error("Invalid recent documents payload");
  }

  if (!validKinds.has(entry.kind) || !validSections.has(entry.snapshot?.section)) {
    throw new Error("Invalid recent documents payload");
  }

  const parsedViewCount = Number(entry.viewCount ?? 0);
  const safeViewCount = Number.isFinite(parsedViewCount) ? Math.max(0, Math.floor(parsedViewCount)) : 0;

  return {
    id: String(entry.id ?? ""),
    documentId: String(entry.documentId ?? ""),
    kind: entry.kind,
    title: String(entry.title ?? ""),
    subtitle: String(entry.subtitle ?? ""),
    preview: String(entry.preview ?? ""),
    pinned: entry.pinned === true,
    viewedAt: Number(entry.viewedAt ?? 0),
    viewCount: safeViewCount,
    lastEditedAt: Number(entry.lastEditedAt ?? 0),
    lastCompletedAt: Number(entry.lastCompletedAt ?? 0),
    snapshot: {
      section: entry.snapshot.section,
      selectedNoteNodeId:
        typeof entry.snapshot.selectedNoteNodeId === "string" ? entry.snapshot.selectedNoteNodeId : null,
      selectedBookmarkId:
        typeof entry.snapshot.selectedBookmarkId === "string" ? entry.snapshot.selectedBookmarkId : null,
      selectedTodoId:
        typeof entry.snapshot.selectedTodoId === "string" ? entry.snapshot.selectedTodoId : null,
    },
  };
}
