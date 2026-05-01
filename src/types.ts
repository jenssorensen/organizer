import type { LucideIcon } from "lucide-react";
import type { AppPrefs } from "./appTypes";
import type { NavigationSnapshot } from "./navigationHistory";

export type SectionId = "notes" | "wiki" | "bookmarks" | "todo" | "starred" | "recent";

export type TodoStatus = "not-started" | "in-progress" | "paused" | "completed";
export type TodoPriority = "low" | "medium" | "high" | "urgent";
export type TodoViewMode = "list" | "calendar";
export type TodoRecurrenceUnit = "day" | "week" | "month" | "year";

export type TodoRecurrence = {
  unit: TodoRecurrenceUnit;
  interval: number;        // every N units
  endDate?: string | null; // ISO date, stop spawning after this
};

export type TodoItem = {
  id: string;
  title: string;
  description: string;
  status: TodoStatus;
  priority: TodoPriority;
  tags: string[];
  color: string;
  listName: string;
  createdAt: string;
  updatedAt: string;
  startDate: string | null;
  expectedCompletionDate: string | null;
  completedAt: string | null;
  pinned: boolean;
  starred: boolean;
  order: number;
  parentId: string | null;
  reminderAt: string | null;
  recurrence: TodoRecurrence | null;
  snoozeUntil: string | null;    // ISO datetime; hide from active list until then
  inboxItem: boolean;            // captured via quick-capture without a list assignment
};

export type TodoPayload = {
  items: TodoItem[];
  viewMode: TodoViewMode;
  selectedTodoId: string | null;
};

export type Note = {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  createdAt?: string;
  updatedAt: string;
  starred?: boolean;
  kind: "note" | "wiki";
  content: string;
  path?: string[];
  sourcePath?: string;
};

export type NoteFolderNode = {
  id: string;
  type: "folder";
  title: string;
  children: NoteTreeNode[];
  sourcePath?: string;
};

export type NoteLeafNode = {
  id: string;
  type: "note";
  noteId: string;
  note?: Note;
};

export type NoteTreeNode = NoteFolderNode | NoteLeafNode;

export type BookmarkItem = {
  id: string;
  title: string;
  description: string;
  url: string;
  domain: string;
  icon: string;
  tags: string[];
  path: string[];
  starred?: boolean;
};

export type BookmarkFolder = {
  id: string;
  type: "folder";
  title: string;
  children: BookmarkNode[];
};

export type BookmarkLeaf = {
  id: string;
  type: "bookmark";
  title: string;
  description?: string;
  url: string;
  domain: string;
  icon: string;
  tags: string[];
  starred?: boolean;
};

export type BookmarkNode = BookmarkFolder | BookmarkLeaf;

export type QuickCaptureTab = "task" | "note" | "bookmark";

export type QuickCaptureState = {
  tab: QuickCaptureTab;
  title: string;
  url: string;           // bookmark only
  description: string;   // bookmark only
  listName: string;      // task only — "" means Inbox
  noteTemplate: string;  // note only
  toInbox: boolean;      // task: skip list assignment; note: skip folder assignment
};

export type BookmarkDialogState =
  | { kind: "closed" }
  | { kind: "add-folder"; title: string }
  | { kind: "add-bookmark"; title: string; url: string; description: string }
  | { kind: "edit-folder"; nodeId: string; title: string }
  | { kind: "edit-bookmark"; nodeId: string; title: string; url: string; description: string }
  | { kind: "delete"; nodeId: string; title: string };

export type NoteCreationDialogState =
  | { kind: "closed" }
  | { kind: "document"; creationPath: string; name: string; targetPath: string; selectedTemplate: string }
  | { kind: "folder"; creationPath: string; name: string; targetPath: string }
  | { kind: "section"; creationPath: string; name: string; targetPath: string };

export type SearchEntry = {
  id: string;
  title: string;
  subtitle: string;
  category: "note" | "wiki" | "bookmark" | "todo" | "tag" | "code";
  tags: string[];
  filterTags?: string[];
  isRecent?: boolean;
  isStarred?: boolean;
  matchText?: string;
  scoreText: string;
  todoDueDate?: string | null;
  todoStatus?: TodoStatus;
  targetSection?: SectionId;
  targetId?: string;
  targetPath?: string[];
  targetQuery?: string;
  targetUrl?: string;
};

export type ViewerContent = {
  title: string;
  eyebrow: string;
  badge: string;
  markdown: string;
};

export type ParsedSearchQuery = {
  noteSectionScope: string | null;
  sectionScope: SectionId | null;
  folderScopePath: string[];
  query: string;
};

export type ParsedSearchFilterQuery = {
  due: string | null;
  hasFilters: boolean;
  isRecent: boolean;
  isStarred: boolean;
  query: string;
  tags: string[];
  types: SearchEntry["category"][];
};

export type NoteBreadcrumb = {
  id: string | null;
  label: string;
  isCurrent: boolean;
};

export type NavItem = {
  id: SectionId;
  label: string;
  icon: LucideIcon;
  count: number;
};

export type SidebarOrderResponse = {
  order: SectionId[];
};

export type BookmarksResponse = {
  tree: BookmarkNode[];
  bookmarks: BookmarkItem[];
};

export type ImportResponse = {
  tree: BookmarkNode[];
  bookmarks: BookmarkItem[];
  imported: number;
  duplicatesFiltered: number;
};

export type NotesResponse = {
  tree: NoteTreeNode[];
  notes: Note[];
  docsFolder: string;
  additionalFolders: string[];
};

export type DocsUploadResponse = {
  targetPath: string;
  uploaded: Array<{
    fileName: string;
    sourcePath: string;
    indexed: boolean;
  }>;
  indexedCount: number;
};

export type DocsCreateResponse = {
  targetPath: string;
  fileName: string;
  sourcePath: string;
  note: Note;
};

export type DocsCreateFolderResponse = {
  targetPath: string;
  folderName: string;
  sourcePath: string;
};

export type DocsRenameResponse = {
  fileName: string;
  sourcePath: string;
};

export type UnfurlResponse = {
  url: string;
  title: string;
  description: string;
  image: string | null;
  siteName: string;
};

export type NoteUploadTarget = {
  sourcePath: string;
  label: string;
};

export type RecentDocumentSeed = {
  documentId: string;
  kind: "note" | "wiki" | "todo";
  title: string;
  subtitle: string;
  preview: string;
  snapshot: NavigationSnapshot;
};

export type RecentDocumentEntry = RecentDocumentSeed & {
  id: string;
  pinned: boolean;
  viewedAt: number;
  viewCount: number;
  lastEditedAt: number;
  lastCompletedAt: number;
};

export type SmartFolder = {
  id: string;
  label: string;
  query: string;
};

export type TrashEntry = {
  id: string;
  sourcePath: string;
  title: string;
  deletedAt: string;
};

export type TrashResponse = {
  entries: TrashEntry[];
};

export type WorkspaceInfo = {
  id: string;
  label: string;
  path: string;
  isActive: boolean;
};

export type GraphNode = {
  id: string;
  title: string;
  sourcePath: string;
  linkCount: number;
};

export type GraphLink = {
  source: string;
  target: string;
};

export type SavedSearch = {
  id: string;
  label: string;
  query: string;
};

export type WorkspaceBackupNote = {
  sourcePath: string;
  title: string;
  tags: string[];
  content: string;
  updatedAt: string;
  createdAt: string | null;
};

export type WorkspaceBackupSnapshot = {
  version: 1;
  createdAt: number;
  label: string;
  isAutomatic: boolean;
  notes: WorkspaceBackupNote[];
  bookmarks: BookmarkNode[];
  todo: TodoPayload;
  recentDocuments: RecentDocumentEntry[];
  savedSearches: SavedSearch[];
  pinnedNoteIds: string[];
  prefs: AppPrefs;
  sidebarOrder: SectionId[];
  starredNotePaths: string[];
};

export type RestorePointSummary = {
  id: string;
  label: string;
  createdAt: number;
  isAutomatic: boolean;
  noteCount: number;
  bookmarkCount: number;
  todoCount: number;
  recentDocumentCount: number;
};

export type FullTextSearchResult = {
  noteId: string;
  sourcePath: string;
  title: string;
  snippet: string;
  matchStart: number;
  matchEnd: number;
};

export type PomodoroState = {
  isRunning: boolean;
  mode: "work" | "break" | "longBreak";
  timeRemaining: number;
  sessionsCompleted: number;
  linkedTodoId: string | null;
};

export type DailyNoteResponse = {
  sourcePath: string;
  note: Note;
  created: boolean;
};
