import type { Note, NoteTreeNode } from "./types";

export function getNoteSourceFileName(note: Note) {
  return note.sourcePath?.split("/").pop() || "";
}

export function formatNoteTargetLocation(sourcePath: string) {
  const normalizedPath = sourcePath
    .split("/")
    .filter(Boolean)
    .join("/");

  return normalizedPath ? `data/docs/${normalizedPath}` : "data/docs";
}

export function formatNoteTimestamp(value: string) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return value;
  }
  return formatRelativeTimestamp(timestamp);
}

export function formatRecentViewedAt(value: number) {
  return `Viewed ${formatRelativeTimestamp(value)}`;
}

export function formatRecentViewCount(value: number) {
  const safeValue = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return `${safeValue} view${safeValue === 1 ? "" : "s"}`;
}

function formatRelativeTimestamp(timestamp: number) {
  if (Number.isNaN(timestamp)) {
    return "";
  }

  const deltaMs = timestamp - Date.now();
  const deltaMinutes = Math.round(deltaMs / 60000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  if (Math.abs(deltaMinutes) < 60) {
    return formatter.format(deltaMinutes, "minute");
  }

  const deltaHours = Math.round(deltaMinutes / 60);
  if (Math.abs(deltaHours) < 24) {
    return formatter.format(deltaHours, "hour");
  }

  const deltaDays = Math.round(deltaHours / 24);
  if (Math.abs(deltaDays) < 7) {
    return formatter.format(deltaDays, "day");
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(timestamp);
}

export function countNotesInTree(tree: NoteTreeNode[]): number {
  return tree.reduce((count, node) => {
    if (node.type === "note") {
      return count + 1;
    }
    return count + countNotesInTree(node.children);
  }, 0);
}
