import type { Note, NoteTreeNode, SectionId } from "./types";

export type NoteTreeSearchState = "neutral" | "match" | "partial" | "excluded";

export function buildNoteTreeSearchStateMap({
  currentSection,
  notes,
  query,
  tree,
}: {
  currentSection: SectionId;
  notes: Note[];
  query: string;
  tree: NoteTreeNode[];
}) {
  const parsedQuery = parseScopedSearchQuery(query);
  const hasActiveSearch = Boolean(parsedQuery.sectionScope || parsedQuery.folderScopePath.length > 0 || parsedQuery.query.trim());
  const notesById = new Map(notes.map((note) => [note.id, note]));
  const stateByNodeId = new Map<string, NoteTreeSearchState>();

  if (!hasActiveSearch) {
    return {
      matchingNoteCount: countNotes(tree),
      stateByNodeId,
    };
  }

  const normalizedFolderScope = parsedQuery.folderScopePath.map(normalizeSearchSegment);
  const sectionMatches = !parsedQuery.sectionScope || parsedQuery.sectionScope === currentSection;

  function visit(node: NoteTreeNode): { state: NoteTreeSearchState; matchingNoteCount: number } {
    if (node.type === "note") {
      const note = notesById.get(node.noteId) ?? node.note;
      const isMatch =
        note !== undefined &&
        sectionMatches &&
        isNoteWithinFolderScope(note, normalizedFolderScope) &&
        matchesNote(note, parsedQuery.query);
      const state = isMatch ? "match" : "excluded";
      stateByNodeId.set(node.id, state);
      return { state, matchingNoteCount: isMatch ? 1 : 0 };
    }

    const childResults = node.children.map(visit);
    const matchingNoteCount = childResults.reduce((total, child) => total + child.matchingNoteCount, 0);
    const hasIncludedChild = childResults.some((child) => child.state === "match" || child.state === "partial");
    const hasExcludedChild = childResults.some((child) => child.state === "excluded");

    let state: NoteTreeSearchState;
    if (!sectionMatches) {
      state = "excluded";
    } else if (!hasIncludedChild) {
      state = "excluded";
    } else if (hasExcludedChild) {
      state = "partial";
    } else {
      state = "match";
    }

    stateByNodeId.set(node.id, state);
    return { state, matchingNoteCount };
  }

  const matchingNoteCount = tree.reduce((total, node) => total + visit(node).matchingNoteCount, 0);

  return {
    matchingNoteCount,
    stateByNodeId,
  };
}

function countNotes(tree: NoteTreeNode[]): number {
  return tree.reduce((total, node) => {
    if (node.type === "note") {
      return total + 1;
    }
    return total + countNotes(node.children);
  }, 0);
}

function parseScopedSearchQuery(query: string) {
  let remaining = query.trim();
  let sectionScope: SectionId | null = null;
  let folderScopePath: string[] = [];

  while (remaining.length > 0) {
    const sectionMatch = /^in:\s*([^\s]+)\s*(.*)$/i.exec(remaining);
    if (sectionMatch) {
      const [, rawScope, rest] = sectionMatch;
      const normalizedSectionScope = normalizeSearchScope(rawScope);

      if (!sectionScope && normalizedSectionScope) {
        sectionScope = normalizedSectionScope;
        remaining = rest.trim();
        continue;
      }

      if (!folderScopePath.length && (sectionScope === "notes" || sectionScope === "wiki")) {
        folderScopePath = normalizeFolderScopePath(rawScope);
        remaining = rest.trim();
        continue;
      }
    }

    const folderMatch = /^folder:\s*([^\s]+)\s*(.*)$/i.exec(remaining);
    if (folderMatch && !folderScopePath.length && (sectionScope === "notes" || sectionScope === "wiki")) {
      const [, rawFolderPath, rest] = folderMatch;
      folderScopePath = normalizeFolderScopePath(rawFolderPath);
      remaining = rest.trim();
      continue;
    }

    break;
  }

  return {
    sectionScope,
    folderScopePath,
    query: remaining,
  };
}

function normalizeSearchScope(rawScope: string): SectionId | null {
  const scope = rawScope.trim().toLowerCase();

  if (scope === "notes" || scope === "note") return "notes";
  if (scope === "wiki" || scope === "wikis") return "wiki";
  if (scope === "favorites" || scope === "favorite" || scope === "bookmarks" || scope === "bookmark") {
    return "bookmarks";
  }
  if (scope === "todo" || scope === "todos" || scope === "tasks" || scope === "task") return "todo";
  if (scope === "starred" || scope === "stars") return "starred";
  if (scope === "recent" || scope === "recents") return "recent";

  return null;
}

function normalizeFolderScopePath(rawPath: string) {
  return rawPath
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function isNoteWithinFolderScope(note: Note, normalizedFolderScope: string[]) {
  if (normalizedFolderScope.length === 0) {
    return true;
  }

  const notePath = (note.path ?? []).map(normalizeSearchSegment);
  if (notePath.length < normalizedFolderScope.length) {
    return false;
  }

  return normalizedFolderScope.every((segment, index) => notePath[index] === segment);
}

function matchesNote(note: Note, query: string) {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return true;
  }

  const fileName = note.sourcePath?.split("/").pop() ?? "";
  const haystack = [note.title, fileName, note.summary, (note.path ?? []).join(" / "), note.tags.join(" "), note.content].join(" ");
  return matchesSearch(haystack, trimmedQuery);
}

function matchesSearch(haystack: string, query: string) {
  const regex = parseRegexQuery(query);
  if (regex) {
    regex.lastIndex = 0;
    return regex.test(haystack);
  }

  return haystack.toLowerCase().includes(query.toLowerCase());
}

function parseRegexQuery(query: string) {
  const trimmed = query.trim();
  const match = /^\/(.+)\/([a-z]*)$/i.exec(trimmed);
  if (!match) {
    return null;
  }

  try {
    return new RegExp(match[1], match[2]);
  } catch {
    return null;
  }
}

function normalizeSearchSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
