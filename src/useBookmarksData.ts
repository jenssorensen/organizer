import { useCallback, useState } from "react";
import { createSyncEntryId, enqueueSyncEntry, loadSyncQueue } from "./syncQueue";
import type { BookmarkItem, BookmarkNode, BookmarksResponse } from "./types";

export function useBookmarksData({
  apiBase,
  onSelectedBookmarkIdChange,
  onSyncQueueChange,
}: {
  apiBase: string;
  onSelectedBookmarkIdChange: (value: string | null | ((current: string | null) => string | null)) => void;
  onSyncQueueChange?: (count: number) => void;
}) {
  const [bookmarkTree, setBookmarkTree] = useState<BookmarkNode[]>([]);
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [bookmarkStatus, setBookmarkStatus] = useState("Loading bookmarks...");
  const [hasLoadedBookmarks, setHasLoadedBookmarks] = useState(false);

  const loadBookmarks = useCallback(async () => {
    try {
      const response = await fetch(`${apiBase}/api/bookmarks`);
      if (!response.ok) {
        throw new Error("Failed to load bookmarks");
      }

      const data = (await response.json()) as BookmarksResponse;
      setBookmarkTree(data.tree);
      setBookmarks(data.bookmarks);
      onSelectedBookmarkIdChange((current) =>
        current && findNodeById(data.tree, current) ? current : data.bookmarks[0]?.id ?? firstTreeNode(data.tree)?.id ?? null,
      );
      setBookmarkStatus(`${data.bookmarks.length} bookmarks synced`);
    } catch {
      setBookmarkStatus("Bookmark API offline");
    } finally {
      setHasLoadedBookmarks(true);
    }
  }, [apiBase, onSelectedBookmarkIdChange]);

  const persistBookmarkTree = useCallback(
    async (nextTree: BookmarkNode[], nextBookmarks: BookmarkItem[], statusMessage?: string) => {
      setBookmarkStatus("Saving bookmarks...");
      setBookmarkTree(nextTree);
      setBookmarks(nextBookmarks);

      try {
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          const queuedAt = Date.now();
          const nextQueue = enqueueSyncEntry(loadSyncQueue(), {
            id: createSyncEntryId("bookmarks-save", "bookmarks", queuedAt),
            kind: "bookmarks-save",
            resourceKey: "bookmarks",
            queuedAt,
            payload: { tree: nextTree },
          });
          onSyncQueueChange?.(nextQueue.length);
          setBookmarkStatus(statusMessage ?? "Bookmarks queued for sync");
          return;
        }

        const response = await fetch(`${apiBase}/api/bookmarks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tree: nextTree }),
        });

        if (!response.ok) {
          throw new Error("Failed to save bookmarks");
        }

        setBookmarkStatus(statusMessage ?? "Bookmark tree synced");
      } catch {
        const queuedAt = Date.now();
        const nextQueue = enqueueSyncEntry(loadSyncQueue(), {
          id: createSyncEntryId("bookmarks-save", "bookmarks", queuedAt),
          kind: "bookmarks-save",
          resourceKey: "bookmarks",
          queuedAt,
          payload: { tree: nextTree },
        });
        onSyncQueueChange?.(nextQueue.length);
        setBookmarkStatus("Bookmarks queued for sync");
      }
    },
    [apiBase, onSyncQueueChange],
  );

  return {
    bookmarkTree,
    bookmarks,
    bookmarkStatus,
    hasLoadedBookmarks,
    setBookmarkStatus,
    loadBookmarks,
    persistBookmarkTree,
  };
}

function firstTreeNode(tree: BookmarkNode[]): BookmarkNode | null {
  for (const node of tree) {
    return node;
  }

  return null;
}

function findNodeById(tree: BookmarkNode[], nodeId: string): BookmarkNode | null {
  for (const node of tree) {
    if (node.id === nodeId) {
      return node;
    }

    if (node.type === "folder") {
      const nested = findNodeById(node.children, nodeId);
      if (nested) {
        return nested;
      }
    }
  }

  return null;
}
