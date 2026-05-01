import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { NoteVersion, AppPrefs } from "./appTypes";
import { snapshotNoteVersion } from "./noteVersionHistory";
import { getNoteSourceFileName, formatNoteTargetLocation, formatNoteTimestamp, countNotesInTree } from "./noteFormatting";
import {
  BookmarkDialog,
  CommandPalette,
  ConfirmDialog,
  TagBrowserDialog,
  VersionHistoryDialog,
  BrokenLinksDialog,
  ExportImportDialog,
  PreferencesDialog,
  NoteCreationDialog,
  KeyboardShortcutsDialog,
  TaskTemplateDialog,
  TriagePanel,
  QuickCaptureDialog,
  NOTE_TEMPLATES,
} from "./components/Dialogs";
import { NoteFolderOverviewPanel, NoteListCard, RecentDocumentCard, TrashPanel, DailyNoteNavigator, GraphView, WorkspaceSwitcher } from "./components/NoteComponents";
import { TodoWorkspace } from "./components/TodoComponents";
import { MarkdownContent, MarkdownEditor, WikiUnfurlCard } from "./components/MarkdownComponents";
import { BookmarkTreeNode, BookmarkMenuBar } from "./components/BookmarkComponents";
import { getClientPlatform, getFolderPathPlaceholder, shouldUseManualFolderPaths } from "./clientPlatform";
import { getImmersiveChromeState } from "./immersiveLayout";
import { parseNetscapeBookmarkHtml } from "./netscapeBookmarks";
import { type NavigationSnapshot } from "./navigationHistory";
import { canEditNote } from "./noteEditing";
import { filterEmptyFolderNodes, filterEmptyNoteSections } from "./noteVisibility";
import {
  applyNoteSectionPreferences,
  buildNoteSections,
  EMPTY_NOTE_SECTION_PREFERENCES,
  findNoteSectionById,
  findNoteSectionByScope,
  sanitizeNoteSectionPreferences,
  type NoteSectionPreferences,
} from "./noteSections";
import {
  getRecentActivityTimestamp,
  getRecentPrimaryActivity,
  mergeRecentDocuments,
  toRecentDocumentPayload,
  togglePinnedRecentDocument,
} from "./recentDocuments";
import { resolveSelectedNoteNodeId } from "./noteSelection";
import {
  composeScopedSearchQuery,
  consumeScopedSearchInputWithCurrentScopes,
  consumeScopedSearchInputWithDefaultSection,
  getScopeTokenSuggestions,
} from "./searchScope";
import { buildWorkspaceBackupSnapshot, getWorkspaceBackupSnapshotFingerprint } from "./restorePoints";
import { buildSearchIndex, buildSearchEntries } from "./searchIndex";
import { createSyncEntryId, enqueueSyncEntry, loadSyncQueue, removeSyncEntry } from "./syncQueue";
import type {
  BookmarkDialogState,
  BookmarkFolder,
  BookmarkItem,
  BookmarkLeaf,
  BookmarkNode,
  DocsRenameResponse,
  DocsUploadResponse,
  ImportResponse,
  NavItem,
  Note,
  NoteCreationDialogState,
  NoteFolderNode,
  NoteLeafNode,
  NoteTreeNode,
  NoteUploadTarget,
  QuickCaptureState,
  RecentDocumentEntry,
  RecentDocumentSeed,
  RestorePointSummary,
  SavedSearch,
  SearchEntry,
  SectionId,
  SidebarOrderResponse,
  SmartFolder,
  TodoItem,
  TodoPayload,
  TodoStatus,
  TrashEntry,
  UnfurlResponse,
  ViewerContent,
  WorkspaceInfo,
  WorkspaceBackupSnapshot,
} from "./types";
import { useBookmarksData } from "./useBookmarksData";
import { useExpandedNoteFolders } from "./useExpandedNoteFolders";
import { useNavigationHistoryState } from "./useNavigationHistoryState";
import { useNotesData } from "./useNotesData";
import { useRecentDocumentsState } from "./useRecentDocumentsState";
import {
  buildTodoPayload,
  createDefaultTodoItem,
  getDueTodoReminders,
  getTodoRecentPreview,
  normalizeTodoItems,
  removeTodoItems,
  reorderTodoItems,
  spawnNextRecurrence,
  updateTodoItems,
} from "./todoState";
import { useTodoData } from "./useTodoData";
import {
  Bell,
  Bookmark,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Command,
  Columns3,
  Download,
  FileCode2,
  FilePlus2,
  Filter,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderTree,
  GripVertical,
  Keyboard,
  LayoutList,
  Link2,
  ListTree,
  Maximize2,
  ExternalLink,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Minus,
  Plus,
  Search,
  Star,
  Tag,
  TimerReset,
  Trash2,
  TriangleAlert,
  X,
  PanelRightClose,
  Settings,
} from "lucide-react";

const defaultNavOrder: SectionId[] = ["notes", "bookmarks", "todo", "starred", "recent"];
const sidebarApiBase = "";
const ROOT_NOTE_NODE_ID = "__root__";
const TODO_COLOR_DEFAULT = "#78e6c6";
const STORED_ACTIVE_SECTION_KEY = "organizer:active-section";
const STORED_MARKDOWN_EDITOR_PREVIEW_VISIBILITY_KEY = "organizer:markdown-editor-preview-visible";
const STORED_MARKDOWN_EDITOR_PREVIEW_LAYOUT_KEY = "organizer:markdown-editor-preview-layout";
const STORED_SELECTED_NOTES_NODE_KEY = "organizer:selected-notes-node";
const STORED_SELECTED_BOOKMARK_KEY = "organizer:selected-bookmark";
const STORED_RECENT_DOCUMENTS_SORT_MODE_KEY = "organizer:recent-documents-sort-mode";
const STORED_SAVED_SEARCHES_KEY = "organizer:saved-searches";
const STORED_PINNED_NOTES_KEY = "organizer:pinned-notes";
const STORED_SYNC_INTERVAL_KEY = "organizer:sync-interval";
const STORED_PREFS_KEY = "organizer:preferences";
const STORED_NOTES_NAVIGATION_MODE_KEY = "organizer:notes-navigation-mode";
const STORED_NOTE_SECTION_PREFERENCES_KEY = "organizer:note-section-preferences";
const STORED_TODO_LIST_SPLIT_MODE_KEY = "organizer:todo-list-split-mode";
const STORED_SIDEBAR_COLLAPSED_KEY = "organizer:sidebar-collapsed";
const STORED_BOOKMARK_RENDER_MODE_KEY = "organizer:bookmark-render-mode";
const STORED_BOOKMARK_COMPACT_MODE_KEY = "organizer:bookmark-compact-mode";
const STORED_BOOKMARK_EXPANDED_FOLDERS_KEY = "organizer:bookmark-expanded-folders";

const SYNC_INTERVAL_OPTIONS: { label: string; value: number }[] = [
  { label: "Off", value: 0 },
  { label: "30s", value: 30 },
  { label: "1 min", value: 60 },
  { label: "5 min", value: 300 },
];

type RecentDocumentsSortMode = "recent" | "views";

type LegacyExportPack = {
  version: 1;
  exportedAt: number;
  bookmarks: BookmarkNode[];
  savedSearches: SavedSearch[];
  noteMetadata: { sourcePath: string; title: string; tags: string[] }[];
};

type ExportPack =
  | {
      version: 1;
      kind: "workspace";
      exportedAt: number;
      snapshot: WorkspaceBackupSnapshot;
    }
  | {
      version: 1;
      kind: "notes";
      exportedAt: number;
      notes: WorkspaceBackupSnapshot["notes"];
      starredNotePaths: string[];
    }
  | {
      version: 1;
      kind: "bookmarks";
      exportedAt: number;
      bookmarks: BookmarkNode[];
    }
  | {
      version: 1;
      kind: "todo";
      exportedAt: number;
      todo: TodoPayload;
    }
  | {
      version: 1;
      kind: "recents";
      exportedAt: number;
      recentDocuments: RecentDocumentEntry[];
    }
  | {
      version: 1;
      kind: "smart-views";
      exportedAt: number;
      savedSearches: SavedSearch[];
    }
  | {
      version: 1;
      kind: "preferences";
      exportedAt: number;
      prefs: AppPrefs;
      pinnedNoteIds: string[];
      sidebarOrder: SectionId[];
    };
function getStoredMarkdownEditorPreviewVisibility() {
  if (typeof window === "undefined") {
    return true;
  }

  return window.localStorage.getItem(STORED_MARKDOWN_EDITOR_PREVIEW_VISIBILITY_KEY) !== "false";
}

function getStoredMarkdownEditorPreviewLayout(): "below" | "side-by-side" {
  if (typeof window === "undefined") {
    return "below";
  }

  return window.localStorage.getItem(STORED_MARKDOWN_EDITOR_PREVIEW_LAYOUT_KEY) === "side-by-side"
    ? "side-by-side"
    : "below";
}

function isStoredSectionId(value: string): value is SectionId {
  return value === "notes" || value === "wiki" || value === "bookmarks" || value === "todo" || value === "starred" || value === "recent";
}

function getStoredActiveSection(): SectionId {
  if (typeof window === "undefined") {
    return "notes";
  }

  const stored = window.localStorage.getItem(STORED_ACTIVE_SECTION_KEY);
  return stored && isStoredSectionId(stored) ? normalizeVisibleSection(stored) : "notes";
}

function getStoredSelectedNotesNodeId() {
  if (typeof window === "undefined") {
    return ROOT_NOTE_NODE_ID;
  }

  return window.localStorage.getItem(STORED_SELECTED_NOTES_NODE_KEY) ?? ROOT_NOTE_NODE_ID;
}

function getStoredSelectedBookmarkId() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(STORED_SELECTED_BOOKMARK_KEY) || null;
}

function getStoredRecentDocumentsSortMode(): RecentDocumentsSortMode {
  if (typeof window === "undefined") {
    return "recent";
  }

  return window.localStorage.getItem(STORED_RECENT_DOCUMENTS_SORT_MODE_KEY) === "views" ? "views" : "recent";
}

function getStoredNotesNavigationMode(): "folder" | "section" {
  if (typeof window === "undefined") {
    return "folder";
  }

  return window.localStorage.getItem(STORED_NOTES_NAVIGATION_MODE_KEY) === "folder" ? "folder" : "section";
}

function getStoredTodoListSplitMode(): "side-by-side" | "stacked" {
  if (typeof window === "undefined") {
    return "side-by-side";
  }

  return window.localStorage.getItem(STORED_TODO_LIST_SPLIT_MODE_KEY) === "stacked" ? "stacked" : "side-by-side";
}

function getStoredSidebarCollapsed() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(STORED_SIDEBAR_COLLAPSED_KEY) === "true";
}

function getStoredBookmarkRenderMode(): "tree" | "menu" {
  if (typeof window === "undefined") {
    return "menu";
  }

  return window.localStorage.getItem(STORED_BOOKMARK_RENDER_MODE_KEY) === "tree" ? "tree" : "menu";
}

function getStoredBookmarkCompactMode() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(STORED_BOOKMARK_COMPACT_MODE_KEY) === "true";
}

function getStoredBookmarkExpandedFolderIds() {
  if (typeof window === "undefined") {
    return new Set<string>();
  }

  try {
    const raw = window.localStorage.getItem(STORED_BOOKMARK_EXPANDED_FOLDERS_KEY);
    if (!raw) {
      return new Set<string>();
    }

    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((folderId): folderId is string => typeof folderId === "string" && folderId.trim().length > 0) : []);
  } catch {
    return new Set<string>();
  }
}

function getStoredNoteSectionPreferences(): NoteSectionPreferences {
  if (typeof window === "undefined") {
    return EMPTY_NOTE_SECTION_PREFERENCES;
  }

  try {
    const raw = window.localStorage.getItem(STORED_NOTE_SECTION_PREFERENCES_KEY);
    if (!raw) {
      return EMPTY_NOTE_SECTION_PREFERENCES;
    }

    return sanitizeNoteSectionPreferences(JSON.parse(raw));
  } catch {
    return EMPTY_NOTE_SECTION_PREFERENCES;
  }
}

function getStoredSavedSearches(): SavedSearch[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(STORED_SAVED_SEARCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buildBacklinks(allNotes: Note[], targetNote: Note): Note[] {
  const targetTitle = targetNote.title.toLowerCase();
  const targetFileName = targetNote.sourcePath
    ? targetNote.sourcePath.split("/").pop()?.replace(/\.md$/i, "").toLowerCase() ?? ""
    : "";

  return allNotes.filter((note) => {
    if (note.id === targetNote.id) return false;
    const content = note.content.toLowerCase();
    if (targetTitle && content.includes(`[[${targetTitle}]]`)) return true;
    if (targetFileName && content.includes(`[[${targetFileName}]]`)) return true;
    const sourceFile = targetNote.sourcePath ? targetNote.sourcePath.split("/").pop() ?? "" : "";
    if (sourceFile && content.includes(sourceFile.toLowerCase())) return true;
    return false;
  });
}

function buildBrokenLinks(allNotes: Note[]): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const sourcePathSet = new Set(allNotes.map((n) => n.sourcePath).filter(Boolean) as string[]);

  for (const note of allNotes) {
    if (!note.sourcePath) continue;
    const broken: string[] = [];
    const mdLinkPattern = /(!?)\[([^\]]*)\]\(([^)]+)\)/g;
    let match: RegExpExecArray | null;
    while ((match = mdLinkPattern.exec(note.content)) !== null) {
      const isImage = match[1] === "!";
      const href = match[3];
      if (isImage) continue; // images are assets, not note links
      if (!href || href.startsWith("http") || href.startsWith("#") || href.startsWith("mailto:")) continue;
      // Resolve relative to note's directory
      const noteDir = note.sourcePath.split("/").slice(0, -1).join("/");
      const resolved = href.startsWith("/")
        ? href.replace(/^\//, "")
        : noteDir ? `${noteDir}/${href}`.replace(/\/\.\//g, "/") : href;
      const cleanResolved = resolved.replace(/^data\/docs\//, "");
      const matchedPath = [...sourcePathSet].find(
        (sp) =>
          sp === resolved ||
          sp === cleanResolved ||
          sp.endsWith(`/${href.replace(/^\.\//, "")}`) ||
          sp === href.replace(/^\.\//, ""),
      );
      if (!matchedPath) {
        broken.push(match[0]);
      }
    }
    if (broken.length > 0) {
      result.set(note.sourcePath, broken);
    }
  }
  return result;
}
function getStoredPrefs(): AppPrefs {
  try {
    const raw = window.localStorage.getItem(STORED_PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppPrefs>;
      const feedsMode = parsed.feedsMode;
      return {
        feedsMode: feedsMode === "panel" ? "panel" : feedsMode === "popup" ? "popup" : "own-view",
        showBacklinks: parsed.showBacklinks !== false,
        showEmptyFoldersAndSections: parsed.showEmptyFoldersAndSections === true,
        showCollapsedSearchCard: parsed.showCollapsedSearchCard !== false,
        searchInterface: parsed.searchInterface === "palette" ? "palette" : "topbar",
      };
    }
  } catch { /* ignore */ }
  return {
    feedsMode: "own-view",
    showBacklinks: true,
    showEmptyFoldersAndSections: false,
    showCollapsedSearchCard: true,
    searchInterface: "topbar",
  };
}

function getStoredPinnedNotes(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORED_PINNED_NOTES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getStoredSyncInterval(): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(STORED_SYNC_INTERVAL_KEY);
  const n = Number(raw);
  return [0, 30, 60, 300].includes(n) ? n : 0;
}

function getAllTags(allNotes: Note[], bookmarks: BookmarkItem[], todoItems: TodoItem[]): { tag: string; count: number }[] {
  const tagCounts = new Map<string, number>();
  for (const note of allNotes) {
    for (const tag of note.tags ?? []) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  for (const bookmark of bookmarks) {
    for (const tag of bookmark.tags ?? []) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  for (const todo of todoItems) {
    for (const tag of todo.tags ?? []) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  return [...tagCounts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

function App() {
  const platform = getClientPlatform();
  const shouldUseManualPaths = shouldUseManualFolderPaths();
  const folderPathPlaceholder = getFolderPathPlaceholder();
  const commandPaletteShortcutTitle = platform === "mac"
    ? "Command palette (⌘K / ⌘⇧P)"
    : "Command palette (Ctrl+K / Ctrl+Shift+P)";
  const searchShortcutTitle = platform === "mac"
    ? "Search (⌘F)"
    : "Search (Ctrl+F)";
  const keyboardShortcutsTitle = platform === "mac"
    ? "Keyboard shortcuts (⌘/)"
    : "Keyboard shortcuts (Ctrl+/)";
  const [section, setSection] = useState<SectionId>(getStoredActiveSection());
  const [searchText, setSearchText] = useState("");
  const [searchScope, setSearchScope] = useState<SectionId | null>(null);
  const [searchNoteSectionScope, setSearchNoteSectionScope] = useState<string | null>(null);
  const [searchFolderScopePath, setSearchFolderScopePath] = useState<string[]>([]);
  const [navOrder, setNavOrder] = useState<SectionId[]>(defaultNavOrder);
  const [draggedSection, setDraggedSection] = useState<SectionId | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: SectionId; position: "before" | "after" } | null>(null);
  const [selectedBookmarkId, setSelectedBookmarkId] = useState<string | null>(getStoredSelectedBookmarkId());
  const [draggedBookmarkId, setDraggedBookmarkId] = useState<string | null>(null);
  const [draggedNoteSourcePath, setDraggedNoteSourcePath] = useState<string | null>(null);
  const draggedNoteSourcePathRef = useRef<string | null>(null);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(getStoredBookmarkExpandedFolderIds);
  const [bookmarkRenderMode, setBookmarkRenderMode] = useState<"tree" | "menu">(getStoredBookmarkRenderMode());
  const [bookmarkCompactMode, setBookmarkCompactMode] = useState(getStoredBookmarkCompactMode());
  const [notesNavigationMode, setNotesNavigationMode] = useState<"folder" | "section">(getStoredNotesNavigationMode());
  const [noteSectionPreferences, setNoteSectionPreferences] = useState<NoteSectionPreferences>(getStoredNoteSectionPreferences());
  const [openMenuPath, setOpenMenuPath] = useState<string[]>([]);
  const [selectedNoteNodeId, setSelectedNoteNodeId] = useState<string | null>(getStoredSelectedNotesNodeId());
  const [wikiUnfurl, setWikiUnfurl] = useState<UnfurlResponse | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(getStoredSidebarCollapsed());
  const [isSearchPanelOpen, setIsSearchPanelOpen] = useState(false);
  const [isSearchPopupDismissed, setIsSearchPopupDismissed] = useState(false);
  const [isSearchScopePopupDismissed, setIsSearchScopePopupDismissed] = useState(false);
  const [activeSearchScopeSuggestionIndex, setActiveSearchScopeSuggestionIndex] = useState(0);
  const [isNoteEditing, setIsNoteEditing] = useState(false);
  const [trashConfirmNote, setTrashConfirmNote] = useState<Note | null>(null);
  const [pendingCreatedNoteSourcePath, setPendingCreatedNoteSourcePath] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [immersiveZoomPercent, setImmersiveZoomPercent] = useState(100);
  const [editorSplitPercent, setEditorSplitPercent] = useState(50);
  const [showMarkdownEditorPreview, setShowMarkdownEditorPreview] = useState(getStoredMarkdownEditorPreviewVisibility());
  const [markdownEditorPreviewLayout, setMarkdownEditorPreviewLayout] = useState(getStoredMarkdownEditorPreviewLayout());
  const [forceImmersive, setForceImmersive] = useState(false);
  const [pendingEditorScrollRatio, setPendingEditorScrollRatio] = useState(0);
  const [noteSaveState, setNoteSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [noteSaveError, setNoteSaveError] = useState<string | null>(null);
  const [bookmarkDialog, setBookmarkDialog] = useState<BookmarkDialogState>({ kind: "closed" });
  const [noteCreationDialog, setNoteCreationDialog] = useState<NoteCreationDialogState>({ kind: "closed" });
  const [pendingRecentDocuments, setPendingRecentDocuments] = useState<RecentDocumentEntry[] | null>(null);
  const [recentDocumentsSortMode, setRecentDocumentsSortMode] =
    useState<RecentDocumentsSortMode>(getStoredRecentDocumentsSortMode());
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [commandPaletteQuery, setCommandPaletteQuery] = useState("");
  const [isSearchDialogOpen, setIsSearchDialogOpen] = useState(false);
  const [showTriagePanel, setShowTriagePanel] = useState(false);
  const [isKeyboardShortcutsOpen, setIsKeyboardShortcutsOpen] = useState(false);
  const [showTaskTemplateDialog, setShowTaskTemplateDialog] = useState(false);
  const [pendingNoteTemplate, setPendingNoteTemplate] = useState<string | null>(null);
  const [isQuickCaptureOpen, setIsQuickCaptureOpen] = useState(false);
  const [quickCaptureState, setQuickCaptureState] = useState<QuickCaptureState>({
    tab: "task", title: "", url: "", description: "", listName: "", noteTemplate: "", toInbox: true,
  });
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>(getStoredSavedSearches);
  const [isTagBrowserOpen, setIsTagBrowserOpen] = useState(false);
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);
  const [versionHistoryNote, setVersionHistoryNote] = useState<Note | null>(null);
  const [isBrokenLinksOpen, setIsBrokenLinksOpen] = useState(false);
  const [isExportImportOpen, setIsExportImportOpen] = useState(false);
  const [restorePoints, setRestorePoints] = useState<RestorePointSummary[]>([]);
  const [isLoadingRestorePoints, setIsLoadingRestorePoints] = useState(false);
  const [isRestoringRestorePoint, setIsRestoringRestorePoint] = useState(false);
  const [isPrefsOpen, setIsPrefsOpen] = useState(false);
  const [prefs, setPrefs] = useState<AppPrefs>(getStoredPrefs);
  const [isStarredPanelOpen, setIsStarredPanelOpen] = useState(false);
  const [isRecentPanelOpen, setIsRecentPanelOpen] = useState(false);
  const [openFeedPopup, setOpenFeedPopup] = useState<"starred" | "recent" | null>(null);
  const [pinnedNoteIds, setPinnedNoteIds] = useState<string[]>(getStoredPinnedNotes);
  const [syncInterval, setSyncInterval] = useState<number>(getStoredSyncInterval);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== "undefined" ? navigator.onLine : true));
  const [pendingSyncCount, setPendingSyncCount] = useState(() => loadSyncQueue().length);
  const [lastSyncConflictCount, setLastSyncConflictCount] = useState(0);
  const [syncErrorMessage, setSyncErrorMessage] = useState<string | null>(null);
  const [docsSourceInput, setDocsSourceInput] = useState("");
  const [docsSourceError, setDocsSourceError] = useState<string | null>(null);
  const [docsSourceSubmitting, setDocsSourceSubmitting] = useState(false);
  const [trashEntries, setTrashEntries] = useState<TrashEntry[]>([]);
  const [showTrashPanel, setShowTrashPanel] = useState(false);
  const [showGraphView, setShowGraphView] = useState(false);
  const [showDailyNotes, setShowDailyNotes] = useState(false);
  const [dailyNoteDate, setDailyNoteDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [smartFolders] = useState<SmartFolder[]>(() => {
    try { return JSON.parse(localStorage.getItem("smartFolders") || "[]"); } catch { return []; }
  });
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
  const [showWorkspaceSwitcher, setShowWorkspaceSwitcher] = useState(false);
  const [reminderNotifications, setReminderNotifications] = useState<TodoItem[]>([]);
  const isSyncingRef = useRef(false);
  const lastRestorePointFingerprintRef = useRef("");
  const refreshPendingSyncCount = useCallback(() => setPendingSyncCount(loadSyncQueue().length), []);
  const loadSidebarOrder = useCallback(async () => {
    try {
      const response = await fetch(`${sidebarApiBase}/api/sidebar-order`);
      if (!response.ok) {
        throw new Error("Failed to load sidebar order");
      }
      const data = (await response.json()) as SidebarOrderResponse;
      if (Array.isArray(data.order)) {
        setNavOrder(normalizeNavOrder(data.order));
      }
    } catch {
      // Keep local nav order when API is unavailable.
    }
  }, []);

  const loadRecentDocuments = useCallback(async () => {
    try {
      const response = await fetch(`${sidebarApiBase}/api/recent-documents`);
      if (!response.ok) {
        throw new Error("Failed to load recent documents");
      }

      const data = (await response.json()) as { entries?: RecentDocumentEntry[] };
      setPendingRecentDocuments(Array.isArray(data.entries) ? data.entries : []);
    } catch {
      // Ignore recent history load failures and keep local state empty.
      setPendingRecentDocuments([]);
    } finally {
      // Hydration completion is handled when pending recents are applied.
    }
  }, []);

  const loadRestorePoints = useCallback(async () => {
    setIsLoadingRestorePoints(true);

    try {
      const response = await fetch(`${sidebarApiBase}/api/restore-points`);
      if (!response.ok) {
        throw new Error("Failed to load restore points");
      }

      const data = (await response.json()) as { entries?: RestorePointSummary[] };
      setRestorePoints(Array.isArray(data.entries) ? data.entries : []);
    } catch {
      setRestorePoints([]);
    } finally {
      setIsLoadingRestorePoints(false);
    }
  }, [sidebarApiBase]);

  const bookmarkImportInputRef = useRef<HTMLInputElement>(null);
  const noteUploadInputRef = useRef<HTMLInputElement>(null);
  const topbarSearchInputRef = useRef<HTMLInputElement>(null);
  const searchDialogInputRef = useRef<HTMLInputElement>(null);
  const [todoListSplitMode, setTodoListSplitMode] = useState<"side-by-side" | "stacked">(getStoredTodoListSplitMode);
  const [requestedTodoEditorId, setRequestedTodoEditorId] = useState<string | null>(null);
  const menuBarRef = useRef<HTMLDivElement>(null);
  const viewerContentRef = useRef<HTMLDivElement>(null);
  const searchbarRef = useRef<HTMLLabelElement>(null);
  const {
    notesTree,
    notes,
    hasLoadedNotes,
    docsFolder,
    isMultiRoot,
    setNotesStatus,
    loadNotes,
    createNoteDocument,
    createNoteFolder,
    toggleNoteStar,
    saveNoteContent,
  } = useNotesData({
    apiBase: sidebarApiBase,
    rootNodeId: ROOT_NOTE_NODE_ID,
    currentSelectedNoteNodeId: selectedNoteNodeId,
    onSelectedNoteNodeIdChange: setSelectedNoteNodeId,
    onSyncQueueChange: setPendingSyncCount,
  });
  const {
    bookmarkTree,
    bookmarks,
    hasLoadedBookmarks,
    setBookmarkStatus,
    loadBookmarks,
    persistBookmarkTree: persistBookmarkTreeState,
  } = useBookmarksData({
    apiBase: sidebarApiBase,
    onSelectedBookmarkIdChange: setSelectedBookmarkId,
    onSyncQueueChange: setPendingSyncCount,
  });
  const persistBookmarkTree = useCallback(
    (nextTree: BookmarkNode[], statusMessage?: string) =>
      persistBookmarkTreeState(nextTree, flattenLocalTree(nextTree), statusMessage),
    [persistBookmarkTreeState],
  );
  const {
    todoItems,
    todoViewMode,
    selectedTodoId,
    todoStoragePath,
    setSelectedTodoId,
    loadTodoItems,
    persistTodoItems,
    setTodoViewMode,
  } = useTodoData({
    apiBase: sidebarApiBase,
    onSyncQueueChange: setPendingSyncCount,
  });

  useEffect(() => {
    window.localStorage.setItem(STORED_TODO_LIST_SPLIT_MODE_KEY, todoListSplitMode);
  }, [todoListSplitMode]);

  const wikiData = useMemo(() => buildGeneratedWikiFromBookmarks(bookmarks), [bookmarks]);
  const wikiPages = wikiData.notes;
  const wikiTree = wikiData.tree;
  const rawResolvedNotesTree = useMemo(
    () => (notesTree.length > 0 || notes.length === 0 ? notesTree : buildPersistedNoteTree(notes)),
    [notes, notesTree],
  );
  const hiddenRootFolderIds = useMemo(() => new Set(noteSectionPreferences.hiddenRootFolderIds), [noteSectionPreferences.hiddenRootFolderIds]);
  const hiddenRootFolderIdByTitle = useMemo(() => buildRootFolderIdByTitleMap(rawResolvedNotesTree), [rawResolvedNotesTree]);
  const filteredNotes = useMemo(
    () => filterNotesByHiddenRootFolderIds(notes, hiddenRootFolderIds, hiddenRootFolderIdByTitle),
    [hiddenRootFolderIdByTitle, hiddenRootFolderIds, notes],
  );
  const resolvedNotesTree = useMemo(
    () => filterNoteTreeByHiddenRootFolderIds(rawResolvedNotesTree, hiddenRootFolderIds),
    [hiddenRootFolderIds, rawResolvedNotesTree],
  );
  const allNotes = [...filteredNotes, ...wikiPages];
  const derivedNoteSections = useMemo(
    () => buildNoteSections(resolvedNotesTree, isMultiRoot),
    [resolvedNotesTree, isMultiRoot],
  );
  const noteSections = useMemo(
    () => {
      if (notesNavigationMode !== "section") {
        return [];
      }

      const sections = applyNoteSectionPreferences(derivedNoteSections, noteSectionPreferences);
      return prefs.showEmptyFoldersAndSections ? sections : filterEmptyNoteSections(sections);
    },
    [derivedNoteSections, noteSectionPreferences, notesNavigationMode, prefs.showEmptyFoldersAndSections],
  );
  const hasRootLevelNotes = useMemo(
    () => resolvedNotesTree.some((node) => node.type === "note"),
    [resolvedNotesTree],
  );
  const activeNoteTree = section === "notes" ? resolvedNotesTree : section === "wiki" || section === "bookmarks" ? wikiTree : [];
  const availableNoteFolderIds = useMemo(
    () => collectNoteFolderIds([...resolvedNotesTree, ...wikiTree]),
    [resolvedNotesTree, wikiTree],
  );
  const { expandedFolderIds: expandedNoteFolderIds, toggleFolder: toggleNoteFolder, expandFolders: expandNoteFolders } =
    useExpandedNoteFolders(availableNoteFolderIds);
  const query = useMemo(
    () => composeScopedSearchQuery(searchScope, searchNoteSectionScope, searchFolderScopePath, searchText),
    [searchFolderScopePath, searchNoteSectionScope, searchScope, searchText],
  );
  const scopedSuggestionTree = useMemo(() => {
    if (searchScope === "wiki") {
      return wikiTree;
    }

    if (searchScope === "notes") {
      return findNoteSectionByScope(noteSections, searchNoteSectionScope)?.children ?? resolvedNotesTree;
    }

    if (section === "wiki" || section === "bookmarks") {
      return wikiTree;
    }

    if (section === "notes" && searchNoteSectionScope) {
      return findNoteSectionByScope(noteSections, searchNoteSectionScope)?.children ?? resolvedNotesTree;
    }

    return resolvedNotesTree;
  }, [noteSections, resolvedNotesTree, searchNoteSectionScope, searchScope, section, wikiTree]);
  const scopeSuggestionFolderPaths = useMemo(() => {
    return collectFolderSuggestionPaths(scopedSuggestionTree);
  }, [scopedSuggestionTree]);
  const searchScopeSuggestions = useMemo(
    () =>
      getScopeTokenSuggestions({
        currentSection: section,
        folderPaths: scopeSuggestionFolderPaths,
        inputValue: searchText,
        noteSections: noteSections.map((noteSection) => ({ label: noteSection.title, value: noteSection.scopeValue })),
        sectionOptions: navOrder,
        sectionScope: searchScope,
      }),
    [navOrder, noteSections, scopeSuggestionFolderPaths, searchScope, searchText, section],
  );
  const isSearchScopePopupOpen = searchScopeSuggestions.length > 0 && !isSearchScopePopupDismissed;
  const hasActiveSearch = Boolean(searchScope || searchNoteSectionScope || searchFolderScopePath.length > 0 || searchText.trim());
  const isDocumentSuggestionPopupOpen =
    !isSearchScopePopupOpen && !isSearchPanelOpen && !isSearchDialogOpen && hasActiveSearch && !isSearchPopupDismissed;

  useEffect(() => {
    if (!isSearchDialogOpen) return;
    searchDialogInputRef.current?.focus();
    searchDialogInputRef.current?.select();
  }, [isSearchDialogOpen]);

  useEffect(() => {
    if (prefs.searchInterface === "topbar") {
      setIsSearchDialogOpen(false);
    }
  }, [prefs.searchInterface]);

  useEffect(() => {
    if (!isSearchScopePopupOpen && !isDocumentSuggestionPopupOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (searchbarRef.current && !searchbarRef.current.contains(event.target as Node)) {
        if (isSearchScopePopupOpen) setIsSearchScopePopupDismissed(true);
        if (isDocumentSuggestionPopupOpen) setIsSearchPopupDismissed(true);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isSearchScopePopupOpen, isDocumentSuggestionPopupOpen]);
  const {
    history: navigationHistory,
    commitSnapshot: commitNavigationSnapshot,
    traverseHistory,
  } = useNavigationHistoryState({
    section: "notes",
    selectedNoteNodeId: ROOT_NOTE_NODE_ID,
    selectedBookmarkId: null,
    selectedTodoId: null,
  });

  useEffect(() => {
    window.localStorage.setItem(STORED_MARKDOWN_EDITOR_PREVIEW_VISIBILITY_KEY, String(showMarkdownEditorPreview));
  }, [showMarkdownEditorPreview]);

  useEffect(() => {
    window.localStorage.setItem(STORED_ACTIVE_SECTION_KEY, section);
  }, [section]);

  useEffect(() => {
    window.localStorage.setItem(STORED_MARKDOWN_EDITOR_PREVIEW_LAYOUT_KEY, markdownEditorPreviewLayout);
  }, [markdownEditorPreviewLayout]);

  useEffect(() => {
    if (section !== "notes") {
      return;
    }

    window.localStorage.setItem(STORED_SELECTED_NOTES_NODE_KEY, selectedNoteNodeId ?? ROOT_NOTE_NODE_ID);
  }, [section, selectedNoteNodeId]);

  useEffect(() => {
    if (section !== "bookmarks") {
      return;
    }

    if (selectedBookmarkId) {
      window.localStorage.setItem(STORED_SELECTED_BOOKMARK_KEY, selectedBookmarkId);
      return;
    }

    window.localStorage.removeItem(STORED_SELECTED_BOOKMARK_KEY);
  }, [section, selectedBookmarkId]);

  useEffect(() => {
    if (
      section !== "notes" ||
      selectedNoteNodeId !== ROOT_NOTE_NODE_ID ||
      hasRootLevelNotes ||
      noteSections.length === 0 ||
      notes.length === 0
    ) {
      return;
    }

    setSelectedNoteNodeId(findNoteSectionById(noteSections, "__general__")?.id ?? ROOT_NOTE_NODE_ID);
  }, [hasRootLevelNotes, notes.length, noteSections, section, selectedNoteNodeId]);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  useEffect(() => {
    if (!hasLoadedNotes || notes.length === 0) return;

    void loadSidebarOrder();
    void loadBookmarks();
    void loadTodoItems();
    void loadRecentDocuments();

    const eventSource = new EventSource(`${sidebarApiBase}/api/events`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { resource?: string };

        if (data.resource === "notes") {
          void loadNotes();
          return;
        }

        if (data.resource === "bookmarks") {
          void loadBookmarks();
          return;
        }

        if (data.resource === "todo") {
          void loadTodoItems();
        }
      } catch {
        // Ignore malformed events and keep the stream open.
      }
    };

    return () => {
      eventSource.close();
    };
  }, [hasLoadedNotes, notes.length, loadBookmarks, loadNotes, loadRecentDocuments, loadSidebarOrder, loadTodoItems]);

  useEffect(() => {
    if (section !== "bookmarks") {
      return;
    }

    if (selectedBookmarkId && findNodeById(bookmarkTree, selectedBookmarkId)) {
      return;
    }

    const firstNode = firstTreeNode(bookmarkTree);
    setSelectedBookmarkId(firstNode?.id ?? null);
  }, [bookmarkTree, section, selectedBookmarkId]);

  useEffect(() => {
    if (section !== "notes" && section !== "wiki" && section !== "bookmarks") {
      return;
    }

    const nextTree = section === "notes" ? resolvedNotesTree : wikiTree;
    if (nextTree.length === 0) {
      return;
    }

    const nextSelectedNoteNodeId = resolveSelectedNoteNodeId({
      currentSelectedNoteNodeId: selectedNoteNodeId,
      rootNodeId: ROOT_NOTE_NODE_ID,
      tree: nextTree,
    });
    if (nextSelectedNoteNodeId !== selectedNoteNodeId) {
      setSelectedNoteNodeId(nextSelectedNoteNodeId);
    }
  }, [resolvedNotesTree, section, selectedNoteNodeId, wikiTree]);

  useEffect(() => {
    setExpandedFolderIds((current) => {
      const folderIds = collectFolderIds(bookmarkTree);
      const next = new Set<string>();

      for (const folderId of current) {
        if (folderIds.has(folderId)) {
          next.add(folderId);
        }
      }

      return next;
    });
  }, [bookmarkTree]);

  useEffect(() => {
    setActiveSearchScopeSuggestionIndex(0);
  }, [searchText, searchScope, searchNoteSectionScope, searchFolderScopePath]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      const clickedWithinMenuBar = Boolean(menuBarRef.current?.contains(target));
      const clickedWithinOpenMenu =
        Boolean(target?.closest(".menu-flyout")) || Boolean(target?.closest(".menu-folder__title.is-top"));

      if (!clickedWithinMenuBar || !clickedWithinOpenMenu) {
        setOpenMenuPath((current) => (current.length > 0 ? [] : current));
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  useEffect(() => {
    function handleMenuEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenMenuPath([]);
      }
    }

    window.addEventListener("keydown", handleMenuEscape);
    return () => window.removeEventListener("keydown", handleMenuEscape);
  }, []);

  useEffect(() => {
    if (section !== "bookmarks" || bookmarkRenderMode !== "menu") {
      setOpenMenuPath([]);
    }
  }, [bookmarkRenderMode, section]);

  useEffect(() => {
    if (section === "notes" || section === "wiki") {
      setIsSearchPanelOpen(false);
    }
  }, [section]);

  const filteredBookmarkTree = useMemo(() => {
    if (section !== "bookmarks") {
      return [];
    }
    if (!searchText.trim()) {
      return bookmarkTree;
    }
    return filterBookmarkTree(bookmarkTree, searchText);
  }, [bookmarkTree, searchText, section]);

  const selectedBookmarkNode = useMemo(
    () => (selectedBookmarkId ? findNodeById(bookmarkTree, selectedBookmarkId) : null),
    [bookmarkTree, selectedBookmarkId],
  );

  const selectedBookmarkStats = useMemo(() => {
    if (!selectedBookmarkNode || selectedBookmarkNode.type !== "folder") {
      return null;
    }

    const flattened = flattenLocalTree([selectedBookmarkNode]);
    return {
      bookmarks: flattened.length,
      folders: countFolders(selectedBookmarkNode.children),
    };
  }, [selectedBookmarkNode]);

  const selectedNoteTreeNode = useMemo(
    () => (selectedNoteNodeId ? findNoteTreeNodeById(activeNoteTree, selectedNoteNodeId) : null),
    [activeNoteTree, selectedNoteNodeId],
  );

  const selectedNote = useMemo(() => {
    if (!selectedNoteTreeNode || selectedNoteTreeNode.type !== "note") {
      return null;
    }

    return allNotes.find((item) => item.id === selectedNoteTreeNode.noteId) ?? selectedNoteTreeNode.note ?? null;
  }, [allNotes, selectedNoteTreeNode]);
  const selectedTodo = useMemo(
    () => (selectedTodoId ? todoItems.find((item) => item.id === selectedTodoId) ?? null : null),
    [selectedTodoId, todoItems],
  );

  // In notes and wiki views, keep note selection in the integrated preview unless forced immersive.
  const shouldShowPreviewInPanel =
    (section === "notes" || section === "wiki" || section === "bookmarks") && Boolean(selectedNote) && !forceImmersive;
  
  const isMarkdownImmersive = (Boolean(selectedNote) || isNoteEditing) && !shouldShowPreviewInPanel;
  const canEditSelectedNote = canEditNote(selectedNote);
  const isNoteDraftDirty = Boolean(selectedNote && isNoteEditing && noteDraft !== selectedNote.content);
  const selectedNoteDisplayTitle = selectedNote ? getNoteSourceFileName(selectedNote) || selectedNote.title : "";
  const showSearchResultsPanel = !isMarkdownImmersive && isSearchPanelOpen;
  const showStarredPanel = isStarredPanelOpen;
  const showRecentPanel = isRecentPanelOpen;
  const usesSearchPalette = prefs.searchInterface === "palette";
  const showTopbarSearch = prefs.searchInterface === "topbar";
  const immersiveChromeState = useMemo(
    () =>
      getImmersiveChromeState({
        isImmersive: isMarkdownImmersive,
        isSearchPanelOpen: showSearchResultsPanel,
        isFeedPanelOpen: isStarredPanelOpen || isRecentPanelOpen,
        isSidebarCollapsed,
      }),
    [isMarkdownImmersive, isSidebarCollapsed, showSearchResultsPanel, isStarredPanelOpen, isRecentPanelOpen],
  );
  const showCollapsedSearchCard =
    !isMarkdownImmersive &&
    immersiveChromeState.showCollapsedSearchCard &&
    prefs.showCollapsedSearchCard;
  const useSingleColumnDashboard =
    immersiveChromeState.useSingleColumnDashboard ||
    (!showSearchResultsPanel && !showStarredPanel && !showRecentPanel && !showCollapsedSearchCard);
  const starredNotes = useMemo(() => allNotes.filter((item) => item.starred), [allNotes]);
  const starredBookmarks = useMemo(() => bookmarks.filter((item) => item.starred), [bookmarks]);

  useEffect(() => {
    setIsNoteEditing(false);
    setNoteDraft(selectedNote?.content ?? "");
    setImmersiveZoomPercent(100);
    setEditorSplitPercent(50);
    setPendingEditorScrollRatio(0);
    setNoteSaveState("idle");
    setNoteSaveError(null);
    setForceImmersive(false);
  }, [selectedNote?.id]);

  useEffect(() => {
    if (section === "bookmarks" && forceImmersive) {
      setForceImmersive(false);
    }
  }, [forceImmersive, section]);

  useEffect(() => {
    if (!pendingCreatedNoteSourcePath || selectedNote?.sourcePath !== pendingCreatedNoteSourcePath) {
      return;
    }

    setIsNoteEditing(true);
    if (pendingNoteTemplate !== null) {
      setNoteDraft(pendingNoteTemplate);
      setPendingNoteTemplate(null);
    } else {
      setNoteDraft(selectedNote.content ?? "");
    }
    setPendingCreatedNoteSourcePath(null);
  }, [pendingCreatedNoteSourcePath, pendingNoteTemplate, selectedNote?.content, selectedNote?.sourcePath]);

  useEffect(() => {
    if (!canEditSelectedNote && isNoteEditing) {
      setIsNoteEditing(false);
      setNoteSaveState("idle");
      setNoteSaveError(null);
    }
  }, [canEditSelectedNote, isNoteEditing]);

  function handleViewerZoomOut() {
    setImmersiveZoomPercent((current) => Math.max(70, current - 10));
  }

  function handleViewerZoomIn() {
    setImmersiveZoomPercent((current) => Math.min(170, current + 10));
  }

  function renderNoteViewerToolbarLeading() {
    if (!selectedNote) {
      return null;
    }

    return canEditSelectedNote ? (
      <div className="markdown-body__toolbar-leading">
        <button
          aria-label={selectedNote.starred ? "Remove star" : "Add star"}
          className={`icon-action markdown-body__star ${selectedNote.starred ? "is-active" : ""}`}
          onClick={() => void handleToggleNoteStar(selectedNote, !selectedNote.starred)}
          title={selectedNote.starred ? "Remove star" : "Add star"}
          type="button"
        >
          <Star fill={selectedNote.starred ? "currentColor" : "none"} size={16} />
        </button>
        <span className="markdown-body__toolbar-title">{selectedNoteDisplayTitle}</span>
      </div>
    ) : (
      <span className="markdown-body__toolbar-title">{selectedNoteDisplayTitle}</span>
    );
  }

  function renderNoteViewerZoomControls() {
    if (!selectedNote) {
      return null;
    }

    return (
      <>
        <button
          aria-label="Zoom out"
          className="icon-action markdown-body__zoom"
          onClick={handleViewerZoomOut}
          title="Zoom out"
          type="button"
        >
          <Minus size={16} />
        </button>
        <span className="markdown-body__zoom-value">{immersiveZoomPercent}%</span>
        <button
          aria-label="Zoom in"
          className="icon-action markdown-body__zoom"
          onClick={handleViewerZoomIn}
          title="Zoom in"
          type="button"
        >
          <Plus size={16} />
        </button>
      </>
    );
  }

  function renderNoteViewerDocumentActions() {
    if (!canEditSelectedNote) {
      return null;
    }

    return (
      <>
        <button
          aria-label="Edit document"
          className="icon-action markdown-body__edit"
          onClick={handleStartNoteEditing}
          title="Edit document"
          type="button"
        >
          <Pencil size={16} />
        </button>
        {selectedNote?.sourcePath ? (
          <button
            aria-label="Move to trash"
            className="icon-action"
            onClick={() => { if (selectedNote) setTrashConfirmNote(selectedNote); }}
            title="Move to trash"
            type="button"
          >
            <Trash2 size={16} />
          </button>
        ) : null}
        <button
          aria-label="Close document"
          className="icon-action markdown-body__close"
          onClick={handleCloseSelectedNote}
          title="Close document"
          type="button"
        >
          <X size={16} />
        </button>
      </>
    );
  }

  const notePreviewToolbarLeading = renderNoteViewerToolbarLeading();
  const notePreviewToolbarActions = selectedNote ? (
    section === "bookmarks" ? null : (
      <>
        {renderNoteViewerZoomControls()}
        {renderNoteViewerDocumentActions()}
        <button
          aria-label="Enter immersive mode"
          className="icon-action"
          onClick={() => setForceImmersive(true)}
          title="Enter immersive mode"
          type="button"
        >
          <Maximize2 size={16} />
        </button>
      </>
    )
  ) : null;
  const standaloneNoteViewerToolbarActions = isMarkdownImmersive ? (
    <>
      {renderNoteViewerZoomControls()}
      {renderNoteViewerDocumentActions()}
    </>
  ) : renderNoteViewerDocumentActions();

  useEffect(() => {
    window.localStorage.setItem(STORED_RECENT_DOCUMENTS_SORT_MODE_KEY, recentDocumentsSortMode);
  }, [recentDocumentsSortMode]);

  useEffect(() => {
    window.localStorage.setItem(STORED_SIDEBAR_COLLAPSED_KEY, String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  useEffect(() => {
    window.localStorage.setItem(STORED_BOOKMARK_RENDER_MODE_KEY, bookmarkRenderMode);
  }, [bookmarkRenderMode]);

  useEffect(() => {
    window.localStorage.setItem(STORED_BOOKMARK_COMPACT_MODE_KEY, String(bookmarkCompactMode));
  }, [bookmarkCompactMode]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORED_BOOKMARK_EXPANDED_FOLDERS_KEY, JSON.stringify([...expandedFolderIds]));
    } catch {
      // Ignore storage errors.
    }
  }, [expandedFolderIds]);

  useEffect(() => {
    window.localStorage.setItem(STORED_NOTES_NAVIGATION_MODE_KEY, notesNavigationMode);
  }, [notesNavigationMode]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORED_NOTE_SECTION_PREFERENCES_KEY, JSON.stringify(noteSectionPreferences));
    } catch {
      // Ignore storage errors.
    }
  }, [noteSectionPreferences]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORED_SAVED_SEARCHES_KEY, JSON.stringify(savedSearches));
    } catch {
      // Ignore storage errors.
    }
  }, [savedSearches]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORED_PINNED_NOTES_KEY, JSON.stringify(pinnedNoteIds));
    } catch {
      // Ignore storage errors.
    }
  }, [pinnedNoteIds]);

  useEffect(() => {
    try {
      window.localStorage.setItem("smartFolders", JSON.stringify(smartFolders));
    } catch { /* ignore */ }
  }, [smartFolders]);

  useEffect(() => {
    window.localStorage.setItem(STORED_SYNC_INTERVAL_KEY, String(syncInterval));
  }, [syncInterval]);

  useEffect(() => {
    window.localStorage.setItem(STORED_PREFS_KEY, JSON.stringify(prefs));
  }, [prefs]);

  const handleSyncAll = useCallback(async () => {
    if (isSyncingRef.current) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setIsOnline(false);
      return;
    }

    isSyncingRef.current = true;
    setIsSyncing(true);
    setSyncErrorMessage(null);
    setLastSyncConflictCount(0);

    try {
      let queue = loadSyncQueue();
      let conflictCount = 0;

      for (const entry of queue) {
        try {
          if (entry.kind === "note-save") {
            const response = await fetch(`${sidebarApiBase}/api/notes`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(entry.payload),
            });

            if (response.status === 409) {
              snapshotNoteVersion(
                entry.payload.sourcePath,
                entry.payload.content,
                `Offline conflict draft – ${new Date().toLocaleString()}`,
              );
              conflictCount += 1;
              queue = removeSyncEntry(queue, entry.id);
              continue;
            }

            if (!response.ok) {
              throw new Error("Failed to sync queued note save");
            }

            queue = removeSyncEntry(queue, entry.id);
            continue;
          }

          if (entry.kind === "bookmarks-save") {
            const response = await fetch(`${sidebarApiBase}/api/bookmarks`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(entry.payload),
            });
            if (!response.ok) {
              throw new Error("Failed to sync queued bookmarks save");
            }
            queue = removeSyncEntry(queue, entry.id);
            continue;
          }

          if (entry.kind === "todo-save") {
            const response = await fetch(`${sidebarApiBase}/api/todo-items`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(entry.payload),
            });
            if (!response.ok) {
              throw new Error("Failed to sync queued task save");
            }
            queue = removeSyncEntry(queue, entry.id);
            continue;
          }

          if (entry.kind === "recents-save") {
            const response = await fetch(`${sidebarApiBase}/api/recent-documents`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(entry.payload),
            });
            if (!response.ok) {
              throw new Error("Failed to sync queued recents save");
            }
            queue = removeSyncEntry(queue, entry.id);
            continue;
          }

          if (entry.kind === "sidebar-order-save") {
            const response = await fetch(`${sidebarApiBase}/api/sidebar-order`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(entry.payload),
            });
            if (!response.ok) {
              throw new Error("Failed to sync queued sidebar order save");
            }
            queue = removeSyncEntry(queue, entry.id);
          }
        } catch {
          break;
        }
      }

      setPendingSyncCount(queue.length);
      setLastSyncConflictCount(conflictCount);
      await Promise.all([loadNotes(), loadBookmarks(), loadTodoItems(), loadRecentDocuments()]);
      setLastSyncedAt(Date.now());
      if (queue.length > 0) {
        setSyncErrorMessage(`${queue.length} change${queue.length === 1 ? "" : "s"} still pending`);
      }
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [loadBookmarks, loadNotes, loadRecentDocuments, loadTodoItems]);

  useEffect(() => {
    if (syncInterval === 0) return;
    const id = window.setInterval(() => { void handleSyncAll(); }, syncInterval * 1000);
    return () => window.clearInterval(id);
  }, [syncInterval, handleSyncAll]);

  useEffect(() => {
    refreshPendingSyncCount();

    function handleOnline() {
      setIsOnline(true);
      void handleSyncAll();
    }

    function handleOffline() {
      setIsOnline(false);
      refreshPendingSyncCount();
    }

    function handleStorage(event: StorageEvent) {
      if (!event.key || event.key === "organizer:sync-queue:v1") {
        refreshPendingSyncCount();
      }
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("storage", handleStorage);
    };
  }, [handleSyncAll, refreshPendingSyncCount]);

  const noteUploadTarget = useMemo(
    () => getNoteUploadTarget(section, selectedNoteTreeNode, selectedNote),
    [section, selectedNote, selectedNoteTreeNode],
  );
  const canGoBack = navigationHistory.index > 0;
  const canGoForward = navigationHistory.index < navigationHistory.entries.length - 1;

  useEffect(() => {
    const sourcePath = selectedNote?.sourcePath;
    if ((section !== "wiki" && section !== "bookmarks") || typeof sourcePath !== "string" || !sourcePath) {
      setWikiUnfurl(null);
      return;
    }
    const sourceUrl = sourcePath;

    const controller = new AbortController();

    async function loadUnfurl() {
      try {
        const response = await fetch(`${sidebarApiBase}/api/unfurl?url=${encodeURIComponent(sourceUrl)}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error("Failed to load unfurl");
        }
        const data = (await response.json()) as UnfurlResponse;
        setWikiUnfurl(data);
      } catch {
        if (!controller.signal.aborted) {
          setWikiUnfurl(null);
        }
      }
    }

    void loadUnfurl();

    return () => controller.abort();
  }, [section, selectedNote?.sourcePath]);

  const selectedNoteTreeTrail = useMemo(
    () => (selectedNoteNodeId && selectedNoteNodeId !== ROOT_NOTE_NODE_ID ? getNoteTreeTrail(activeNoteTree, selectedNoteNodeId) : []),
    [activeNoteTree, selectedNoteNodeId],
  );
  const activeNoteSection = useMemo(() => {
    if (section !== "notes" || notesNavigationMode !== "section") {
      return null;
    }

    // Search bottom-up (most specific first) for a direct section match
    const trailFolders = selectedNoteTreeTrail.filter((node): node is NoteFolderNode => node.type === "folder");
    let foundSection: ReturnType<typeof findNoteSectionById> = null;
    for (let i = trailFolders.length - 1; i >= 0; i--) {
      foundSection = findNoteSectionById(noteSections, trailFolders[i].id);
      if (foundSection) break;
    }

    // If no direct match, check for multi-root General sections (${rootFolderId}:__general__)
    if (!foundSection) {
      for (let i = trailFolders.length - 1; i >= 0; i--) {
        foundSection = findNoteSectionById(noteSections, `${trailFolders[i].id}:__general__`);
        if (foundSection) break;
      }
    }

    if (!foundSection && noteSections.length > 0) {
      return findNoteSectionById(noteSections, "__general__") ?? noteSections[0];
    }

    return foundSection;
  }, [noteSections, notesNavigationMode, section, selectedNoteTreeTrail]);
  const currentFolderContextNode = useMemo(() => {
    if (selectedNoteTreeNode?.type === "folder") {
      return selectedNoteTreeNode;
    }

    const folderTrail = selectedNoteTreeTrail.filter((node): node is NoteFolderNode => node.type === "folder");
    return folderTrail.at(-1) ?? null;
  }, [selectedNoteTreeNode, selectedNoteTreeTrail]);

  const selectedNoteFolderStats = useMemo(() => {
    const folderChildren =
      currentFolderContextNode?.children ??
      (!currentFolderContextNode && (section === "notes" || section === "wiki" || section === "bookmarks") ? activeNoteTree : null);

    if (!folderChildren) {
      return null;
    }

    return {
      notes: countNotesInTree(folderChildren),
      folders: countNoteFolders(folderChildren),
      childFolders: folderChildren.filter((node) => node.type === "folder"),
      childNotes: folderChildren
        .filter((node): node is NoteLeafNode => node.type === "note")
        .map((node) => allNotes.find((item) => item.id === node.noteId) ?? node.note)
        .filter((item): item is Note => Boolean(item)),
    };
  }, [activeNoteTree, allNotes, currentFolderContextNode, section, selectedNoteTreeNode]);
  const showPersistentFolderOverview =
    (section === "notes" || section === "wiki" || section === "bookmarks") &&
    !isMarkdownImmersive &&
    !isNoteEditing &&
    Boolean(selectedNoteFolderStats);
  const visibleOverviewNavigationTreeNodes = useMemo(() => {
    const tree = activeNoteSection ? activeNoteSection.children : activeNoteTree;
    return prefs.showEmptyFoldersAndSections ? tree : filterEmptyFolderNodes(tree);
  }, [activeNoteSection, activeNoteTree, prefs.showEmptyFoldersAndSections]);
  const showStandaloneNoteViewer = !shouldShowPreviewInPanel;
  const showDetachedStandaloneNoteToolbar = section === "notes" && !isMarkdownImmersive && showStandaloneNoteViewer;
  const useAsideLayout =
    showPersistentFolderOverview && showStandaloneNoteViewer;

  const backlinks = useMemo(
    () => (selectedNote ? buildBacklinks(allNotes, selectedNote) : []),
    [allNotes, selectedNote],
  );
  const brokenLinksMap = useMemo(() => buildBrokenLinks(filteredNotes), [filteredNotes]);
  const allTags = useMemo(() => getAllTags(allNotes, bookmarks, todoItems), [allNotes, bookmarks, todoItems]);
  const triageData = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const weekEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    return {
      dueTodayTodos: todoItems.filter((t) => t.status !== "completed" && t.expectedCompletionDate?.startsWith(today)),
      dueThisWeekTodos: todoItems.filter((t) => t.status !== "completed" && t.expectedCompletionDate != null && t.expectedCompletionDate >= today && t.expectedCompletionDate <= weekEnd),
      waitingTodos: todoItems.filter((t) => t.status === "paused"),
      staleNotes: allNotes.filter((n) => n.sourcePath && n.updatedAt && n.updatedAt < thirtyDaysAgo),
      unsortedBookmarks: bookmarks.filter((b) => (!b.tags || b.tags.length === 0)).map((b) => { let domain = b.domain; try { domain = new URL(b.url).hostname.replace(/^www\./, ""); } catch { /* keep b.domain */ } return { id: b.id, title: b.title, url: b.url, domain }; }),
    };
  }, [allNotes, bookmarks, todoItems]);
  const pinnedNotes = useMemo(
    () => pinnedNoteIds.flatMap((id) => { const n = allNotes.find((note) => note.id === id); return n ? [n] : []; }),
    [allNotes, pinnedNoteIds],
  );
  const pinnedNoteIdSet = useMemo(() => new Set(pinnedNoteIds), [pinnedNoteIds]);
  const handlePendingRecentDocumentsConsumed = useCallback(() => setPendingRecentDocuments(null), []);
  const persistRecentDocuments = useCallback(async (entries: RecentDocumentEntry[]) => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      const queuedAt = Date.now();
      const nextQueue = enqueueSyncEntry(loadSyncQueue(), {
        id: createSyncEntryId("recents-save", "recent-documents", queuedAt),
        kind: "recents-save",
        resourceKey: "recent-documents",
        queuedAt,
        payload: { entries },
      });
      setPendingSyncCount(nextQueue.length);
      return;
    }

    try {
      const response = await fetch(`${sidebarApiBase}/api/recent-documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toRecentDocumentPayload(entries)),
      });

      if (!response.ok) {
        throw new Error("Failed to save recent documents");
      }
    } catch {
      const queuedAt = Date.now();
      const nextQueue = enqueueSyncEntry(loadSyncQueue(), {
        id: createSyncEntryId("recents-save", "recent-documents", queuedAt),
        kind: "recents-save",
        resourceKey: "recent-documents",
        queuedAt,
        payload: { entries },
      });
      setPendingSyncCount(nextQueue.length);
    }
  }, []);
  const currentRenderedDocument = useMemo<RecentDocumentSeed | null>(() => {
    if (section === "todo" && selectedTodo && selectedTodoId) {
      return createRecentTodoSeed(selectedTodo, {
        section,
        selectedNoteNodeId,
        selectedBookmarkId,
        selectedTodoId,
      });
    }

    if (selectedNote && (section === "notes" || section === "wiki" || section === "bookmarks") && selectedNoteNodeId) {
      return createRecentDocumentSeed(
        selectedNote,
        {
          section,
          selectedNoteNodeId,
          selectedBookmarkId,
          selectedTodoId,
        },
      );
    }

    return null;
  }, [section, selectedBookmarkId, selectedNote, selectedNoteNodeId, selectedTodo, selectedTodoId]);
  const visibleNoteNodeIds = useMemo(() => collectNoteLeafNodeIds(resolvedNotesTree), [resolvedNotesTree]);
  const visibleTodoIds = useMemo(() => new Set(todoItems.map((item) => item.id)), [todoItems]);
  const visibleWikiNodeIds = useMemo(() => collectNoteLeafNodeIds(wikiTree), [wikiTree]);
  const {
    recentDocuments,
    setRecentDocuments,
    removeRecentDocument,
  } = useRecentDocumentsState({
    currentRenderedDocument,
    pendingRecentDocuments,
    onPendingRecentDocumentsConsumed: handlePendingRecentDocumentsConsumed,
    hasLoadedBookmarks,
    hasLoadedNotes,
    visibleNoteNodeIds,
    visibleTodoIds,
    visibleWikiNodeIds,
    persistRecentDocuments,
  });
  const editedRecentDocuments = useMemo(
    () =>
      allNotes.flatMap((note) => {
        const editedAt = Date.parse(note.updatedAt);
        if (!Number.isFinite(editedAt)) {
          return [];
        }

        const targetTree = note.kind === "wiki" ? wikiTree : resolvedNotesTree;
        const targetNodeId = findNoteTreeNodeIdByNoteId(targetTree, note.id);
        if (!targetNodeId) {
          return [];
        }

        const existingEntry = recentDocuments.find((entry) => entry.documentId === `${note.kind}:${note.id}`);

        return [{
          ...(existingEntry ?? createRecentDocumentSeed(note, {
            section: note.kind === "wiki" ? "bookmarks" : "notes",
            selectedNoteNodeId: targetNodeId,
            selectedBookmarkId: null,
            selectedTodoId: null,
          })),
          id: existingEntry?.id ?? `edited-${note.kind}:${note.id}`,
          pinned: existingEntry?.pinned ?? false,
          viewedAt: existingEntry?.viewedAt ?? 0,
          viewCount: existingEntry?.viewCount ?? 0,
          lastEditedAt: editedAt,
          lastCompletedAt: existingEntry?.lastCompletedAt ?? 0,
          snapshot: existingEntry?.snapshot ?? {
            section: note.kind === "wiki" ? "bookmarks" : "notes",
            selectedNoteNodeId: targetNodeId,
            selectedBookmarkId: null,
            selectedTodoId: null,
          },
        }];
      }),
    [allNotes, recentDocuments, resolvedNotesTree, wikiTree],
  );
  const completedRecentDocuments = useMemo(
    () =>
      todoItems.flatMap((todo) => {
        const completedAt = todo.completedAt ? Date.parse(todo.completedAt) : NaN;
        if (!Number.isFinite(completedAt)) {
          return [];
        }

        const existingEntry = recentDocuments.find((entry) => entry.documentId === `todo:${todo.id}`);

        return [{
          ...(existingEntry ?? createRecentTodoSeed(todo, {
            section: "todo",
            selectedNoteNodeId: null,
            selectedBookmarkId: null,
            selectedTodoId: todo.id,
          })),
          id: existingEntry?.id ?? `completed-todo:${todo.id}`,
          pinned: existingEntry?.pinned ?? false,
          viewedAt: existingEntry?.viewedAt ?? 0,
          viewCount: existingEntry?.viewCount ?? 0,
          lastEditedAt: existingEntry?.lastEditedAt ?? 0,
          lastCompletedAt: completedAt,
          snapshot: existingEntry?.snapshot ?? {
            section: "todo",
            selectedNoteNodeId: null,
            selectedBookmarkId: null,
            selectedTodoId: todo.id,
          },
        }];
      }),
    [recentDocuments, todoItems],
  );
  const intelligentRecentDocuments = useMemo(
    () => mergeRecentDocuments(recentDocuments, editedRecentDocuments, completedRecentDocuments),
    [completedRecentDocuments, editedRecentDocuments, recentDocuments],
  );
  const visibleRecentDocuments = useMemo(
    () =>
      intelligentRecentDocuments.filter((entry) => {
        if (entry.kind === "todo") {
          return Boolean(entry.snapshot.selectedTodoId && visibleTodoIds.has(entry.snapshot.selectedTodoId));
        }

        const targetTree = entry.kind === "wiki" ? wikiTree : resolvedNotesTree;
        return Boolean(entry.snapshot.selectedNoteNodeId && findNoteTreeNodeById(targetTree, entry.snapshot.selectedNoteNodeId));
      }),
    [intelligentRecentDocuments, resolvedNotesTree, visibleTodoIds, wikiTree],
  );
  const searchIndex = useMemo(
    () => buildSearchIndex(resolvedNotesTree, filteredNotes, wikiTree, wikiPages, bookmarks, todoItems, intelligentRecentDocuments),
    [bookmarks, filteredNotes, intelligentRecentDocuments, resolvedNotesTree, todoItems, wikiPages, wikiTree],
  );
  const filteredEntries = useMemo(() => buildSearchEntries(query, searchIndex), [query, searchIndex]);
  const documentSuggestionEntries = useMemo(
    () =>
      filteredEntries
        .filter(
          (entry) =>
            entry.category === "note" ||
            entry.category === "wiki" ||
            entry.category === "bookmark" ||
            entry.category === "todo",
        )
        .slice(0, 10),
    [filteredEntries],
  );
  const visibleSearchEntries = useMemo(() => filteredEntries.slice(0, 50), [filteredEntries]);
  const sortedRecentDocuments = useMemo(() => {
    const entries = [...visibleRecentDocuments];
    if (recentDocumentsSortMode === "views") {
      return entries
        .filter((entry) => entry.viewCount > 1)
        .sort(
          (left, right) =>
            Number(right.pinned) - Number(left.pinned) ||
            right.viewCount - left.viewCount ||
            getRecentActivityTimestamp(right) - getRecentActivityTimestamp(left),
        );
    }

    entries.sort(
      (left, right) =>
        Number(right.pinned) - Number(left.pinned) ||
        getRecentActivityTimestamp(right) - getRecentActivityTimestamp(left) ||
        right.viewCount - left.viewCount,
    );
    return entries;
  }, [recentDocumentsSortMode, visibleRecentDocuments]);
  const continueWhereLeftOffEntry = sortedRecentDocuments[0] ?? null;
  const noteViewCounts = useMemo(() => {
    const counts = new Map<string, number>();

    for (const entry of visibleRecentDocuments) {
      if (entry.kind === "todo") {
        continue;
      }
      counts.set(entry.documentId, Math.max(counts.get(entry.documentId) ?? 0, entry.viewCount));
    }

    return counts;
  }, [visibleRecentDocuments]);
  const noteRecentViewedAt = useMemo(() => {
    const viewedAt = new Map<string, number>();

    for (const entry of visibleRecentDocuments) {
      if (entry.kind === "todo") {
        continue;
      }
      viewedAt.set(entry.documentId, Math.max(viewedAt.get(entry.documentId) ?? 0, getRecentActivityTimestamp(entry)));
    }

    return viewedAt;
  }, [visibleRecentDocuments]);
  const openTodoItems = useMemo(() => todoItems.filter((item) => item.status !== "completed"), [todoItems]);
  const completedTodoItems = useMemo(() => todoItems.filter((item) => item.status === "completed"), [todoItems]);

  const navItems = useMemo<NavItem[]>(
    () => [
      { id: "notes", label: "Notes", icon: FileCode2, count: notes.length },
      { id: "bookmarks", label: "Bookmarks", icon: Bookmark, count: bookmarks.length },
      { id: "todo", label: "TODO", icon: LayoutList, count: openTodoItems.length },
      {
        id: "starred",
        label: "Starred",
        icon: Star,
        count: starredNotes.length + starredBookmarks.length,
      },
      { id: "recent", label: "Recent", icon: TimerReset, count: visibleRecentDocuments.length },
    ],
    [bookmarks.length, notes.length, openTodoItems.length, starredBookmarks.length, starredNotes.length, visibleRecentDocuments.length],
  );

  const orderedNavItems = useMemo(() => {
    const map = new Map(navItems.map((item) => [item.id, item]));
    const ordered = navOrder.map((id) => map.get(id)).filter((item): item is NavItem => Boolean(item));
    const missing = navItems.filter((item) => !navOrder.includes(item.id));
    return [...ordered, ...missing];
  }, [navItems, navOrder]);

  const viewerContent = useMemo<ViewerContent>(() => {
    if (section === "bookmarks") {
      if (selectedBookmarkNode?.type === "folder") {
        return {
          title: selectedBookmarkNode.title,
          eyebrow: "Bookmark folder",
          badge: "Tree selection",
          markdown: `# ${selectedBookmarkNode.title}

This folder is persisted in JSON and can be reordered with drag and drop.

## Contents

- Folders: ${selectedBookmarkStats?.folders ?? 0}
- Bookmarks: ${selectedBookmarkStats?.bookmarks ?? 0}
`,
        };
      }

      const featuredBookmark = selectedBookmarkNode?.type === "bookmark" ? selectedBookmarkNode : bookmarks[0] ?? null;

      if (!featuredBookmark) {
        return {
          title: "No bookmarks yet",
          eyebrow: "Bookmark preview",
          badge: "Import bookmarks",
          markdown: "# No bookmarks yet\n\nImport a browser bookmarks HTML file to populate this section.",
        };
      }

      const bookmarkDetails =
        "type" in featuredBookmark
          ? flattenLocalTree(bookmarkTree).find((item) => item.id === featuredBookmark.id) ?? null
          : featuredBookmark;

      return {
        title: featuredBookmark.title,
        eyebrow: "Bookmark preview",
        badge: "Editable + persisted",
        markdown: `# ${featuredBookmark.title}

${featuredBookmark.description || bookmarkDetails?.description || "Imported bookmark"}

## Link

- URL: ${featuredBookmark.url}
- Domain: ${featuredBookmark.domain}
- Path: ${bookmarkDetails?.path.length ? bookmarkDetails.path.join(" / ") : "root"}

## Tags

${featuredBookmark.tags.length ? featuredBookmark.tags.map((tag) => `- #${tag}`).join("\n") : "- none"}
`,
      };
    }

    if (section === "recent") {
      return {
        title: "Recently viewed",
        eyebrow: "Reading history",
        badge: `${visibleRecentDocuments.length} document${visibleRecentDocuments.length === 1 ? "" : "s"}`,
        markdown: "",
      };
    }

    if (section === "todo") {
      return {
        title: selectedTodo?.title ?? "TODO workspace",
        eyebrow: "Task management",
        badge: `${openTodoItems.length} open · ${completedTodoItems.length} completed`,
        markdown: "",
      };
    }

    if (section === "starred") {
      return {
        title: "Starred items",
        eyebrow: "Saved shortcuts",
        badge: `${starredNotes.length + starredBookmarks.length} starred`,
        markdown: "",
      };
    }

    const featuredNote = allNotes[0] ?? null;

    if (!featuredNote) {
      return {
        title: "No notes yet",
        eyebrow: "Markdown viewer",
        badge: "Waiting for docs",
        markdown: "# No notes yet\n\nAdd markdown files under `data/docs` to populate this view.",
      };
    }

    return {
      title: featuredNote.title,
      eyebrow: featuredNote.kind === "wiki" ? "Wiki viewer" : "Editor / Viewer",
      badge: featuredNote.kind === "wiki" ? "Wiki content" : "Markdown + syntax color",
      markdown: featuredNote.content,
    };
  }, [
    allNotes,
    bookmarkTree,
    bookmarks,
    section,
    selectedBookmarkNode,
    selectedBookmarkStats,
    selectedTodo?.title,
    completedTodoItems.length,
    openTodoItems.length,
    starredBookmarks.length,
    starredNotes.length,
    visibleRecentDocuments.length,
  ]);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isEscapeKey = event.key === "Escape" || event.key === "Esc" || event.code === "Escape";
      const isMod = event.metaKey || event.ctrlKey;

      // Close command palette with Escape
      if (isEscapeKey && isCommandPaletteOpen) {
        setIsCommandPaletteOpen(false);
        return;
      }

      if (isEscapeKey && isSearchDialogOpen) {
        setIsSearchDialogOpen(false);
        return;
      }

      if (isEscapeKey && noteCreationDialog.kind !== "closed") {
        setNoteCreationDialog({ kind: "closed" });
        return;
      }

      // Close tag browser / version history / broken links / prefs / feed panels with Escape
      if (isEscapeKey && (isTagBrowserOpen || isVersionHistoryOpen || isBrokenLinksOpen || isExportImportOpen || isPrefsOpen || isStarredPanelOpen || isRecentPanelOpen || openFeedPopup !== null || showTrashPanel || showGraphView || showDailyNotes || showWorkspaceSwitcher || showTriagePanel || isKeyboardShortcutsOpen || showTaskTemplateDialog || isQuickCaptureOpen)) {
        setIsTagBrowserOpen(false);
        setIsVersionHistoryOpen(false);
        setIsBrokenLinksOpen(false);
        setIsExportImportOpen(false);
        setIsPrefsOpen(false);
        setIsStarredPanelOpen(false);
        setIsRecentPanelOpen(false);
        setOpenFeedPopup(null);
        setShowTrashPanel(false);
        setShowGraphView(false);
        setShowDailyNotes(false);
        setShowWorkspaceSwitcher(false);
        setShowTriagePanel(false);
        setIsKeyboardShortcutsOpen(false);
        setShowTaskTemplateDialog(false);
        setIsQuickCaptureOpen(false);
        return;
      }

      // Cmd/Ctrl+K or Cmd/Ctrl+Shift+P — command palette
      if (isMod && ((event.key === "k" || event.key === "K") || (event.shiftKey && (event.key === "p" || event.key === "P")))) {
        event.preventDefault();
        setCommandPaletteQuery("");
        setIsCommandPaletteOpen((current) => !current);
        return;
      }

      // Cmd/Ctrl+F — search
      if (isMod && (event.key === "f" || event.key === "F")) {
        event.preventDefault();
        openSearchSurface();
        return;
      }

      // Cmd/Ctrl+S — save note when editing
      if (isMod && (event.key === "s" || event.key === "S") && isNoteEditing) {
        event.preventDefault();
        void handleSaveNoteEdits();
        return;
      }

      // Cmd/Ctrl+E — toggle edit mode
      if (isMod && (event.key === "e" || event.key === "E") && selectedNote && canEditSelectedNote && !isCommandPaletteOpen) {
        event.preventDefault();
        if (isNoteEditing) {
          handleCancelNoteEditing();
        } else {
          handleStartNoteEditing();
        }
        return;
      }

      // Cmd/Ctrl+/ — keyboard shortcuts reference
      if (isMod && event.key === "/") {
        event.preventDefault();
        setIsKeyboardShortcutsOpen((v) => !v);
        return;
      }

      // Cmd/Ctrl+Alt+N — quick capture
      if (isMod && event.altKey && (event.key === "n" || event.key === "N")) {
        event.preventDefault();
        setQuickCaptureState({ tab: "task", title: "", url: "", description: "", listName: "", noteTemplate: "", toInbox: true });
        setIsQuickCaptureOpen(true);
        return;
      }

      if (!isEscapeKey) {
        return;
      }

      if (isNoteEditing) {
        if (!isNoteDraftDirty) {
          handleCancelNoteEditing();
        }
        return;
      }

      if (isMarkdownImmersive && selectedNote) {
        event.preventDefault();
        handleCloseSelectedNote();
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [
    handleCancelNoteEditing,
    handleCloseSelectedNote,
    handleStartNoteEditing,
    isCommandPaletteOpen,
    isBrokenLinksOpen,
    isExportImportOpen,
    isMarkdownImmersive,
    isNoteDraftDirty,
    isNoteEditing,
    noteCreationDialog.kind,
    isTagBrowserOpen,
    isVersionHistoryOpen,
    isPrefsOpen,
    isStarredPanelOpen,
    isRecentPanelOpen,
    openFeedPopup,
    canEditSelectedNote,
    selectedNote,
  ]);

  const applyNavigationSnapshot = useCallback(
    (snapshot: NavigationSnapshot, mode: "push" | "replace" | "traverse" = "push") => {
      const nextSection = normalizeVisibleSection(snapshot.section);
      const normalizedSnapshot = { ...snapshot, section: nextSection };
      if (mode !== "traverse") {
        commitNavigationSnapshot(normalizedSnapshot, mode);
      }
      setSection(nextSection);
      setSelectedNoteNodeId(normalizedSnapshot.selectedNoteNodeId);
      setSelectedBookmarkId(normalizedSnapshot.selectedBookmarkId);
      setSelectedTodoId(normalizedSnapshot.selectedTodoId);
    },
    [commitNavigationSnapshot, setSelectedTodoId],
  );

  const navigate = useCallback(
    (partial: Partial<NavigationSnapshot>, mode: "push" | "replace" = "push") => {
      applyNavigationSnapshot(
        {
          section: partial.section ?? section,
          selectedNoteNodeId:
            partial.selectedNoteNodeId !== undefined ? partial.selectedNoteNodeId : selectedNoteNodeId,
          selectedBookmarkId:
            partial.selectedBookmarkId !== undefined ? partial.selectedBookmarkId : selectedBookmarkId,
          selectedTodoId:
            partial.selectedTodoId !== undefined ? partial.selectedTodoId : selectedTodoId,
        },
        mode,
      );
    },
    [applyNavigationSnapshot, section, selectedBookmarkId, selectedNoteNodeId, selectedTodoId],
  );

  const navigateSection = useCallback(
    (nextSection: SectionId) => {
      navigate({ section: normalizeVisibleSection(nextSection) });
    },
    [navigate],
  );

  const navigateNoteSelection = useCallback(
    (nodeId: string | null, nextSection: SectionId = section) => {
      const normalizedSection = normalizeVisibleSection(nextSection);
      navigate({
        section: normalizedSection,
        selectedNoteNodeId: nodeId,
      });
    },
    [navigate, section],
  );

  function openNote(note: Note) {
    const targetTree = note.kind === "wiki" ? wikiTree : resolvedNotesTree;
    const targetNodeId = findNoteTreeNodeIdByNoteId(targetTree, note.id);
    if (!targetNodeId) {
      return;
    }

    navigate({
      section: note.kind === "wiki" ? "bookmarks" : "notes",
      selectedNoteNodeId: targetNodeId,
    });
  }

  const navigateBookmarkSelection = useCallback(
    (nodeId: string | null) => {
      navigate({ section: "bookmarks", selectedBookmarkId: nodeId, selectedNoteNodeId: ROOT_NOTE_NODE_ID });
    },
    [navigate],
  );

  const navigateTodoSelection = useCallback(
    (todoId: string | null) => {
      navigate({ section: "todo", selectedTodoId: todoId });
    },
    [navigate],
  );

  const handleMoveNoteSection = useCallback(
    (draggedSectionId: string, targetSectionId: string, position: "before" | "after") => {
      if (draggedSectionId === targetSectionId) {
        return;
      }

      const orderedSectionIds = noteSections.map((noteSection) => noteSection.id);
      const draggedIndex = orderedSectionIds.indexOf(draggedSectionId);
      const targetIndex = orderedSectionIds.indexOf(targetSectionId);

      if (draggedIndex === -1 || targetIndex === -1) {
        return;
      }

      const nextOrder = [...orderedSectionIds];
      const [movedSectionId] = nextOrder.splice(draggedIndex, 1);
  const insertionIndex = nextOrder.indexOf(targetSectionId) + (position === "after" ? 1 : 0);
  nextOrder.splice(insertionIndex, 0, movedSectionId);

      setNoteSectionPreferences((current) => ({
        ...current,
        order: nextOrder,
      }));
    },
    [noteSections],
  );

  const handleRenameNoteSection = useCallback(
    (sectionId: string, nextTitle: string) => {
      const defaultSection = derivedNoteSections.find((noteSection) => noteSection.id === sectionId);
      const normalizedTitle = nextTitle.trim();

      setNoteSectionPreferences((current) => {
        const nextOverrides = { ...current.overrides };
        const nextOverride = { ...(nextOverrides[sectionId] ?? {}) };

        if (!normalizedTitle || normalizedTitle === defaultSection?.title) {
          delete nextOverride.title;
        } else {
          nextOverride.title = normalizedTitle;
        }

        if (!nextOverride.title && !nextOverride.accentColor) {
          delete nextOverrides[sectionId];
        } else {
          nextOverrides[sectionId] = nextOverride;
        }

        return {
          ...current,
          overrides: nextOverrides,
        };
      });
    },
    [derivedNoteSections],
  );

  const handleSetNoteSectionColor = useCallback(
    (sectionId: string, accentColor: string) => {
      const defaultSection = derivedNoteSections.find((noteSection) => noteSection.id === sectionId);

      setNoteSectionPreferences((current) => {
        const nextOverrides = { ...current.overrides };
        const nextOverride = { ...(nextOverrides[sectionId] ?? {}) };

        if (!accentColor || accentColor.toLowerCase() === defaultSection?.accentColor.toLowerCase()) {
          delete nextOverride.accentColor;
        } else {
          nextOverride.accentColor = accentColor.toLowerCase();
        }

        if (!nextOverride.title && !nextOverride.accentColor) {
          delete nextOverrides[sectionId];
        } else {
          nextOverrides[sectionId] = nextOverride;
        }

        return {
          ...current,
          overrides: nextOverrides,
        };
      });
    },
    [derivedNoteSections],
  );

  const handleHideNoteSectionGroup = useCallback((rootFolderId: string) => {
    setNoteSectionPreferences((current) => {
      if (current.hiddenRootFolderIds.includes(rootFolderId)) {
        return current;
      }

      return {
        ...current,
        hiddenRootFolderIds: [...current.hiddenRootFolderIds, rootFolderId],
      };
    });
  }, []);

  const noteFolderOverviewPanel = selectedNoteFolderStats ? (
    <NoteFolderOverviewPanel
      activeFolderNodeId={currentFolderContextNode?.id ?? null}
      activeSection={activeNoteSection}
      allNotes={allNotes}
      baseSections={section === "notes" ? derivedNoteSections : []}
      childNotes={selectedNoteFolderStats.childNotes}
      navigationTreeNodes={visibleOverviewNavigationTreeNodes}
      itemLabelPlural={section === "bookmarks" ? "bookmarks" : "notes"}
      useCompactCards={section === "bookmarks"}
      noteRecentViewedAt={noteRecentViewedAt}
      noteViewCounts={noteViewCounts}
      pinnedNoteIds={pinnedNoteIdSet}
      isRoot={!currentFolderContextNode}
      nodeLabel={currentFolderContextNode?.title ?? null}
      rootLabel={isMultiRoot ? null : docsFolder}
      notesNavigationMode={section === "notes" ? notesNavigationMode : "folder"}
      draggedNoteSourcePath={section === "notes" ? draggedNoteSourcePath : null}
      onMoveNote={section === "notes" ? handleMoveNote : undefined}
      onNoteDragEnd={section === "notes" ? () => {
        draggedNoteSourcePathRef.current = null;
        setDraggedNoteSourcePath(null);
      } : undefined}
      onNoteDragStart={section === "notes" ? (sourcePath) => {
        draggedNoteSourcePathRef.current = sourcePath;
        setDraggedNoteSourcePath(sourcePath);
      } : undefined}
      onMoveSection={section === "notes" ? handleMoveNoteSection : undefined}
      onHideSectionGroup={section === "notes" && isMultiRoot ? handleHideNoteSectionGroup : undefined}
      onRenameSection={section === "notes" ? handleRenameNoteSection : undefined}
      onSelectSection={(nodeId) => navigateNoteSelection(nodeId, "notes")}
      onSetSectionColor={section === "notes" ? handleSetNoteSectionColor : undefined}
      onSelectFolder={navigateNoteSelection}
      onRenameNote={section === "notes" ? handleRenameNoteFile : undefined}
      onEditNote={(note) => {
        navigateNoteSelection(note.id);
        handleStartNoteEditing();
      }}
      onOpenNoteHistory={(note) => {
        setVersionHistoryNote(note);
        setIsVersionHistoryOpen(true);
      }}
      onSelectNote={navigateNoteSelection}
      onTogglePinnedNote={(noteId, nextPinned) => {
        if (nextPinned) {
          handlePinNote(noteId);
          return;
        }

        handleUnpinNote(noteId);
      }}
      onToggleNoteStar={handleToggleNoteStar}
      onToggleFolder={toggleNoteFolder}
      previewContentScale={immersiveZoomPercent}
      previewSupplementary={
        (section === "wiki" || section === "bookmarks") && wikiUnfurl && !isNoteEditing
          ? <WikiUnfurlCard unfurl={wikiUnfurl} />
          : null
      }
      previewToolbarActions={notePreviewToolbarActions}
      previewToolbarLeading={notePreviewToolbarLeading}
      sections={section === "notes" ? noteSections : []}
      selectedNote={selectedNote}
      selectedNodeId={selectedNoteNodeId}
      showContextPill={section !== "notes"}
      showOverviewMeta={section !== "bookmarks"}
      expandedFolderIds={expandedNoteFolderIds}
    />
  ) : null;

  const handleHistoryNavigation = useCallback(
    (direction: -1 | 1) => {
      const nextSnapshot = traverseHistory(direction);
      if (!nextSnapshot) {
        return;
      }

      applyNavigationSnapshot(nextSnapshot, "traverse");
    },
    [applyNavigationSnapshot, traverseHistory],
  );

  function handleRemoveRecentDocument(entryId: string) {
    removeRecentDocument(entryId);
  }

  function handleToggleRecentDocumentPin(entryId: string) {
    setRecentDocuments((current) => togglePinnedRecentDocument(current, entryId));
  }

  function handleToggleBookmarkStar(bookmarkId: string, nextStarred: boolean) {
    const nextTree = updateBookmarkStarredState(bookmarkTree, bookmarkId, nextStarred);
    if (nextTree === bookmarkTree) {
      return;
    }

    void persistBookmarkTree(nextTree, nextStarred ? "Bookmark starred" : "Bookmark unstarred");
  }

  async function handleSetTodoViewMode(nextViewMode: TodoPayload["viewMode"]) {
    await setTodoViewMode(nextViewMode);
  }

  async function handleAddTodo(parentId: string | null = null, openEditor = false) {
    const parentTodo = parentId ? todoItems.find((item) => item.id === parentId) ?? null : null;
    const nextTodo = createDefaultTodoItem({
      color: parentTodo?.color ?? TODO_COLOR_DEFAULT,
      listName: parentTodo?.listName ?? "General",
      parentId,
      siblingItems: todoItems.filter((item) => item.parentId === parentId),
    });
    const nextItems = normalizeTodoItems([...todoItems, nextTodo]);
    setSelectedTodoId(nextTodo.id);
    if (openEditor) {
      setRequestedTodoEditorId(nextTodo.id);
    }
    await persistTodoItems(buildTodoPayload(nextItems, todoViewMode, nextTodo.id), "Task created");
  }

  async function handleCreateFromTaskBundle(tasks: string[], listName: string) {
    let nextItems = [...todoItems];
    let lastId: string | null = null;
    for (const title of tasks) {
      const nextTodo = createDefaultTodoItem({
        color: TODO_COLOR_DEFAULT,
        listName,
        parentId: null,
        siblingItems: nextItems.filter((item) => item.parentId === null),
      });
      const withTitle = { ...nextTodo, title };
      nextItems = normalizeTodoItems([...nextItems, withTitle]);
      lastId = withTitle.id;
    }
    if (lastId) {
      setSelectedTodoId(lastId);
    }
    await persistTodoItems(buildTodoPayload(nextItems, todoViewMode, lastId), `Created ${tasks.length} tasks`);
    navigateSection("todo");
  }

  async function handleQuickCaptureTask(title: string, listName: string, toInbox: boolean) {
    const nextTodo = createDefaultTodoItem({
      color: TODO_COLOR_DEFAULT,
      listName: listName || "General",
      parentId: null,
      siblingItems: todoItems.filter((item) => item.parentId === null),
    });
    const withTitle = { ...nextTodo, title, inboxItem: toInbox };
    const nextItems = normalizeTodoItems([...todoItems, withTitle]);
    setSelectedTodoId(withTitle.id);
    await persistTodoItems(buildTodoPayload(nextItems, todoViewMode, withTitle.id), "Task captured");
  }

  async function handleQuickCaptureNote(title: string, templateId: string, _toInbox: boolean) {
    const template = NOTE_TEMPLATES.find((t) => t.id === templateId);
    setPendingNoteTemplate(template && "content" in template ? template.content : null);
    setNoteCreationDialog({
      kind: "document",
      creationPath: "",
      name: title,
      targetPath: "",
      selectedTemplate: templateId,
    });
  }

  function handleQuickCaptureBookmark(title: string, url: string, description: string) {
    setBookmarkDialog({
      kind: "add-bookmark",
      title,
      url,
      description,
    });
  }

  async function handleUpdateTodo(todoId: string, update: Partial<TodoItem>) {
    const nextItems = updateTodoItems(todoItems, todoId, update);
    await persistTodoItems(buildTodoPayload(nextItems, todoViewMode, todoId), "Task updated");
  }

  function collectTodoDescendantIds(items: TodoItem[], todoId: string) {
    const descendants = new Set<string>();
    const queue = [todoId];

    while (queue.length > 0) {
      const currentId = queue.shift();
      if (!currentId) {
        continue;
      }

      for (const item of items) {
        if (item.parentId === currentId && !descendants.has(item.id)) {
          descendants.add(item.id);
          queue.push(item.id);
        }
      }
    }

    return descendants;
  }

  function applyTodoStatusTransition(items: TodoItem[], todoId: string, nextStatus: TodoStatus, changedAt = new Date().toISOString()) {
    const item = items.find((entry) => entry.id === todoId);
    if (!item) {
      return items;
    }

    if (nextStatus !== "completed" && item.status === nextStatus) {
      return items;
    }

    if (nextStatus === "completed") {
      const descendantIds = collectTodoDescendantIds(items, todoId);
      const affectedIds = new Set<string>([todoId, ...descendantIds]);

      return normalizeTodoItems(
        items.map((entry) => {
          if (!affectedIds.has(entry.id)) {
            return entry;
          }

          return {
            ...entry,
            status: "completed",
            expectedCompletionDate: changedAt,
            completedAt: entry.completedAt ?? changedAt,
            updatedAt: changedAt,
          };
        }),
      );
    }

    const update: Partial<TodoItem> = { status: nextStatus };
    if (item.status === "completed" && item.completedAt) {
      update.expectedCompletionDate = item.completedAt;
    }

    return updateTodoItems(items, todoId, update, changedAt);
  }

  async function handleTransitionTodoStatus(todoId: string, nextStatus: TodoStatus) {
    let nextItems = applyTodoStatusTransition(todoItems, todoId, nextStatus);
    if (nextItems === todoItems) {
      return;
    }

    if (nextStatus === "completed") {
      nextItems = spawnNextRecurrence(nextItems, todoId);
    }

    await persistTodoItems(buildTodoPayload(nextItems, todoViewMode, selectedTodoId), "Task updated");
  }

  async function handleDeleteTodo(todoId: string) {
    const remainingItems = removeTodoItems(todoItems, todoId);
    const nextSelectedTodoId =
      selectedTodoId && remainingItems.some((item) => item.id === selectedTodoId) ? selectedTodoId : remainingItems[0]?.id ?? null;
    setSelectedTodoId(nextSelectedTodoId);
    await persistTodoItems(buildTodoPayload(remainingItems, todoViewMode, nextSelectedTodoId), "Task deleted");
  }

  async function handleMoveTodo(sourceId: string, targetId: string, placement: "before" | "after") {
    const sourceItem = todoItems.find((item) => item.id === sourceId);
    const targetItem = todoItems.find((item) => item.id === targetId);
    if (!sourceItem || !targetItem) {
      return;
    }

    let nextItems = reorderTodoItems(todoItems, sourceId, targetId, placement);
    if (nextItems === todoItems) {
      return;
    }

    if (sourceItem.status !== targetItem.status) {
      nextItems = applyTodoStatusTransition(nextItems, sourceId, targetItem.status);
    }

    await persistTodoItems(buildTodoPayload(nextItems, todoViewMode, selectedTodoId), "Task priority updated");
  }

  function handleStartNoteEditing() {
    if (!selectedNote || !canEditSelectedNote) {
      return;
    }

    setPendingEditorScrollRatio(getScrollProgress(viewerContentRef.current));
    setNoteDraft(selectedNote.content);
    setNoteSaveError(null);
    setNoteSaveState("idle");
    setIsNoteEditing(true);
  }

  function handleCancelNoteEditing() {
    setNoteDraft(selectedNote?.content ?? "");
    setNoteSaveError(null);
    setNoteSaveState("idle");
    setIsNoteEditing(false);
  }

  function handleCloseSelectedNote() {
    if (section !== "notes" && section !== "wiki" && section !== "bookmarks") {
      return;
    }

    const folderTrailIds = selectedNoteTreeTrail
      .filter((node): node is NoteFolderNode => node.type === "folder")
      .map((node) => node.id);
    if (folderTrailIds.length > 0) {
      expandNoteFolders(folderTrailIds);
    }

    navigateNoteSelection(currentFolderContextNode?.id ?? ROOT_NOTE_NODE_ID);
  }

  async function handleToggleNoteStar(note: Note, nextStarred: boolean) {
    if (!canEditNote(note) || !note.sourcePath) {
      return;
    }
    await toggleNoteStar(note, nextStarred);
  }

  async function handleMoveNote(targetFolderSourcePath: string) {
    const noteSourcePath = draggedNoteSourcePathRef.current;
    draggedNoteSourcePathRef.current = null;
    setDraggedNoteSourcePath(null);
    if (!noteSourcePath) return;
    try {
      const response = await fetch(`${sidebarApiBase}/api/docs/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourcePath: noteSourcePath, targetFolderPath: targetFolderSourcePath }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        window.alert(data.error ?? "Failed to move note");
        return;
      }
      void loadNotes();
    } catch {
      window.alert("Failed to move note");
    }
  }

  async function handleRenameNoteFile(note: Note, nextFileName: string) {
    if (!canEditNote(note) || !note.sourcePath) {
      return;
    }

    try {
      const response = await fetch(`${sidebarApiBase}/api/docs/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourcePath: note.sourcePath, fileName: nextFileName }),
      });

      const raw = await response.text();
      let data: (DocsRenameResponse & { error?: string }) | null = null;
      if (raw) {
        try {
          data = JSON.parse(raw) as DocsRenameResponse & { error?: string };
        } catch {
          const isHtml = raw.trimStart().startsWith("<!doctype") || raw.trimStart().startsWith("<html");
          const message = isHtml
            ? "Rename endpoint returned HTML instead of JSON. Restart the dev server and try again."
            : "Rename endpoint returned an invalid response.";
          window.alert(message);
          return;
        }
      }

      if (!response.ok) {
        window.alert(data?.error ?? `Failed to rename note file (${response.status})`);
        return;
      }

      if (!data) {
        window.alert("Failed to rename note file");
        return;
      }

      const notesData = await loadNotes();
      const renamedNote = notesData?.notes?.find((item) => item.sourcePath === data.sourcePath) ?? null;
      const targetNodeId =
        notesData?.tree && renamedNote
          ? findNoteTreeNodeIdByNoteId(notesData.tree, renamedNote.id)
          : null;

      if (targetNodeId) {
        navigateNoteSelection(targetNodeId, "notes");
      } else if (notesNavigationMode === "section" && activeNoteSection?.id) {
        // Keep the current section focused if the renamed file node cannot be resolved.
        navigateNoteSelection(activeNoteSection.id, "notes");
      }

      setNotesStatus(`Renamed to ${data.fileName}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to rename note file";
      window.alert(message);
    }
  }

  async function handleSaveNoteEdits() {
    if (!selectedNote?.sourcePath || !canEditSelectedNote) {
      return;
    }

    // Snapshot the current content before overwriting.
    snapshotNoteVersion(
      selectedNote.sourcePath,
      selectedNote.content,
      `Before save – ${new Date().toLocaleString()}`,
    );

    setNoteSaveState("saving");
    setNoteSaveError(null);
    setNotesStatus("Saving note...");

    try {
      const result = await saveNoteContent(selectedNote, noteDraft);
      if (!result.ok) {
        if ("conflict" in result && result.conflict && result.note && selectedNote.sourcePath) {
          snapshotNoteVersion(
            selectedNote.sourcePath,
            noteDraft,
            `Conflict draft – ${new Date().toLocaleString()}`,
          );
          await loadNotes();
          setNoteDraft(result.note.content);
          setNoteSaveState("error");
          setNoteSaveError("Conflict detected. Server version loaded; your draft was saved to local history.");
          setNotesStatus("Note conflict detected");
          return;
        }

        throw new Error(result.error ?? "Failed to save note");
      }
      setNoteSaveState("saved");
      setNotesStatus("queued" in result && result.queued ? `${selectedNote.title} queued for sync` : `Saved ${selectedNote.title}`);
      window.setTimeout(() => setNoteSaveState((current) => (current === "saved" ? "idle" : current)), 1400);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save note";
      setNoteSaveState("error");
      setNoteSaveError(message);
      setNotesStatus("Note save failed");
    }
  }

  async function persistSidebarOrder(nextOrder: SectionId[]) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      const queuedAt = Date.now();
      const nextQueue = enqueueSyncEntry(loadSyncQueue(), {
        id: createSyncEntryId("sidebar-order-save", "sidebar-order", queuedAt),
        kind: "sidebar-order-save",
        resourceKey: "sidebar-order",
        queuedAt,
        payload: { order: nextOrder },
      });
      setPendingSyncCount(nextQueue.length);
      return;
    }

    try {
      const response = await fetch(`${sidebarApiBase}/api/sidebar-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: nextOrder }),
      });

      if (!response.ok) {
        throw new Error("Failed to save sidebar order");
      }
    } catch {
      const queuedAt = Date.now();
      const nextQueue = enqueueSyncEntry(loadSyncQueue(), {
        id: createSyncEntryId("sidebar-order-save", "sidebar-order", queuedAt),
        kind: "sidebar-order-save",
        resourceKey: "sidebar-order",
        queuedAt,
        payload: { order: nextOrder },
      });
      setPendingSyncCount(nextQueue.length);
    }
  }

  function moveSidebarItem(targetSection: SectionId) {
    if (!draggedSection || draggedSection === targetSection) {
      return;
    }

    const nextOrder = reorderItems(navOrder, draggedSection, targetSection);
    setNavOrder(nextOrder);
    setDraggedSection(null);
    void persistSidebarOrder(nextOrder);
  }

  async function handleBookmarkImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setBookmarkStatus("Importing favorites...");

    try {
      const html = await file.text();
      const parsedTree = parseNetscapeBookmarkHtml(html);
      const response = await fetch(`${sidebarApiBase}/api/bookmarks/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tree: parsedTree }),
      });

      if (!response.ok) {
        throw new Error("Import failed");
      }

      const result = (await response.json()) as ImportResponse;
      await loadBookmarks();
      applyNavigationSnapshot(
        {
          section: "bookmarks",
          selectedNoteNodeId,
          selectedBookmarkId: result.bookmarks[0]?.id ?? firstTreeNode(result.tree)?.id ?? null,
          selectedTodoId,
        },
        "push",
      );
      setBookmarkStatus(`Imported ${result.imported} favorite${result.imported === 1 ? "" : "s"} and replaced bookmarks`);
    } catch {
      setBookmarkStatus("Import failed");
    } finally {
      event.target.value = "";
    }
  }

  function openNoteUploadDialog() {
    noteUploadInputRef.current?.click();
  }

  async function handleSetDocsSource(folderPath?: string) {
    const trimmed = (folderPath ?? docsSourceInput).trim();
    if (!trimmed) {
      setDocsSourceError("Please enter a folder path.");
      return;
    }
    setDocsSourceSubmitting(true);
    setDocsSourceError(null);
    try {
      const response = await fetch(`${sidebarApiBase}/api/docs/source`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: trimmed }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to set docs source");
      }
      setDocsSourceInput("");
      setSelectedNoteNodeId(ROOT_NOTE_NODE_ID);
      await loadNotes();
      await loadRecentDocuments();
    } catch (error) {
      setDocsSourceError(error instanceof Error ? error.message : "Failed to set docs source");
    } finally {
      setDocsSourceSubmitting(false);
    }
  }

  async function handlePickDocsFolder() {
    setDocsSourceSubmitting(true);
    setDocsSourceError(null);
    try {
      const response = await fetch(`${sidebarApiBase}/api/docs/pick-folder`, { method: "POST" });
      const text = await response.text();
      let data: { path?: string; error?: string };
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("Server returned an invalid response. Make sure to restart the server.");
      }
      if (!response.ok) {
        throw new Error(data.error || "Folder selection failed");
      }
      if (!data.path) {
        throw new Error("No folder path returned");
      }
      setDocsSourceInput(data.path);
      await handleSetDocsSource(data.path);
    } catch (error) {
      setDocsSourceError(error instanceof Error ? error.message : "Folder selection failed");
    } finally {
      setDocsSourceSubmitting(false);
    }
  }

  async function handleImportNotesFolder() {
    try {
      const response = await fetch(`${sidebarApiBase}/api/docs/import-folder`, { method: "POST" });
      const text = await response.text();
      try {
        JSON.parse(text);
      } catch {
        return;
      }
      if (!response.ok) {
        return;
      }
      await loadNotes();
    } catch {
      // Silently ignore — user likely cancelled the picker
    }
  }

  async function handleCreateDocument() {
    if (section !== "notes" || !noteUploadTarget) {
      return;
    }
    setNoteCreationDialog({
      creationPath: noteUploadTarget.sourcePath,
      kind: "document",
      name: "",
      targetPath: formatNoteTargetLocation(noteUploadTarget.sourcePath),
      selectedTemplate: "blank",
    });
  }

  async function handleCreateFolder() {
    if (section !== "notes" || !noteUploadTarget) {
      return;
    }
    setNoteCreationDialog({
      creationPath: noteUploadTarget.sourcePath,
      kind: "folder",
      name: "",
      targetPath: formatNoteTargetLocation(noteUploadTarget.sourcePath),
    });
  }

  function handleCreateSection() {
    if (section !== "notes") {
      return;
    }

    setNoteCreationDialog({
      creationPath: "",
      kind: "section",
      name: "",
      targetPath: formatNoteTargetLocation(""),
    });
  }

  function handleNoteCreationDialogClose() {
    setNoteCreationDialog({ kind: "closed" });
  }

  function handleNoteCreationDialogChange(name: string) {
    setNoteCreationDialog((current) => (current.kind === "closed" ? current : { ...current, name }));
  }

  function handleNoteCreationDialogTemplateChange(templateId: string) {
    setNoteCreationDialog((current) => (current.kind !== "document" ? current : { ...current, selectedTemplate: templateId }));
  }

  async function handleNoteCreationDialogConfirm() {
    if (section !== "notes" || noteCreationDialog.kind === "closed") {
      return;
    }

    const requestedName = noteCreationDialog.name.trim();
    if (!requestedName) {
      return;
    }

    const creationPath = noteCreationDialog.creationPath;

    if (noteCreationDialog.kind === "document") {
      setNotesStatus(`Creating document in ${noteCreationDialog.targetPath}...`);
      const result = await createNoteDocument(creationPath, requestedName);
      if (!result.ok) {
        return;
      }

      const templateId = noteCreationDialog.kind === "document" ? noteCreationDialog.selectedTemplate : "blank";
      const templateDef = NOTE_TEMPLATES.find((t) => t.id === templateId);
      if (templateDef && "content" in templateDef && templateDef.content) {
        const today = new Date().toISOString().slice(0, 10);
        const filled = templateDef.content.replace(/\{date\}/g, today).replace(/\{title\}/g, requestedName);
        setPendingNoteTemplate(filled);
      }
      setNoteCreationDialog({ kind: "closed" });
      const targetNodeId =
        result.notesData?.tree ? findNoteTreeNodeIdBySourcePath(result.notesData.tree, result.sourcePath) : null;

      if (!targetNodeId) {
        setNotesStatus(`Created ${result.fileName}`);
        return;
      }

      setPendingCreatedNoteSourcePath(result.sourcePath);
      navigateNoteSelection(targetNodeId, "notes");
      return;
    }

    setNotesStatus(`Creating ${noteCreationDialog.kind === "section" ? "section" : "folder"} in ${noteCreationDialog.targetPath}...`);
    const result = await createNoteFolder(creationPath, requestedName);
    if (!result.ok) {
      return;
    }

    setNoteCreationDialog({ kind: "closed" });
    const targetFolderId =
      result.notesData?.tree ? findNoteFolderNodeIdBySourcePath(result.notesData.tree, result.sourcePath) : null;

    if (!targetFolderId) {
      return;
    }

    expandNoteFolders([targetFolderId]);
    navigateNoteSelection(targetFolderId, "notes");
  }

  async function handleNoteUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0 || !noteUploadTarget) {
      event.target.value = "";
      return;
    }

    const targetLabel = noteUploadTarget.label;
    setNotesStatus(`Uploading ${files.length} file${files.length === 1 ? "" : "s"} to ${targetLabel}...`);

    try {
      const uploadFiles = await Promise.all(
        files.map(async (file) => ({
          name: file.name,
          contentBase64: await readFileAsBase64(file),
        })),
      );

      const response = await fetch(`${sidebarApiBase}/api/docs/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetPath: noteUploadTarget.sourcePath,
          files: uploadFiles,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to upload files");
      }

      const result = (await response.json()) as DocsUploadResponse;
      await loadNotes();
      setNotesStatus(
        `Uploaded ${result.uploaded.length} file${result.uploaded.length === 1 ? "" : "s"} to ${targetLabel}. ${
          result.indexedCount
        } markdown file${result.indexedCount === 1 ? "" : "s"} indexed.`,
      );
      navigate({ section: "notes" }, "replace");
    } catch {
      setNotesStatus("Upload failed");
    } finally {
      event.target.value = "";
    }
  }

  async function handleOpenCurrentNotesFolder() {
    try {
      const targetSourcePath =
        (selectedNote?.sourcePath ? getParentSourcePath(selectedNote.sourcePath) : null) ??
        currentFolderContextNode?.sourcePath ??
        noteUploadTarget?.sourcePath ??
        "";
      const folderPath = await resolveAbsoluteNotesFolderPath(targetSourcePath);

      const response = await fetch(`${sidebarApiBase}/api/open-folder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folderPath,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Failed to open folder");
      }

      setNotesStatus("Opened folder in file manager");
    } catch (error) {
      setNotesStatus(error instanceof Error ? error.message : "Failed to open folder");
    }
  }

  function handleAddFolder() {
    setBookmarkDialog({ kind: "add-folder", title: "" });
  }

  function handleAddBookmark() {
    setBookmarkDialog({ kind: "add-bookmark", title: "", url: "", description: "" });
  }

  function handleEditNode(nodeId: string) {
    const node = findNodeById(bookmarkTree, nodeId);
    if (!node) {
      return;
    }

    if (node.type === "folder") {
      setBookmarkDialog({ kind: "edit-folder", nodeId, title: node.title });
      return;
    }

    setBookmarkDialog({
      kind: "edit-bookmark",
      nodeId,
      title: node.title,
      url: node.url,
      description: node.description ?? "",
    });
  }

  function handleDeleteNode(nodeId: string) {
    const node = findNodeById(bookmarkTree, nodeId);
    if (!node) {
      return;
    }

    setBookmarkDialog({ kind: "delete", nodeId, title: node.title });
  }

  function handleBookmarkDialogClose() {
    setBookmarkDialog({ kind: "closed" });
  }

  function handleBookmarkDialogChange(field: "title" | "url" | "description", value: string) {
    setBookmarkDialog((current) => {
      if (current.kind === "closed" || current.kind === "delete") {
        return current;
      }

      return {
        ...current,
        [field]: value,
      };
    });
  }

  function handleBookmarkDialogConfirm() {
    if (bookmarkDialog.kind === "closed") {
      return;
    }

    if (bookmarkDialog.kind === "delete") {
      const nextTree = removeNodeById(bookmarkTree, bookmarkDialog.nodeId);
      const nextSelection = firstTreeNode(nextTree)?.id ?? null;
      navigate({ selectedBookmarkId: nextSelection }, "replace");
      void persistBookmarkTree(nextTree, "Bookmark tree updated");
      handleBookmarkDialogClose();
      return;
    }

    const title = bookmarkDialog.title.trim();
    if (!title) {
      return;
    }

    if (bookmarkDialog.kind === "add-folder") {
      const parentFolderId = getInsertionFolderId(bookmarkTree, selectedBookmarkId);
      const newFolder: BookmarkFolder = {
        id: createNodeId(`folder-${title}-${Date.now()}`),
        type: "folder",
        title,
        children: [],
      };

      const nextTree = insertNodeIntoFolder(bookmarkTree, parentFolderId, newFolder);
      navigateBookmarkSelection(newFolder.id);
      void persistBookmarkTree(nextTree, "Folder added");
      handleBookmarkDialogClose();
      return;
    }

    if (bookmarkDialog.kind === "edit-folder") {
      const nextTree = updateNodeById(bookmarkTree, bookmarkDialog.nodeId, (current) =>
        current.type === "folder" ? { ...current, title } : current,
      );
      void persistBookmarkTree(nextTree, "Folder updated");
      handleBookmarkDialogClose();
      return;
    }

    const url = bookmarkDialog.url.trim();
    if (!url) {
      return;
    }

    if (bookmarkDialog.kind === "add-bookmark") {
      const description = bookmarkDialog.description.trim();
      const parentFolderId = getInsertionFolderId(bookmarkTree, selectedBookmarkId);
      const newBookmark: BookmarkLeaf = {
        id: createNodeId(`bookmark-${url}-${Date.now()}`),
        type: "bookmark",
        title,
        description,
        url,
        domain: safeDomain(url),
        icon: createIcon(title),
        tags: [],
        starred: false,
      };

      const nextTree = insertNodeIntoFolder(bookmarkTree, parentFolderId, newBookmark);
      navigateBookmarkSelection(newBookmark.id);
      void persistBookmarkTree(nextTree, "Bookmark added");
      handleBookmarkDialogClose();
      return;
    }

    const description = bookmarkDialog.description.trim();
    const nextTree = updateNodeById(bookmarkTree, bookmarkDialog.nodeId, (current) =>
      current.type === "bookmark"
        ? {
            ...current,
            title,
            url,
            domain: safeDomain(url),
            description,
            icon: current.icon.startsWith("data:image") ? current.icon : createIcon(title),
          }
        : current,
    );
    void persistBookmarkTree(nextTree, "Bookmark updated");
    handleBookmarkDialogClose();
  }

  function handleDropOnNode(targetId: string, placement: "before" | "inside") {
    if (!draggedBookmarkId || draggedBookmarkId === targetId) {
      return;
    }

    const nextTree = moveBookmarkNode(bookmarkTree, draggedBookmarkId, targetId, placement);
    if (nextTree === bookmarkTree) {
      setDraggedBookmarkId(null);
      return;
    }

    setDraggedBookmarkId(null);
    void persistBookmarkTree(nextTree, "Bookmark order saved");
  }

  function toggleFolder(folderId: string) {
    setExpandedFolderIds((current) => {
      const next = new Set(current);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }

  function handleSearchInputChange(value: string) {
    const inferredSectionScope =
      section === "bookmarks"
        ? "wiki"
        : section === "notes" || section === "wiki"
          ? section
          : null;
    const nextState =
      searchScope || searchNoteSectionScope || searchFolderScopePath.length > 0
        ? consumeScopedSearchInputWithCurrentScopes(value, searchScope, searchNoteSectionScope, searchFolderScopePath)
        : consumeScopedSearchInputWithDefaultSection(value, inferredSectionScope);
    const nextSuggestionFolderPaths = collectFolderSuggestionPaths(
      nextState.sectionScope === "wiki"
        ? wikiTree
        : nextState.sectionScope === "notes"
          ? findNoteSectionByScope(noteSections, nextState.noteSectionScope)?.children ?? resolvedNotesTree
          : section === "wiki" || section === "bookmarks"
            ? wikiTree
            : resolvedNotesTree,
    );
    const nextSuggestions = getScopeTokenSuggestions({
      currentSection: section,
      folderPaths: nextSuggestionFolderPaths,
      inputValue: nextState.text,
      noteSections: noteSections.map((noteSection) => ({ label: noteSection.title, value: noteSection.scopeValue })),
      sectionOptions: navOrder,
      sectionScope: nextState.sectionScope,
    });

    if (nextSuggestions.length === 1) {
      applySearchScopeSuggestion(nextSuggestions[0], nextState.sectionScope);
      setIsSearchScopePopupDismissed(false);
      setIsSearchPopupDismissed(false);
      return;
    }

    setSearchScope(nextState.sectionScope);
    setSearchNoteSectionScope(nextState.noteSectionScope);
    setSearchFolderScopePath(nextState.folderScopePath);
    setSearchText(nextState.text);
    setIsSearchScopePopupDismissed(false);
    setIsSearchPopupDismissed(false);
  }

  function applySearchScopeSuggestion(
    suggestion: ReturnType<typeof getScopeTokenSuggestions>[number],
    pendingSectionScope: SectionId | null = searchScope,
  ) {
    if (suggestion.kind === "section") {
      setSearchScope(suggestion.value);
      setSearchNoteSectionScope(null);
      setSearchFolderScopePath([]);
      setSearchText("");
      setIsSearchScopePopupDismissed(false);
      setIsSearchPopupDismissed(false);
      return;
    }

    if (suggestion.kind === "note-section") {
      setSearchScope("notes");
      setSearchNoteSectionScope(suggestion.value);
      setSearchFolderScopePath([]);
      setSearchText("");
      setIsSearchScopePopupDismissed(false);
      setIsSearchPopupDismissed(false);
      return;
    }

    const effectiveSectionScope =
      pendingSectionScope === "notes" || pendingSectionScope === "wiki"
        ? pendingSectionScope
        : section === "bookmarks"
          ? "wiki"
          : section === "notes" || section === "wiki"
            ? section
            : null;
    setSearchScope(effectiveSectionScope);
    setSearchFolderScopePath(suggestion.path);
    setSearchText("");
    setIsSearchScopePopupDismissed(false);
    setIsSearchPopupDismissed(false);
  }

  function handleSearchInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (isSearchScopePopupOpen) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveSearchScopeSuggestionIndex((current) => (current + 1) % searchScopeSuggestions.length);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveSearchScopeSuggestionIndex((current) =>
          current === 0 ? searchScopeSuggestions.length - 1 : current - 1,
        );
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        const suggestion = searchScopeSuggestions[activeSearchScopeSuggestionIndex];
        if (suggestion) {
          applySearchScopeSuggestion(suggestion);
        }
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setIsSearchScopePopupDismissed(true);
        return;
      }
    }

    if (isDocumentSuggestionPopupOpen && documentSuggestionEntries.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveSearchScopeSuggestionIndex((current) => (current + 1) % documentSuggestionEntries.length);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveSearchScopeSuggestionIndex((current) =>
          current === 0 ? documentSuggestionEntries.length - 1 : current - 1,
        );
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        const suggestion = documentSuggestionEntries[activeSearchScopeSuggestionIndex];
        if (suggestion) {
          handleSearchEntrySelect(suggestion);
        }
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setIsSearchPopupDismissed(true);
        return;
      }
    }

    if (event.key === "Escape") {
      setIsSearchPopupDismissed(true);
      event.currentTarget.blur();
    }
    if (event.key === "Backspace" && !searchText && searchFolderScopePath.length > 0) {
      setSearchFolderScopePath([]);
      setIsSearchPopupDismissed(false);
    } else if (event.key === "Backspace" && !searchText && searchNoteSectionScope) {
      setSearchNoteSectionScope(null);
      setSearchFolderScopePath([]);
      setIsSearchPopupDismissed(false);
    } else if (event.key === "Backspace" && !searchText && searchScope) {
      setSearchScope(null);
      setSearchNoteSectionScope(null);
      setSearchFolderScopePath([]);
      setIsSearchPopupDismissed(false);
    }
  }

  function handleSearchEntrySelect(entry: SearchEntry) {
    if (entry.category === "bookmark" && entry.targetUrl) {
      window.open(entry.targetUrl, "_blank", "noopener,noreferrer");
      setIsSearchPopupDismissed(true);
      return;
    }

    if (entry.category === "todo" && entry.targetId) {
      navigateTodoSelection(entry.targetId);
      setIsSearchPopupDismissed(true);
      return;
    }

    if ((entry.category === "note" || entry.category === "wiki" || entry.category === "code") && entry.targetId) {
      navigateNoteSelection(
        entry.targetId,
        normalizeVisibleSection(entry.targetSection ?? (entry.category === "wiki" ? "wiki" : "notes")),
      );
      setIsSearchPopupDismissed(true);
      return;
    }

    if (entry.category === "tag") {
      setSearchScope(null);
      setSearchNoteSectionScope(null);
      setSearchText(entry.targetQuery ?? entry.title.replace(/^#/, ""));
    }

    setIsSearchPanelOpen(true);
    setIsSearchPopupDismissed(true);
  }

  function openSearchSurface() {
    setIsCommandPaletteOpen(false);
    setIsStarredPanelOpen(false);
    setIsRecentPanelOpen(false);
    setIsSearchPopupDismissed(false);
    setIsSearchScopePopupDismissed(false);

    if (prefs.searchInterface === "palette") {
      setIsSearchPanelOpen(false);
      setIsSearchDialogOpen(true);
      return;
    }

    setIsSearchDialogOpen(false);
    setIsSearchPanelOpen(true);
    requestAnimationFrame(() => {
      topbarSearchInputRef.current?.focus();
      topbarSearchInputRef.current?.select();
    });
  }

  function handleSearchDialogEntrySelect(entry: SearchEntry) {
    handleSearchEntrySelect(entry);
    if (entry.category !== "tag") {
      setIsSearchDialogOpen(false);
    }
  }

  function handleAddSavedSearch() {
    const currentQuery = query.trim();
    if (!currentQuery) return;
    const label = window.prompt("Name this smart view", currentQuery);
    if (!label) return;
    const newSearch: SavedSearch = {
      id: `search-${Date.now()}`,
      label: label.trim(),
      query: currentQuery,
    };
    setSavedSearches((current) => [...current, newSearch]);
  }

  function handleDeleteSavedSearch(id: string) {
    setSavedSearches((current) => current.filter((s) => s.id !== id));
  }

  function handleApplySavedSearch(savedSearch: SavedSearch) {
    const parsed = consumeScopedSearchInputWithDefaultSection(savedSearch.query, null);
    setSearchScope(parsed.sectionScope);
    setSearchNoteSectionScope(parsed.noteSectionScope);
    setSearchFolderScopePath(parsed.folderScopePath);
    setSearchText(parsed.text);
    setIsSearchPanelOpen(true);
    setIsSearchPopupDismissed(true);
  }

  function handleRestoreNoteVersion(version: NoteVersion) {
    if (!versionHistoryNote || !canEditNote(versionHistoryNote)) return;
    setNoteDraft(version.content);
    setIsNoteEditing(true);
    setIsVersionHistoryOpen(false);
  }

  function handlePinNote(noteId: string) {
    setPinnedNoteIds((current) => (current.includes(noteId) ? current : [...current, noteId]));
  }

  function handleUnpinNote(noteId: string) {
    setPinnedNoteIds((current) => current.filter((id) => id !== noteId));
  }

  // ── Trash handlers ──
  const loadTrashEntries = useCallback(async () => {
    try {
      const res = await fetch(`${sidebarApiBase}/api/docs/trash`);
      if (res.ok) {
        const data = await res.json() as { entries: TrashEntry[] };
        setTrashEntries(data.entries ?? []);
      }
    } catch { /* ignore */ }
  }, []);

  async function handleTrashNote(note: Note) {
    if (!note.sourcePath) return;
    try {
      await fetch(`${sidebarApiBase}/api/docs/trash`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourcePath: note.sourcePath }),
      });
      await loadNotes();
      await loadTrashEntries();
    } catch { /* ignore */ }
  }

  async function handleRestoreFromTrash(id: string) {
    try {
      await fetch(`${sidebarApiBase}/api/docs/trash/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      await loadNotes();
      await loadTrashEntries();
    } catch { /* ignore */ }
  }

  async function handlePurgeTrashEntry(id: string | null) {
    try {
      await fetch(`${sidebarApiBase}/api/docs/trash/purge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(id ? { id } : { all: true }),
      });
      await loadTrashEntries();
    } catch { /* ignore */ }
  }

  // ── Daily note handler ──
  async function handleOpenDailyNote(date: string) {
    setDailyNoteDate(date);
    try {
      const res = await fetch(`${sidebarApiBase}/api/docs/daily?date=${encodeURIComponent(date)}`);
      if (res.ok) {
        const data = await res.json() as { sourcePath: string };
        await loadNotes();
        const note = notes.find((n) => n.sourcePath === data.sourcePath);
        if (note) openNote(note);
      }
    } catch { /* ignore */ }
  }

  // ── Workspace handlers ──
  const loadWorkspaces = useCallback(async () => {
    try {
      const res = await fetch(`${sidebarApiBase}/api/workspaces`);
      if (res.ok) {
        const data = await res.json() as { workspaces: WorkspaceInfo[] };
        setWorkspaces(data.workspaces ?? []);
      }
    } catch { /* ignore */ }
  }, []);

  async function handleWorkspaceAction(action: "add" | "switch" | "remove", workspace?: Partial<WorkspaceInfo>) {
    try {
      await fetch(`${sidebarApiBase}/api/workspaces`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...workspace }),
      });
      await loadWorkspaces();
      if (action === "switch") {
        await Promise.all([loadNotes(), loadBookmarks(), loadTodoItems(), loadRecentDocuments(), loadTrashEntries()]);
      }
    } catch { /* ignore */ }
  }

  // ── Reminder check effect ──
  useEffect(() => {
    const interval = setInterval(() => {
      const due = getDueTodoReminders(todoItems, new Date());
      if (due.length > 0) setReminderNotifications(due);
    }, 30_000);
    return () => clearInterval(interval);
  }, [todoItems]);

  // ── Load trash + workspaces after notes are available ──
  useEffect(() => {
    if (!hasLoadedNotes || notes.length === 0) return;
    void loadTrashEntries();
    void loadWorkspaces();
  }, [hasLoadedNotes, notes.length, loadTrashEntries, loadWorkspaces]);

  // ── Graph data memo ──
  const graphData = useMemo(() => {
    const idByTitle = new Map(notes.map((n) => [n.title.toLowerCase(), n.id]));
    const linkCounts = new Map<string, number>();
    const links: { source: string; target: string }[] = [];
    for (const note of notes) {
      const body = note.content ?? "";
      const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
      let m;
      while ((m = wikiLinkRegex.exec(body)) !== null) {
        const targetId = idByTitle.get(m[1].toLowerCase());
        if (targetId && targetId !== note.id) {
          links.push({ source: note.id, target: targetId });
          linkCounts.set(note.id, (linkCounts.get(note.id) ?? 0) + 1);
          linkCounts.set(targetId, (linkCounts.get(targetId) ?? 0) + 1);
        }
      }
    }
    const graphNodes = notes.map((n) => ({
      id: n.id,
      title: n.title,
      sourcePath: n.sourcePath ?? "",
      linkCount: linkCounts.get(n.id) ?? 0,
    }));
    return { nodes: graphNodes, links };
  }, [notes]);

  const buildRestorePointSnapshot = useCallback(
    (label: string, isAutomatic: boolean, now = Date.now()): WorkspaceBackupSnapshot =>
      buildWorkspaceBackupSnapshot({
        label,
        isAutomatic,
        notes,
        bookmarks: bookmarkTree,
        todo: buildTodoPayload(todoItems, todoViewMode, selectedTodoId),
        recentDocuments: intelligentRecentDocuments,
        savedSearches,
        pinnedNoteIds,
        prefs,
        sidebarOrder: navOrder,
        now,
      }),
    [bookmarkTree, intelligentRecentDocuments, navOrder, notes, pinnedNoteIds, prefs, savedSearches, selectedTodoId, todoItems, todoViewMode],
  );

  const createRestorePoint = useCallback(
    async ({ label, isAutomatic }: { label: string; isAutomatic: boolean }) => {
      const snapshot = buildRestorePointSnapshot(label, isAutomatic);
      const fingerprint = getWorkspaceBackupSnapshotFingerprint(snapshot);
      const response = await fetch(`${sidebarApiBase}/api/restore-points`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
      });

      if (!response.ok) {
        throw new Error("Failed to create restore point");
      }

      lastRestorePointFingerprintRef.current = fingerprint;

      if (isExportImportOpen) {
        await loadRestorePoints();
      }
    },
    [buildRestorePointSnapshot, isExportImportOpen, loadRestorePoints, sidebarApiBase],
  );

  const restorePointFingerprint = useMemo(
    () => getWorkspaceBackupSnapshotFingerprint(buildRestorePointSnapshot("Automatic restore point", true, 0)),
    [buildRestorePointSnapshot],
  );

  useEffect(() => {
    if (!isExportImportOpen) {
      return;
    }

    void loadRestorePoints();
  }, [isExportImportOpen, loadRestorePoints]);

  useEffect(() => {
    if (!hasLoadedNotes || !hasLoadedBookmarks || isRestoringRestorePoint) {
      return;
    }

    if (restorePointFingerprint === lastRestorePointFingerprintRef.current) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void createRestorePoint({ label: "Automatic restore point", isAutomatic: true }).catch(() => {});
    }, 1200);

    return () => window.clearTimeout(timeoutId);
  }, [createRestorePoint, hasLoadedBookmarks, hasLoadedNotes, isRestoringRestorePoint, restorePointFingerprint]);

  async function handleCreateRestorePoint() {
    const defaultLabel = `Restore point ${new Date().toLocaleString()}`;
    const label = window.prompt("Name this restore point", defaultLabel);
    if (label === null) {
      return;
    }

    try {
      await createRestorePoint({ label, isAutomatic: false });
      window.alert("Restore point created.");
    } catch {
      window.alert("Failed to create restore point.");
    }
  }

  async function handleRestoreRestorePoint(restorePointId: string) {
    const confirmed = window.confirm(
      "Restore this snapshot? This will overwrite bookmarks, tasks, recents, smart views, and matching note files captured in the restore point.",
    );
    if (!confirmed) {
      return;
    }

    setIsRestoringRestorePoint(true);

    try {
      const response = await fetch(`${sidebarApiBase}/api/restore-points/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: restorePointId }),
      });
      if (!response.ok) {
        throw new Error("Failed to restore restore point");
      }

      const data = (await response.json()) as { snapshot: WorkspaceBackupSnapshot };
      const snapshot = data.snapshot;

      setSavedSearches(snapshot.savedSearches);
      setPrefs(snapshot.prefs);
      setPinnedNoteIds(snapshot.pinnedNoteIds);
      setNavOrder(normalizeNavOrder(snapshot.sidebarOrder));
      lastRestorePointFingerprintRef.current = getWorkspaceBackupSnapshotFingerprint(snapshot);

      await Promise.all([loadSidebarOrder(), loadNotes(), loadBookmarks(), loadTodoItems(), loadRecentDocuments(), loadTrashEntries()]);
      await loadRestorePoints();
      setIsExportImportOpen(false);
      window.alert("Restore point applied.");
    } catch {
      window.alert("Failed to restore restore point.");
    } finally {
      setIsRestoringRestorePoint(false);
    }
  }

  async function importNotesSnapshot(notesSnapshot: WorkspaceBackupSnapshot["notes"], starredNotePaths: string[]) {
    const response = await fetch(`${sidebarApiBase}/api/notes/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: notesSnapshot, starredNotePaths }),
    });

    if (!response.ok) {
      throw new Error("Failed to import notes snapshot");
    }
  }

  async function applyWorkspaceImportSnapshot(snapshot: WorkspaceBackupSnapshot) {
    await importNotesSnapshot(snapshot.notes, snapshot.starredNotePaths);

    await Promise.all([
      fetch(`${sidebarApiBase}/api/bookmarks/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tree: snapshot.bookmarks }),
      }),
      fetch(`${sidebarApiBase}/api/todo-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot.todo),
      }),
      fetch(`${sidebarApiBase}/api/recent-documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: snapshot.recentDocuments }),
      }),
      fetch(`${sidebarApiBase}/api/sidebar-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: snapshot.sidebarOrder }),
      }),
    ]);

    setSavedSearches(snapshot.savedSearches);
    setPrefs(snapshot.prefs);
    setPinnedNoteIds(snapshot.pinnedNoteIds);
    setNavOrder(normalizeNavOrder(snapshot.sidebarOrder));
    lastRestorePointFingerprintRef.current = getWorkspaceBackupSnapshotFingerprint(snapshot);

    await Promise.all([loadSidebarOrder(), loadNotes(), loadBookmarks(), loadTodoItems(), loadRecentDocuments(), loadTrashEntries()]);
  }

  function downloadJsonFile(fileName: string, payload: ExportPack) {
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const exportActions = useMemo(
    () => [
      { id: "workspace", label: "Full workspace snapshot", description: "Notes, bookmarks, tasks, recents, smart views, and preferences." },
      { id: "notes", label: "Notes", description: "Markdown content plus starred note paths." },
      { id: "bookmarks", label: "Bookmarks", description: "Bookmark tree only." },
      { id: "todo", label: "Tasks", description: "Tasks, selected task, and task view mode." },
      { id: "recents", label: "Recents", description: "Opened, edited, completed, and pinned recent activity." },
      { id: "smart-views", label: "Smart views", description: "Saved search definitions." },
      { id: "preferences", label: "Preferences", description: "App preferences, pinned notes, and sidebar order." },
    ],
    [],
  );

  function handleExportPack(kind: string) {
    const exportedAt = Date.now();

    if (kind === "workspace") {
      downloadJsonFile(
        `organizer-workspace-${new Date(exportedAt).toISOString().slice(0, 10)}.json`,
        {
          version: 1,
          kind: "workspace",
          exportedAt,
          snapshot: buildRestorePointSnapshot(`Workspace export ${new Date(exportedAt).toLocaleString()}`, false, exportedAt),
        },
      );
      return;
    }

    if (kind === "notes") {
      const snapshot = buildRestorePointSnapshot("Notes export", false, exportedAt);
      downloadJsonFile(`organizer-notes-${new Date(exportedAt).toISOString().slice(0, 10)}.json`, {
        version: 1,
        kind: "notes",
        exportedAt,
        notes: snapshot.notes,
        starredNotePaths: snapshot.starredNotePaths,
      });
      return;
    }

    if (kind === "bookmarks") {
      downloadJsonFile(`organizer-bookmarks-${new Date(exportedAt).toISOString().slice(0, 10)}.json`, {
        version: 1,
        kind: "bookmarks",
        exportedAt,
        bookmarks: bookmarkTree,
      });
      return;
    }

    if (kind === "todo") {
      downloadJsonFile(`organizer-tasks-${new Date(exportedAt).toISOString().slice(0, 10)}.json`, {
        version: 1,
        kind: "todo",
        exportedAt,
        todo: buildTodoPayload(todoItems, todoViewMode, selectedTodoId),
      });
      return;
    }

    if (kind === "recents") {
      downloadJsonFile(`organizer-recents-${new Date(exportedAt).toISOString().slice(0, 10)}.json`, {
        version: 1,
        kind: "recents",
        exportedAt,
        recentDocuments: intelligentRecentDocuments,
      });
      return;
    }

    if (kind === "smart-views") {
      downloadJsonFile(`organizer-smart-views-${new Date(exportedAt).toISOString().slice(0, 10)}.json`, {
        version: 1,
        kind: "smart-views",
        exportedAt,
        savedSearches,
      });
      return;
    }

    if (kind === "preferences") {
      downloadJsonFile(`organizer-preferences-${new Date(exportedAt).toISOString().slice(0, 10)}.json`, {
        version: 1,
        kind: "preferences",
        exportedAt,
        prefs,
        pinnedNoteIds,
        sidebarOrder: navOrder,
      });
    }
  }

  async function handleImportPackFile(file: File) {
    try {
      const text = await file.text();
      const pack = JSON.parse(text) as ExportPack | LegacyExportPack;
      if (pack.version !== 1) {
        window.alert("Unrecognized export format.");
        return;
      }

      if (!("kind" in pack)) {
        if (Array.isArray(pack.bookmarks) && pack.bookmarks.length > 0) {
          const response = await fetch(`${sidebarApiBase}/api/bookmarks/import`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tree: pack.bookmarks }),
          });
          if (response.ok) {
            await loadBookmarks();
          }
        }
        if (Array.isArray(pack.savedSearches)) {
          setSavedSearches(pack.savedSearches);
        }
        setIsExportImportOpen(false);
        const noteCount = pack.noteMetadata?.length ?? 0;
        const bookmarkCount = Array.isArray(pack.bookmarks) ? pack.bookmarks.length : 0;
        window.alert(`Import complete — ${noteCount} notes indexed, ${bookmarkCount} bookmark root node(s) restored.`);
        return;
      }

      if (pack.kind === "workspace") {
        await applyWorkspaceImportSnapshot(pack.snapshot);
        setIsExportImportOpen(false);
        window.alert(`Workspace import complete — ${pack.snapshot.notes.length} notes, ${pack.snapshot.todo.items.length} tasks, ${pack.snapshot.recentDocuments.length} recents restored.`);
        return;
      }

      if (pack.kind === "notes") {
        await importNotesSnapshot(pack.notes, pack.starredNotePaths);
        await loadNotes();
        setIsExportImportOpen(false);
        window.alert(`Imported ${pack.notes.length} note file(s).`);
        return;
      }

      if (pack.kind === "bookmarks") {
        const response = await fetch(`${sidebarApiBase}/api/bookmarks/import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tree: pack.bookmarks }),
        });
        if (response.ok) {
          await loadBookmarks();
        }
        setIsExportImportOpen(false);
        window.alert("Bookmark import complete.");
        return;
      }

      if (pack.kind === "todo") {
        await fetch(`${sidebarApiBase}/api/todo-items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pack.todo),
        });
        await loadTodoItems();
        setIsExportImportOpen(false);
        window.alert(`Imported ${pack.todo.items.length} task(s).`);
        return;
      }

      if (pack.kind === "recents") {
        await fetch(`${sidebarApiBase}/api/recent-documents`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entries: pack.recentDocuments }),
        });
        await loadRecentDocuments();
        setIsExportImportOpen(false);
        window.alert(`Imported ${pack.recentDocuments.length} recent activity item(s).`);
        return;
      }

      if (pack.kind === "smart-views") {
        setSavedSearches(pack.savedSearches);
        setIsExportImportOpen(false);
        window.alert(`Imported ${pack.savedSearches.length} smart view(s).`);
        return;
      }

      if (pack.kind === "preferences") {
        setPrefs(pack.prefs);
        setPinnedNoteIds(pack.pinnedNoteIds);
        setNavOrder(normalizeNavOrder(pack.sidebarOrder));
        await fetch(`${sidebarApiBase}/api/sidebar-order`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: pack.sidebarOrder }),
        });
        setIsExportImportOpen(false);
        window.alert("Preferences import complete.");
        return;
      }

      setIsExportImportOpen(false);
      window.alert("Import complete.");
    } catch {
      window.alert("Failed to import pack. The file may be corrupted or invalid.");
    }
  }

  return (
    <div
      className={`app-shell ${immersiveChromeState.isSidebarCollapsed ? "app-shell--sidebar-collapsed" : ""} ${
        isMarkdownImmersive ? "app-shell--immersive" : ""
      }`}
    >
      <aside className={`sidebar ${immersiveChromeState.isSidebarCollapsed ? "is-collapsed" : ""}`}>
        <button
          className="sidebar__toggle"
          onClick={() => setIsSidebarCollapsed((current) => !current)}
          type="button"
        >
          {immersiveChromeState.isSidebarCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
          <span>{immersiveChromeState.isSidebarCollapsed ? "Expand" : "Collapse"}</span>
        </button>

        <div className="brand">
          <div className="brand__badge">
            <img alt="Organizer logo" src="/assets/organizer-logo.svg" />
          </div>
          <div className="brand__copy">
            <p className="eyebrow">Personal Knowledge</p>
            <h1>Organizer</h1>
          </div>
        </div>

        <button
          className="import-button"
          type="button"
          onClick={handleImportNotesFolder}
          disabled={shouldUseManualPaths || notes.length === 0}
        >
          <FolderPlus size={14} />
          <span>Import notes</span>
        </button>
        <button className="import-button" type="button" disabled={notes.length === 0} onClick={() => bookmarkImportInputRef.current?.click()}>
          <Download size={14} />
          <span>Import bookmarks</span>
        </button>
        <input
          ref={bookmarkImportInputRef}
          className="hidden-input"
          type="file"
          accept=".html,text/html"
          onChange={handleBookmarkImport}
        />
        <input ref={noteUploadInputRef} className="hidden-input" type="file" multiple onChange={handleNoteUpload} />
        {shouldUseManualPaths ? (
          <p className="sidebar__folder-path-note">
            Windows browser build: enter note and metadata paths manually. Additional note-folder import is unavailable.
          </p>
        ) : null}

        <nav className="sidebar__nav">
          {orderedNavItems.map((item) => {
            const Icon = item.icon;
            const isDisabled = (item.id === "bookmarks" || item.id === "todo" || item.id === "starred" || item.id === "recent") && notes.length === 0;
            return (
              <button
                key={item.id}
                disabled={isDisabled}
                className={`nav-item ${
                  section === item.id ||
                  (item.id === "starred" && (isStarredPanelOpen || openFeedPopup === "starred")) ||
                  (item.id === "recent" && (isRecentPanelOpen || openFeedPopup === "recent"))
                    ? "is-active"
                    : ""
                } ${item.id === "notes" && notes.length === 0 ? "nav-item--glow" : ""} ${draggedSection === item.id ? "is-dragging" : ""} ${
                  dropTarget?.id === item.id ? `drop-${dropTarget.position}` : ""
                }`}
                draggable
                onClick={() => {
                  if (prefs.feedsMode === "panel" && (item.id === "starred" || item.id === "recent")) {
                    if (item.id === "starred") {
                      setIsStarredPanelOpen((prev) => !prev);
                      setIsRecentPanelOpen(false);
                    } else {
                      setIsRecentPanelOpen((prev) => !prev);
                      setIsStarredPanelOpen(false);
                    }
                  } else if (prefs.feedsMode === "popup" && (item.id === "starred" || item.id === "recent")) {
                    setOpenFeedPopup((prev) => (prev === item.id ? null : item.id as "starred" | "recent"));
                  } else {
                    setIsStarredPanelOpen(false);
                    setIsRecentPanelOpen(false);
                    setOpenFeedPopup(null);
                    navigateSection(item.id);
                  }
                }}
                onDragStart={() => setDraggedSection(item.id)}
                onDragEnd={() => { setDraggedSection(null); setDropTarget(null); }}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (!draggedSection || draggedSection === item.id) { return; }
                  const rect = event.currentTarget.getBoundingClientRect();
                  const midY = rect.top + rect.height / 2;
                  const position = event.clientY < midY ? "before" : "after";
                  setDropTarget((prev) => prev?.id === item.id && prev.position === position ? prev : { id: item.id, position });
                }}
                onDragLeave={() => { if (dropTarget?.id === item.id) { setDropTarget(null); } }}
                onDrop={() => { setDropTarget(null); moveSidebarItem(item.id); }}
                type="button"
              >
                <span className="nav-item__label">
                  {!isSidebarCollapsed ? <GripVertical size={12} className="drag-handle" /> : null}
                  <Icon size={14} />
                  <span className="nav-item__text">{item.label}</span>
                </span>
                {!isSidebarCollapsed ? <span className="nav-item__count">{item.count}</span> : null}
              </button>
            );
          })}
        </nav>

        <div className="sidebar__tools">
          {usesSearchPalette ? (
          <button
            className="sidebar__tool-btn"
            onClick={openSearchSurface}
            title={searchShortcutTitle}
            type="button"
          >
            <Search size={14} />
            {!isSidebarCollapsed ? <span>Search</span> : null}
          </button>
          ) : null}
          <button
            className="sidebar__tool-btn"
            onClick={() => { setCommandPaletteQuery(""); setIsCommandPaletteOpen(true); }}
            title={commandPaletteShortcutTitle}
            type="button"
          >
            <Command size={14} />
            {!isSidebarCollapsed ? <span>Command palette</span> : null}
          </button>
          <button
            className="sidebar__tool-btn"
            onClick={() => setIsTagBrowserOpen((c) => !c)}
            title="Browse tags"
            type="button"
          >
            <Tag size={14} />
            {!isSidebarCollapsed ? <span>Tags ({allTags.length})</span> : null}
          </button>
          <button
            className={`sidebar__tool-btn ${brokenLinksMap.size > 0 ? "is-warning" : ""}`}
            onClick={() => setIsBrokenLinksOpen((c) => !c)}
            title="Check broken links"
            type="button"
          >
            <TriangleAlert size={14} />
            {!isSidebarCollapsed ? <span>Broken links ({brokenLinksMap.size})</span> : null}
          </button>
          <button
            className="sidebar__tool-btn"
            onClick={() => setIsExportImportOpen(true)}
            title="Export / Import pack"
            type="button"
          >
            <Download size={14} />
            {!isSidebarCollapsed ? <span>Export / Import</span> : null}
          </button>
          <button
            className="sidebar__tool-btn"
            onClick={() => { setShowTrashPanel((c) => !c); void loadTrashEntries(); }}
            title="Trash"
            type="button"
          >
            <Trash2 size={14} />
            {!isSidebarCollapsed ? <span>Trash ({trashEntries.length})</span> : null}
          </button>
          <button
            className="sidebar__tool-btn"
            onClick={() => setShowTriagePanel((c) => !c)}
            title="Triage view — due today, stale notes, unsorted bookmarks"
            type="button"
          >
            <Filter size={14} />
            {!isSidebarCollapsed ? <span>Triage</span> : null}
          </button>
          <button
            className="sidebar__tool-btn"
            onClick={() => setIsKeyboardShortcutsOpen((c) => !c)}
            title={keyboardShortcutsTitle}
            type="button"
          >
            <Keyboard size={14} />
            {!isSidebarCollapsed ? <span>Shortcuts</span> : null}
          </button>
          <button
            className="sidebar__tool-btn"
            onClick={() => setIsPrefsOpen(true)}
            title="Preferences"
            type="button"
          >
            <Settings size={14} />
            {!isSidebarCollapsed ? <span>Preferences</span> : null}
          </button>
        </div>

        {savedSearches.length > 0 && !isSidebarCollapsed ? (
          <div className="saved-searches">
            <p className="saved-searches__label">Smart views</p>
            {savedSearches.map((s) => (
              <div key={s.id} className="saved-searches__item">
                <button
                  className="saved-searches__apply"
                  onClick={() => handleApplySavedSearch(s)}
                  type="button"
                  title={s.query}
                >
                  <Search size={12} />
                  {s.label}
                </button>
                <button
                  aria-label={`Delete saved search "${s.label}"`}
                  className="icon-action saved-searches__delete"
                  onClick={() => handleDeleteSavedSearch(s.id)}
                  type="button"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {!isSidebarCollapsed ? (
          <div className="sync-panel">
            <div className="sync-panel__status">
              <span className={`sync-panel__indicator ${isOnline ? "is-online" : "is-offline"}`} title={isOnline ? "Online" : "Offline"} />
              <span className="sync-panel__label">
                {isSyncing
                  ? pendingSyncCount > 0
                    ? `Syncing ${pendingSyncCount} queued`
                    : "Syncing…"
                  : !isOnline
                    ? pendingSyncCount > 0
                      ? `Offline · ${pendingSyncCount} queued`
                      : "Offline"
                    : syncErrorMessage
                      ? syncErrorMessage
                      : pendingSyncCount > 0
                        ? `${pendingSyncCount} pending change${pendingSyncCount === 1 ? "" : "s"}`
                        : lastSyncConflictCount > 0
                          ? `Synced · ${lastSyncConflictCount} conflict${lastSyncConflictCount === 1 ? "" : "s"} resolved`
                          : lastSyncedAt
                            ? `Synced ${new Date(lastSyncedAt).toLocaleTimeString()}`
                            : "Not synced"}
              </span>
              <button
                className="icon-action sync-panel__now"
                disabled={isSyncing}
                onClick={() => void handleSyncAll()}
                title="Sync now"
                type="button"
              >
                <TimerReset size={13} />
              </button>
            </div>
            <div className="sync-panel__interval" role="group" aria-label="Auto-sync interval">
              {SYNC_INTERVAL_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  className={`sync-panel__interval-btn ${syncInterval === opt.value ? "is-active" : ""}`}
                  onClick={() => setSyncInterval(opt.value)}
                  type="button"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

      </aside>

      <main className="main-area">
        {showTopbarSearch ? (
        <header className={`topbar ${immersiveChromeState.isTopbarCollapsed ? "is-collapsed" : ""} ${notes.length === 0 ? "topbar--disabled" : ""}`}>
          <div className="topbar__title">
            <Search size={18} />
            <div>
              <p className="eyebrow">Global search</p>
              <h2>Search notes, wiki pages, bookmarks, TODO items, tags, and snippets</h2>
            </div>
          </div>

          <label className="searchbar" ref={searchbarRef}>
            <Search size={18} />
            {searchScope ? (
              <span className="search-scope-pill">
                in: {getScopeLabel(searchScope)}
                <button
                  aria-label={`Clear ${getScopeLabel(searchScope)} scope`}
                  className="search-scope-pill__clear"
                  onClick={(event) => {
                    event.preventDefault();
                    setSearchScope(null);
                    setSearchNoteSectionScope(null);
                    setSearchFolderScopePath([]);
                    setIsSearchPopupDismissed(false);
                  }}
                  type="button"
                >
                  <X size={12} />
                </button>
              </span>
            ) : null}
            {searchNoteSectionScope ? (
              <span className="search-scope-pill">
                section: {findNoteSectionByScope(noteSections, searchNoteSectionScope)?.title ?? searchNoteSectionScope}
                <button
                  aria-label={`Clear ${findNoteSectionByScope(noteSections, searchNoteSectionScope)?.title ?? searchNoteSectionScope} section scope`}
                  className="search-scope-pill__clear"
                  onClick={(event) => {
                    event.preventDefault();
                    setSearchNoteSectionScope(null);
                    setSearchFolderScopePath([]);
                    setIsSearchPopupDismissed(false);
                  }}
                  type="button"
                >
                  <X size={12} />
                </button>
              </span>
            ) : null}
            {searchFolderScopePath.length > 0 ? (
              <span className="search-scope-pill">
                folder: {searchFolderScopePath.join(" / ")}
                <button
                  aria-label={`Clear ${searchFolderScopePath.join(" / ")} folder scope`}
                  className="search-scope-pill__clear"
                  onClick={(event) => {
                    event.preventDefault();
                    setSearchFolderScopePath([]);
                    setIsSearchPopupDismissed(false);
                  }}
                  type="button"
                >
                  <X size={12} />
                </button>
              </span>
            ) : null}
            <input
              ref={topbarSearchInputRef}
              value={searchText}
              onChange={(event) => handleSearchInputChange(event.target.value)}
              onKeyDown={handleSearchInputKeyDown}
              placeholder="Search across notes, wiki pages, bookmarks, TODO items, tags, code snippets..."
            />
            {isSearchScopePopupOpen ? (
              <div className="searchbar__popup">
                <div className="searchbar__popup-header">
                  <span>Scope suggestions</span>
                  <button
                    aria-label="Close scope suggestions"
                    className="icon-action searchbar__popup-close"
                    onClick={() => setIsSearchScopePopupDismissed(true)}
                    type="button"
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className="searchbar__popup-list">
                  {searchScopeSuggestions.map((suggestion, index) => (
                    <button
                      key={suggestion.id}
                      className={`searchbar__popup-item ${index === activeSearchScopeSuggestionIndex ? "is-active" : ""}`}
                      onClick={() => applySearchScopeSuggestion(suggestion)}
                      onMouseEnter={() => setActiveSearchScopeSuggestionIndex(index)}
                      type="button"
                    >
                      <span className={`category-badge is-${suggestion.kind === "folder" ? "wiki" : "note"}`}>
                        {suggestion.kind === "note-section" ? "section" : suggestion.kind}
                      </span>
                      <span className="searchbar__popup-body">
                        <strong>
                          {suggestion.kind === "section"
                            ? `in: ${suggestion.label}`
                            : suggestion.kind === "note-section"
                              ? `section: ${suggestion.label}`
                              : `folder: ${suggestion.label}`}
                        </strong>
                        <span>
                          {suggestion.kind === "folder"
                            ? suggestion.subtitle ?? "Folder scope"
                            : suggestion.kind === "note-section"
                              ? "Scope search to this notes section"
                            : "Scope search to this section"}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : isDocumentSuggestionPopupOpen ? (
              <div className="searchbar__popup">
                <div className="searchbar__popup-header">
                  <span>Suggestions</span>
                  <div className="inline-actions">
                    <button
                      className="searchbar__popup-action"
                      onClick={() => {
                        setIsSearchPanelOpen(true);
                        setIsSearchPopupDismissed(true);
                      }}
                      type="button"
                    >
                      View all
                    </button>
                    <button
                      className="searchbar__popup-action"
                      onClick={handleAddSavedSearch}
                      title="Save this search"
                      type="button"
                    >
                      + Save
                    </button>
                    <button
                      aria-label="Close quick matches"
                      className="icon-action searchbar__popup-close"
                      onClick={() => setIsSearchPopupDismissed(true)}
                      type="button"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
                <div className="searchbar__popup-list">
                  {documentSuggestionEntries.map((entry, index) => (
                    <button
                      key={entry.id}
                      className={`searchbar__popup-item ${index === activeSearchScopeSuggestionIndex ? "is-active" : ""}`}
                      onClick={() => handleSearchEntrySelect(entry)}
                      onMouseEnter={() => setActiveSearchScopeSuggestionIndex(index)}
                      type="button"
                    >
                      <span className={`category-badge is-${entry.category}`}>{entry.category}</span>
                      <span className="searchbar__popup-body">
                        <strong>{entry.title}</strong>
                        <span>{entry.subtitle}</span>
                      </span>
                      <span className="searchbar__popup-meta">{entry.scoreText}</span>
                    </button>
                  ))}
                  {documentSuggestionEntries.length === 0 ? (
                    <div className="searchbar__popup-empty">No matches for "{query}"</div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </label>
        </header>
        ) : null}

        <section
          className={`dashboard-grid ${(showSearchResultsPanel || showStarredPanel || showRecentPanel) ? "is-search-open" : "is-search-collapsed"} ${
            useSingleColumnDashboard ? "is-single-column" : ""
          }`}
        >
          <div
            className={`card hero-card ${
              section === "bookmarks" && bookmarkRenderMode === "menu" ? "hero-card--menu" : ""
            } ${isMarkdownImmersive ? "is-immersive" : ""}`}
          >
            {((section === "notes" || section === "wiki") && hasLoadedNotes && notes.length === 0) || (section === "bookmarks" && hasLoadedBookmarks && bookmarkTree.length === 0) ? null : (
            <div className={`card__header ${section === "notes" || section === "todo" || section === "starred" || section === "recent" ? "hero-card__header--divided" : ""}`.trim()}>
              <div className="hero-card__header-main">
                <div aria-label="Navigation history" className="history-rail" role="group">
                  <button
                    aria-label="Go back"
                    className="history-action"
                    disabled={!canGoBack}
                    onClick={() => handleHistoryNavigation(-1)}
                    type="button"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    aria-label="Go forward"
                    className="history-action"
                    disabled={!canGoForward}
                    onClick={() => handleHistoryNavigation(1)}
                    type="button"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
                <div className="hero-card__header-copy">
                  <p className="eyebrow">
                    {section === "bookmarks"
                      ? "Bookmarks + wiki"
                      : section === "todo"
                        ? "Task workspace"
                      : section === "notes"
                        ? "Notes hierarchy"
                        : section === "wiki"
                          ? "Wiki hierarchy"
                          : viewerContent.eyebrow}
                  </p>
                  <h3>
                    {section === "bookmarks"
                      ? selectedNote?.title ??
                        (selectedNoteTreeNode?.type === "folder" ? selectedNoteTreeNode.title : null) ??
                        selectedBookmarkNode?.title ??
                        "Bookmarks"
                      : section === "todo"
                        ? selectedTodo?.title ?? "TODO"
                      : section === "notes" || section === "wiki"
                        ? selectedNote?.title ??
                          (selectedNoteTreeNode?.type === "folder" ? selectedNoteTreeNode.title : null) ??
                          (section === "wiki" ? "Wiki map" : "Notes map")
                        : viewerContent.title}
                  </h3>
                  {section === "notes" || section === "wiki" ? (
                    <div className="hero-card__header-subcopy notes-actions__target-text">
                        <button
                          aria-label="Open folder in file manager"
                          className="hero-card__folder-button"
                          onClick={() => {
                            void handleOpenCurrentNotesFolder();
                          }}
                          title="Open folder in file manager"
                          type="button"
                        >
                          <FolderOpen size={13} />
                        </button>
                      <span>
                        {section === "notes" && notesNavigationMode === "section" && activeNoteSection
                          ? `Section: ${activeNoteSection.title}`
                          : section === "notes" && noteUploadTarget
                            ? `Target: ${noteUploadTarget.label}`
                            : query.trim()
                              ? "Filtered by search"
                              : "Focus view"}
                      </span>
                    </div>
                  ) : null}
                  {section === "todo" && todoStoragePath ? (
                    <div className="hero-card__header-subcopy notes-actions__target-text">
                      <button
                        className="todo-storage-path-button"
                        onClick={() => {
                          void fetch(`${sidebarApiBase}/api/open-folder`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ folderPath: todoStoragePath }),
                          });
                        }}
                        title="Open in file manager"
                        type="button"
                      >
                        <FolderOpen size={13} />
                      </button>
                      <span>{todoStoragePath}</span>
                    </div>
                  ) : null}
                </div>
                {section === "todo" ? (
                  <>
                    <div className="inline-actions todo-hero-actions" role="group" aria-label="Todo view controls">
                      <button className="mini-action" disabled={!todoStoragePath} onClick={() => void handleAddTodo(null, true)} type="button">
                        <Plus size={14} />
                        New task
                      </button>
                      <button
                        className="mini-action"
                        disabled={!todoStoragePath}
                        onClick={() => handleSetTodoViewMode(todoViewMode === "list" ? "calendar" : "list")}
                        type="button"
                      >
                        {todoViewMode === "list" ? <CalendarDays size={14} /> : <PanelLeftClose size={14} />}
                        {todoViewMode === "list" ? "Calendar view" : "List view"}
                      </button>
                      <button
                        className="mini-action"
                        disabled={!todoStoragePath || todoViewMode === "calendar"}
                        onClick={() => setTodoListSplitMode((current) => (current === "side-by-side" ? "stacked" : "side-by-side"))}
                        type="button"
                      >
                        {todoListSplitMode === "side-by-side" ? <PanelLeftClose size={14} /> : <Columns3 size={14} />}
                        {todoListSplitMode === "side-by-side" ? "Top and bottom" : "Side by side"}
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
              {section === "bookmarks" ? (
                <div className="inline-actions">
                  <button
                    className={`mini-action ${bookmarkRenderMode === "tree" ? "is-active" : ""}`}
                    onClick={() => setBookmarkRenderMode("tree")}
                    type="button"
                  >
                    <ListTree size={14} />
                    Tree
                  </button>
                  <button
                    className={`mini-action ${bookmarkRenderMode === "menu" ? "is-active" : ""}`}
                    onClick={() => setBookmarkRenderMode("menu")}
                    type="button"
                  >
                    <LayoutList size={14} />
                    Menu
                  </button>
                  <button
                    className={`mini-action ${bookmarkCompactMode ? "is-active" : ""}`}
                    onClick={() => setBookmarkCompactMode((current) => !current)}
                    type="button"
                  >
                    Compact
                  </button>
                  <button className="mini-action" onClick={handleAddFolder} type="button">
                    <Plus size={14} />
                    Folder
                  </button>
                  <button className="mini-action" onClick={handleAddBookmark} type="button">
                    <Plus size={14} />
                    Bookmark
                  </button>
                </div>
              ) : section === "notes" || section === "wiki" ? (
                <div className="notes-actions">
                  <div className="inline-actions">
                    {section === "notes" ? (
                      notesNavigationMode === "section" ? (
                        <button
                          className="mini-action notes-actions__button notes-actions__button--view"
                          onClick={() => setNotesNavigationMode("folder")}
                          type="button"
                        >
                          <FolderTree size={14} />
                          <span className="notes-actions__label">Folder View</span>
                        </button>
                      ) : (
                        <button
                          className="mini-action notes-actions__button notes-actions__button--view"
                          onClick={() => setNotesNavigationMode("section")}
                          type="button"
                        >
                          <LayoutList size={14} />
                          <span className="notes-actions__label">Section View</span>
                        </button>
                      )
                    ) : null}
                    {section === "notes" ? (
                      <button
                        className="mini-action notes-actions__button notes-actions__button--section"
                        disabled={notesNavigationMode !== "section"}
                        onClick={handleCreateSection}
                        title={notesNavigationMode === "section" ? "Create section in data/docs" : "Switch to Section View to create a section"}
                        type="button"
                      >
                        <FolderPlus size={14} />
                        <span className="notes-actions__label">New Section</span>
                      </button>
                    ) : null}
                    {section === "notes" && noteUploadTarget ? (
                      <button
                        className="mini-action notes-actions__button notes-actions__button--document"
                        onClick={handleCreateDocument}
                        title={`Create in ${noteUploadTarget.label}`}
                        type="button"
                      >
                        <FilePlus2 size={14} />
                        <span className="notes-actions__label">New Document</span>
                      </button>
                    ) : null}
                    {section === "notes" && noteUploadTarget ? (
                      <button
                        className="mini-action notes-actions__button notes-actions__button--folder"
                        onClick={handleCreateFolder}
                        title={`Create folder in ${noteUploadTarget.label}`}
                        type="button"
                      >
                        <FolderPlus size={14} />
                        <span className="notes-actions__label">New Folder</span>
                      </button>
                    ) : null}
                    {section === "notes" && noteUploadTarget ? (
                      <button
                        className="mini-action notes-actions__button notes-actions__button--upload"
                        onClick={openNoteUploadDialog}
                        title={`Upload into ${noteUploadTarget.label}`}
                        type="button"
                      >
                        <FilePlus2 size={14} />
                        <span className="notes-actions__label">Upload</span>
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : section === "recent" ? (
                <div className="recent-actions">
                  <span className="status-pill">
                    <TimerReset size={14} />
                    {visibleRecentDocuments.length} viewed
                  </span>
                  <div aria-label="Recent sort mode" className="inline-actions" role="group">
                    <button
                      aria-pressed={recentDocumentsSortMode === "recent"}
                      className={`mini-action ${recentDocumentsSortMode === "recent" ? "is-active" : ""}`}
                      onClick={() => setRecentDocumentsSortMode("recent")}
                      type="button"
                    >
                      Most recent
                    </button>
                    <button
                      aria-pressed={recentDocumentsSortMode === "views"}
                      className={`mini-action ${recentDocumentsSortMode === "views" ? "is-active" : ""}`}
                      onClick={() => setRecentDocumentsSortMode("views")}
                      type="button"
                    >
                      Most views
                    </button>
                  </div>
                </div>
              ) : (
                <span className="status-pill">
                  <FileCode2 size={14} />
                  {viewerContent.badge}
                </span>
              )}
            </div>
            )}

            {section === "bookmarks" ? (
              hasLoadedBookmarks && bookmarkTree.length === 0 ? (
                <div className="getting-started">
                  <div className="getting-started__icon">
                    <Bookmark size={48} />
                  </div>
                  <h3>Import Your Bookmarks</h3>
                  <p className="muted">
                    Bring your browser bookmarks into Organizer. Export them from your browser, then import the HTML file here.
                  </p>
                  <div className="getting-started__steps">
                    <div className="getting-started__step">
                      <strong>1. Export from your browser</strong>
                      <ul className="getting-started__instructions">
                        <li><strong>Chrome:</strong> Bookmark Manager → ⋮ menu → Export bookmarks</li>
                        <li><strong>Firefox:</strong> Bookmarks → Manage Bookmarks → Import and Backup → Export Bookmarks to HTML</li>
                        <li><strong>Safari:</strong> File → Export Bookmarks…</li>
                        <li><strong>Edge:</strong> Favorites → ⋯ menu → Export favorites</li>
                      </ul>
                    </div>
                    <div className="getting-started__step">
                      <strong>2. Import the exported HTML file</strong>
                    </div>
                  </div>
                  <button
                    className="getting-started__button"
                    onClick={() => bookmarkImportInputRef.current?.click()}
                    type="button"
                  >
                    <Download size={16} />
                    Import Bookmarks
                  </button>
                </div>
              ) : (
              <div className="bookmark-combined-view">
                <section className="bookmark-combined-view__section bookmark-combined-view__section--bookmarks">
                  <div className="bookmark-combined-view__section-header">
                    <div>
                      <p className="eyebrow">Bookmarks</p>
                      <h4>Favorites hierarchy</h4>
                    </div>
                  </div>
                  <div
                    className={`bookmark-tree bookmark-tree--hero ${bookmarkCompactMode ? "is-compact" : ""} ${
                      bookmarkRenderMode === "menu" ? "is-menu" : ""
                    }`}
                  >
                    {filteredBookmarkTree.length > 0 ? (
                      bookmarkRenderMode === "tree" ? (
                        filteredBookmarkTree.map((node) => (
                          <BookmarkTreeNode
                            compact={bookmarkCompactMode}
                            expandedFolderIds={expandedFolderIds}
                            key={node.id}
                            draggedBookmarkId={draggedBookmarkId}
                            node={node}
                            onDelete={handleDeleteNode}
                            onDragEnd={() => setDraggedBookmarkId(null)}
                            onDragStart={setDraggedBookmarkId}
                            onDrop={handleDropOnNode}
                            onEdit={handleEditNode}
                            onSelect={navigateBookmarkSelection}
                            selectedBookmarkId={selectedBookmarkId}
                            onToggleFolder={toggleFolder}
                          />
                        ))
                      ) : (
                        <BookmarkMenuBar
                          compact={bookmarkCompactMode}
                          menuBarRef={menuBarRef}
                          nodes={filteredBookmarkTree}
                          onCloseMenus={() => setOpenMenuPath([])}
                          onOpenMenuPath={setOpenMenuPath}
                          onSelect={navigateBookmarkSelection}
                          onToggleStar={handleToggleBookmarkStar}
                          openMenuPath={openMenuPath}
                          selectedBookmarkId={selectedBookmarkId}
                        />
                      )
                    ) : (
                      <article className="bookmark-empty">
                        <h4>No bookmarks visible</h4>
                        <p>
                          {bookmarkTree.length > 0 && query.trim()
                            ? `The current search for "${query}" does not match any bookmarks.`
                            : "Import bookmarks to see them rendered here."}
                        </p>
                      </article>
                    )}
                  </div>
                </section>

                <section className="bookmark-combined-view__section bookmark-combined-view__section--wiki">
                  <div className="bookmark-combined-view__section-header">
                    <div>
                      <p className="eyebrow">Bookmarks</p>
                      <h4>Bookmars navigation</h4>
                      <p className="muted bookmark-combined-view__section-meta">
                        {selectedNoteFolderStats?.folders ?? 0} folders · {selectedNoteFolderStats?.notes ?? 0} bookmarks
                      </p>
                    </div>
                  </div>
                  {wikiPages.length > 0 && noteFolderOverviewPanel ? (
                    noteFolderOverviewPanel
                  ) : (
                    <article className="bookmark-empty">
                      <h4>No wiki pages available</h4>
                      <p>Add or sync wiki-style bookmarks to populate this navigator.</p>
                    </article>
                  )}
                </section>
              </div>
              )
            ) : section === "notes" || section === "wiki" ? (
              hasLoadedNotes && notes.length === 0 ? (
                <div className="getting-started">
                  <div className="getting-started__icon">
                    <FolderOpen size={48} />
                  </div>
                  <h3>Welcome to Organizer</h3>
                  <p className="muted">
                    Get started by selecting a folder that contains your documents, markdown files, or images.
                    This folder will be used as the source of truth for your notes.
                  </p>
                  {shouldUseManualPaths ? (
                    <p className="getting-started__hint">
                      On Windows in the browser build, enter the full folder path manually.
                    </p>
                  ) : null}
                  <div className="getting-started__form">
                    <input
                      className="getting-started__input"
                      onChange={(event) => {
                        setDocsSourceInput(event.target.value);
                        setDocsSourceError(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          handleSetDocsSource();
                        }
                      }}
                      placeholder={folderPathPlaceholder}
                      ref={(el) => { if (el && shouldUseManualPaths) el.focus(); }}
                      value={docsSourceInput}
                    />
                    <button
                      className="getting-started__button"
                      disabled={docsSourceSubmitting || !docsSourceInput.trim()}
                      onClick={() => {
                        void handleSetDocsSource();
                      }}
                      type="button"
                    >
                      <Folder size={16} />
                      {docsSourceSubmitting ? "Loading..." : "Set path"}
                    </button>
                    {!shouldUseManualPaths ? (
                      <button
                        className="getting-started__button"
                        disabled={docsSourceSubmitting}
                        onClick={handlePickDocsFolder}
                        ref={(el) => { if (el) el.focus(); }}
                        type="button"
                      >
                        <FolderOpen size={16} />
                        {docsSourceSubmitting ? "Loading..." : "Select Folder"}
                      </button>
                    ) : null}
                  </div>
                  {docsSourceError ? (
                    <p className="getting-started__error">{docsSourceError}</p>
                  ) : null}
                </div>
              ) : (
              <div className={`note-browser ${isMarkdownImmersive ? "is-immersive" : ""}`.trim()}>
                <div className={`note-detail-panel note-detail-panel--focus ${isMarkdownImmersive ? "is-immersive" : ""}`}>
                  {selectedNote ? (
                    <>
                      <div className="note-detail-panel__meta note-detail-panel__meta--note">
                        {section === "wiki" ? (
                          <span className="status-pill subtle">
                            <FileCode2 size={14} />
                            {selectedNote.kind === "wiki" ? "Wiki note" : "Markdown note"}
                          </span>
                        ) : null}
                        <span className="muted">
                          {section === "notes" && selectedNoteFolderStats
                            ? `${selectedNoteFolderStats.folders} folders · ${selectedNoteFolderStats.notes} notes (Updated ${formatNoteTimestamp(selectedNote.updatedAt)})`
                            : `Updated ${formatNoteTimestamp(selectedNote.updatedAt)}`}
                        </span>
                        {selectedNote.sourcePath ? <span className="muted note-detail-panel__path">{selectedNote.sourcePath}</span> : null}
                        {selectedNote.sourcePath && brokenLinksMap.has(selectedNote.sourcePath) ? (
                          <span className="status-pill is-warning" title="This note has broken links">
                            <TriangleAlert size={13} />
                            {brokenLinksMap.get(selectedNote.sourcePath)!.length} broken link{brokenLinksMap.get(selectedNote.sourcePath)!.length === 1 ? "" : "s"}
                          </span>
                        ) : null}
                      </div>
                      <div
                        className={`note-content-layout ${
                          useAsideLayout ? "has-aside" : ""
                        } ${isMarkdownImmersive ? "is-immersive" : ""} ${isNoteEditing ? "is-editing" : ""}`}
                      >
                        {isNoteEditing ? (
                          <MarkdownEditor
                            documentPath={selectedNote.sourcePath || selectedNote.title}
                            noteSourcePath={selectedNote.sourcePath}
                            initialScrollRatio={pendingEditorScrollRatio}
                            markdown={noteDraft}
                            onCancel={handleCancelNoteEditing}
                            onChange={setNoteDraft}
                            onZoomIn={handleViewerZoomIn}
                            onZoomOut={handleViewerZoomOut}
                            onSave={handleSaveNoteEdits}
                            previewContentScale={immersiveZoomPercent}
                            previewLayout={markdownEditorPreviewLayout}
                            resizePercent={editorSplitPercent}
                            saveError={noteSaveError}
                            saveState={noteSaveState}
                            setPreviewLayout={setMarkdownEditorPreviewLayout}
                            setShowPreview={setShowMarkdownEditorPreview}
                            setResizePercent={setEditorSplitPercent}
                            showPreview={showMarkdownEditorPreview}
                          />
                        ) : (
                          <>
                            {showPersistentFolderOverview ? (
                              noteFolderOverviewPanel
                            ) : null}
                            {showStandaloneNoteViewer ? (
                              <div className={`note-standalone-viewer ${showDetachedStandaloneNoteToolbar ? "is-sectioned" : ""}`}>
                                {showDetachedStandaloneNoteToolbar ? (
                                  <div className="markdown-body__toolbar note-browser__section-toolbar">
                                    {notePreviewToolbarLeading ? <div className="markdown-body__toolbar-side is-leading">{notePreviewToolbarLeading}</div> : <div />}
                                    {standaloneNoteViewerToolbarActions ? <div className="markdown-body__toolbar-side is-trailing">{standaloneNoteViewerToolbarActions}</div> : null}
                                  </div>
                                ) : null}
                                <MarkdownContent
                                  contentRef={viewerContentRef}
                                  contentScale={isMarkdownImmersive ? immersiveZoomPercent : 100}
                                  isImmersive={isMarkdownImmersive}
                                  markdown={selectedNote.content}
                                  noteSourcePath={selectedNote.sourcePath}
                                  toolbarLeading={showDetachedStandaloneNoteToolbar ? undefined : notePreviewToolbarLeading}
                                  toolbarActions={showDetachedStandaloneNoteToolbar ? undefined : standaloneNoteViewerToolbarActions}
                                />
                              </div>
                            ) : null}
                          </>
                        )}
                        {!isNoteEditing && !isMarkdownImmersive && prefs.showBacklinks && backlinks.length > 0 ? (
                          <aside className="backlinks-panel">
                            <h4 className="backlinks-panel__heading">
                              <Link2 size={14} />
                              Linked from ({backlinks.length})
                              <button
                                className="icon-action backlinks-panel__close"
                                onClick={() => setPrefs((p) => ({ ...p, showBacklinks: false }))}
                                type="button"
                                aria-label="Hide backlinks"
                                title="Hide backlinks"
                              >
                                <X size={14} />
                              </button>
                            </h4>
                            <ul className="backlinks-panel__list">
                              {backlinks.map((note) => (
                                <li key={note.id}>
                                  <button
                                    className="backlinks-panel__link"
                                    onClick={() => openNote(note)}
                                    type="button"
                                  >
                                    {note.title}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </aside>
                        ) : null}
                      </div>
                    </>
                  ) : selectedNoteTreeNode?.type === "folder" || !selectedNoteTreeNode ? (
                    <>
                      <div className="note-detail-panel__meta note-detail-panel__meta--note">
                        <span className="muted">
                          {selectedNoteFolderStats
                            ? `${selectedNoteFolderStats.folders} folders · ${selectedNoteFolderStats.notes} notes`
                            : "Empty folder"}
                        </span>
                        {selectedNoteTreeNode?.sourcePath ? <span className="muted note-detail-panel__path">{selectedNoteTreeNode.sourcePath}</span> : null}
                      </div>
                      {noteFolderOverviewPanel}
                    </>
                  ) : (
                    <article className="bookmark-empty">
                      <h4>No note selected</h4>
                      <p>Select a folder or note from the tree to browse this hierarchy.</p>
                    </article>
                  )}
                </div>
              </div>
              )
            ) : section === "todo" ? (
              !todoStoragePath ? (
                <div className="getting-started">
                  <div className="getting-started__icon">
                    <FolderOpen size={48} />
                  </div>
                  <h3>Select a notes folder first</h3>
                  <p className="muted">
                    TODO items are stored alongside your notes. Select a notes folder from the Notes tab to get started.
                  </p>
                </div>
              ) : (
              <TodoWorkspace
                items={todoItems}
                listSplitMode={todoListSplitMode}
                onAddTodo={handleAddTodo}
                onConsumeRequestedEditorTodoId={() => setRequestedTodoEditorId(null)}
                onDeleteTodo={handleDeleteTodo}
                onMoveTodo={handleMoveTodo}
                onSelectTodo={navigateTodoSelection}
                onUpdateTodo={handleUpdateTodo}
                onTransitionTodoStatus={handleTransitionTodoStatus}
                requestedEditorTodoId={requestedTodoEditorId}
                selectedTodoId={selectedTodoId}
                viewMode={todoViewMode}
              />
              )
            ) : section === "starred" ? (
              <div className="recent-feed">
                {starredNotes.length > 0 || starredBookmarks.length > 0 ? (
                  <>
                    {starredNotes.map((note) => (
                      <NoteListCard
                        key={note.id}
                        badgeKind={note.kind}
                        description={note.summary || getRecentDocumentPreview(note)}
                        documentName={getNoteSourceFileName(note) || note.title}
                        note={note}
                        onSelect={() => openNote(note)}
                        onToggleStar={(nextStarred) => void handleToggleNoteStar(note, nextStarred)}
                        timestamp={formatNoteTimestamp(note.updatedAt)}
                        title={note.title}
                      />
                    ))}
                    {starredBookmarks.map((bookmark) => (
                      <article key={bookmark.id} className="recent-entry">
                        <button
                          aria-label={bookmark.starred ? `Remove star from ${bookmark.title}` : `Add star to ${bookmark.title}`}
                          className={`icon-action recent-entry__delete ${bookmark.starred ? "is-active" : ""}`}
                          onClick={() => handleToggleBookmarkStar(bookmark.id, !bookmark.starred)}
                          title={bookmark.starred ? "Remove star" : "Add star"}
                          type="button"
                        >
                          <Star fill={bookmark.starred ? "currentColor" : "none"} size={14} />
                        </button>
                        <button
                          className="recent-entry__main"
                          onClick={() => window.open(bookmark.url, "_blank", "noopener,noreferrer")}
                          type="button"
                        >
                          <div className="recent-entry__meta">
                            <span className="recent-entry__meta-primary">
                              <span className="category-badge is-bookmark">bookmark</span>
                              <span className="recent-entry__filename">{bookmark.title}</span>
                            </span>
                            <span>{bookmark.domain}</span>
                          </div>
                          <h4 className="recent-entry__title">{bookmark.domain}</h4>
                          <span className="recent-entry__subtitle">
                            {bookmark.path.length ? `${bookmark.path.join(" / ")} · ${bookmark.url}` : bookmark.url}
                          </span>
                        </button>
                      </article>
                    ))}
                  </>
                ) : (
                  <article className="bookmark-empty">
                    <h4>No starred items yet</h4>
                    <p>Starred notes and bookmarks will appear here for quick access.</p>
                  </article>
                )}
              </div>
            ) : section === "recent" ? (
              <div className="recent-feed">
                {visibleRecentDocuments.length > 0 ? (
                  <>
                    {continueWhereLeftOffEntry ? (
                      <article className="recent-resume-card">
                        <div>
                          <p className="eyebrow">Continue where I left off</p>
                          <h4>{continueWhereLeftOffEntry.title}</h4>
                          <p>
                            {getRecentPrimaryActivity(continueWhereLeftOffEntry) === "completed"
                              ? "Resume from your most recently completed item."
                              : getRecentPrimaryActivity(continueWhereLeftOffEntry) === "edited"
                                ? "Jump back into the document you edited most recently."
                                : "Jump back into the document you opened most recently."}
                          </p>
                        </div>
                        <button className="mini-action is-active" onClick={() => applyNavigationSnapshot(continueWhereLeftOffEntry.snapshot, "push")} type="button">
                          Open
                        </button>
                      </article>
                    ) : null}
                    {sortedRecentDocuments.map((entry, index) => (
                      index === 0 && continueWhereLeftOffEntry ? null : (
                        <RecentDocumentCard
                          entry={entry}
                          key={entry.id}
                          note={resolveRecentEntryNote(entry, resolvedNotesTree, wikiTree, allNotes)}
                          onDelete={() => handleRemoveRecentDocument(entry.id)}
                          onSelect={() => applyNavigationSnapshot(entry.snapshot, "push")}
                          onTogglePin={() => handleToggleRecentDocumentPin(entry.id)}
                        />
                      )
                    ))}
                  </>
                ) : (
                  <article className="bookmark-empty">
                    <h4>No recent documents yet</h4>
                    <p>Open, edit, or complete items and they will appear here for quick return navigation.</p>
                  </article>
                )}
              </div>
            ) : (
              <MarkdownContent
                isImmersive={isMarkdownImmersive}
                markdown={viewerContent.markdown}
              />
            )}
          </div>

          {showSearchResultsPanel ? (
            <div className="card search-card">
              <div className="card__header">
                <div>
                  <p className="eyebrow">Search results</p>
                  <h3>{query.trim() ? "Live matches" : "Everything indexed"}</h3>
                </div>
                <div className="inline-actions">
                  <span className="muted">{filteredEntries.length} items</span>
                  {query.trim() ? (
                    <button className="mini-action" onClick={handleAddSavedSearch} title="Save this search" type="button">
                      + Save search
                    </button>
                  ) : null}
                  <button className="icon-action" onClick={() => setIsSearchPanelOpen(false)} type="button">
                    <PanelRightClose size={14} />
                  </button>
                </div>
              </div>

              <div className="search-groups">
                {visibleSearchEntries.map((entry) => (
                  <article key={entry.id} className="search-hit" onClick={() => handleSearchEntrySelect(entry)}>
                    <div className="search-hit__meta">
                      <span className={`category-badge is-${entry.category}`}>{entry.category}</span>
                      <span>{entry.scoreText}</span>
                    </div>
                    <h4>{entry.title}</h4>
                    <p>{entry.subtitle}</p>
                    <div className="tag-row">
                      {entry.tags.map((tag, tagIndex) => (
                        <span key={`${tag}-${tagIndex}`} className="tag">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : showStarredPanel ? (
            <div className="card search-card">
              <div className="card__header">
                <div>
                  <p className="eyebrow">Bookmarks &amp; notes</p>
                  <h3>Starred</h3>
                </div>
                <div className="inline-actions">
                  <button className="icon-action" onClick={() => setIsStarredPanelOpen(false)} type="button">
                    <PanelRightClose size={14} />
                  </button>
                </div>
              </div>
              <div className="search-groups">
                {starredNotes.length > 0 || starredBookmarks.length > 0 ? (
                  <>
                    {starredNotes.map((note) => (
                      <NoteListCard
                        key={note.id}
                        badgeKind={note.kind}
                        description={note.summary || ""}
                        documentName={getNoteSourceFileName(note) || note.title}
                        note={note}
                        onSelect={() => { openNote(note); setIsStarredPanelOpen(false); }}
                        onToggleStar={(next) => void handleToggleNoteStar(note, next)}
                        timestamp={formatNoteTimestamp(note.updatedAt)}
                        title={note.title}
                      />
                    ))}
                    {starredBookmarks.map((bookmark) => (
                      <article key={bookmark.id} className="recent-entry">
                        <button
                          aria-label={bookmark.starred ? `Remove star from ${bookmark.title}` : `Add star to ${bookmark.title}`}
                          className={`icon-action recent-entry__delete ${bookmark.starred ? "is-active" : ""}`}
                          onClick={() => handleToggleBookmarkStar(bookmark.id, !bookmark.starred)}
                          type="button"
                        >
                          <Star fill={bookmark.starred ? "currentColor" : "none"} size={14} />
                        </button>
                        <button
                          className="recent-entry__main"
                          onClick={() => window.open(bookmark.url, "_blank", "noopener,noreferrer")}
                          type="button"
                        >
                          <div className="recent-entry__meta">
                            <span className="recent-entry__meta-primary">
                              <span className="category-badge is-bookmark">bookmark</span>
                              <span className="recent-entry__filename">{bookmark.title}</span>
                            </span>
                            <span>{bookmark.domain}</span>
                          </div>
                          <h4 className="recent-entry__title">{bookmark.domain}</h4>
                          <span className="recent-entry__subtitle">
                            {bookmark.path.length ? `${bookmark.path.join(" / ")} · ${bookmark.url}` : bookmark.url}
                          </span>
                        </button>
                      </article>
                    ))}
                  </>
                ) : (
                  <article className="bookmark-empty">
                    <h4>No starred items yet</h4>
                    <p>Star notes and bookmarks to see them here.</p>
                  </article>
                )}
              </div>
            </div>
          ) : showRecentPanel ? (
            <div className="card search-card">
              <div className="card__header">
                <div>
                  <p className="eyebrow">Navigation history</p>
                  <h3>Recent</h3>
                </div>
                <div className="inline-actions">
                  <button
                    aria-pressed={recentDocumentsSortMode === "recent"}
                    className={`mini-action ${recentDocumentsSortMode === "recent" ? "is-active" : ""}`}
                    onClick={() => setRecentDocumentsSortMode("recent")}
                    type="button"
                  >
                    Recent
                  </button>
                  <button
                    aria-pressed={recentDocumentsSortMode === "views"}
                    className={`mini-action ${recentDocumentsSortMode === "views" ? "is-active" : ""}`}
                    onClick={() => setRecentDocumentsSortMode("views")}
                    type="button"
                  >
                    Most viewed
                  </button>
                  <button className="icon-action" onClick={() => setIsRecentPanelOpen(false)} type="button">
                    <PanelRightClose size={14} />
                  </button>
                </div>
              </div>
              <div className="search-groups">
                {sortedRecentDocuments.length > 0 ? (
                  sortedRecentDocuments.map((entry) => (
                    <RecentDocumentCard
                      key={entry.id}
                      entry={entry}
                      note={resolveRecentEntryNote(entry, resolvedNotesTree, wikiTree, allNotes)}
                      onDelete={() => handleRemoveRecentDocument(entry.id)}
                      onSelect={() => { applyNavigationSnapshot(entry.snapshot, "push"); setIsRecentPanelOpen(false); }}
                      onTogglePin={() => handleToggleRecentDocumentPin(entry.id)}
                    />
                  ))
                ) : (
                  <article className="bookmark-empty">
                    <h4>No recent documents yet</h4>
                    <p>Open notes, wiki pages, or TODO items and they will appear here.</p>
                  </article>
                )}
              </div>
            </div>
          ) : showCollapsedSearchCard ? (
            <div className={`search-card search-card--collapsed ${notes.length === 0 ? "search-card--disabled" : ""}`}>
              <button className="search-card__toggle" onClick={openSearchSurface} type="button">
                <Search size={16} />
                <span>Open search panel</span>
              </button>
            </div>
          ) : null}

        </section>

        {!isMarkdownImmersive && pinnedNotes.length > 0 ? (
          <section className="card dashboard-widgets-card">
            <div className="card__header">
              <div>
                <p className="eyebrow">Dashboard</p>
                <h3>Pinned notes ({pinnedNotes.length})</h3>
              </div>
            </div>
            <div className="dashboard-widgets__grid">
              {pinnedNotes.map((note) => (
                <article key={note.id} className="dashboard-widget">
                  <div className="dashboard-widget__header">
                    <h4 className="dashboard-widget__title">{note.title}</h4>
                    <button
                      aria-label={`Unpin ${note.title}`}
                      className="icon-action dashboard-widget__unpin"
                      onClick={() => handleUnpinNote(note.id)}
                      title="Unpin"
                      type="button"
                    >
                      <X size={12} />
                    </button>
                  </div>
                  <p className="dashboard-widget__summary">{note.summary || note.content.slice(0, 120).replace(/[#*`]/g, "").trim()}</p>
                  <button
                    className="mini-action dashboard-widget__open"
                    onClick={() => openNote(note)}
                    type="button"
                  >
                    <ExternalLink size={12} />
                    Open
                  </button>
                </article>
              ))}
            </div>
          </section>
        ) : null}

      </main>
      <BookmarkDialog
        onChange={handleBookmarkDialogChange}
        onClose={handleBookmarkDialogClose}
        onConfirm={handleBookmarkDialogConfirm}
        state={bookmarkDialog}
      />
      <NoteCreationDialog
        onChange={handleNoteCreationDialogChange}
        onClose={handleNoteCreationDialogClose}
        onConfirm={() => void handleNoteCreationDialogConfirm()}
        onTemplateChange={handleNoteCreationDialogTemplateChange}
        state={noteCreationDialog}
      />
      {isKeyboardShortcutsOpen ? <KeyboardShortcutsDialog onClose={() => setIsKeyboardShortcutsOpen(false)} /> : null}
      {isQuickCaptureOpen ? (
        <QuickCaptureDialog
          state={quickCaptureState}
          todoLists={[...new Set(todoItems.map((t) => t.listName).filter(Boolean))]}
          onClose={() => setIsQuickCaptureOpen(false)}
          onChange={(patch) => setQuickCaptureState((prev) => ({ ...prev, ...patch }))}
          onCaptureTask={(title, listName, toInbox) => { void handleQuickCaptureTask(title, listName, toInbox); }}
          onCaptureNote={(title, templateId, toInbox) => { void handleQuickCaptureNote(title, templateId, toInbox); }}
          onCaptureBookmark={(title, url, description) => { handleQuickCaptureBookmark(title, url, description); }}
        />
      ) : null}
      {showTaskTemplateDialog ? (
        <TaskTemplateDialog
          onClose={() => setShowTaskTemplateDialog(false)}
          onCreateBundle={(tasks, listName) => { void handleCreateFromTaskBundle(tasks, listName); setShowTaskTemplateDialog(false); }}
        />
      ) : null}
      {openFeedPopup !== null ? (
        <div className="dialog-backdrop" onClick={() => setOpenFeedPopup(null)}>
          <div className="feed-popup" onClick={(e) => e.stopPropagation()}>
            <div className="feed-popup__header">
              {openFeedPopup === "starred" ? (
                <>
                  <p className="eyebrow">Bookmarks &amp; notes</p>
                  <h3>Starred</h3>
                </>
              ) : (
                <>
                  <p className="eyebrow">Navigation history</p>
                  <h3>Recent</h3>
                </>
              )}
              {openFeedPopup === "recent" ? (
                <div className="feed-popup__header-actions">
                  <button
                    aria-pressed={recentDocumentsSortMode === "recent"}
                    className={`mini-action ${recentDocumentsSortMode === "recent" ? "is-active" : ""}`}
                    onClick={() => setRecentDocumentsSortMode("recent")}
                    type="button"
                  >
                    Recent
                  </button>
                  <button
                    aria-pressed={recentDocumentsSortMode === "views"}
                    className={`mini-action ${recentDocumentsSortMode === "views" ? "is-active" : ""}`}
                    onClick={() => setRecentDocumentsSortMode("views")}
                    type="button"
                  >
                    Most viewed
                  </button>
                </div>
              ) : null}
              <button className="icon-action" onClick={() => setOpenFeedPopup(null)} type="button">
                <X size={14} />
              </button>
            </div>
            <div className="feed-popup__body">
              {openFeedPopup === "starred" ? (
                starredNotes.length > 0 || starredBookmarks.length > 0 ? (
                  <>
                    {starredNotes.map((note) => (
                      <NoteListCard
                        key={note.id}
                        badgeKind={note.kind}
                        description={note.summary || ""}
                        documentName={getNoteSourceFileName(note) || note.title}
                        note={note}
                        onSelect={() => { openNote(note); setOpenFeedPopup(null); }}
                        onToggleStar={(next) => void handleToggleNoteStar(note, next)}
                        timestamp={formatNoteTimestamp(note.updatedAt)}
                        title={note.title}
                      />
                    ))}
                    {starredBookmarks.map((bookmark) => (
                      <article key={bookmark.id} className="recent-entry">
                        <button
                          aria-label={bookmark.starred ? `Remove star from ${bookmark.title}` : `Add star to ${bookmark.title}`}
                          className={`icon-action recent-entry__delete ${bookmark.starred ? "is-active" : ""}`}
                          onClick={() => handleToggleBookmarkStar(bookmark.id, !bookmark.starred)}
                          type="button"
                        >
                          <Star fill={bookmark.starred ? "currentColor" : "none"} size={14} />
                        </button>
                        <button
                          className="recent-entry__main"
                          onClick={() => window.open(bookmark.url, "_blank", "noopener,noreferrer")}
                          type="button"
                        >
                          <div className="recent-entry__meta">
                            <span className="recent-entry__meta-primary">
                              <span className="category-badge is-bookmark">bookmark</span>
                              <span className="recent-entry__filename">{bookmark.title}</span>
                            </span>
                            <span>{bookmark.domain}</span>
                          </div>
                          <h4 className="recent-entry__title">{bookmark.domain}</h4>
                          <span className="recent-entry__subtitle">
                            {bookmark.path.length ? `${bookmark.path.join(" / ")} · ${bookmark.url}` : bookmark.url}
                          </span>
                        </button>
                      </article>
                    ))}
                  </>
                ) : (
                  <article className="bookmark-empty">
                    <h4>No starred items yet</h4>
                    <p>Star notes and bookmarks to see them here.</p>
                  </article>
                )
              ) : sortedRecentDocuments.length > 0 ? (
                sortedRecentDocuments.map((entry) => (
                  <RecentDocumentCard
                    key={entry.id}
                    entry={entry}
                    note={resolveRecentEntryNote(entry, resolvedNotesTree, wikiTree, allNotes)}
                    onDelete={() => handleRemoveRecentDocument(entry.id)}
                    onSelect={() => { applyNavigationSnapshot(entry.snapshot, "push"); setOpenFeedPopup(null); }}
                    onTogglePin={() => handleToggleRecentDocumentPin(entry.id)}
                  />
                ))
              ) : (
                <article className="bookmark-empty">
                  <h4>No recent documents yet</h4>
                  <p>Open notes, wiki pages, or TODO items and they will appear here.</p>
                </article>
              )}
            </div>
          </div>
        </div>
      ) : null}
      {isCommandPaletteOpen ? (
        <CommandPalette
          allNotes={allNotes}
          canEditSelectedNote={canEditSelectedNote}
          isNoteEditing={isNoteEditing}
          navItems={orderedNavItems}
          onClose={() => setIsCommandPaletteOpen(false)}
          onNavigateSection={navigateSection}
          onOpenNote={openNote}
          onStartEditing={handleStartNoteEditing}
          onCancelEditing={handleCancelNoteEditing}
          onSaveEditing={() => void handleSaveNoteEdits()}
          onToggleSidebar={() => setIsSidebarCollapsed((c) => !c)}
          onOpenSearch={openSearchSurface}
          onOpenTags={() => { setIsTagBrowserOpen(true); setIsCommandPaletteOpen(false); }}
          onOpenBrokenLinks={() => { setIsBrokenLinksOpen(true); setIsCommandPaletteOpen(false); }}
          onOpenDailyNote={() => { void handleOpenDailyNote(new Date().toISOString().slice(0, 10)); setIsCommandPaletteOpen(false); }}
          onShowTriage={() => { setShowTriagePanel(true); setIsCommandPaletteOpen(false); }}
          onShowKeyboardHelp={() => { setIsKeyboardShortcutsOpen(true); setIsCommandPaletteOpen(false); }}
          onOpenGraphView={() => { setShowGraphView(true); setIsCommandPaletteOpen(false); }}
          onCreateDocument={() => { void handleCreateDocument(); setIsCommandPaletteOpen(false); }}
          onShowTaskTemplates={() => { setShowTaskTemplateDialog(true); setIsCommandPaletteOpen(false); }}
          onAddTodo={() => { void handleAddTodo(null, true); setIsCommandPaletteOpen(false); }}
          onQuickCapture={() => { setQuickCaptureState({ tab: "task", title: "", url: "", description: "", listName: "", noteTemplate: "", toInbox: true }); setIsQuickCaptureOpen(true); setIsCommandPaletteOpen(false); }}
          query={commandPaletteQuery}
          onQueryChange={setCommandPaletteQuery}
          selectedNote={selectedNote}
          todoItems={todoItems}
        />
      ) : null}
      {usesSearchPalette && isSearchDialogOpen ? (
        <div className="dialog-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setIsSearchDialogOpen(false); }}>
          <div aria-label="Search" className="dialog-card command-palette search-palette" role="dialog" aria-modal="true">
            <div className="command-palette__search search-palette__search">
              <Search size={16} />
              <input
                ref={searchDialogInputRef}
                className="command-palette__input"
                onChange={(event) => handleSearchInputChange(event.target.value)}
                onKeyDown={handleSearchInputKeyDown}
                placeholder="Search across notes, wiki pages, bookmarks, TODO items, tags, code snippets..."
                type="text"
                value={searchText}
              />
              {query.trim() ? (
                <button className="mini-action" onClick={handleAddSavedSearch} title="Save this search" type="button">
                  + Save search
                </button>
              ) : null}
              <button aria-label="Close search" className="icon-action" onClick={() => setIsSearchDialogOpen(false)} type="button">
                <X size={14} />
              </button>
            </div>
            <div className="search-palette__summary">
              <span className="muted">{visibleSearchEntries.length} items</span>
              {searchScope ? <span className="search-palette__scope">in: {getScopeLabel(searchScope)}</span> : null}
              {searchNoteSectionScope ? <span className="search-palette__scope">section: {findNoteSectionByScope(noteSections, searchNoteSectionScope)?.title ?? searchNoteSectionScope}</span> : null}
              {searchFolderScopePath.length > 0 ? <span className="search-palette__scope">folder: {searchFolderScopePath.join(" / ")}</span> : null}
            </div>
            <div className="command-palette__list search-palette__list">
              {visibleSearchEntries.length === 0 ? (
                <div className="command-palette__empty">No search results yet</div>
              ) : (
                visibleSearchEntries.map((entry) => (
                  <button
                    key={entry.id}
                    className="command-palette__item search-palette__item"
                    onClick={() => handleSearchDialogEntrySelect(entry)}
                    type="button"
                  >
                    <span className="command-palette__item-body">
                      <span className="command-palette__item-label">
                        <span className={`category-badge is-${entry.category}`}>{entry.category}</span>
                        {entry.title}
                      </span>
                      <span className="command-palette__item-subtitle">{entry.subtitle}</span>
                    </span>
                    <span className="search-palette__score">{entry.scoreText}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
      {isTagBrowserOpen ? (
        <TagBrowserDialog
          allTags={allTags}
          onClose={() => setIsTagBrowserOpen(false)}
          onSelectTag={(tag) => {
            setSearchText(tag);
            setSearchScope(null);
            setIsSearchPanelOpen(true);
            setIsTagBrowserOpen(false);
          }}
        />
      ) : null}
      {trashConfirmNote ? (
        <ConfirmDialog
          message={`Move "${trashConfirmNote.title}" to trash?`}
          confirmLabel="Move to trash"
          cancelLabel="No, keep it"
          onConfirm={() => { void handleTrashNote(trashConfirmNote); setTrashConfirmNote(null); }}
          onCancel={() => setTrashConfirmNote(null)}
        />
      ) : null}
      {isVersionHistoryOpen && versionHistoryNote ? (
        <VersionHistoryDialog
          note={versionHistoryNote}
          onClose={() => setIsVersionHistoryOpen(false)}
          onRestore={handleRestoreNoteVersion}
        />
      ) : null}
      {isBrokenLinksOpen ? (
        <BrokenLinksDialog
          brokenLinksMap={brokenLinksMap}
          allNotes={notes}
          onClose={() => setIsBrokenLinksOpen(false)}
          onSelectNote={openNote}
        />
      ) : null}
      {isExportImportOpen ? (
        <ExportImportDialog
          noteCount={notes.length}
          bookmarkCount={bookmarks.length}
          exportActions={exportActions}
          restorePoints={restorePoints}
          isLoadingRestorePoints={isLoadingRestorePoints}
          isRestoringRestorePoint={isRestoringRestorePoint}
          onClose={() => setIsExportImportOpen(false)}
          onCreateRestorePoint={handleCreateRestorePoint}
          onExport={handleExportPack}
          onImport={handleImportPackFile}
          onRestoreRestorePoint={handleRestoreRestorePoint}
        />
      ) : null}
      {isPrefsOpen ? (
        <PreferencesDialog
          prefs={prefs}
          onPrefsChange={setPrefs}
          onClose={() => setIsPrefsOpen(false)}
          apiBase={sidebarApiBase}
        />
      ) : null}

      {showTrashPanel ? (
        <TrashPanel
          entries={trashEntries}
          onClose={() => setShowTrashPanel(false)}
          onRestore={(id) => void handleRestoreFromTrash(id)}
          onPurge={(id) => void handlePurgeTrashEntry(id)}
          onPurgeAll={() => void handlePurgeTrashEntry(null)}
        />
      ) : null}

      {showDailyNotes ? (
        <div className="overlay-panel">
          <div className="overlay-panel__header">
            <h2>Daily Notes</h2>
            <button className="icon-action" onClick={() => setShowDailyNotes(false)} type="button"><X size={14} /></button>
          </div>
          <DailyNoteNavigator
            currentDate={dailyNoteDate}
            onSelectDate={(date) => void handleOpenDailyNote(date)}
          />
        </div>
      ) : null}

      {showGraphView ? (
        <div className="overlay-panel overlay-panel--large">
          <div className="overlay-panel__header">
            <h2>Graph View</h2>
            <button className="icon-action" onClick={() => setShowGraphView(false)} type="button"><X size={14} /></button>
          </div>
          <GraphView
            nodes={graphData.nodes}
            links={graphData.links}
            onSelectNode={(sourcePath) => {
              const note = notes.find((n) => n.sourcePath === sourcePath);
              if (note) openNote(note);
              setShowGraphView(false);
            }}
          />
        </div>
      ) : null}

      {showWorkspaceSwitcher ? (
        <div className="overlay-panel">
          <div className="overlay-panel__header">
            <h2>Workspaces</h2>
            <button className="icon-action" onClick={() => setShowWorkspaceSwitcher(false)} type="button"><X size={14} /></button>
          </div>
          <WorkspaceSwitcher
            workspaces={workspaces}
            onSwitch={(id) => void handleWorkspaceAction("switch", { id })}
            onAdd={() => {
              const label = window.prompt("Workspace name:");
              if (!label) return;
              const wsPath = window.prompt("Path to docs folder:");
              if (!wsPath) return;
              void handleWorkspaceAction("add", { label, path: wsPath });
            }}
            onRemove={(id) => void handleWorkspaceAction("remove", { id })}
          />
        </div>
      ) : null}

      {showTriagePanel ? (
        <TriagePanel
          dueTodayTodos={triageData.dueTodayTodos}
          dueThisWeekTodos={triageData.dueThisWeekTodos}
          waitingTodos={triageData.waitingTodos}
          staleNotes={triageData.staleNotes}
          unsortedBookmarks={triageData.unsortedBookmarks}
          onClose={() => setShowTriagePanel(false)}
          onSelectTodo={(id) => { navigateTodoSelection(id); setShowTriagePanel(false); }}
          onOpenNote={(note) => { openNote(note); setShowTriagePanel(false); }}
        />
      ) : null}

      {reminderNotifications.length > 0 ? (
        <div className="reminder-toast">
          <Bell size={16} />
          <div className="reminder-toast__body">
            <p className="reminder-toast__title">Reminders due</p>
            {reminderNotifications.map((item) => (
              <p key={item.id} className="reminder-toast__item">{item.title}</p>
            ))}
          </div>
          <button className="icon-action" onClick={() => setReminderNotifications([])} type="button"><X size={14} /></button>
        </div>
      ) : null}
    </div>
  );
}

function getScrollProgress(element: HTMLElement | null) {
  if (!element) {
    return 0;
  }

  const maxScrollTop = Math.max(element.scrollHeight - element.clientHeight, 0);
  if (maxScrollTop === 0) {
    return 0;
  }

  return Math.min(Math.max(element.scrollTop / maxScrollTop, 0), 1);
}

function collectNoteFolderIds(tree: NoteTreeNode[], ids: Set<string> = new Set()): Set<string> {
  for (const node of tree) {
    if (node.type === "folder") {
      ids.add(node.id);
      collectNoteFolderIds(node.children, ids);
    }
  }
  return ids;
}

function collectNoteLeafNodeIds(tree: NoteTreeNode[], ids: Set<string> = new Set()): Set<string> {
  for (const node of tree) {
    if (node.type === "note") {
      ids.add(node.id);
      continue;
    }

    collectNoteLeafNodeIds(node.children, ids);
  }

  return ids;
}

function findNoteTreeNodeById(tree: NoteTreeNode[], nodeId: string): NoteTreeNode | null {
  for (const node of tree) {
    if (node.id === nodeId) {
      return node;
    }
    if (node.type === "folder") {
      const nested = findNoteTreeNodeById(node.children, nodeId);
      if (nested) {
        return nested;
      }
    }
  }
  return null;
}

function findNoteTreeNodeIdByNoteId(tree: NoteTreeNode[], noteId: string): string | null {
  for (const node of tree) {
    if (node.type === "note" && node.noteId === noteId) {
      return node.id;
    }

    if (node.type === "folder") {
      const nested = findNoteTreeNodeIdByNoteId(node.children, noteId);
      if (nested) {
        return nested;
      }
    }
  }

  return null;
}

function findNoteTreeNodeIdBySourcePath(tree: NoteTreeNode[], sourcePath: string): string | null {
  for (const node of tree) {
    if (node.type === "note" && node.note?.sourcePath === sourcePath) {
      return node.id;
    }

    if (node.type === "folder") {
      const nested = findNoteTreeNodeIdBySourcePath(node.children, sourcePath);
      if (nested) {
        return nested;
      }
    }
  }

  return null;
}

function findNoteFolderNodeIdBySourcePath(tree: NoteTreeNode[], sourcePath: string): string | null {
  for (const node of tree) {
    if (node.type === "folder" && node.sourcePath === sourcePath) {
      return node.id;
    }

    if (node.type === "folder") {
      const nested = findNoteFolderNodeIdBySourcePath(node.children, sourcePath);
      if (nested) {
        return nested;
      }
    }
  }

  return null;
}

function getNoteTreeTrail(tree: NoteTreeNode[], targetId: string, trail: NoteTreeNode[] = []): NoteTreeNode[] {
  for (const node of tree) {
    const nextTrail = [...trail, node];
    if (node.id === targetId) {
      return nextTrail;
    }

    if (node.type === "folder") {
      const nested = getNoteTreeTrail(node.children, targetId, nextTrail);
      if (nested.length > 0) {
        return nested;
      }
    }
  }

  return [];
}

function getNoteUploadTarget(
  section: SectionId,
  selectedNode: NoteTreeNode | null,
  selectedNote: Note | null,
): NoteUploadTarget | null {
  if (section !== "notes") {
    return null;
  }

  if (selectedNode?.type === "folder") {
    return {
      sourcePath: selectedNode.sourcePath ?? "",
      label: selectedNode.sourcePath || "docs root",
    };
  }

  if (selectedNode?.type === "note" && selectedNote?.sourcePath) {
    const parentPath = getParentSourcePath(selectedNote.sourcePath);
    return {
      sourcePath: parentPath,
      label: parentPath || "docs root",
    };
  }

  return {
    sourcePath: "",
    label: "docs root",
  };
}

function getParentSourcePath(sourcePath: string) {
  const segments = sourcePath.split("/").filter(Boolean);
  segments.pop();
  return segments.join("/");
}

async function resolveAbsoluteNotesFolderPath(sourcePath: string) {
  const response = await fetch(`${sidebarApiBase}/api/docs/source`);
  const data = (await response.json()) as { path?: string; additionalPaths?: string[]; error?: string };

  if (!response.ok || !data.path) {
    throw new Error(data.error || "Failed to resolve docs folder");
  }

  const normalizedSourcePath = sourcePath.trim();
  if (!normalizedSourcePath) {
    return data.path;
  }

  const importedPrefix = "__imported__/";
  if (normalizedSourcePath.startsWith(importedPrefix)) {
    const rest = normalizedSourcePath.slice(importedPrefix.length);
    const slashIndex = rest.indexOf("/");
    const folderName = slashIndex === -1 ? rest : rest.slice(0, slashIndex);
    const innerPath = slashIndex === -1 ? "" : rest.slice(slashIndex + 1);
    const importedRoot = (data.additionalPaths ?? []).find((entry) => getPathBasename(entry) === folderName);

    if (!importedRoot) {
      throw new Error(`Imported folder "${folderName}" is not registered`);
    }

    return joinFilesystemPath(importedRoot, innerPath);
  }

  return joinFilesystemPath(data.path, normalizedSourcePath);
}

function joinFilesystemPath(rootPath: string, relativePath: string) {
  const separator = rootPath.includes("\\") ? "\\" : "/";
  const normalizedRoot = rootPath.replace(/[\\/]+$/g, "");
  const segments = relativePath.split("/").filter(Boolean);
  return segments.length === 0 ? normalizedRoot : [normalizedRoot, ...segments].join(separator);
}

function getPathBasename(value: string) {
  const normalized = value.replace(/[\\/]+$/g, "");
  const segments = normalized.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) ?? "";
}

function readFileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Unable to read file"));
        return;
      }

      resolve(result.slice(result.indexOf(",") + 1));
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error("Unable to read file"));
    };

    reader.readAsDataURL(file);
  });
}

function createRecentDocumentSeed(note: Note, snapshot: NavigationSnapshot): RecentDocumentSeed {
  return {
    documentId: `${note.kind}:${note.id}`,
    kind: note.kind,
    title: note.title,
    subtitle:
      note.path?.length ? note.path.join(" / ") : getNoteSourceFileName(note) || (note.kind === "wiki" ? "Wiki page" : "Markdown note"),
    preview: getRecentDocumentPreview(note),
    snapshot,
  };
}

function createRecentTodoSeed(todo: TodoItem, snapshot: NavigationSnapshot): RecentDocumentSeed {
  return {
    documentId: `todo:${todo.id}`,
    kind: "todo",
    title: todo.title,
    subtitle: todo.listName,
    preview: getTodoRecentPreview(todo),
    snapshot,
  };
}

function getRecentDocumentPreview(note: Note) {
  const normalized = note.summary.trim();
  if (normalized) {
    return normalized;
  }

  return `Updated ${formatNoteTimestamp(note.updatedAt)}`;
}

function resolveRecentEntryNote(
  entry: RecentDocumentEntry,
  notesTreeNodes: NoteTreeNode[],
  wikiTreeNodes: NoteTreeNode[],
  notesList: Note[],
) {
  const targetTree = entry.kind === "wiki" ? wikiTreeNodes : notesTreeNodes;
  const targetNodeId = entry.snapshot.selectedNoteNodeId;
  if (!targetNodeId) {
    return null;
  }

  const node = findNoteTreeNodeById(targetTree, targetNodeId);
  if (!node || node.type !== "note") {
    return null;
  }

  return notesList.find((item) => item.id === node.noteId) ?? node.note ?? null;
}

function countNoteFolders(tree: NoteTreeNode[]): number {
  return tree.reduce((count, node) => {
    if (node.type === "folder") {
      return count + 1 + countNoteFolders(node.children);
    }
    return count;
  }, 0);
}

function collectFolderSuggestionPaths(tree: NoteTreeNode[], trail: string[] = []): string[][] {
  const paths: string[][] = [];

  for (const node of tree) {
    if (node.type !== "folder") {
      continue;
    }

    const nextTrail = [...trail, node.title];
    paths.push(nextTrail);
    paths.push(...collectFolderSuggestionPaths(node.children, nextTrail));
  }

  return paths;
}

function filterBookmarkTree(tree: BookmarkNode[], query: string): BookmarkNode[] {
  return tree
    .map((node) => {
      if (node.type === "folder") {
        const children = filterBookmarkTree(node.children, query);
        if (children.length > 0 || matchesSearch(node.title, query)) {
          return { ...node, children };
        }
        return null;
      }

      const haystack = [node.title, node.description || "", node.url, node.domain, node.tags.join(" ")].join(" ");
      return matchesSearch(haystack, query) ? node : null;
    })
    .filter((node): node is BookmarkNode => Boolean(node));
}

function firstTreeNode(tree: BookmarkNode[]): BookmarkNode | null {
  for (const node of tree) {
    if (node.type === "bookmark") {
      return node;
    }
    const nested = firstTreeNode(node.children);
    if (nested) {
      return nested;
    }
    return node;
  }
  return null;
}

function collectFolderIds(tree: BookmarkNode[], ids: Set<string> = new Set()): Set<string> {
  for (const node of tree) {
    if (node.type === "folder") {
      ids.add(node.id);
      collectFolderIds(node.children, ids);
    }
  }
  return ids;
}

function updateBookmarkStarredState(tree: BookmarkNode[], bookmarkId: string, starred: boolean): BookmarkNode[] {
  let changed = false;

  const nextTree = tree.map((node) => {
    if (node.type === "folder") {
      const nextChildren = updateBookmarkStarredState(node.children, bookmarkId, starred);
      if (nextChildren !== node.children) {
        changed = true;
        return { ...node, children: nextChildren };
      }
      return node;
    }

    if (node.id !== bookmarkId) {
      return node;
    }

    changed = true;
    return { ...node, starred };
  });

  return changed ? nextTree : tree;
}

function flattenLocalTree(tree: BookmarkNode[], path: string[] = []): BookmarkItem[] {
  return tree.flatMap((node) => {
    if (node.type === "folder") {
      return flattenLocalTree(node.children, [...path, node.title]);
    }

    return [
      {
        id: node.id,
        title: node.title,
        description: node.description || (path.length ? `Imported from ${path.join(" / ")}` : "Imported bookmark"),
        url: node.url,
        domain: node.domain,
        icon: node.icon,
        tags: node.tags,
        path,
        starred: Boolean(node.starred),
      },
    ];
  });
}

function countFolders(tree: BookmarkNode[]): number {
  return tree.reduce((count, node) => {
    if (node.type === "folder") {
      return count + 1 + countFolders(node.children);
    }
    return count;
  }, 0);
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

function findParentFolderId(tree: BookmarkNode[], nodeId: string, parentId: string | null = null): string | null {
  for (const node of tree) {
    if (node.id === nodeId) {
      return parentId;
    }
    if (node.type === "folder") {
      const nested = findParentFolderId(node.children, nodeId, node.id);
      if (nested !== null || node.children.some((child) => child.id === nodeId)) {
        return nested ?? node.id;
      }
    }
  }
  return null;
}

function getInsertionFolderId(tree: BookmarkNode[], selectedId: string | null): string | null {
  if (!selectedId) {
    return null;
  }

  const selectedNode = findNodeById(tree, selectedId);
  if (!selectedNode) {
    return null;
  }

  return selectedNode.type === "folder" ? selectedNode.id : findParentFolderId(tree, selectedId);
}

function insertNodeIntoFolder(tree: BookmarkNode[], folderId: string | null, nodeToInsert: BookmarkNode): BookmarkNode[] {
  if (!folderId) {
    return [...tree, nodeToInsert];
  }

  return tree.map((node) => {
    if (node.type === "folder") {
      if (node.id === folderId) {
        return { ...node, children: [...node.children, nodeToInsert] };
      }
      return { ...node, children: insertNodeIntoFolder(node.children, folderId, nodeToInsert) };
    }
    return node;
  });
}

function updateNodeById(
  tree: BookmarkNode[],
  nodeId: string,
  updater: (node: BookmarkNode) => BookmarkNode,
): BookmarkNode[] {
  return tree.map((node) => {
    if (node.id === nodeId) {
      return updater(node);
    }
    if (node.type === "folder") {
      return { ...node, children: updateNodeById(node.children, nodeId, updater) };
    }
    return node;
  });
}

function removeNodeById(tree: BookmarkNode[], nodeId: string): BookmarkNode[] {
  return tree
    .filter((node) => node.id !== nodeId)
    .map((node) =>
      node.type === "folder" ? { ...node, children: removeNodeById(node.children, nodeId) } : node,
    );
}

function moveBookmarkNode(
  tree: BookmarkNode[],
  sourceId: string,
  targetId: string,
  placement: "before" | "inside",
): BookmarkNode[] {
  const sourceNode = findNodeById(tree, sourceId);
  if (!sourceNode || sourceId === targetId) {
    return tree;
  }

  if (sourceNode.type === "folder" && findNodeById(sourceNode.children, targetId)) {
    return tree;
  }

  const [prunedTree, extractedNode] = extractNode(tree, sourceId);
  if (!extractedNode) {
    return tree;
  }

  if (placement === "inside") {
    return insertNodeIntoFolder(prunedTree, targetId, extractedNode);
  }

  return insertNodeBefore(prunedTree, targetId, extractedNode);
}

function extractNode(tree: BookmarkNode[], nodeId: string): [BookmarkNode[], BookmarkNode | null] {
  let extracted: BookmarkNode | null = null;

  const nextTree = tree.reduce<BookmarkNode[]>((accumulator, node) => {
    if (node.id === nodeId) {
      extracted = node;
      return accumulator;
    }

    if (node.type === "folder") {
      const [children, nested] = extractNode(node.children, nodeId);
      if (nested) {
        extracted = nested;
      }
      accumulator.push({ ...node, children });
      return accumulator;
    }

    accumulator.push(node);
    return accumulator;
  }, []);

  return [nextTree, extracted];
}

function insertNodeBefore(tree: BookmarkNode[], targetId: string, nodeToInsert: BookmarkNode): BookmarkNode[] {
  const [nextTree, inserted] = insertNodeBeforeInternal(tree, targetId, nodeToInsert);
  return inserted ? nextTree : [...tree, nodeToInsert];
}

function insertNodeBeforeInternal(
  tree: BookmarkNode[],
  targetId: string,
  nodeToInsert: BookmarkNode,
): [BookmarkNode[], boolean] {
  let inserted = false;

  const nextTree = tree.reduce<BookmarkNode[]>((accumulator, node) => {
    if (node.id === targetId) {
      inserted = true;
      accumulator.push(nodeToInsert, node);
      return accumulator;
    }

    if (node.type === "folder") {
      const [children, childInserted] = insertNodeBeforeInternal(node.children, targetId, nodeToInsert);
      if (childInserted) {
        inserted = true;
        accumulator.push({ ...node, children });
        return accumulator;
      }
    }

    accumulator.push(node);
    return accumulator;
  }, []);

  return [nextTree, inserted];
}

function buildGeneratedWikiFromBookmarks(bookmarks: BookmarkItem[]) {
  const tree: NoteTreeNode[] = [];
  const notes: Note[] = [];
  const generatedIdCounts = new Map<string, number>();

  for (const bookmark of bookmarks) {
    const classification = classifyWikiBookmark(bookmark);
    if (!classification) {
      continue;
    }

    const noteIdentity = [
      bookmark.id,
      bookmark.title,
      bookmark.url,
      bookmark.path.join("/"),
      classification.section,
      classification.domain,
      classification.folders.join("/"),
    ].join("|");
    const duplicateIndex = generatedIdCounts.get(noteIdentity) ?? 0;
    generatedIdCounts.set(noteIdentity, duplicateIndex + 1);

    const note = createGeneratedWikiNote(bookmark, classification, duplicateIndex);
    notes.push(note);
    insertGeneratedNote(tree, [classification.section, classification.domain, ...classification.folders], note);
  }

  notes.sort((left, right) => left.title.localeCompare(right.title));
  tree.sort(sortNoteTreeNodes);

  return { tree, notes };
}

function classifyWikiBookmark(bookmark: BookmarkItem) {
  const normalizedUrl = bookmark.url.toLowerCase();
  const domain = bookmark.domain.toLowerCase();

  if (domain.includes("confluence")) {
    return {
      section: "Confluence",
      domain: bookmark.domain,
      folders: extractConfluenceFolders(bookmark.url),
    };
  }

  if (domain === "wiki.cisco.com") {
    return {
      section: "Confluence",
      domain: bookmark.domain,
      folders: [],
    };
  }

  if (domain.includes("github")) {
    if (!isGithubWikiUrl(normalizedUrl)) {
      return null;
    }

    return {
      section: "Github",
      domain: bookmark.domain,
      folders: extractGithubFolders(bookmark.url),
    };
  }

  if (isLoggingBookmark(domain, normalizedUrl, bookmark.title)) {
    return {
      section: "Logging",
      domain: bookmark.domain,
      folders: [],
    };
  }

  if (domain.includes("figma.com")) {
    return {
      section: "Design",
      domain: bookmark.domain,
      folders: [],
    };
  }

  if (domain.includes("cosmosx.cisco.com") || domain.includes("automateddiagnostics")) {
    return {
      section: "Diagnostics",
      domain: bookmark.domain,
      folders: [],
    };
  }

  if (isGeneralDocsBookmark(domain, normalizedUrl)) {
    return {
      section: "Docs",
      domain: bookmark.domain,
      folders: [],
    };
  }

  return null;
}

function isGithubWikiUrl(url: string) {
  return url.includes("/docs/") || /\.md(?:$|[?#])/i.test(url);
}

function isLoggingBookmark(domain: string, url: string, title: string) {
  const candidate = `${domain} ${url} ${title.toLowerCase()}`;
  return (
    domain.includes("logs.o.webex.com") ||
    domain.includes("grafana") ||
    domain.includes("automateddiagnostics") ||
    url.includes("/support/logs") ||
    candidate.includes("call analyzer") ||
    candidate.includes("log analyzer")
  );
}

function isGeneralDocsBookmark(domain: string, url: string) {
  return (
    domain.includes("docs.") ||
    domain === "wiki.cisco.com" ||
    url.includes("/display/") ||
    url.includes("/pages/")
  );
}

function extractConfluenceFolders(url: string) {
  try {
    const parsed = new URL(url);
    const displayMatch = parsed.pathname.match(/\/display\/([^/]+)/i);
    if (displayMatch?.[1]) {
      return [displayMatch[1]];
    }
  } catch {}

  return [];
}

function extractGithubFolders(url: string) {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const folders: string[] = [];

    if (segments.length >= 2) {
      folders.push(`${segments[0]}/${segments[1]}`);
    }

    if (segments.includes("docs")) {
      folders.push("docs");
    }

    return folders;
  } catch {
    return [];
  }
}

function createGeneratedWikiNote(
  bookmark: BookmarkItem,
  classification: { section: string; domain: string; folders: string[] },
  duplicateIndex = 0,
): Note {
  const uniqueBookmarkScope = [
    bookmark.id,
    classification.section,
    classification.domain,
    ...classification.folders,
    ...bookmark.path,
    bookmark.title,
    bookmark.url,
    duplicateIndex === 0 ? "" : `dup:${duplicateIndex}`,
  ].join("|");

  return {
    id: `wiki-${createNodeId(`bookmark-note:${uniqueBookmarkScope}`)}`,
    title: bookmark.title,
    summary:
      bookmark.description ||
      `Saved from ${classification.domain}${classification.folders.length ? ` / ${classification.folders.join(" / ")}` : ""}`,
    tags: Array.from(
      new Set([
        ...bookmark.tags,
        slugify(classification.section),
        slugify(classification.domain),
        ...classification.folders.map(slugify),
      ]),
    ),
    updatedAt: "Generated",
    kind: "wiki",
    content: buildGeneratedWikiMarkdown(bookmark, classification),
    path: [classification.section, classification.domain, ...classification.folders],
    sourcePath: bookmark.url,
  };
}

function buildGeneratedWikiMarkdown(
  bookmark: BookmarkItem,
  classification: { section: string; domain: string; folders: string[] },
) {
  return `# ${bookmark.title}

${bookmark.description || "Auto-generated from favorites."}

## Source

- Section: ${classification.section}
- Domain: ${classification.domain}
- URL: ${bookmark.url}
- Favorites path: ${bookmark.path.length ? bookmark.path.join(" / ") : "root"}

## Tags

${bookmark.tags.length ? bookmark.tags.map((tag) => `- #${tag}`).join("\n") : "- none"}
`;
}

function buildRootFolderIdByTitleMap(tree: NoteTreeNode[]) {
  const rootFolderIdByTitle = new Map<string, string>();

  for (const node of tree) {
    if (node.type === "folder") {
      rootFolderIdByTitle.set(node.title, node.id);
    }
  }

  return rootFolderIdByTitle;
}

function filterNotesByHiddenRootFolderIds(
  notesList: Note[],
  hiddenRootFolderIds: Set<string>,
  rootFolderIdByTitle: Map<string, string>,
) {
  if (hiddenRootFolderIds.size === 0) {
    return notesList;
  }

  return notesList.filter((note) => {
    const rootFolderTitle = note.path?.[0] ?? getFoldersFromSourcePath(note.sourcePath)[0];
    if (!rootFolderTitle) {
      return true;
    }

    const rootFolderId = rootFolderIdByTitle.get(rootFolderTitle);
    return !rootFolderId || !hiddenRootFolderIds.has(rootFolderId);
  });
}

function filterNoteTreeByHiddenRootFolderIds(tree: NoteTreeNode[], hiddenRootFolderIds: Set<string>): NoteTreeNode[] {
  if (hiddenRootFolderIds.size === 0) {
    return tree;
  }

  return tree.filter((node) => node.type !== "folder" || !hiddenRootFolderIds.has(node.id));
}

function insertGeneratedNote(tree: NoteTreeNode[], folders: string[], note: Note) {
  let currentLevel = tree;

  for (const folderTitle of folders) {
    let folderNode = currentLevel.find(
      (node): node is NoteFolderNode => node.type === "folder" && node.title === folderTitle,
    );

    if (!folderNode) {
      folderNode = {
        id: createNodeId(`wiki-folder-${folders.join("/")}-${folderTitle}`),
        type: "folder",
        title: folderTitle,
        children: [],
      };
      currentLevel.push(folderNode);
    }

    currentLevel = folderNode.children;
  }

  currentLevel.push({
    id: note.id,
    type: "note",
    noteId: note.id,
    note,
  });
}

function buildPersistedNoteTree(notesList: Note[]): NoteTreeNode[] {
  const tree: NoteTreeNode[] = [];

  for (const note of notesList) {
    const folders: string[] = note.path?.length ? note.path : getFoldersFromSourcePath(note.sourcePath);
    let currentLevel = tree;
    const folderPath: string[] = [];

    for (const folderTitle of folders) {
      folderPath.push(folderTitle);
      let folderNode = currentLevel.find(
        (node): node is NoteFolderNode => node.type === "folder" && node.title === folderTitle,
      );

      if (!folderNode) {
        folderNode = {
          id: createNodeId(`docs-folder-${folderPath.join("/")}`),
          type: "folder",
          title: folderTitle,
          children: [],
        };
        currentLevel.push(folderNode);
      }

      currentLevel = folderNode.children;
    }

    currentLevel.push({
      id: note.id,
      type: "note",
      noteId: note.id,
      note,
    });
  }

  tree.sort(sortNoteTreeNodes);
  return tree;
}

function getFoldersFromSourcePath(sourcePath?: string): string[] {
  if (!sourcePath) {
    return [];
  }

  const segments = sourcePath.split("/").filter(Boolean);
  segments.pop();
  return segments.map(formatFolderSegment);
}

function formatFolderSegment(segment: string) {
  return segment
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function sortNoteTreeNodes(left: NoteTreeNode, right: NoteTreeNode) {
  if (left.type !== right.type) {
    return left.type === "folder" ? -1 : 1;
  }

  if (left.type === "folder" && right.type === "folder") {
    left.children.sort(sortNoteTreeNodes);
    right.children.sort(sortNoteTreeNodes);
    return left.title.localeCompare(right.title);
  }

  if (left.type === "note" && right.type === "note") {
    return (left.note?.title ?? left.noteId).localeCompare(right.note?.title ?? right.noteId);
  }

  return 0;
}


function getScopeLabel(scope: SectionId) {
  if (scope === "notes") return "Notes";
  if (scope === "wiki") return "Wiki";
  if (scope === "bookmarks") return "Bookmarks";
  if (scope === "todo") return "TODO";
  if (scope === "starred") return "Starred";
  if (scope === "recent") return "Recent";
  return scope;
}

function reorderItems(order: SectionId[], source: SectionId, target: SectionId) {
  const nextOrder = [...order];
  const sourceIndex = nextOrder.indexOf(source);
  const targetIndex = nextOrder.indexOf(target);
  if (sourceIndex === -1 || targetIndex === -1) {
    return nextOrder;
  }
  nextOrder.splice(sourceIndex, 1);
  nextOrder.splice(targetIndex, 0, source);
  return nextOrder;
}

function normalizeVisibleSection(section: SectionId): SectionId {
  return section === "wiki" ? "bookmarks" : section;
}

function normalizeNavOrder(order: SectionId[]): SectionId[] {
  const visibleItems = Array.isArray(order)
    ? order
        .filter((item): item is SectionId => defaultNavOrder.some((visibleItem) => visibleItem === item))
        .filter((item, index, list) => list.indexOf(item) === index)
    : [];

  return [...visibleItems, ...defaultNavOrder.filter((item) => !visibleItems.includes(item))];
}

function safeDomain(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function createIcon(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase() || "BM";
}

function createNodeId(value: string) {
  let hash = 0;

  for (const character of value) {
    hash = (hash * 31 + character.codePointAt(0)!) >>> 0;
  }

  return `node-${hash.toString(36)}`;
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

export default App;
