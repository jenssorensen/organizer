import type { ParsedSearchFilterQuery, SearchEntry } from "./types";

const SEARCH_TYPE_ALIASES: Record<string, SearchEntry["category"]> = {
  bookmark: "bookmark",
  bookmarks: "bookmark",
  code: "code",
  note: "note",
  notes: "note",
  tag: "tag",
  tags: "tag",
  task: "todo",
  tasks: "todo",
  todo: "todo",
  todos: "todo",
  wiki: "wiki",
  wikis: "wiki",
};

export function parseSearchFilterQuery(query: string): ParsedSearchFilterQuery {
  const tokens = query.trim().length > 0 ? query.trim().split(/\s+/) : [];
  const remainingTokens: string[] = [];
  const types = new Set<SearchEntry["category"]>();
  const tags = new Set<string>();
  let due: string | null = null;
  let isStarred = false;
  let isRecent = false;

  for (const token of tokens) {
    const typeMatch = /^type:(.+)$/i.exec(token);
    if (typeMatch) {
      const normalizedType = normalizeSearchType(typeMatch[1]);
      if (normalizedType) {
        types.add(normalizedType);
        continue;
      }
    }

    const tagMatch = /^tag:(.+)$/i.exec(token);
    if (tagMatch) {
      const normalizedTag = normalizeTagFilter(tagMatch[1]);
      if (normalizedTag) {
        tags.add(normalizedTag);
        continue;
      }
    }

    const dueMatch = /^due:(.+)$/i.exec(token);
    if (dueMatch) {
      const normalizedDue = dueMatch[1].trim().toLowerCase();
      if (normalizedDue) {
        due = normalizedDue;
        continue;
      }
    }

    const isMatch = /^is:(.+)$/i.exec(token);
    if (isMatch) {
      const normalizedFlag = isMatch[1].trim().toLowerCase();
      if (normalizedFlag === "starred" || normalizedFlag === "star") {
        isStarred = true;
        continue;
      }
      if (normalizedFlag === "recent" || normalizedFlag === "recents") {
        isRecent = true;
        continue;
      }
    }

    remainingTokens.push(token);
  }

  return {
    due,
    hasFilters: types.size > 0 || tags.size > 0 || Boolean(due) || isStarred || isRecent,
    isRecent,
    isStarred,
    query: remainingTokens.join(" ").trim(),
    tags: [...tags],
    types: [...types],
  };
}

export function filterEntriesBySearchFilters(
  entries: SearchEntry[],
  parsedQuery: ParsedSearchFilterQuery,
  now = new Date(),
) {
  const today = toIsoDate(now);
  const weekEnd = addDays(today, 6);

  return entries.filter((entry) => {
    if (parsedQuery.types.length > 0 && !parsedQuery.types.includes(entry.category)) {
      return false;
    }

    if (parsedQuery.tags.length > 0) {
      const filterTags = new Set((entry.filterTags ?? entry.tags).map(normalizeTagFilter).filter(Boolean) as string[]);
      for (const tag of parsedQuery.tags) {
        if (!filterTags.has(tag)) {
          return false;
        }
      }
    }

    if (parsedQuery.isStarred && !entry.isStarred) {
      return false;
    }

    if (parsedQuery.isRecent && !entry.isRecent) {
      return false;
    }

    if (parsedQuery.due) {
      if (entry.category !== "todo" || !entry.todoDueDate || entry.todoStatus === "completed") {
        return false;
      }

      const dueDate = entry.todoDueDate.slice(0, 10);
      if (parsedQuery.due === "today") {
        return dueDate === today;
      }
      if (parsedQuery.due === "overdue") {
        return dueDate < today;
      }
      if (parsedQuery.due === "week" || parsedQuery.due === "this-week") {
        return dueDate >= today && dueDate <= weekEnd;
      }

      return dueDate === parsedQuery.due;
    }

    return true;
  });
}

function normalizeSearchType(value: string): SearchEntry["category"] | null {
  return SEARCH_TYPE_ALIASES[value.trim().toLowerCase()] ?? null;
}

function normalizeTagFilter(value: string) {
  return value.trim().replace(/^#/, "").toLowerCase();
}

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(isoDate: string, offset: number) {
  const result = new Date(`${isoDate}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + offset);
  return toIsoDate(result);
}
