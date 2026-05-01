import { getNoteSourceFileName } from "./noteFormatting";
import { filterEntriesBySearchFilters, parseSearchFilterQuery } from "./searchFilters";
import { filterEntriesByScope, parseScopedSearchQuery } from "./searchScope";
import { formatTodoStatus } from "./todoState";
import type {
  BookmarkItem,
  Note,
  NoteTreeNode,
  RecentDocumentEntry,
  SearchEntry,
  TodoItem,
} from "./types";

type IndexedNote = {
  codeBlocksText: string;
  isRecent: boolean;
  isStarred: boolean;
  item: Note & { path: string[] };
  pathText: string;
  snippetLanguages: string[];
  sourceFileName: string;
  tagsText: string;
};

type IndexedBookmark = {
  item: BookmarkItem;
  pathText: string;
};

type IndexedTodo = {
  dueDate: string | null;
  isRecent: boolean;
  item: TodoItem;
  listName: string;
  statusLabel: string;
  tagsText: string;
};

export type SearchIndex = {
  bookmarks: IndexedBookmark[];
  notes: IndexedNote[];
  tags: string[];
  todos: IndexedTodo[];
};

export function buildSearchIndex(
  notesTreeNodes: NoteTreeNode[],
  notesList: Note[],
  wikiTreeNodes: NoteTreeNode[],
  wikiNotes: Note[],
  bookmarks: BookmarkItem[],
  todoItems: TodoItem[],
  recentDocuments: RecentDocumentEntry[],
): SearchIndex {
  const indexedNotes = [
    ...flattenNoteTree(notesTreeNodes, notesList),
    ...flattenNoteTree(wikiTreeNodes, wikiNotes),
  ];
  const recentDocumentIds = new Set(recentDocuments.map((entry) => entry.documentId));

  return {
    notes: indexedNotes.map((item) => {
      const sourceFileName = getNoteSourceFileName(item);
      const pathText = item.path.join(" / ");
      const codeBlocksText = extractCodeBlocks(item.content).join(" ");
      return {
        item,
        sourceFileName,
        pathText,
        codeBlocksText,
        snippetLanguages: Array.from(new Set(Array.from(item.content.matchAll(/```(\w+)/g)).map((match) => match[1]))),
        isRecent: recentDocumentIds.has(`${item.kind}:${item.id}`),
        isStarred: Boolean(item.starred),
        tagsText: item.tags.join(" "),
      };
    }),
    bookmarks: bookmarks.map((item) => ({ item, pathText: item.path.join(" / ") })),
    todos: todoItems.map((item) => ({
      item,
      listName: item.listName,
      statusLabel: formatTodoStatus(item.status),
      tagsText: item.tags.join(" "),
      dueDate: item.expectedCompletionDate,
      isRecent: recentDocumentIds.has(`todo:${item.id}`),
    })),
    tags: Array.from(new Set([...notesList, ...wikiNotes, ...bookmarks, ...todoItems].flatMap((item) => item.tags))),
  };
}

export function buildSearchEntries(query: string, searchIndex: SearchIndex): SearchEntry[] {
  const parsedQuery = parseScopedSearchQuery(query);
  const parsedFilterQuery = parseSearchFilterQuery(parsedQuery.query);
  const effectiveQuery = parsedFilterQuery.query;

  const noteEntries: SearchEntry[] = searchIndex.notes.flatMap(({ item, sourceFileName, pathText, codeBlocksText, snippetLanguages, isRecent, isStarred, tagsText }) => {
    const codeEntries: SearchEntry[] = snippetLanguages.map((language) => ({
      id: `${item.id}-${language}`,
      title: `${item.title} / ${language} snippet`,
      subtitle: getSearchPreview(
        effectiveQuery,
        [item.title, pathText, language, codeBlocksText],
        item.path.length ? `${pathText} · code block indexed from ${item.kind}.` : `Code block indexed from ${item.kind}.`,
      ),
      category: "code",
      filterTags: item.tags,
      isRecent,
      isStarred,
      tags: [...item.tags, language, sourceFileName, ...item.path.map(slugify)],
      matchText: [item.title, sourceFileName, pathText, language, codeBlocksText].join(" "),
      scoreText: getSearchScoreText(
        effectiveQuery,
        [
          { label: "title", value: item.title },
          { label: "filename", value: sourceFileName },
          { label: "path", value: pathText },
          { label: "code", value: codeBlocksText },
        ],
        "Snippet match",
      ),
      targetSection: item.kind === "wiki" ? "wiki" : "notes",
      targetId: item.id,
      targetPath: item.path,
    }));

    return [
      {
        id: item.id,
        title: item.title,
        subtitle: getSearchPreview(
          effectiveQuery,
          [item.title, sourceFileName, item.summary, pathText, tagsText, item.content],
          item.path.length ? `${pathText} · ${sourceFileName || item.summary || item.title}` : sourceFileName || item.summary,
        ),
        category: item.kind,
        filterTags: item.tags,
        isRecent,
        isStarred,
        tags: [...item.tags, sourceFileName, ...item.path.map(slugify)],
        matchText: [item.title, sourceFileName, item.summary, pathText, item.content, tagsText].join(" "),
        scoreText: getSearchScoreText(
          effectiveQuery,
          [
            { label: "title", value: item.title },
            { label: "filename", value: sourceFileName },
            { label: "summary", value: item.summary },
            { label: "path", value: pathText },
            { label: "content", value: item.content },
            { label: "tags", value: tagsText },
          ],
          item.kind === "wiki" ? "Wiki page" : "Markdown note",
        ),
        targetSection: item.kind === "wiki" ? "wiki" : "notes",
        targetId: item.id,
        targetPath: item.path,
      },
      ...codeEntries,
    ];
  });

  const bookmarkEntries: SearchEntry[] = searchIndex.bookmarks.map(({ item, pathText }) => ({
    id: item.id,
    title: item.title,
    subtitle: getSearchPreview(
      effectiveQuery,
      [item.title, item.description, pathText, item.domain, item.url, item.tags.join(" ")],
      item.path.length ? `${pathText} · ${item.domain}` : item.domain,
    ),
    category: "bookmark",
    filterTags: item.tags,
    isStarred: Boolean(item.starred),
    tags: [...item.tags, ...item.path.map(slugify)],
    scoreText: getSearchScoreText(
      effectiveQuery,
      [
        { label: "title", value: item.title },
        { label: "description", value: item.description },
        { label: "path", value: pathText },
        { label: "domain", value: item.domain },
        { label: "url", value: item.url },
      ],
      item.domain,
    ),
    targetSection: "bookmarks",
    targetId: item.id,
    targetPath: item.path,
    targetUrl: item.url,
  }));

  const todoEntries: SearchEntry[] = searchIndex.todos.map(({ item, listName, statusLabel, tagsText, dueDate, isRecent }) => ({
    id: item.id,
    title: item.title,
    subtitle: getSearchPreview(
      effectiveQuery,
      [
        item.title,
        item.description,
        listName,
        statusLabel,
        item.priority,
        tagsText,
        item.startDate ?? "",
        dueDate ?? "",
      ],
      `${listName} · ${statusLabel} · ${item.priority} priority`,
    ),
    category: "todo",
    filterTags: item.tags,
    isRecent,
    isStarred: Boolean(item.starred),
    tags: [...item.tags, listName, item.priority, slugify(statusLabel)],
    matchText: [
      item.title,
      item.description,
      listName,
      statusLabel,
      item.priority,
      tagsText,
      item.startDate ?? "",
      dueDate ?? "",
    ].join(" "),
    scoreText: getSearchScoreText(
      effectiveQuery,
      [
        { label: "title", value: item.title },
        { label: "description", value: item.description },
        { label: "list", value: listName },
        { label: "status", value: statusLabel },
        { label: "priority", value: item.priority },
        { label: "tags", value: tagsText },
      ],
      "TODO item",
    ),
    targetSection: "todo",
    targetId: item.id,
    todoDueDate: dueDate,
    todoStatus: item.status,
  }));

  const tagEntries: SearchEntry[] = searchIndex.tags.map((tag) => ({
    id: `tag-${tag}`,
    title: `#${tag}`,
    subtitle: `Tag archive for ${tag}`,
    category: "tag",
    filterTags: [tag],
    tags: [tag],
    scoreText: "Tag",
    targetQuery: tag,
  }));

  const scopedEntries = filterEntriesByScope(
    [...noteEntries, ...bookmarkEntries, ...todoEntries, ...(parsedQuery.sectionScope ? [] : tagEntries)],
    parsedQuery,
  );
  const dedupedEntries = dedupeSearchEntries(filterEntriesBySearchFilters(scopedEntries, parsedFilterQuery));

  if (!effectiveQuery.trim()) {
    if (parsedQuery.sectionScope || parsedQuery.noteSectionScope || parsedQuery.folderScopePath.length > 0 || parsedFilterQuery.hasFilters) {
      return dedupedEntries;
    }
    return dedupedEntries.slice(0, 9);
  }

  return dedupedEntries
    .filter((entry) =>
      matchesSearch(
        entry.matchText ?? [entry.title, entry.subtitle, entry.category, entry.tags.join(" ")].join(" "),
        effectiveQuery,
      ),
    )
    .sort((left, right) => scoreSearchEntry(right, effectiveQuery) - scoreSearchEntry(left, effectiveQuery));
}

function flattenNoteTree(tree: NoteTreeNode[], notesList: Note[], path: string[] = []): Array<Note & { path: string[] }> {
  return tree.flatMap((node) => {
    if (node.type === "folder") {
      return flattenNoteTree(node.children, notesList, [...path, node.title]);
    }

    const note = node.note ?? notesList.find((item) => item.id === node.noteId);
    const notePath = note?.path?.length ? note.path : path;
    return note ? [{ ...note, path: notePath }] : [];
  });
}

function dedupeSearchEntries(entries: SearchEntry[]) {
  const seen = new Set<string>();
  const deduped: SearchEntry[] = [];

  for (const entry of entries) {
    const key = getSearchEntryDedupeKey(entry);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(entry);
  }

  return deduped;
}

function getSearchEntryDedupeKey(entry: SearchEntry) {
  if (entry.category === "bookmark" && entry.targetUrl) {
    return `bookmark:${normalizeSearchUrl(entry.targetUrl)}`;
  }

  if (entry.category === "tag") {
    return `tag:${(entry.targetQuery ?? entry.title).trim().toLowerCase()}`;
  }

  if (entry.targetId) {
    return `${entry.category}:${entry.targetSection ?? ""}:${entry.targetId}:${entry.title.trim().toLowerCase()}`;
  }

  return `${entry.category}:${entry.title.trim().toLowerCase()}:${entry.subtitle.trim().toLowerCase()}`;
}

function normalizeSearchUrl(url: string) {
  return url.trim().replace(/\/+$/, "").toLowerCase();
}

function getSearchPreview(query: string, candidates: string[], fallback: string) {
  if (!query.trim()) {
    return fallback;
  }

  const match = candidates.find((candidate) => candidate && matchesSearch(candidate, query));
  if (!match) {
    return fallback;
  }

  return createSearchExcerpt(match, query);
}

function getSearchScoreText(
  query: string,
  candidates: Array<{ label: string; value: string }>,
  fallback: string,
) {
  if (!query.trim()) {
    return fallback;
  }

  const match = candidates.find((candidate) => candidate.value && matchesSearch(candidate.value, query));
  if (!match) {
    return fallback;
  }

  return `Matched ${match.label}`;
}

function createSearchExcerpt(text: string, query: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  const lowered = normalized.toLowerCase();
  const target = query.trim().toLowerCase();
  const index = lowered.indexOf(target);

  if (index === -1) {
    return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
  }

  const start = Math.max(0, index - 36);
  const end = Math.min(normalized.length, index + target.length + 52);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < normalized.length ? "..." : "";
  return `${prefix}${normalized.slice(start, end)}${suffix}`;
}

function extractCodeBlocks(markdown: string) {
  return Array.from(markdown.matchAll(/```[\w+-]*\n([\s\S]*?)```/g)).map((match) => match[1] ?? "");
}

function scoreSearchEntry(entry: SearchEntry, query: string) {
  const loweredQuery = query.trim().toLowerCase();
  const title = entry.title.toLowerCase();
  const subtitle = entry.subtitle.toLowerCase();

  let score = 0;
  if (title.includes(loweredQuery)) score += 5;
  if (subtitle.includes(loweredQuery)) score += 3;
  if (entry.tags.some((tag) => tag.toLowerCase().includes(loweredQuery))) score += 2;
  if (entry.category === "tag") score -= 1;
  return score;
}

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
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