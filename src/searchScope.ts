import type { ParsedSearchQuery, SearchEntry, SectionId } from "./types";

export type ScopeTokenSuggestion =
  | {
      id: string;
      kind: "section";
      label: string;
      value: SectionId;
    }
  | {
      id: string;
      kind: "note-section";
      label: string;
      value: string;
    }
  | {
      id: string;
      kind: "folder";
      label: string;
      path: string[];
      subtitle: string | null;
    };

export function normalizeSearchScope(rawScope: string): SectionId | null {
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

export function normalizeFolderScopePath(rawPath: string) {
  return rawPath
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export function parseScopedSearchQuery(query: string): ParsedSearchQuery {
  let remaining = query.trim();
  let noteSectionScope: string | null = null;
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

    const noteSectionMatch = /^section:\s*([^\s]+)\s*(.*)$/i.exec(remaining);
    if (noteSectionMatch && !noteSectionScope && (!sectionScope || sectionScope === "notes")) {
      const [, rawSectionScope, rest] = noteSectionMatch;
      noteSectionScope = rawSectionScope.trim();
      sectionScope = "notes";
      remaining = rest.trim();
      continue;
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
    noteSectionScope,
    sectionScope,
    folderScopePath,
    query: remaining,
  };
}

export function consumeScopedSearchInput(value: string) {
  const parsed = parseScopedSearchQuery(value);
  if (!parsed.sectionScope && !parsed.noteSectionScope && parsed.folderScopePath.length === 0) {
    return { sectionScope: null, noteSectionScope: null, folderScopePath: [] as string[], text: value };
  }

  return {
    sectionScope: parsed.sectionScope,
    noteSectionScope: parsed.noteSectionScope,
    folderScopePath: parsed.folderScopePath,
    text: parsed.query,
  };
}

export function consumeScopedSearchInputWithDefaultSection(value: string, defaultSection: SectionId | null) {
  const trimmedValue = value.trim();
  const lowerTrimmedValue = trimmedValue.toLowerCase();

  if (!lowerTrimmedValue.startsWith("folder:")) {
    return consumeScopedSearchInput(value);
  }

  if (/^folder:\s*\S+$/i.test(trimmedValue) && !/\s$/.test(value)) {
    return {
      sectionScope: null,
      noteSectionScope: null,
      folderScopePath: [] as string[],
      text: value,
    };
  }

  if (!defaultSection) {
    return consumeScopedSearchInput(value);
  }

  return consumeScopedSearchInput(`in:${defaultSection} ${value}`);
}

export function consumeScopedSearchInputWithCurrentScopes(
  value: string,
  sectionScope: SectionId | null,
  noteSectionScope: string | null,
  folderScopePath: string[],
) {
  const trimmedValue = value.trim();
  const legacyInScopeMatch = /^in:\s*(\S+)$/i.exec(trimmedValue);

  if (
    !trimmedValue.toLowerCase().startsWith("in:") &&
    !trimmedValue.toLowerCase().startsWith("section:") &&
    !trimmedValue.toLowerCase().startsWith("folder:")
  ) {
    return {
      sectionScope,
      noteSectionScope,
      folderScopePath,
      text: value,
    };
  }

  if (
    legacyInScopeMatch &&
    !/\s$/.test(value) &&
    (sectionScope === "notes" || sectionScope === "wiki") &&
    !normalizeSearchScope(legacyInScopeMatch[1])
  ) {
    return {
      sectionScope,
      noteSectionScope,
      folderScopePath,
      text: value,
    };
  }

  if ((/^section:\s*\S+$/i.test(trimmedValue) || /^folder:\s*\S+$/i.test(trimmedValue)) && !/\s$/.test(value)) {
    return {
      sectionScope,
      noteSectionScope,
      folderScopePath,
      text: value,
    };
  }

  return consumeScopedSearchInput(composeScopedSearchQuery(sectionScope, noteSectionScope, folderScopePath, value));
}

export function composeScopedSearchQuery(
  sectionScope: SectionId | null,
  noteSectionScope: string | null,
  folderScopePath: string[],
  text: string,
) {
  const parts: string[] = [];
  if (sectionScope) {
    parts.push(`in:${sectionScope}`);
  }
  if (noteSectionScope && sectionScope === "notes") {
    parts.push(`section:${noteSectionScope}`);
  }
  if (folderScopePath.length > 0) {
    parts.push(`folder:${folderScopePath.join("/")}`);
  }
  if (text.trim()) {
    parts.push(text.trim());
  }

  return parts.join(" ").trim();
}

export function filterEntriesByScope(entries: SearchEntry[], parsedQuery: ParsedSearchQuery) {
  let nextEntries = entries;

  if (parsedQuery.sectionScope) {
    if (parsedQuery.sectionScope === "starred") {
      nextEntries = nextEntries.filter((entry) => entry.isStarred);
    } else if (parsedQuery.sectionScope === "recent") {
      nextEntries = nextEntries.filter((entry) => entry.isRecent);
    } else {
      nextEntries = nextEntries.filter((entry) => entry.targetSection === parsedQuery.sectionScope);
    }
  }

  if (parsedQuery.noteSectionScope && parsedQuery.sectionScope === "notes") {
    const normalizedSectionScope = normalizeFolderSegment(parsedQuery.noteSectionScope);
    nextEntries = nextEntries.filter(
      (entry) => normalizeFolderSegment(entry.targetPath?.[0] ?? "") === normalizedSectionScope,
    );
  }

  if (
    parsedQuery.folderScopePath.length > 0 &&
    (parsedQuery.sectionScope === "notes" || parsedQuery.sectionScope === "wiki")
  ) {
    const normalizedFolderPath = parsedQuery.folderScopePath.map(normalizeFolderSegment);
    nextEntries = nextEntries.filter((entry) => isEntryWithinFolderScope(entry, normalizedFolderPath));
  }

  return nextEntries;
}

export function getScopeTokenSuggestions({
  currentSection,
  folderPaths,
  inputValue,
  noteSections,
  sectionOptions,
  sectionScope,
}: {
  currentSection: SectionId;
  folderPaths: string[][];
  inputValue: string;
  noteSections: Array<{ label: string; value: string }>;
  sectionOptions: SectionId[];
  sectionScope: SectionId | null;
}): ScopeTokenSuggestion[] {
  const trimmedValue = inputValue.trim();

  if (trimmedValue.length === 0) {
    return [];
  }

  const sectionMatch = /^in:\s*(.+)$/i.exec(trimmedValue);
  if (sectionMatch) {
    const fragment = sectionMatch[1].trim();
    if (fragment.length < 2) {
      return [];
    }

    return sectionOptions
      .map((option) => ({ id: option, kind: "section" as const, label: getSectionLabel(option), value: option }))
      .filter((option) => matchesScopeSuggestion(option.label, fragment) || matchesScopeSuggestion(option.value, fragment))
      .slice(0, 10);
  }

  const noteSectionMatch = /^section:\s*(.+)$/i.exec(trimmedValue);
  if (noteSectionMatch) {
    const effectiveSection = sectionScope ?? currentSection;
    if (effectiveSection !== "notes") {
      return [];
    }

    const fragment = noteSectionMatch[1].trim();
    if (fragment.length < 2) {
      return [];
    }

    return noteSections
      .map((option) => ({ id: option.value, kind: "note-section" as const, label: option.label, value: option.value }))
      .filter((option) => matchesScopeSuggestion(option.label, fragment) || matchesScopeSuggestion(option.value, fragment))
      .slice(0, 10);
  }

  const folderMatch = /^folder:\s*(.+)$/i.exec(trimmedValue);
  if (!folderMatch) {
    return [];
  }

  const effectiveSection = getEffectiveFolderScopeSection(sectionScope, currentSection);
  if (!effectiveSection) {
    return [];
  }

  const fragment = folderMatch[1].trim();
  if (fragment.length < 2) {
    return [];
  }

  const seen = new Set<string>();
  return folderPaths
    .filter((path) => path.length > 0)
    .map((path) => {
      const normalizedPath = path.join("/");
      return {
        id: normalizedPath,
        kind: "folder" as const,
        label: path[path.length - 1],
        path,
        subtitle: path.length > 1 ? path.slice(0, -1).join(" / ") : null,
      };
    })
    .filter((option) => {
      if (seen.has(option.id)) {
        return false;
      }
      seen.add(option.id);
      return matchesScopeSuggestion(option.label, fragment) || matchesScopeSuggestion(option.path.join("/"), fragment);
    })
    .sort((left, right) => {
      const leftStarts = startsWithScopeSuggestion(left.label, fragment);
      const rightStarts = startsWithScopeSuggestion(right.label, fragment);
      if (leftStarts !== rightStarts) {
        return leftStarts ? -1 : 1;
      }
      return left.label.localeCompare(right.label);
    })
    .slice(0, 10);
}

function getEffectiveFolderScopeSection(sectionScope: SectionId | null, currentSection: SectionId) {
  if (sectionScope === "notes" || sectionScope === "wiki") {
    return sectionScope;
  }

  if (currentSection === "bookmarks") {
    return "wiki";
  }

  if (currentSection === "notes" || currentSection === "wiki") {
    return currentSection;
  }

  return null;
}

function getSectionLabel(section: SectionId) {
  if (section === "notes") return "Notes";
  if (section === "wiki") return "Wiki";
  if (section === "bookmarks") return "Bookmarks";
  if (section === "todo") return "TODO";
  if (section === "starred") return "Starred";
  return "Recent";
}

function matchesScopeSuggestion(value: string, fragment: string) {
  return value.toLowerCase().includes(fragment.toLowerCase());
}

function startsWithScopeSuggestion(value: string, fragment: string) {
  return value.toLowerCase().startsWith(fragment.toLowerCase());
}

function isEntryWithinFolderScope(entry: SearchEntry, normalizedFolderPath: string[]) {
  if (!entry.targetPath || entry.targetPath.length < normalizedFolderPath.length) {
    return false;
  }

  return normalizedFolderPath.every(
    (segment, index) => normalizeFolderSegment(entry.targetPath?.[index] ?? "") === segment,
  );
}

function normalizeFolderSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
