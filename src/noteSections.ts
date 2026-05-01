import type { NoteFolderNode, NoteTreeNode } from "./types";

const NOTE_SECTION_ACCENTS = ["#22c55e", "#0ea5e9", "#f97316", "#a855f7", "#ef4444", "#14b8a6"];

export type NoteSectionPreference = {
  accentColor?: string;
  title?: string;
};

export type NoteSectionPreferences = {
  hiddenRootFolderIds: string[];
  order: string[];
  overrides: Record<string, NoteSectionPreference>;
};

export const EMPTY_NOTE_SECTION_PREFERENCES: NoteSectionPreferences = {
  hiddenRootFolderIds: [],
  order: [],
  overrides: {},
};

export type NoteSectionSummary = {
  accentClass: string;
  accentColor: string;
  children: NoteTreeNode[];
  folderCount: number;
  id: string;
  noteCount: number;
  rootFolderId?: string;
  rootFolderTitle?: string;
  scopeValue: string;
  sourcePath: string;
  title: string;
};

export function buildNoteSections(tree: NoteTreeNode[], isMultiRoot = false): NoteSectionSummary[] {
  if (!isMultiRoot) {
    return buildSectionsFromTree(tree);
  }

  // Multi-root: each root folder produces its own group of sections
  const allSections: NoteSectionSummary[] = [];
  const rootFolders = tree.filter((n): n is NoteFolderNode => n.type === "folder");
  let colorIndex = 0;

  for (const rootFolder of rootFolders) {
    const rootNotes = rootFolder.children.filter((node) => node.type === "note");

    if (rootNotes.length > 0) {
      allSections.push({
        accentClass: "note-section-accent--general",
        accentColor: "#94a3b8",
        children: rootNotes,
        folderCount: 0,
        id: `${rootFolder.id}:__general__`,
        noteCount: rootNotes.length,
        rootFolderId: rootFolder.id,
        rootFolderTitle: rootFolder.title,
        scopeValue: "general",
        sourcePath: rootFolder.sourcePath ?? "",
        title: "General",
      });
    }

    const folderSections = rootFolder.children
      .filter((node): node is NoteFolderNode => node.type === "folder")
      .map((node) => {
        const section: NoteSectionSummary = {
          accentClass: `note-section-accent--${colorIndex % NOTE_SECTION_ACCENTS.length}`,
          accentColor: NOTE_SECTION_ACCENTS[colorIndex % NOTE_SECTION_ACCENTS.length],
          children: node.children,
          folderCount: countChildFolders(node.children),
          id: node.id,
          noteCount: countChildNotes(node.children),
          rootFolderId: rootFolder.id,
          rootFolderTitle: rootFolder.title,
          scopeValue: getNoteSectionScopeValue(node),
          sourcePath: node.sourcePath ?? "",
          title: node.title,
        };
        colorIndex++;
        return section;
      });

    allSections.push(...folderSections);
  }

  return allSections;
}

function buildSectionsFromTree(tree: NoteTreeNode[]): NoteSectionSummary[] {
  const rootNotes = tree.filter((node) => node.type === "note");
  const generalSection: NoteSectionSummary = {
    accentClass: "note-section-accent--general",
    accentColor: "#94a3b8",
    children: rootNotes,
    folderCount: 0,
    id: "__general__",
    noteCount: rootNotes.length,
    scopeValue: "general",
    sourcePath: "",
    title: "General",
  };

  const folderSections = tree
    .filter((node): node is NoteFolderNode => node.type === "folder")
    .map((node, index) => ({
      accentClass: `note-section-accent--${index % NOTE_SECTION_ACCENTS.length}`,
      accentColor: NOTE_SECTION_ACCENTS[index % NOTE_SECTION_ACCENTS.length],
      children: node.children,
      folderCount: countChildFolders(node.children),
      id: node.id,
      noteCount: countChildNotes(node.children),
      scopeValue: getNoteSectionScopeValue(node),
      sourcePath: node.sourcePath ?? "",
      title: node.title,
    }));

  return [generalSection, ...folderSections];
}

export function applyNoteSectionPreferences(
  sections: NoteSectionSummary[],
  preferences: NoteSectionPreferences,
) {
  const sanitizedPreferences = sanitizeNoteSectionPreferences(preferences);
  const sectionsById = new Map(sections.map((section) => [section.id, section]));
  const orderedSections: NoteSectionSummary[] = [];
  const seenIds = new Set<string>();

  for (const sectionId of sanitizedPreferences.order) {
    const section = sectionsById.get(sectionId);
    if (!section) {
      continue;
    }

    orderedSections.push(section);
    seenIds.add(sectionId);
  }

  for (const section of sections) {
    if (!seenIds.has(section.id)) {
      orderedSections.push(section);
    }
  }

  return orderedSections.map((section) => {
    const override = sanitizedPreferences.overrides[section.id];
    if (!override) {
      return section;
    }

    return {
      ...section,
      accentColor: override.accentColor ?? section.accentColor,
      title: override.title ?? section.title,
    };
  });
}

export function sanitizeNoteSectionPreferences(value: unknown): NoteSectionPreferences {
  if (!value || typeof value !== "object") {
    return EMPTY_NOTE_SECTION_PREFERENCES;
  }

  const rawPreferences = value as Partial<NoteSectionPreferences> & { overrides?: Record<string, unknown> };
  const hiddenRootFolderIds = Array.isArray(rawPreferences.hiddenRootFolderIds)
    ? rawPreferences.hiddenRootFolderIds.filter(
        (rootFolderId): rootFolderId is string => typeof rootFolderId === "string" && rootFolderId.trim().length > 0,
      )
    : [];
  const order = Array.isArray(rawPreferences.order)
    ? rawPreferences.order.filter((sectionId): sectionId is string => typeof sectionId === "string" && sectionId.trim().length > 0)
    : [];
  const overrides: Record<string, NoteSectionPreference> = {};

  if (rawPreferences.overrides && typeof rawPreferences.overrides === "object") {
    for (const [sectionId, rawOverride] of Object.entries(rawPreferences.overrides)) {
      if (!sectionId || !rawOverride || typeof rawOverride !== "object") {
        continue;
      }

      const title = typeof (rawOverride as { title?: unknown }).title === "string"
        ? (rawOverride as { title: string }).title.trim()
        : "";
      const accentColor = normalizeAccentColor(
        typeof (rawOverride as { accentColor?: unknown }).accentColor === "string"
          ? (rawOverride as { accentColor: string }).accentColor
          : undefined,
      );

      if (!title && !accentColor) {
        continue;
      }

      overrides[sectionId] = {
        ...(title ? { title } : {}),
        ...(accentColor ? { accentColor } : {}),
      };
    }
  }

  return {
    hiddenRootFolderIds,
    order,
    overrides,
  };
}

export function findNoteSectionById(sections: NoteSectionSummary[], sectionId: string | null) {
  if (!sectionId) {
    return null;
  }

  return sections.find((section) => section.id === sectionId) ?? null;
}

export function findNoteSectionByScope(sections: NoteSectionSummary[], scopeValue: string | null) {
  if (!scopeValue) {
    return null;
  }

  const normalizedScopeValue = normalizeSectionScopeValue(scopeValue);
  return sections.find((section) => normalizeSectionScopeValue(section.scopeValue) === normalizedScopeValue) ?? null;
}

function countChildFolders(tree: NoteTreeNode[]): number {
  return tree.reduce((count, node) => {
    if (node.type === "folder") {
      return count + 1 + countChildFolders(node.children);
    }

    return count;
  }, 0);
}

function countChildNotes(tree: NoteTreeNode[]): number {
  return tree.reduce((count, node) => {
    if (node.type === "note") {
      return count + 1;
    }

    return count + countChildNotes(node.children);
  }, 0);
}

function getNoteSectionScopeValue(node: NoteFolderNode) {
  const sourcePathSegment = node.sourcePath?.split("/").filter(Boolean)[0];
  if (sourcePathSegment) {
    return sourcePathSegment;
  }

  return normalizeSectionScopeValue(node.title);
}

function normalizeSectionScopeValue(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeAccentColor(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim();
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(normalized) ? normalized.toLowerCase() : undefined;
}