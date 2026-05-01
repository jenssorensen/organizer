import type { AppPrefs } from "./appTypes";
import type {
  BookmarkNode,
  Note,
  RecentDocumentEntry,
  RestorePointSummary,
  SavedSearch,
  SectionId,
  TodoPayload,
  WorkspaceBackupSnapshot,
} from "./types";

function countBookmarks(tree: BookmarkNode[]): number {
  let count = 0;

  for (const node of tree) {
    if (node.type === "folder") {
      count += countBookmarks(node.children);
      continue;
    }

    count += 1;
  }

  return count;
}

export function buildWorkspaceBackupSnapshot({
  label,
  isAutomatic,
  notes,
  bookmarks,
  todo,
  recentDocuments,
  savedSearches,
  pinnedNoteIds,
  prefs,
  sidebarOrder,
  now = Date.now(),
}: {
  label: string;
  isAutomatic: boolean;
  notes: Note[];
  bookmarks: BookmarkNode[];
  todo: TodoPayload;
  recentDocuments: RecentDocumentEntry[];
  savedSearches: SavedSearch[];
  pinnedNoteIds: string[];
  prefs: AppPrefs;
  sidebarOrder: SectionId[];
  now?: number;
}): WorkspaceBackupSnapshot {
  return {
    version: 1,
    createdAt: now,
    label: label.trim() || (isAutomatic ? "Automatic restore point" : "Restore point"),
    isAutomatic,
    notes: notes
      .filter((note) => typeof note.sourcePath === "string" && note.sourcePath.trim().length > 0)
      .map((note) => ({
        sourcePath: note.sourcePath ?? "",
        title: note.title,
        tags: [...note.tags],
        content: note.content,
        updatedAt: note.updatedAt,
        createdAt: note.createdAt ?? null,
      })),
    bookmarks,
    todo,
    recentDocuments,
    savedSearches,
    pinnedNoteIds: [...pinnedNoteIds],
    prefs,
    sidebarOrder: [...sidebarOrder],
    starredNotePaths: notes
      .filter((note) => note.starred && typeof note.sourcePath === "string" && note.sourcePath.trim().length > 0)
      .map((note) => note.sourcePath ?? ""),
  };
}

export function getWorkspaceBackupSnapshotFingerprint(snapshot: WorkspaceBackupSnapshot): string {
  return JSON.stringify({
    notes: snapshot.notes,
    bookmarks: snapshot.bookmarks,
    todo: snapshot.todo,
    recentDocuments: snapshot.recentDocuments,
    savedSearches: snapshot.savedSearches,
    pinnedNoteIds: snapshot.pinnedNoteIds,
    prefs: snapshot.prefs,
    sidebarOrder: snapshot.sidebarOrder,
    starredNotePaths: snapshot.starredNotePaths,
  });
}

export function toRestorePointSummary(id: string, snapshot: WorkspaceBackupSnapshot): RestorePointSummary {
  return {
    id,
    label: snapshot.label,
    createdAt: snapshot.createdAt,
    isAutomatic: snapshot.isAutomatic,
    noteCount: snapshot.notes.length,
    bookmarkCount: countBookmarks(snapshot.bookmarks),
    todoCount: snapshot.todo.items.length,
    recentDocumentCount: snapshot.recentDocuments.length,
  };
}
