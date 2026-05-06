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
      const normalizedTree = normalizeBookmarkTreeIds(data.tree);
      const normalizedBookmarks = flattenBookmarkTree(normalizedTree);
      setBookmarkTree(normalizedTree);
      setBookmarks(normalizedBookmarks);
      onSelectedBookmarkIdChange((current) =>
        current && findNodeById(normalizedTree, current) ? current : normalizedBookmarks[0]?.id ?? firstTreeNode(normalizedTree)?.id ?? null,
      );
      setBookmarkStatus(`${normalizedBookmarks.length} bookmarks synced`);

      if (!areBookmarkTreesEqual(data.tree, normalizedTree)) {
        void fetch(`${apiBase}/api/bookmarks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tree: normalizedTree }),
        }).catch(() => {});
      }
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

function normalizeBookmarkTreeIds(tree: BookmarkNode[]): BookmarkNode[] {
  const seenIds = new Set<string>();
  const pathCounts = new Map<string, number>();

  function visit(nodes: BookmarkNode[], path: string[]): BookmarkNode[] {
    return nodes.map((node) => {
      const pathKey = createBookmarkPathKey(node, path);
      const nextCount = (pathCounts.get(pathKey) ?? 0) + 1;
      pathCounts.set(pathKey, nextCount);

      const nextId = !node.id || seenIds.has(node.id)
        ? createNormalizedBookmarkNodeId(pathKey, nextCount)
        : node.id;
      seenIds.add(nextId);

      if (node.type === "folder") {
        return {
          ...node,
          id: nextId,
          children: visit(node.children, [...path, node.title]),
        };
      }

      return {
        ...node,
        id: nextId,
      };
    });
  }

  return visit(tree, []);
}

function createBookmarkPathKey(node: BookmarkNode, path: string[]) {
  if (node.type === "folder") {
    return ["folder", ...path, node.title].join("/");
  }

  return ["bookmark", ...path, node.title, node.url].join("/");
}

function createNormalizedBookmarkNodeId(value: string, occurrence: number) {
  const base = occurrence > 1 ? `${value}:${occurrence}` : value;
  let hash = 0;

  for (const character of base) {
    hash = (hash * 31 + character.codePointAt(0)!) >>> 0;
  }

  return `node-${hash.toString(36)}`;
}

function flattenBookmarkTree(tree: BookmarkNode[], path: string[] = []): BookmarkItem[] {
  return tree.flatMap((node) => {
    if (node.type === "folder") {
      return flattenBookmarkTree(node.children, [...path, node.title]);
    }

    return [{
      id: node.id,
      title: node.title,
      description: node.description ?? "",
      url: node.url,
      domain: node.domain,
      icon: node.icon,
      tags: node.tags,
      path,
      starred: node.starred,
    }];
  });
}

function areBookmarkTreesEqual(left: BookmarkNode[], right: BookmarkNode[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
