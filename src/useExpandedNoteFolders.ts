import { useEffect, useState } from "react";

const STORED_EXPANDED_NOTE_FOLDERS_KEY = "organizer:expanded-note-folders";

export function getStoredExpandedNoteFolderIds() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORED_EXPANDED_NOTE_FOLDERS_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return null;
    }

    return new Set(parsed.filter((folderId): folderId is string => typeof folderId === "string" && folderId.trim().length > 0));
  } catch {
    return null;
  }
}

export function syncExpandedNoteFolderIds(
  current: Set<string>,
  available: Set<string>,
  hasInitialized: boolean,
) {
  if (!hasInitialized) {
    if (available.size === 0) {
      return {
        expandedFolderIds: current,
        hasInitialized: false,
      };
    }

    return {
      expandedFolderIds: new Set(available),
      hasInitialized: true,
    };
  }

  const next = new Set<string>();
  for (const folderId of current) {
    if (available.has(folderId)) {
      next.add(folderId);
    }
  }

  return {
    expandedFolderIds: next,
    hasInitialized: true,
  };
}

export function toggleExpandedNoteFolder(current: Set<string>, folderId: string) {
  const next = new Set(current);
  if (next.has(folderId)) {
    next.delete(folderId);
  } else {
    next.add(folderId);
  }
  return next;
}

export function expandExpandedNoteFolders(current: Set<string>, folderIds: string[], available: Set<string>) {
  const next = new Set(current);

  for (const folderId of folderIds) {
    if (available.has(folderId)) {
      next.add(folderId);
    }
  }

  return next;
}

export function useExpandedNoteFolders(availableFolderIds: Set<string>) {
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(() => getStoredExpandedNoteFolderIds() ?? new Set());
  const [hasInitialized, setHasInitialized] = useState(() => getStoredExpandedNoteFolderIds() !== null);

  useEffect(() => {
    setExpandedFolderIds((current) => {
      const nextState = syncExpandedNoteFolderIds(current, availableFolderIds, hasInitialized);
      if (nextState.hasInitialized !== hasInitialized) {
        setHasInitialized(nextState.hasInitialized);
      }
      return areFolderSetsEqual(current, nextState.expandedFolderIds) ? current : nextState.expandedFolderIds;
    });
  }, [availableFolderIds, hasInitialized]);

  useEffect(() => {
    if (!hasInitialized || typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(STORED_EXPANDED_NOTE_FOLDERS_KEY, JSON.stringify([...expandedFolderIds]));
    } catch {
      // Ignore storage errors.
    }
  }, [expandedFolderIds, hasInitialized]);

  return {
    expandedFolderIds,
    toggleFolder(folderId: string) {
      setExpandedFolderIds((current) => toggleExpandedNoteFolder(current, folderId));
    },
    expandFolders(folderIds: string[]) {
      setExpandedFolderIds((current) => expandExpandedNoteFolders(current, folderIds, availableFolderIds));
    },
  };
}

function areFolderSetsEqual(left: Set<string>, right: Set<string>) {
  if (left.size !== right.size) {
    return false;
  }

  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }

  return true;
}
