import { normalizeBookmarkTreeRoot } from "./bookmarkImport.mjs";
import { sanitizeRecentDocumentsPayload } from "./recentDocuments.mjs";
import { sanitizeTodoPayload } from "./todoItems.mjs";

export const MAX_RESTORE_POINTS = 12;

const DEFAULT_SIDEBAR_ORDER = ["notes", "wiki", "bookmarks", "todo", "starred", "recent"];

function sanitizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry) => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function sanitizeSavedSearches(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    const label = typeof entry.label === "string" ? entry.label.trim() : "";
    const query = typeof entry.query === "string" ? entry.query.trim() : "";

    if (!id || !label) {
      return [];
    }

    return [{ id, label, query }];
  });
}

function sanitizePrefs(value) {
  const feedsMode = value && typeof value === "object" && value.feedsMode === "popup"
    ? "popup"
    : value && typeof value === "object" && value.feedsMode === "panel"
      ? "panel"
      : "own-view";

  return {
    feedsMode,
    showBacklinks: Boolean(value && typeof value === "object" && value.showBacklinks),
    showEmptyFoldersAndSections: Boolean(value && typeof value === "object" && value.showEmptyFoldersAndSections),
  };
}

function sanitizeSidebarOrder(value) {
  if (
    Array.isArray(value) &&
    value.length === DEFAULT_SIDEBAR_ORDER.length &&
    DEFAULT_SIDEBAR_ORDER.every((item) => value.includes(item))
  ) {
    return [...value];
  }

  return [...DEFAULT_SIDEBAR_ORDER];
}

function sanitizeNotes(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const sourcePath = typeof entry.sourcePath === "string" ? entry.sourcePath.trim() : "";
    const title = typeof entry.title === "string" ? entry.title.trim() : "Untitled";
    const content = typeof entry.content === "string" ? entry.content : "";
    const updatedAt = typeof entry.updatedAt === "string" ? entry.updatedAt : new Date(0).toISOString();
    const createdAt = typeof entry.createdAt === "string" && entry.createdAt.trim() ? entry.createdAt : null;
    const tags = sanitizeStringArray(entry.tags);

    if (!sourcePath) {
      return [];
    }

    return [{ sourcePath, title, content, updatedAt, createdAt, tags }];
  });
}

export function sanitizeRestorePointNotesPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid notes snapshot payload");
  }

  return {
    notes: sanitizeNotes(payload.notes),
    starredNotePaths: sanitizeStringArray(payload.starredNotePaths),
  };
}

function countBookmarks(tree) {
  let count = 0;

  for (const node of tree) {
    if (node.type === "folder") {
      count += countBookmarks(node.children || []);
      continue;
    }

    count += 1;
  }

  return count;
}

export function sanitizeRestorePointSnapshot(payload) {
  if (!payload || typeof payload !== "object" || payload.version !== 1) {
    throw new Error("Invalid restore point snapshot");
  }

  const label = typeof payload.label === "string" && payload.label.trim()
    ? payload.label.trim().slice(0, 120)
    : payload.isAutomatic
      ? "Automatic restore point"
      : "Restore point";
  const createdAt = Number.isFinite(payload.createdAt) && payload.createdAt > 0 ? payload.createdAt : Date.now();
  const bookmarks = Array.isArray(payload.bookmarks) ? normalizeBookmarkTreeRoot(payload.bookmarks) : [];

  return {
    version: 1,
    createdAt,
    label,
    isAutomatic: Boolean(payload.isAutomatic),
    notes: sanitizeNotes(payload.notes),
    bookmarks,
    todo: sanitizeTodoPayload(payload.todo ?? { items: [], viewMode: "list", selectedTodoId: null }),
    recentDocuments: sanitizeRecentDocumentsPayload({ entries: payload.recentDocuments }).entries,
    savedSearches: sanitizeSavedSearches(payload.savedSearches),
    pinnedNoteIds: sanitizeStringArray(payload.pinnedNoteIds),
    prefs: sanitizePrefs(payload.prefs),
    sidebarOrder: sanitizeSidebarOrder(payload.sidebarOrder),
    starredNotePaths: sanitizeStringArray(payload.starredNotePaths),
  };
}

export function toRestorePointSummary(id, snapshot) {
  return {
    id,
    label: snapshot.label,
    createdAt: snapshot.createdAt,
    isAutomatic: Boolean(snapshot.isAutomatic),
    noteCount: snapshot.notes.length,
    bookmarkCount: countBookmarks(snapshot.bookmarks),
    todoCount: snapshot.todo.items.length,
    recentDocumentCount: snapshot.recentDocuments.length,
  };
}
