export type NavigationSnapshot = {
  section: "notes" | "wiki" | "bookmarks" | "todo" | "starred" | "recent";
  selectedNoteNodeId: string | null;
  selectedBookmarkId: string | null;
  selectedTodoId: string | null;
};

export type NavigationHistoryState = {
  entries: NavigationSnapshot[];
  index: number;
};

export function commitNavigationHistory(
  current: NavigationHistoryState,
  snapshot: NavigationSnapshot,
  mode: "push" | "replace",
): NavigationHistoryState {
  const currentEntry = current.entries[current.index];

  if (isSameNavigationSnapshot(currentEntry, snapshot)) {
    return current;
  }

  if (mode === "replace") {
    return {
      entries: current.entries.map((entry, index) => (index === current.index ? snapshot : entry)),
      index: current.index,
    };
  }

  const baseEntries = current.entries.slice(0, current.index + 1);
  const lastEntry = baseEntries[baseEntries.length - 1];

  if (isSameNavigationSnapshot(lastEntry, snapshot)) {
    return {
      entries: baseEntries,
      index: baseEntries.length - 1,
    };
  }

  return {
    entries: [...baseEntries, snapshot],
    index: baseEntries.length,
  };
}

function isSameNavigationSnapshot(left: NavigationSnapshot | undefined, right: NavigationSnapshot) {
  return (
    left !== undefined &&
    left.section === right.section &&
    left.selectedNoteNodeId === right.selectedNoteNodeId &&
    left.selectedBookmarkId === right.selectedBookmarkId &&
    left.selectedTodoId === right.selectedTodoId
  );
}
