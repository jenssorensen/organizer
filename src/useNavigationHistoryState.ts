import { useCallback, useState } from "react";

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

export function initialNavigationHistoryState(rootNodeId: string): NavigationHistoryState {
  return {
    entries: [
      {
        section: "notes",
        selectedNoteNodeId: rootNodeId,
        selectedBookmarkId: null,
        selectedTodoId: null,
      },
    ],
    index: 0,
  };
}

export function createNavigationSnapshot(
  current: NavigationSnapshot,
  partial: Partial<NavigationSnapshot>,
): NavigationSnapshot;
export function createNavigationSnapshot(
  section: NavigationSnapshot["section"],
  selectedNoteNodeId: string | null,
  selectedBookmarkId: string | null,
  selectedTodoId?: string | null,
): NavigationSnapshot;
export function createNavigationSnapshot(
  input: NavigationSnapshot | NavigationSnapshot["section"],
  selectedNoteNodeIdOrPartial: string | null | Partial<NavigationSnapshot>,
  selectedBookmarkId?: string | null,
  selectedTodoId?: string | null,
): NavigationSnapshot {
  if (typeof input === "string") {
    return {
      section: input,
      selectedNoteNodeId: (selectedNoteNodeIdOrPartial as string | null) ?? null,
      selectedBookmarkId: selectedBookmarkId ?? null,
      selectedTodoId: selectedTodoId ?? null,
    };
  }

  const partial = selectedNoteNodeIdOrPartial as Partial<NavigationSnapshot>;
  return {
    section: partial.section ?? input.section,
    selectedNoteNodeId:
      partial.selectedNoteNodeId !== undefined ? partial.selectedNoteNodeId : input.selectedNoteNodeId,
    selectedBookmarkId:
      partial.selectedBookmarkId !== undefined ? partial.selectedBookmarkId : input.selectedBookmarkId,
    selectedTodoId:
      partial.selectedTodoId !== undefined ? partial.selectedTodoId : input.selectedTodoId,
  };
}

export function getHistoryTraversalResult(
  history: NavigationHistoryState,
  direction: -1 | 1,
): { history: NavigationHistoryState; snapshot: NavigationSnapshot } | null {
  const nextIndex = history.index + direction;
  if (nextIndex < 0 || nextIndex >= history.entries.length) {
    return null;
  }

  return {
    history: {
      ...history,
      index: nextIndex,
    },
    snapshot: history.entries[nextIndex],
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

function commitNavigationHistory(
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

export function useNavigationHistoryState(initialSnapshot: NavigationSnapshot) {
  const [history, setHistory] = useState<NavigationHistoryState>({
    entries: [initialSnapshot],
    index: 0,
  });

  const commitSnapshot = useCallback((snapshot: NavigationSnapshot, mode: "push" | "replace") => {
    setHistory((current) => commitNavigationHistory(current, snapshot, mode));
  }, []);

  const traverseHistory = useCallback((direction: -1 | 1) => {
    let nextSnapshot: NavigationSnapshot | null = null;

    setHistory((current) => {
      const traversal = getHistoryTraversalResult(current, direction);
      nextSnapshot = traversal?.snapshot ?? null;
      return traversal?.history ?? current;
    });

    return nextSnapshot;
  }, []);

  return {
    history,
    commitSnapshot,
    traverseHistory,
  };
}
