import type { Note } from "./types";

export type FolderNotesSortMode = "created" | "modified" | "name-asc" | "name-desc" | "recent" | "views";

function getDocumentId(note: Note) {
  return `${note.kind}:${note.id}`;
}

function toTimestamp(value: string | undefined) {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareTitles(left: Note, right: Note) {
  return left.title.localeCompare(right.title);
}

export function sortFolderNotes(
  notes: Note[],
  sortMode: FolderNotesSortMode,
  noteViewCounts: Map<string, number>,
  noteRecentViewedAt: Map<string, number>,
) {
  return [...notes].sort((left, right) => {
    const leftDocumentId = getDocumentId(left);
    const rightDocumentId = getDocumentId(right);
    const leftCreatedAt = toTimestamp(left.createdAt ?? left.updatedAt);
    const rightCreatedAt = toTimestamp(right.createdAt ?? right.updatedAt);
    const leftUpdatedAt = toTimestamp(left.updatedAt);
    const rightUpdatedAt = toTimestamp(right.updatedAt);
    const leftRecentViewedAt = noteRecentViewedAt.get(leftDocumentId) ?? 0;
    const rightRecentViewedAt = noteRecentViewedAt.get(rightDocumentId) ?? 0;
    const leftViewCount = noteViewCounts.get(leftDocumentId) ?? 0;
    const rightViewCount = noteViewCounts.get(rightDocumentId) ?? 0;

    if (sortMode === "recent") {
      return rightRecentViewedAt - leftRecentViewedAt || rightViewCount - leftViewCount || rightUpdatedAt - leftUpdatedAt || compareTitles(left, right);
    }

    if (sortMode === "views") {
      return rightViewCount - leftViewCount || rightRecentViewedAt - leftRecentViewedAt || rightUpdatedAt - leftUpdatedAt || compareTitles(left, right);
    }

    if (sortMode === "modified") {
      return rightUpdatedAt - leftUpdatedAt || rightCreatedAt - leftCreatedAt || compareTitles(left, right);
    }

    if (sortMode === "name-asc") {
      return compareTitles(left, right);
    }

    if (sortMode === "name-desc") {
      return compareTitles(right, left);
    }

    return rightCreatedAt - leftCreatedAt || rightUpdatedAt - leftUpdatedAt || compareTitles(left, right);
  });
}