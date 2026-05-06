import { useState, useEffect, useMemo, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { ArrowUpDown, Check, Clock, Folder, GripVertical, PanelLeftClose, PanelLeftOpen, Pin, PinOff, Plus, Star, Trash2, X } from "lucide-react";
import type { Note, NoteTreeNode, RecentDocumentEntry } from "../types";
import type { NoteSectionSummary } from "../noteSections";
import { sortFolderNotes, type FolderNotesSortMode } from "../noteSorting";
import type { NoteTreeSearchState } from "../noteTreeSearchState";
import { canEditNote } from "../noteEditing";
import {
  getNoteSourceFileName,
  formatNoteTargetLocation,
  formatNoteTimestamp,
  formatRecentViewedAt,
  formatRecentViewCount,
  countNotesInTree,
} from "../noteFormatting";
import { getRecentActivityTimestamp, getRecentPrimaryActivity } from "../recentDocuments";

type SectionsSortMode = "custom" | "title" | "notes" | "folders";
type NavigationSortMode = "recent" | "views" | "created" | "modified" | "name-asc" | "name-desc";
type NoteRowViewMode = "detailed" | "compact";

const SECTIONS_SORT_OPTIONS: Array<{ label: string; value: SectionsSortMode }> = [
  { label: "Manual order", value: "custom" },
  { label: "Title", value: "title" },
  { label: "Most notes", value: "notes" },
  { label: "Most folders", value: "folders" },
];

const NAVIGATION_SORT_OPTIONS: Array<{ label: string; value: NavigationSortMode }> = [
  { label: "Most Recent", value: "recent" },
  { label: "Most Views", value: "views" },
  { label: "Date created", value: "created" },
  { label: "Date modified", value: "modified" },
  { label: "Name A → Z", value: "name-asc" },
  { label: "Name Z → A", value: "name-desc" },
];

const NOTE_ROW_VIEW_OPTIONS: Array<{ description: string; label: string; value: NoteRowViewMode }> = [
  { description: "Show filename, title, and metadata", label: "Detailed view", value: "detailed" },
  { description: "Show filename only", label: "Compact view", value: "compact" },
];

function compareText(left: string, right: string) {
  return left.localeCompare(right);
}

type NavigationNodeMetrics = {
  createdAt: number;
  recentViewedAt: number;
  title: string;
  updatedAt: number;
  viewCount: number;
};

function toSortTimestamp(value: string | undefined) {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortSectionsList(sections: NoteSectionSummary[], sortMode: SectionsSortMode) {
  if (sortMode === "custom") {
    return sections;
  }

  return [...sections].sort((left, right) => {
    if (sortMode === "notes") {
      return right.noteCount - left.noteCount || right.folderCount - left.folderCount || compareText(left.title, right.title);
    }

    if (sortMode === "folders") {
      return right.folderCount - left.folderCount || right.noteCount - left.noteCount || compareText(left.title, right.title);
    }

    return compareText(left.title, right.title);
  });
}

function sortNavigationNodes(
  nodes: NoteTreeNode[],
  sortMode: NavigationSortMode,
  allNotes: Note[],
  noteViewCounts: Map<string, number>,
  noteRecentViewedAt: Map<string, number>,
): NoteTreeNode[] {
  const notesById = new Map(allNotes.map((note) => [note.id, note]));
  const metricsCache = new Map<string, NavigationNodeMetrics>();

  function getNodeMetrics(node: NoteTreeNode): NavigationNodeMetrics {
    const cached = metricsCache.get(node.id);
    if (cached) {
      return cached;
    }

    if (node.type === "note") {
      const note = node.note ?? notesById.get(node.noteId) ?? null;
      const metrics: NavigationNodeMetrics = {
        createdAt: toSortTimestamp(note?.createdAt ?? note?.updatedAt),
        recentViewedAt: note ? noteRecentViewedAt.get(`${note.kind}:${note.id}`) ?? 0 : 0,
        title: note?.title ?? "",
        updatedAt: toSortTimestamp(note?.updatedAt),
        viewCount: note ? noteViewCounts.get(`${note.kind}:${note.id}`) ?? 0 : 0,
      };
      metricsCache.set(node.id, metrics);
      return metrics;
    }

    const metrics: NavigationNodeMetrics = node.children.reduce<NavigationNodeMetrics>(
      (accumulator, child) => {
        const childMetrics: NavigationNodeMetrics = getNodeMetrics(child);
        return {
          createdAt: Math.max(accumulator.createdAt, childMetrics.createdAt),
          recentViewedAt: Math.max(accumulator.recentViewedAt, childMetrics.recentViewedAt),
          title: node.title,
          updatedAt: Math.max(accumulator.updatedAt, childMetrics.updatedAt),
          viewCount: accumulator.viewCount + childMetrics.viewCount,
        };
      },
      { createdAt: 0, recentViewedAt: 0, title: node.title, updatedAt: 0, viewCount: 0 },
    );
    metricsCache.set(node.id, metrics);
    return metrics;
  }

  function sortNodeList(items: NoteTreeNode[]): NoteTreeNode[] {
    return items
      .map((node) =>
        node.type === "folder"
          ? { ...node, children: sortNodeList(node.children) }
          : node,
      )
      .sort((left, right) => {
        if (left.type !== right.type) {
          return left.type === "folder" ? -1 : 1;
        }

        const leftMetrics = getNodeMetrics(left);
        const rightMetrics = getNodeMetrics(right);

        if (sortMode === "recent") {
          return rightMetrics.recentViewedAt - leftMetrics.recentViewedAt || rightMetrics.viewCount - leftMetrics.viewCount || rightMetrics.updatedAt - leftMetrics.updatedAt || compareText(leftMetrics.title, rightMetrics.title);
        }

        if (sortMode === "views") {
          return rightMetrics.viewCount - leftMetrics.viewCount || rightMetrics.recentViewedAt - leftMetrics.recentViewedAt || rightMetrics.updatedAt - leftMetrics.updatedAt || compareText(leftMetrics.title, rightMetrics.title);
        }

        if (sortMode === "modified") {
          return rightMetrics.updatedAt - leftMetrics.updatedAt || rightMetrics.createdAt - leftMetrics.createdAt || compareText(leftMetrics.title, rightMetrics.title);
        }

        if (sortMode === "name-asc") {
          return compareText(leftMetrics.title, rightMetrics.title);
        }

        if (sortMode === "name-desc") {
          return compareText(rightMetrics.title, leftMetrics.title);
        }

        return rightMetrics.createdAt - leftMetrics.createdAt || rightMetrics.updatedAt - leftMetrics.updatedAt || compareText(leftMetrics.title, rightMetrics.title);
      });
  }

  return sortNodeList(nodes);
}
import { MarkdownContent } from "./MarkdownComponents";

const STORED_NOTES_OVERVIEW_SPLIT_KEY = "organizer:notes-overview-split:v3";
const STORED_NOTES_PREVIEW_SPLIT_KEY = "organizer:notes-preview-split:v2";
const STORED_NOTES_SECTIONS_COLLAPSED_KEY = "organizer:notes-sections-collapsed";
const STORED_NOTE_ROW_VIEW_MODE_KEY = "organizer:note-row-view-mode:v1";
const STORED_NOTES_SECTIONS_SORT_MODE_KEY = "organizer:notes-sections-sort-mode:v1";
const STORED_NOTES_NAVIGATION_SORT_MODE_KEY = "organizer:notes-navigation-sort-mode:v1";
const STORED_NOTES_FOLDER_ITEMS_SORT_MODE_KEY = "organizer:notes-folder-items-sort-mode:v1";
const STORED_NOTES_TREE_COLLAPSED_KEY = "organizer:notes-tree-collapsed:v1";
const STORED_NOTES_LIST_COLLAPSED_KEY = "organizer:notes-list-collapsed:v1";
const STORED_COLLAPSED_SECTION_GROUPS_KEY = "organizer:notes-collapsed-section-groups:v1";
const COLLAPSED_OVERVIEW_PANE_WIDTH = 44;
const MIN_NOTE_TREE_MAIN_WIDTH = 190;
const RESIZE_HANDLE_RESERVED_WIDTH = 46;
const FOLDER_NOTES_SORT_OPTIONS: Array<{ label: string; value: FolderNotesSortMode }> = [
  { label: "Most Recent", value: "recent" },
  { label: "Most Views", value: "views" },
  { label: "Date created", value: "created" },
  { label: "Date modified", value: "modified" },
  { label: "Name A → Z", value: "name-asc" },
  { label: "Name Z → A", value: "name-desc" },
];
const SECTION_COLOR_OPTIONS = [
  "#94a3b8",
  "#475569",
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#10b981",
  "#14b8a6",
  "#06b6d4",
  "#0ea5e9",
  "#3b82f6",
  "#6366f1",
  "#a855f7",
  "#ec4899",
  "#be123c",
] as const;

function clampNotesOverviewSplitPercent(value: number) {
  return Math.min(52, Math.max(11, value));
}

function clampNotesPreviewSplitPercent(value: number) {
  return clampNotesOverviewSplitPercent(value);
}

function getMinimumPaneSplitPercent(boundsWidth: number, minPaneWidth: number, minPercent: number, maxPercent: number) {
  if (boundsWidth <= RESIZE_HANDLE_RESERVED_WIDTH) {
    return minPercent;
  }

  const availableWidth = boundsWidth - RESIZE_HANDLE_RESERVED_WIDTH;
  return Math.min(maxPercent, Math.max(minPercent, (minPaneWidth / availableWidth) * 100));
}

function clampPaneSplitPercentForBounds(
  value: number,
  boundsWidth: number,
  minPaneWidth: number,
  minPercent: number,
  maxPercent: number,
) {
  const effectiveMinPercent = getMinimumPaneSplitPercent(boundsWidth, minPaneWidth, minPercent, maxPercent);
  return Math.min(maxPercent, Math.max(effectiveMinPercent, value));
}

function getResizableOverviewColumns(splitPercent: number) {
  return `minmax(${MIN_NOTE_TREE_MAIN_WIDTH}px, ${splitPercent}fr) auto minmax(260px, ${100 - splitPercent}fr)`;
}

function getCollapsedOverviewColumns() {
  return `${COLLAPSED_OVERVIEW_PANE_WIDTH}px minmax(260px, 1fr)`;
}

function getStoredNotesOverviewSplitPercent() {
  const defaultPercent = 33;
  if (typeof window === "undefined") {
    return defaultPercent;
  }

  const stored = Number(window.localStorage.getItem(STORED_NOTES_OVERVIEW_SPLIT_KEY));
  return Number.isFinite(stored) ? clampNotesOverviewSplitPercent(stored) : defaultPercent;
}

function getStoredNotesPreviewSplitPercent() {
  if (typeof window === "undefined") {
    return 50;
  }

  const stored = Number(window.localStorage.getItem(STORED_NOTES_PREVIEW_SPLIT_KEY));
  return Number.isFinite(stored) ? clampNotesPreviewSplitPercent(stored) : 50;
}

function getStoredNotesSectionsCollapsed() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(STORED_NOTES_SECTIONS_COLLAPSED_KEY) === "true";
}

function getStoredNoteRowViewMode(): NoteRowViewMode {
  if (typeof window === "undefined") {
    return "detailed";
  }

  const stored = window.localStorage.getItem(STORED_NOTE_ROW_VIEW_MODE_KEY);
  return stored === "compact" ? "compact" : "detailed";
}

function getStoredSectionsSortMode(): SectionsSortMode {
  if (typeof window === "undefined") {
    return "custom";
  }

  const stored = window.localStorage.getItem(STORED_NOTES_SECTIONS_SORT_MODE_KEY);
  return stored === "title" || stored === "notes" || stored === "folders" ? stored : "custom";
}

function getStoredNavigationSortMode(): NavigationSortMode {
  if (typeof window === "undefined") {
    return "recent";
  }

  const stored = window.localStorage.getItem(STORED_NOTES_NAVIGATION_SORT_MODE_KEY);
  return stored === "views" || stored === "created" || stored === "modified" || stored === "name-asc" || stored === "name-desc"
    ? stored
    : "recent";
}

function getStoredFolderNotesSortMode(): FolderNotesSortMode {
  if (typeof window === "undefined") {
    return "created";
  }

  const stored = window.localStorage.getItem(STORED_NOTES_FOLDER_ITEMS_SORT_MODE_KEY);
  return stored === "recent" || stored === "views" || stored === "modified" || stored === "name-asc" || stored === "name-desc"
    ? stored
    : "created";
}

function getStoredNotesTreeCollapsed() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(STORED_NOTES_TREE_COLLAPSED_KEY) === "true";
}

function getStoredNotesListCollapsed() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(STORED_NOTES_LIST_COLLAPSED_KEY) === "true";
}

function getStoredCollapsedSectionRootIds() {
  if (typeof window === "undefined") {
    return new Set<string>();
  }

  try {
    const raw = window.localStorage.getItem(STORED_COLLAPSED_SECTION_GROUPS_KEY);
    if (!raw) {
      return new Set<string>();
    }

    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((rootId): rootId is string => typeof rootId === "string" && rootId.trim().length > 0) : []);
  } catch {
    return new Set<string>();
  }
}

function NoteTreeItem({
  node,
  notes,
  noteViewCounts,
  pinnedNoteIds,
  expandedFolderIds,
  searchStateByNodeId,
  selectedNodeId,
  onOpenHistory,
  onRenameFile,
  onSelect,
  onTogglePinned,
  onToggleStar,
  onToggleFolder,
  onNoteDragStart,
  onNoteDragEnd,
  onNoteDrop,
  foldersOnly = false,
  viewMode = "detailed",
}: {
  node: NoteTreeNode;
  notes: Note[];
  noteViewCounts: Map<string, number>;
  pinnedNoteIds: Set<string>;
  expandedFolderIds: Set<string>;
  searchStateByNodeId: Map<string, NoteTreeSearchState>;
  selectedNodeId: string | null;
  onOpenHistory?: (note: Note) => void;
  onRenameFile?: (note: Note, nextFileName: string) => Promise<void> | void;
  onSelect: (nodeId: string) => void;
  onTogglePinned?: (noteId: string, nextPinned: boolean) => void;
  onToggleStar?: (note: Note, nextStarred: boolean) => void;
  onToggleFolder: (folderId: string) => void;
  onNoteDragStart?: (sourcePath: string) => void;
  onNoteDragEnd?: () => void;
  onNoteDrop?: (folderSourcePath: string) => void;
  foldersOnly?: boolean;
  viewMode?: NoteRowViewMode;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isEditingFileName, setIsEditingFileName] = useState(false);
  const [fileNameDraft, setFileNameDraft] = useState("");
  const expandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileNameInputRef = useRef<HTMLInputElement | null>(null);
  const note = node.type === "note" ? notes.find((item) => item.id === node.noteId) ?? node.note : null;
  const sourceFileName = note ? getNoteSourceFileName(note) : "";
  const canRenameFile = Boolean(note && sourceFileName && canEditNote(note) && onRenameFile);

  useEffect(() => {
    return () => {
      if (expandTimerRef.current !== null) clearTimeout(expandTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isEditingFileName) {
      return;
    }

    window.setTimeout(() => {
      fileNameInputRef.current?.focus();
      fileNameInputRef.current?.select();
    }, 0);
  }, [isEditingFileName]);

  useEffect(() => {
    if (!isEditingFileName) {
      setFileNameDraft(sourceFileName ?? "");
    }
  }, [isEditingFileName, sourceFileName]);

  function startEditingFileName(event: React.MouseEvent) {
    if (!canRenameFile || !sourceFileName) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setFileNameDraft(sourceFileName);
    setIsEditingFileName(true);
  }

  async function commitFileName() {
    if (!isEditingFileName || !note) {
      return;
    }

    setIsEditingFileName(false);
    const trimmedName = fileNameDraft.trim();
    if (!trimmedName || trimmedName === sourceFileName || !onRenameFile) {
      return;
    }

    await onRenameFile(note, trimmedName);
  }

  function cancelFileNameEdit() {
    setIsEditingFileName(false);
    setFileNameDraft(sourceFileName ?? "");
  }

  if (node.type === "folder") {
    const hasExpandableChildren = foldersOnly
      ? node.children.some((child) => child.type === "folder")
      : node.children.length > 0;
    const noteCount = countNotesInTree(node.children);
    const isExpanded = expandedFolderIds.has(node.id);
    const isSelected = selectedNodeId === node.id;
    const searchState = searchStateByNodeId.get(node.id) ?? "neutral";
    return (
      <div
        className={`tree-folder note-tree-folder ${isSelected ? "is-selected" : ""} ${
          searchState === "partial" ? "is-search-partial" : searchState === "excluded" ? "is-search-excluded" : ""
        }${isDragOver ? " is-drag-over" : ""}`}
        onDragOver={(event) => {
          if (!onNoteDrop) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "move";
          if (!isDragOver) setIsDragOver(true);
          if (!isExpanded && hasExpandableChildren && expandTimerRef.current === null) {
            expandTimerRef.current = setTimeout(() => {
              expandTimerRef.current = null;
              onToggleFolder(node.id);
            }, 800);
          }
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) {
            setIsDragOver(false);
            if (expandTimerRef.current !== null) {
              clearTimeout(expandTimerRef.current);
              expandTimerRef.current = null;
            }
          }
        }}
        onDrop={(event) => {
          if (!onNoteDrop) return;
          event.preventDefault();
          event.stopPropagation();
          setIsDragOver(false);
          if (expandTimerRef.current !== null) {
            clearTimeout(expandTimerRef.current);
            expandTimerRef.current = null;
          }
          onNoteDrop(node.sourcePath ?? "");
        }}
      >
        <div className="tree-folder__title">
          <span
            className="tree-folder__label note-tree-folder__label"
            onClick={() => onSelect(node.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(node.id);
              }
            }}
          >
            {hasExpandableChildren ? (
              <button
                className="folder-toggle"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleFolder(node.id);
                }}
                type="button"
              >
                <span aria-hidden="true" className="folder-toggle__marker">
                  {isExpanded ? "-" : "+"}
                </span>
              </button>
            ) : (
              <span aria-hidden="true" className="folder-toggle folder-toggle--spacer" />
            )}
            <Folder size={16} />
            <span>
              {node.title} <span className="tree-folder__count">({noteCount})</span>
            </span>
          </span>
        </div>
        {isExpanded && hasExpandableChildren ? (
          <div className="tree-folder__children">
            {node.children.map((child, index) => (
              <NoteTreeItem
                expandedFolderIds={expandedFolderIds}
                foldersOnly={foldersOnly}
                key={`${child.id}:${index}`}
                node={child}
                notes={notes}
                noteViewCounts={noteViewCounts}
                pinnedNoteIds={pinnedNoteIds}
                onNoteDragEnd={onNoteDragEnd}
                onNoteDragStart={onNoteDragStart}
                onNoteDrop={onNoteDrop}
                onOpenHistory={onOpenHistory}
                onRenameFile={onRenameFile}
                onSelect={onSelect}
                onTogglePinned={onTogglePinned}
                onToggleStar={onToggleStar}
                onToggleFolder={onToggleFolder}
                searchStateByNodeId={searchStateByNodeId}
                selectedNodeId={selectedNodeId}
                viewMode={viewMode}
              />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  if (foldersOnly) {
    return null;
  }

  if (!note) {
    return null;
  }

  const isSelected = selectedNodeId === node.id;
  const searchState = searchStateByNodeId.get(node.id) ?? "neutral";
  const sourcePathTitle = note.sourcePath ? formatNoteTargetLocation(note.sourcePath) : undefined;
  const viewCount = noteViewCounts.get(`${note.kind}:${note.id}`) ?? 0;
  const isPinned = pinnedNoteIds.has(note.id);
  const showHistory = typeof onOpenHistory === "function" && canEditNote(note) && Boolean(note.sourcePath);
  const showPinnedToggle = typeof onTogglePinned === "function";
  const showStar = canEditNote(note) && typeof onToggleStar === "function";
  const showLeafActions = showHistory || showPinnedToggle || showStar;
  const isCompactView = viewMode === "compact";

  return (
    <article
      className={`note-leaf note-leaf--tree ${isCompactView ? "note-leaf--compact" : ""} ${isSelected ? "is-selected" : ""} ${
        searchState === "partial" ? "is-search-partial" : searchState === "excluded" ? "is-search-excluded" : ""
      }`}
    >
      <div
        aria-pressed={isSelected}
        className={`note-leaf__tree-main${note.sourcePath ? " is-draggable" : ""}`}
        onClick={() => {
          if (!isEditingFileName) {
            onSelect(node.id);
          }
        }}
        draggable={!!note.sourcePath && !isEditingFileName}
        onDragEnd={() => {
          onNoteDragEnd?.();
        }}
        onDragStart={(event) => {
          if (!note.sourcePath || isEditingFileName) {
            event.preventDefault();
            return;
          }

          onNoteDragStart?.(note.sourcePath);
          event.dataTransfer.setData("application/x-note-sourcepath", note.sourcePath);
          event.dataTransfer.effectAllowed = "move";
        }}
        onKeyDown={(event) => {
          if (isEditingFileName) {
            return;
          }
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect(node.id);
          }
        }}
        role="button"
        tabIndex={0}
      >
        <div className={`note-leaf__tree-top ${showLeafActions ? "note-leaf__tree-top--with-actions" : ""}`}>
          {sourceFileName ? (
            isEditingFileName ? (
              <input
                ref={fileNameInputRef}
                className="note-leaf__file-input"
                value={fileNameDraft}
                onBlur={() => {
                  void commitFileName();
                }}
                onChange={(event) => setFileNameDraft(event.target.value)}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    cancelFileNameEdit();
                  }
                }}
                type="text"
              />
            ) : (
              <span className="note-leaf__file" onDoubleClick={startEditingFileName} title={canRenameFile ? "Double-click to rename file" : undefined}>{sourceFileName}</span>
            )
          ) : null}
          {showLeafActions ? (
            <div className="note-leaf__summary-actions note-leaf__summary-actions--tree">
              {showHistory ? (
                <button
                  aria-label="View version history"
                  className="note-leaf__summary-action"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenHistory?.(note);
                  }}
                  title="View version history"
                  type="button"
                >
                  <Clock size={13} />
                </button>
              ) : null}
              {showPinnedToggle ? (
                <button
                  aria-label={isPinned ? "Unpin from dashboard" : "Pin to dashboard"}
                  className={`note-leaf__summary-action ${isPinned ? "is-active" : ""}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onTogglePinned?.(note.id, !isPinned);
                  }}
                  title={isPinned ? "Unpin from dashboard" : "Pin to dashboard"}
                  type="button"
                >
                  {isPinned ? <PinOff size={13} /> : <Pin size={13} />}
                </button>
              ) : null}
              {showStar ? (
                <button
                  aria-label={note.starred ? "Remove star" : "Add star"}
                  className={`icon-action note-leaf__star note-leaf__star--inline ${note.starred ? "is-active" : ""}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleStar?.(note, !note.starred);
                  }}
                  title={note.starred ? "Remove star" : "Add star"}
                  type="button"
                >
                  <Star fill={note.starred ? "currentColor" : "none"} size={15} />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        {!isCompactView ? <span aria-hidden="true" className="note-leaf__separator" /> : null}
        {!isCompactView ? <span className="note-leaf__title" title={sourcePathTitle}>{note.title}</span> : null}
        {!isCompactView ? <span className="note-leaf__meta">{formatNoteTimestamp(note.updatedAt)} · {formatRecentViewCount(viewCount)}</span> : null}
      </div>
    </article>
  );
}

function SectionCustomizationDialog({
  defaultSection,
  onChangeColor,
  onChangeTitle,
  onClose,
  onConfirm,
  onReset,
  section,
  sectionColor,
  sectionTitle,
}: {
  defaultSection: NoteSectionSummary | null;
  onChangeColor: (value: string) => void;
  onChangeTitle: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  onReset: () => void;
  section: NoteSectionSummary | null;
  sectionColor: string;
  sectionTitle: string;
}) {
  const [isCustomColorPickerOpen, setIsCustomColorPickerOpen] = useState(false);
  const [pendingCustomColor, setPendingCustomColor] = useState(sectionColor);

  useEffect(() => {
    if (!section || !defaultSection) {
      return;
    }

    setIsCustomColorPickerOpen(false);
    setPendingCustomColor(sectionColor);
  }, [defaultSection, section, sectionColor]);

  useEffect(() => {
    if (!section || !defaultSection) {
      return;
    }

    if (!isCustomColorPickerOpen) {
      setPendingCustomColor(sectionColor);
    }
  }, [defaultSection, isCustomColorPickerOpen, section, sectionColor]);

  useEffect(() => {
    if (!section || !defaultSection) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      if (isCustomColorPickerOpen) {
        setIsCustomColorPickerOpen(false);
        setPendingCustomColor(sectionColor);
        return;
      }

      onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [defaultSection, isCustomColorPickerOpen, onClose, section, sectionColor]);

  if (!section || !defaultSection) {
    return null;
  }

  function openCustomColorPicker() {
    setPendingCustomColor(sectionColor);
    setIsCustomColorPickerOpen(true);
  }

  function cancelCustomColorPicker() {
    setIsCustomColorPickerOpen(false);
    setPendingCustomColor(sectionColor);
  }

  function confirmCustomColorPicker() {
    onChangeColor(pendingCustomColor);
    setIsCustomColorPickerOpen(false);
  }

  return (
    <div className="dialog-backdrop" role="presentation" onClick={(event) => {
      if (event.target === event.currentTarget) {
        onClose();
      }
    }}>
      <div
        aria-labelledby="section-customization-dialog-title"
        aria-modal="true"
        className="dialog-card section-customize-dialog"
        role="dialog"
      >
        <div className="dialog-card__header">
          <div>
            <p className="eyebrow">Sections</p>
            <h3 id="section-customization-dialog-title">Customize section</h3>
          </div>
          <button aria-label="Close dialog" className="icon-action" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>

        <div className="dialog-form">
          <label className="dialog-field">
            <span>Section name</span>
            <input
              autoFocus
              onChange={(event) => onChangeTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onConfirm();
                }
              }}
              placeholder={defaultSection.title}
              type="text"
              value={sectionTitle}
            />
          </label>

          <label className="dialog-field">
            <span>Accent color</span>
            <div className="section-customize-dialog__palette" role="group" aria-label={`Accent color for ${section.title}`}>
              {SECTION_COLOR_OPTIONS.map((color) => {
                const isSelected = sectionColor.toLowerCase() === color;
                return (
                  <button
                    key={color}
                    aria-label={`Choose ${color} for ${section.title}`}
                    aria-pressed={isSelected}
                    className={`section-customize-dialog__swatch ${isSelected ? "is-selected" : ""}`}
                    onClick={() => onChangeColor(color)}
                    style={{ backgroundColor: color }}
                    title={color}
                    type="button"
                  >
                    <span className="section-customize-dialog__swatch-indicator" />
                  </button>
                );
              })}
            </div>
            <div className="section-customize-dialog__custom-row">
              <button
                className="section-customize-dialog__custom-trigger"
                onClick={openCustomColorPicker}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="section-customize-dialog__custom-swatch"
                  style={{ backgroundColor: sectionColor }}
                />
                <span>Custom color</span>
              </button>
              <code className="section-customize-dialog__color-code">{sectionColor.toLowerCase()}</code>
            </div>
            {isCustomColorPickerOpen ? (
              <div className="section-customize-dialog__picker-panel" role="group" aria-label={`Custom color picker for ${section.title}`}>
                <div className="section-customize-dialog__picker-row">
                  <input
                    aria-label={`Select custom color for ${section.title}`}
                    className="section-customize-dialog__color-input"
                    onChange={(event) => setPendingCustomColor(event.target.value)}
                    type="color"
                    value={pendingCustomColor}
                  />
                  <code className="section-customize-dialog__color-code">{pendingCustomColor.toLowerCase()}</code>
                </div>
                <div className="section-customize-dialog__picker-actions">
                  <button className="mini-action" onClick={cancelCustomColorPicker} type="button">
                    Cancel
                  </button>
                  <button className="mini-action is-active" onClick={confirmCustomColorPicker} type="button">
                    OK
                  </button>
                </div>
              </div>
            ) : null}
          </label>

          <p className="dialog-card__body dialog-card__body--compact">
            Double-click any section tile to reopen this menu.
          </p>
        </div>

        <div className="dialog-card__actions">
          <button className="mini-action" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="mini-action" onClick={onReset} type="button">
            Reset
          </button>
          <button className="mini-action is-active" onClick={onConfirm} type="button">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function NoteFolderOverviewPanel({
  activeFolderNodeId,
  activeSection,
  allowIframeScripts = false,
  allNotes,
  baseSections,
  childNotes,
  expandedFolderIds,
  itemLabelPlural = "notes",
  useCompactCards = false,
  navigationTreeNodes,
  noteRecentViewedAt,
  noteViewCounts,
  pinnedNoteIds,
  isRoot,
  nodeLabel,
  rootLabel,
  notesNavigationMode,
  draggedNoteSourcePath,
  onMoveNote,
  onMoveSection,
  onNoteDragEnd,
  onNoteDragStart,
  onRenameSection,
  onHideSectionGroup,
  onSelectSection,
  onSetSectionColor,
  onSelectFolder,
  onSelectNote,
  onRenameNote,
  onOpenNoteHistory,
  onTogglePinnedNote,
  onToggleNoteStar,
  onToggleFolder,
  previewContentScale = 100,
  previewSupplementary,
  previewToolbarActions,
  previewToolbarLeading,
  sections,
  selectedNote,
  selectedNodeId,
  showContextPill = true,
  showOverviewMeta = true,
}: {
  activeFolderNodeId: string | null;
  activeSection: NoteSectionSummary | null;
  allowIframeScripts?: boolean;
  allNotes: Note[];
  baseSections: NoteSectionSummary[];
  childNotes: Note[];
  expandedFolderIds: Set<string>;
  itemLabelPlural?: string;
  useCompactCards?: boolean;
  navigationTreeNodes: NoteTreeNode[];
  noteRecentViewedAt: Map<string, number>;
  noteViewCounts: Map<string, number>;
  pinnedNoteIds: Set<string>;
  isRoot: boolean;
  nodeLabel: string | null;
  rootLabel?: string | null;
  notesNavigationMode: "folder" | "section";
  draggedNoteSourcePath?: string | null;
  onMoveNote?: (folderSourcePath: string) => void;
  onMoveSection?: (draggedSectionId: string, targetSectionId: string, position: "before" | "after") => void;
  onNoteDragEnd?: () => void;
  onNoteDragStart?: (sourcePath: string) => void;
  onRenameSection?: (sectionId: string, nextTitle: string) => void;
  onHideSectionGroup?: (rootFolderId: string) => void;
  onSelectSection: (nodeId: string) => void;
  onSetSectionColor?: (sectionId: string, accentColor: string) => void;
  onSelectFolder: (nodeId: string | null) => void;
  onSelectNote: (nodeId: string | null) => void;
  onRenameNote?: (note: Note, nextFileName: string) => Promise<void> | void;
  onOpenNoteHistory?: (note: Note) => void;
  onTogglePinnedNote?: (noteId: string, nextPinned: boolean) => void;
  onToggleNoteStar: (note: Note, nextStarred: boolean) => void;
  onToggleFolder: (folderId: string) => void;
  previewContentScale?: number;
  previewSupplementary?: ReactNode;
  previewToolbarActions?: ReactNode;
  previewToolbarLeading?: ReactNode;
  sections: NoteSectionSummary[];
  selectedNote: Note | null;
  selectedNodeId: string | null;
  showContextPill?: boolean;
  showOverviewMeta?: boolean;
}) {
  const [overviewSplitPercent, setOverviewSplitPercent] = useState(getStoredNotesOverviewSplitPercent());
  const [previewSplitPercent, setPreviewSplitPercent] = useState(getStoredNotesPreviewSplitPercent());
  const [isSectionsCollapsed, setIsSectionsCollapsed] = useState(getStoredNotesSectionsCollapsed);
  const [isTreeCollapsed, setIsTreeCollapsed] = useState(getStoredNotesTreeCollapsed);
  const [isNotesCollapsed, setIsNotesCollapsed] = useState(getStoredNotesListCollapsed);
  const [sectionsSortMode, setSectionsSortMode] = useState<SectionsSortMode>(getStoredSectionsSortMode);
  const [navigationSortMode, setNavigationSortMode] = useState<NavigationSortMode>(getStoredNavigationSortMode);
  const [isSectionsSortMenuOpen, setIsSectionsSortMenuOpen] = useState(false);
  const [isNavigationSortMenuOpen, setIsNavigationSortMenuOpen] = useState(false);
  const [folderNotesSortMode, setFolderNotesSortMode] = useState<FolderNotesSortMode>(getStoredFolderNotesSortMode);
  const [isFolderNotesSortMenuOpen, setIsFolderNotesSortMenuOpen] = useState(false);
  const [noteRowViewMode, setNoteRowViewMode] = useState<NoteRowViewMode>(getStoredNoteRowViewMode);
  const [isNavigationViewMenuOpen, setIsNavigationViewMenuOpen] = useState(false);
  const [isFolderNotesViewMenuOpen, setIsFolderNotesViewMenuOpen] = useState(false);

  // Stable sort: snapshot activity metrics so the tree doesn't re-sort while the user browses.
  // The snapshot updates when the user changes section, folder, sort mode, or the underlying tree data changes.
  const navigationSortContextKey = `${activeSection?.id ?? ""}:${activeFolderNodeId ?? ""}:${navigationSortMode}`;
  const [navSortSnapshotKey, setNavSortSnapshotKey] = useState(navigationSortContextKey);
  const navSortSnapshotViewCounts = useRef(noteViewCounts);
  const navSortSnapshotRecentViewedAt = useRef(noteRecentViewedAt);

  if (navSortSnapshotKey !== navigationSortContextKey) {
    navSortSnapshotViewCounts.current = noteViewCounts;
    navSortSnapshotRecentViewedAt.current = noteRecentViewedAt;
    setNavSortSnapshotKey(navigationSortContextKey);
  }

  // Also snapshot for folder notes sort
  const folderNotesSortContextKey = `${activeFolderNodeId ?? ""}:${folderNotesSortMode}`;
  const [folderSortSnapshotKey, setFolderSortSnapshotKey] = useState(folderNotesSortContextKey);
  const folderSortSnapshotViewCounts = useRef(noteViewCounts);
  const folderSortSnapshotRecentViewedAt = useRef(noteRecentViewedAt);

  if (folderSortSnapshotKey !== folderNotesSortContextKey) {
    folderSortSnapshotViewCounts.current = noteViewCounts;
    folderSortSnapshotRecentViewedAt.current = noteRecentViewedAt;
    setFolderSortSnapshotKey(folderNotesSortContextKey);
  }

  const [draggedSectionId, setDraggedSectionId] = useState<string | null>(null);
  const [sectionDropTarget, setSectionDropTarget] = useState<{ position: "before" | "after"; sectionId: string } | null>(null);
  const [draggedNoteSectionId, setDraggedNoteSectionId] = useState<string | null>(null);
  const [sectionCustomizationSectionId, setSectionCustomizationSectionId] = useState<string | null>(null);
  const [sectionCustomizationTitle, setSectionCustomizationTitle] = useState("");
  const [sectionCustomizationColor, setSectionCustomizationColor] = useState("");
  const [isResizingSections, setIsResizingSections] = useState(false);
  const [isResizingOverview, setIsResizingOverview] = useState(false);
  const [isResizingPreview, setIsResizingPreview] = useState(false);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const splitRef = useRef<HTMLDivElement | null>(null);
  const previewSplitRef = useRef<HTMLDivElement | null>(null);
  const sectionsSortMenuRef = useRef<HTMLDivElement | null>(null);
  const navigationSortMenuRef = useRef<HTMLDivElement | null>(null);
  const folderNotesSortMenuRef = useRef<HTMLDivElement | null>(null);
  const navigationViewMenuRef = useRef<HTMLDivElement | null>(null);
  const folderNotesViewMenuRef = useRef<HTMLDivElement | null>(null);
  const overviewSplitRestoreRef = useRef(overviewSplitPercent);

  const previewSplitRestoreRef = useRef(previewSplitPercent);
  const hasSections = sections.length > 0;
  const sectionBeingCustomized = sectionCustomizationSectionId
    ? sections.find((section) => section.id === sectionCustomizationSectionId) ?? null
    : null;
  const defaultSectionBeingCustomized = sectionCustomizationSectionId
    ? baseSections.find((section) => section.id === sectionCustomizationSectionId) ?? null
    : null;
  const sortedSections = useMemo(() => sortSectionsList(sections, sectionsSortMode), [sections, sectionsSortMode]);
  const isNoteDragActive = Boolean(draggedNoteSourcePath && onMoveNote && notesNavigationMode === "section");
  const [collapsedSectionRootIds, setCollapsedSectionRootIds] = useState<Set<string>>(getStoredCollapsedSectionRootIds);
  const sectionGroups = useMemo(() => {
    if (!sortedSections.some((s) => s.rootFolderId)) return null;

    const groups: Array<{ rootFolderId: string; rootFolderTitle: string; sections: NoteSectionSummary[] }> = [];
    const groupMap = new Map<string, (typeof groups)[0]>();

    for (const section of sortedSections) {
      const rootId = section.rootFolderId!;
      let group = groupMap.get(rootId);
      if (!group) {
        group = { rootFolderId: rootId, rootFolderTitle: section.rootFolderTitle ?? rootId, sections: [] };
        groups.push(group);
        groupMap.set(rootId, group);
      }
      group.sections.push(section);
    }

    return groups;
  }, [sortedSections]);
  const effectiveActiveSection = useMemo(() => {
    if (!isNoteDragActive || !draggedNoteSectionId) {
      return activeSection;
    }

    return sections.find((section) => section.id === draggedNoteSectionId) ?? activeSection;
  }, [activeSection, draggedNoteSectionId, isNoteDragActive, sections]);
  const sortedNavigationTreeNodes = useMemo(
    () => sortNavigationNodes(
      isNoteDragActive && effectiveActiveSection ? effectiveActiveSection.children : navigationTreeNodes,
      navigationSortMode,
      allNotes,
      navSortSnapshotViewCounts.current,
      navSortSnapshotRecentViewedAt.current,
    ),
    [allNotes, effectiveActiveSection, isNoteDragActive, navigationTreeNodes, navigationSortMode, navSortSnapshotKey],
  );
  const sortedChildNotes = useMemo(
    () => sortFolderNotes(childNotes, folderNotesSortMode, folderSortSnapshotViewCounts.current, folderSortSnapshotRecentViewedAt.current),
    [childNotes, folderNotesSortMode, folderSortSnapshotKey],
  );
  const NAVIGATION_PAGE_SIZE = 60;
  const [visibleNavigationCount, setVisibleNavigationCount] = useState(NAVIGATION_PAGE_SIZE);
  useEffect(() => {
    setVisibleNavigationCount(NAVIGATION_PAGE_SIZE);
  }, [effectiveActiveSection, navigationSortMode, navigationTreeNodes]);
  const visibleNavigationTreeNodes = sortedNavigationTreeNodes.slice(0, visibleNavigationCount);
  const hasMoreNavigationNodes = visibleNavigationCount < sortedNavigationTreeNodes.length;
  const CHILD_NOTES_PAGE_SIZE = 50;
  const [visibleChildCount, setVisibleChildCount] = useState(CHILD_NOTES_PAGE_SIZE);
  useEffect(() => {
    setVisibleChildCount(CHILD_NOTES_PAGE_SIZE);
  }, [childNotes, folderNotesSortMode]);
  const visibleChildNotes = sortedChildNotes.slice(0, visibleChildCount);
  const hasMoreChildNotes = visibleChildCount < sortedChildNotes.length;
  const capitalizedItemLabelPlural = `${itemLabelPlural.slice(0, 1).toUpperCase()}${itemLabelPlural.slice(1)}`;
  const rootNodeLabel = rootLabel || `All ${itemLabelPlural}`;
  const directItemsHeading = `${capitalizedItemLabelPlural} in this folder`;
  const directItemsEmptyText = `No ${itemLabelPlural} directly in this folder.`;
  const sectionsSortLabel = "Sort sections";
  const navigationSortLabel = "Sort section navigation";
  const sortItemsLabel = `Sort ${itemLabelPlural} in this folder`;
  const activeSectionsSortOption = SECTIONS_SORT_OPTIONS.find((option) => option.value === sectionsSortMode) ?? SECTIONS_SORT_OPTIONS[0];
  const activeNavigationSortOption = NAVIGATION_SORT_OPTIONS.find((option) => option.value === navigationSortMode) ?? NAVIGATION_SORT_OPTIONS[0];
  const activeFolderNotesSortOption = FOLDER_NOTES_SORT_OPTIONS.find((option) => option.value === folderNotesSortMode) ?? FOLDER_NOTES_SORT_OPTIONS[2];
  const activeNoteRowViewOption = NOTE_ROW_VIEW_OPTIONS.find((option) => option.value === noteRowViewMode) ?? NOTE_ROW_VIEW_OPTIONS[0];

  useEffect(() => {
    window.localStorage.setItem(STORED_NOTES_PREVIEW_SPLIT_KEY, String(previewSplitPercent));
  }, [previewSplitPercent]);

  useEffect(() => {
    window.localStorage.setItem(STORED_NOTES_SECTIONS_COLLAPSED_KEY, String(isSectionsCollapsed));
  }, [isSectionsCollapsed]);

  useEffect(() => {
    window.localStorage.setItem(STORED_NOTES_SECTIONS_SORT_MODE_KEY, sectionsSortMode);
  }, [sectionsSortMode]);

  useEffect(() => {
    window.localStorage.setItem(STORED_NOTES_NAVIGATION_SORT_MODE_KEY, navigationSortMode);
  }, [navigationSortMode]);

  useEffect(() => {
    window.localStorage.setItem(STORED_NOTES_FOLDER_ITEMS_SORT_MODE_KEY, folderNotesSortMode);
  }, [folderNotesSortMode]);

  useEffect(() => {
    window.localStorage.setItem(STORED_NOTE_ROW_VIEW_MODE_KEY, noteRowViewMode);
  }, [noteRowViewMode]);

  useEffect(() => {
    window.localStorage.setItem(STORED_NOTES_TREE_COLLAPSED_KEY, String(isTreeCollapsed));
  }, [isTreeCollapsed]);

  useEffect(() => {
    window.localStorage.setItem(STORED_NOTES_LIST_COLLAPSED_KEY, String(isNotesCollapsed));
  }, [isNotesCollapsed]);

  useEffect(() => {
    if (!isTreeCollapsed) {
      overviewSplitRestoreRef.current = overviewSplitPercent;
    }
  }, [isTreeCollapsed, overviewSplitPercent]);

  useEffect(() => {
    if (!isNotesCollapsed) {
      previewSplitRestoreRef.current = previewSplitPercent;
    }
  }, [isNotesCollapsed, previewSplitPercent]);

  useEffect(() => {
    window.localStorage.setItem(STORED_NOTES_OVERVIEW_SPLIT_KEY, String(overviewSplitPercent));
  }, [overviewSplitPercent]);

  useEffect(() => {
    if (!sectionGroups) {
      return;
    }

    const availableRootIds = new Set(sectionGroups.map((group) => group.rootFolderId));
    setCollapsedSectionRootIds((current) => {
      const next = new Set<string>();
      for (const rootId of current) {
        if (availableRootIds.has(rootId)) {
          next.add(rootId);
        }
      }
      return next.size === current.size ? current : next;
    });
  }, [sectionGroups]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORED_COLLAPSED_SECTION_GROUPS_KEY, JSON.stringify([...collapsedSectionRootIds]));
    } catch {
      // Ignore storage errors.
    }
  }, [collapsedSectionRootIds]);

  useEffect(() => {
    const overviewBoundsWidth = hasSections
      ? gridRef.current?.getBoundingClientRect().width ?? 0
      : splitRef.current?.getBoundingClientRect().width ?? 0;
    setOverviewSplitPercent((current) => clampPaneSplitPercentForBounds(
      current,
      overviewBoundsWidth,
      MIN_NOTE_TREE_MAIN_WIDTH,
      11,
      52,
    ));
  }, [hasSections, notesNavigationMode]);

  useEffect(() => {
    const previewBoundsWidth = notesNavigationMode === "section"
      ? splitRef.current?.getBoundingClientRect().width ?? 0
      : previewSplitRef.current?.getBoundingClientRect().width ?? 0;
    setPreviewSplitPercent((current) => clampPaneSplitPercentForBounds(current, previewBoundsWidth, MIN_NOTE_TREE_MAIN_WIDTH, 11, 52));
  }, [notesNavigationMode]);

  useEffect(() => {
    if (sectionCustomizationSectionId && !sectionBeingCustomized) {
      setSectionCustomizationSectionId(null);
    }
  }, [sectionBeingCustomized, sectionCustomizationSectionId]);

  useEffect(() => {
    if (!draggedSectionId) {
      setSectionDropTarget(null);
    }
  }, [draggedSectionId]);

  useEffect(() => {
    if (!draggedNoteSourcePath) {
      setDraggedNoteSectionId(null);
    }
  }, [draggedNoteSourcePath]);

  useEffect(() => {
    if (!isSectionsSortMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (sectionsSortMenuRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsSectionsSortMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsSectionsSortMenuOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSectionsSortMenuOpen]);

  useEffect(() => {
    if (!isNavigationSortMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (navigationSortMenuRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsNavigationSortMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsNavigationSortMenuOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isNavigationSortMenuOpen]);

  useEffect(() => {
    if (!isFolderNotesSortMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (folderNotesSortMenuRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsFolderNotesSortMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsFolderNotesSortMenuOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFolderNotesSortMenuOpen]);

  useEffect(() => {
    if (!isNavigationViewMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (navigationViewMenuRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsNavigationViewMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsNavigationViewMenuOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isNavigationViewMenuOpen]);

  useEffect(() => {
    if (!isFolderNotesViewMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (folderNotesViewMenuRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsFolderNotesViewMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsFolderNotesViewMenuOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFolderNotesViewMenuOpen]);

  useEffect(() => {
    if (!isResizingSections) {
      return;
    }

    function handlePointerMove(event: PointerEvent) {
      const bounds = gridRef.current?.getBoundingClientRect();
      if (!bounds) {
        return;
      }

      const nextPercent = ((event.clientX - bounds.left) / bounds.width) * 100;
      const minimumOverviewPercent = getMinimumPaneSplitPercent(bounds.width, MIN_NOTE_TREE_MAIN_WIDTH, 11, 52);
      if (nextPercent < minimumOverviewPercent * 0.6) {
        overviewSplitRestoreRef.current = overviewSplitPercent;
        setIsSectionsCollapsed(true);
        setIsResizingSections(false);
        return;
      }

      setOverviewSplitPercent(clampPaneSplitPercentForBounds(nextPercent, bounds.width, MIN_NOTE_TREE_MAIN_WIDTH, 11, 52));
    }

    function handlePointerUp() {
      setIsResizingSections(false);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isResizingSections, overviewSplitPercent]);

  useEffect(() => {
    if (!isResizingOverview) {
      return;
    }

    function handlePointerMove(event: PointerEvent) {
      const bounds = splitRef.current?.getBoundingClientRect();
      if (!bounds) {
        return;
      }

      const nextPercent = ((event.clientX - bounds.left) / bounds.width) * 100;
      const minimumOverviewPercent = getMinimumPaneSplitPercent(bounds.width, MIN_NOTE_TREE_MAIN_WIDTH, 11, 52);

      if (nextPercent < minimumOverviewPercent * 0.6) {
        if (notesNavigationMode === "section") {
          previewSplitRestoreRef.current = previewSplitPercent;
        } else {
          overviewSplitRestoreRef.current = overviewSplitPercent;
        }
        setIsTreeCollapsed(true);
        setIsResizingOverview(false);
        return;
      }

      if (notesNavigationMode === "section") {
        setPreviewSplitPercent(clampPaneSplitPercentForBounds(nextPercent, bounds.width, MIN_NOTE_TREE_MAIN_WIDTH, 11, 52));
        return;
      }

      setOverviewSplitPercent(clampPaneSplitPercentForBounds(nextPercent, bounds.width, MIN_NOTE_TREE_MAIN_WIDTH, 11, 52));
    }

    function handlePointerUp() {
      setIsResizingOverview(false);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isResizingOverview, notesNavigationMode, overviewSplitPercent, previewSplitPercent]);

  useEffect(() => {
    if (!isResizingPreview) {
      return;
    }

    function handlePointerMove(event: PointerEvent) {
      const bounds = previewSplitRef.current?.getBoundingClientRect();
      if (!bounds) {
        return;
      }

      const nextPercent = ((event.clientX - bounds.left) / bounds.width) * 100;
      const minimumPreviewPercent = getMinimumPaneSplitPercent(bounds.width, MIN_NOTE_TREE_MAIN_WIDTH, 11, 52);
      if (nextPercent < minimumPreviewPercent * 0.6) {
        previewSplitRestoreRef.current = previewSplitPercent;
        setIsNotesCollapsed(true);
        setIsResizingPreview(false);
        return;
      }
      setPreviewSplitPercent(clampPaneSplitPercentForBounds(nextPercent, bounds.width, MIN_NOTE_TREE_MAIN_WIDTH, 11, 52));
    }

    function handlePointerUp() {
      setIsResizingPreview(false);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isResizingPreview, previewSplitPercent]);

  function handleResizeStart(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    setIsResizingOverview(true);
  }

  function handlePreviewResizeStart(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    setIsResizingPreview(true);
  }

  function handleSectionResizeStart(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    setIsResizingSections(true);
  }

  function handleSectionResizeKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      const boundsWidth = gridRef.current?.getBoundingClientRect().width ?? 0;
      setOverviewSplitPercent((current) => clampPaneSplitPercentForBounds(current - 3, boundsWidth, MIN_NOTE_TREE_MAIN_WIDTH, 11, 52));
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      const boundsWidth = gridRef.current?.getBoundingClientRect().width ?? 0;
      setOverviewSplitPercent((current) => clampPaneSplitPercentForBounds(current + 3, boundsWidth, MIN_NOTE_TREE_MAIN_WIDTH, 11, 52));
    }
  }

  function handleResizeKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      const boundsWidth = splitRef.current?.getBoundingClientRect().width ?? 0;
      if (notesNavigationMode === "section") {
        setPreviewSplitPercent((current) => clampPaneSplitPercentForBounds(current - 3, boundsWidth, MIN_NOTE_TREE_MAIN_WIDTH, 11, 52));
        return;
      }

      setOverviewSplitPercent((current) => clampPaneSplitPercentForBounds(current - 3, boundsWidth, MIN_NOTE_TREE_MAIN_WIDTH, 11, 52));
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      const boundsWidth = splitRef.current?.getBoundingClientRect().width ?? 0;
      if (notesNavigationMode === "section") {
        setPreviewSplitPercent((current) => clampPaneSplitPercentForBounds(current + 3, boundsWidth, MIN_NOTE_TREE_MAIN_WIDTH, 11, 52));
        return;
      }

      setOverviewSplitPercent((current) => clampPaneSplitPercentForBounds(current + 3, boundsWidth, MIN_NOTE_TREE_MAIN_WIDTH, 11, 52));
    }
  }

  function handlePreviewResizeKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      const boundsWidth = previewSplitRef.current?.getBoundingClientRect().width ?? 0;
      setPreviewSplitPercent((current) => clampPaneSplitPercentForBounds(current - 3, boundsWidth, MIN_NOTE_TREE_MAIN_WIDTH, 11, 52));
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      const boundsWidth = previewSplitRef.current?.getBoundingClientRect().width ?? 0;
      setPreviewSplitPercent((current) => clampPaneSplitPercentForBounds(current + 3, boundsWidth, MIN_NOTE_TREE_MAIN_WIDTH, 11, 52));
    }
  }

  function toggleSectionsCollapsed() {
    if (isSectionsCollapsed) {
      const boundsWidth = gridRef.current?.getBoundingClientRect().width ?? 0;
      setOverviewSplitPercent(clampPaneSplitPercentForBounds(overviewSplitRestoreRef.current, boundsWidth, MIN_NOTE_TREE_MAIN_WIDTH, 11, 52));
      setIsSectionsCollapsed(false);
      return;
    }

    overviewSplitRestoreRef.current = overviewSplitPercent;
    setIsSectionsCollapsed(true);
  }

  function openSectionCustomization(sectionId: string) {
    const section = sections.find((entry) => entry.id === sectionId);
    const defaultSection = baseSections.find((entry) => entry.id === sectionId);
    if (!section || !defaultSection) {
      return;
    }

    setSectionCustomizationSectionId(sectionId);
    setSectionCustomizationTitle(section.title);
    setSectionCustomizationColor(section.accentColor);
  }

  function closeSectionCustomization() {
    setSectionCustomizationSectionId(null);
  }

  function resetSectionCustomizationDraft() {
    if (!defaultSectionBeingCustomized) {
      return;
    }

    setSectionCustomizationTitle(defaultSectionBeingCustomized.title);
    setSectionCustomizationColor(defaultSectionBeingCustomized.accentColor);
  }

  function confirmSectionCustomization() {
    if (!sectionBeingCustomized) {
      return;
    }

    onRenameSection?.(sectionBeingCustomized.id, sectionCustomizationTitle);
    onSetSectionColor?.(sectionBeingCustomized.id, sectionCustomizationColor);
    closeSectionCustomization();
  }

  function toggleTreeCollapsed() {
    if (isTreeCollapsed) {
      const boundsWidth = splitRef.current?.getBoundingClientRect().width ?? 0;
      if (notesNavigationMode === "section") {
        setPreviewSplitPercent(clampPaneSplitPercentForBounds(previewSplitRestoreRef.current, boundsWidth, MIN_NOTE_TREE_MAIN_WIDTH, 11, 52));
      } else {
        setOverviewSplitPercent(clampPaneSplitPercentForBounds(overviewSplitRestoreRef.current, boundsWidth, MIN_NOTE_TREE_MAIN_WIDTH, 11, 52));
      }
      setIsTreeCollapsed(false);
      return;
    }

    if (notesNavigationMode === "section") {
      previewSplitRestoreRef.current = previewSplitPercent;
    } else {
      overviewSplitRestoreRef.current = overviewSplitPercent;
    }
    setIsTreeCollapsed(true);
  }

  function toggleNotesCollapsed() {
    if (isNotesCollapsed) {
      const boundsWidth = previewSplitRef.current?.getBoundingClientRect().width ?? 0;
      setPreviewSplitPercent(clampPaneSplitPercentForBounds(previewSplitRestoreRef.current, boundsWidth, MIN_NOTE_TREE_MAIN_WIDTH, 11, 52));
      setIsNotesCollapsed(false);
      return;
    }

    previewSplitRestoreRef.current = previewSplitPercent;
    setIsNotesCollapsed(true);
  }

  const previewPanel = (
    <section className="note-folder-overview__section note-folder-overview__section--preview">
      {selectedNote ? (
        <>
          {previewToolbarLeading || previewToolbarActions ? (
            <div className="markdown-body__toolbar note-folder-overview__preview-toolbar">
              {previewToolbarLeading ? <div className="markdown-body__toolbar-side is-leading">{previewToolbarLeading}</div> : <div />}
              {previewToolbarActions ? <div className="markdown-body__toolbar-side is-trailing">{previewToolbarActions}</div> : null}
            </div>
          ) : null}
          <div className="note-folder-overview__preview markdown-body">
            <MarkdownContent
              allowIframeScripts={allowIframeScripts}
              contentScale={previewContentScale}
              isImmersive={false}
              markdown={selectedNote.content}
              noteSourcePath={selectedNote.sourcePath}
              omitRootWrapper
              useSandboxFrame
            />
          </div>
          {previewSupplementary ? <div className="note-folder-overview__preview-supplementary">{previewSupplementary}</div> : null}
        </>
      ) : (
        <>
          <div className="note-folder-overview__section-header">
            <h4>Preview</h4>
          </div>
          <div className="note-folder-overview__no-preview">
            <p className="muted">No Preview</p>
          </div>
        </>
      )}
    </section>
  );

  return (
    <div className="note-folder-overview">
      {showOverviewMeta ? (
        <div className="note-detail-panel__meta">
          {notesNavigationMode !== "section" && showContextPill ? (
            <>
              {!isRoot ? (
                <span className="status-pill subtle">
                  <Folder size={14} />
                  {nodeLabel ? "Folder overview" : "Folder context"}
                </span>
              ) : null}
              {activeSection ? (
                <span className="status-pill subtle note-folder-overview__status-pill">
                  <span
                    aria-hidden="true"
                    className={`note-folder-overview__status-accent ${(effectiveActiveSection ?? activeSection).accentClass}`}
                    style={{ backgroundColor: (effectiveActiveSection ?? activeSection).accentColor }}
                  />
                  {`Section: ${(effectiveActiveSection ?? activeSection).title}`}
                </span>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      <div
        className={`note-folder-overview__grid ${hasSections ? "has-sections" : ""} ${isResizingSections ? "is-resizing" : ""}`}
        ref={gridRef}
        style={hasSections
          ? isSectionsCollapsed
            ? { gridTemplateColumns: getCollapsedOverviewColumns() }
            : { gridTemplateColumns: getResizableOverviewColumns(overviewSplitPercent) }
          : undefined}
      >
        {hasSections ? (
          <section className={`note-folder-overview__section note-folder-overview__section--sections ${isSectionsCollapsed ? "is-collapsed" : ""}`}>
            <div className="note-folder-overview__section-header">
              <div className="note-folder-overview__section-heading">
                <button
                  aria-label={isSectionsCollapsed ? "Expand sections pane" : "Collapse sections pane"}
                  className="icon-action note-folder-overview__collapse-toggle"
                  onClick={toggleSectionsCollapsed}
                  title={isSectionsCollapsed ? "Expand sections pane" : "Collapse sections pane"}
                  type="button"
                >
                  {isSectionsCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
                </button>
                {!isSectionsCollapsed ? <h4>Sections</h4> : null}
              </div>
              {!isSectionsCollapsed ? (
                <div className="note-folder-overview__sort-menu" ref={sectionsSortMenuRef}>
                  <button
                    aria-expanded={isSectionsSortMenuOpen}
                    aria-haspopup="menu"
                    aria-label={`${sectionsSortLabel}: ${activeSectionsSortOption.label}`}
                    className="icon-action note-folder-overview__sort-trigger"
                    onClick={() => setIsSectionsSortMenuOpen((current) => !current)}
                    title={`${sectionsSortLabel}: ${activeSectionsSortOption.label}`}
                    type="button"
                  >
                    <ArrowUpDown size={15} />
                  </button>
                  {isSectionsSortMenuOpen ? (
                    <div aria-label={sectionsSortLabel} className="note-folder-overview__sort-popup" role="menu">
                      {SECTIONS_SORT_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          aria-checked={sectionsSortMode === option.value}
                          className={`note-folder-overview__sort-option ${sectionsSortMode === option.value ? "is-active" : ""}`}
                          onClick={() => {
                            setSectionsSortMode(option.value);
                            setIsSectionsSortMenuOpen(false);
                          }}
                          role="menuitemradio"
                          type="button"
                        >
                          <span>{option.label}</span>
                          {sectionsSortMode === option.value ? <Check size={14} /> : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            {!isSectionsCollapsed ? (
              <div className="note-section-rail">
                {sectionGroups ? (
                  sectionGroups.map((group) => {
                    const isGroupCollapsed = collapsedSectionRootIds.has(group.rootFolderId);
                    const groupNoteCount = group.sections.reduce((sum, s) => sum + s.noteCount, 0);
                    return (
                      <div key={group.rootFolderId} className="note-section-rail__group">
                        <div className={`note-section-rail__group-header ${isGroupCollapsed ? "is-collapsed" : ""}`}>
                          <button
                            className="note-section-rail__group-toggle"
                            onClick={() => {
                              setCollapsedSectionRootIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(group.rootFolderId)) next.delete(group.rootFolderId);
                                else next.add(group.rootFolderId);
                                return next;
                              });
                            }}
                            type="button"
                          >
                            <span aria-hidden="true" className="folder-toggle__marker">{isGroupCollapsed ? "+" : "-"}</span>
                            <Folder size={14} />
                            <span className="note-section-rail__group-title">{group.rootFolderTitle}</span>
                            <span className="note-section-rail__group-count">{groupNoteCount}</span>
                          </button>
                          {onHideSectionGroup ? (
                            <button
                              aria-label={`Hide ${group.rootFolderTitle} from notes`}
                              className="icon-action note-section-rail__group-action"
                              onClick={() => onHideSectionGroup(group.rootFolderId)}
                              title={`Hide ${group.rootFolderTitle} from notes`}
                              type="button"
                            >
                              <X size={12} />
                            </button>
                          ) : null}
                        </div>
                        {!isGroupCollapsed ? (
                          group.sections.map((section) => {
                            const isActive = effectiveActiveSection?.id === section.id;
                            const accentStyle = { "--section-accent": section.accentColor } as CSSProperties;
                            const dropPosition = sectionDropTarget?.sectionId === section.id ? sectionDropTarget.position : null;
                            return (
                              <button
                                key={section.id}
                                className={`note-section-rail__item ${section.accentClass} ${isActive ? "is-active" : ""} ${draggedSectionId === section.id ? "is-dragging" : ""} ${dropPosition === "before" ? "is-drop-target-before" : ""} ${dropPosition === "after" ? "is-drop-target-after" : ""}`}
                                draggable
                                onClick={() => onSelectSection(section.rootFolderId && section.id.endsWith(":__general__") ? section.rootFolderId : section.id)}
                                onDoubleClick={() => openSectionCustomization(section.id)}
                                onDragEnd={() => {
                                  setDraggedSectionId(null);
                                  setSectionDropTarget(null);
                                  setDraggedNoteSectionId(null);
                                }}
                                onDragOver={(event) => {
                                  event.preventDefault();
                                  event.dataTransfer.dropEffect = "move";
                                  if (isNoteDragActive) {
                                    setDraggedNoteSectionId(section.id);
                                    setSectionDropTarget(null);
                                    return;
                                  }

                                  if (draggedSectionId === section.id) {
                                    setSectionDropTarget(null);
                                    return;
                                  }

                                  const bounds = event.currentTarget.getBoundingClientRect();
                                  const nextPosition = event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
                                  setSectionDropTarget({ position: nextPosition, sectionId: section.id });
                                }}
                                onDragStart={(event) => {
                                  event.dataTransfer.effectAllowed = "move";
                                  setDraggedSectionId(section.id);
                                  setSectionDropTarget(null);
                                }}
                                onDrop={(event) => {
                                  event.preventDefault();
                                  if (isNoteDragActive && onMoveNote) {
                                    onMoveNote(section.sourcePath);
                                  } else if (draggedSectionId && onMoveSection && sectionDropTarget?.sectionId === section.id) {
                                    onMoveSection(draggedSectionId, section.id, sectionDropTarget.position);
                                  }
                                  setDraggedSectionId(null);
                                  setSectionDropTarget(null);
                                  setDraggedNoteSectionId(null);
                                }}
                                style={accentStyle}
                                title={`${section.title} · double-click to customize`}
                                type="button"
                              >
                                <span className="note-section-rail__label">
                                  <GripVertical size={12} className="drag-handle" />
                                  <span aria-hidden="true" className="note-section-rail__accent" />
                                  <span className="note-section-rail__body">
                                    <strong>{section.title}</strong>
                                    <span>{section.noteCount} notes · {section.folderCount} folders</span>
                                  </span>
                                </span>
                              </button>
                            );
                          })
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  sortedSections.map((section) => {
                    const isActive = effectiveActiveSection?.id === section.id;
                    const accentStyle = { "--section-accent": section.accentColor } as CSSProperties;
                    const dropPosition = sectionDropTarget?.sectionId === section.id ? sectionDropTarget.position : null;
                    return (
                      <button
                        key={section.id}
                        className={`note-section-rail__item ${section.accentClass} ${isActive ? "is-active" : ""} ${draggedSectionId === section.id ? "is-dragging" : ""} ${dropPosition === "before" ? "is-drop-target-before" : ""} ${dropPosition === "after" ? "is-drop-target-after" : ""}`}
                        draggable
                        onClick={() => onSelectSection(section.rootFolderId && section.id.endsWith(":__general__") ? section.rootFolderId : section.id)}
                        onDoubleClick={() => openSectionCustomization(section.id)}
                        onDragEnd={() => {
                          setDraggedSectionId(null);
                          setSectionDropTarget(null);
                          setDraggedNoteSectionId(null);
                        }}
                        onDragOver={(event) => {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                          if (isNoteDragActive) {
                            setDraggedNoteSectionId(section.id);
                            setSectionDropTarget(null);
                            return;
                          }

                          if (draggedSectionId === section.id) {
                            setSectionDropTarget(null);
                            return;
                          }

                          const bounds = event.currentTarget.getBoundingClientRect();
                          const nextPosition = event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
                          setSectionDropTarget({ position: nextPosition, sectionId: section.id });
                        }}
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = "move";
                          setDraggedSectionId(section.id);
                          setSectionDropTarget(null);
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          if (isNoteDragActive && onMoveNote) {
                            onMoveNote(section.sourcePath);
                          } else if (draggedSectionId && onMoveSection && sectionDropTarget?.sectionId === section.id) {
                            onMoveSection(draggedSectionId, section.id, sectionDropTarget.position);
                          }
                          setDraggedSectionId(null);
                          setSectionDropTarget(null);
                          setDraggedNoteSectionId(null);
                        }}
                        style={accentStyle}
                        title={`${section.title} · double-click to customize`}
                        type="button"
                      >
                        <span className="note-section-rail__label">
                          <GripVertical size={12} className="drag-handle" />
                          <span aria-hidden="true" className="note-section-rail__accent" />
                          <span className="note-section-rail__body">
                            <strong>{section.title}</strong>
                            <span>{section.noteCount} notes · {section.folderCount} folders</span>
                          </span>
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            ) : null}
          </section>
        ) : null}

        {hasSections && !isSectionsCollapsed ? (
          <button
            aria-label="Resize sections pane"
            aria-orientation="vertical"
            className={`note-folder-overview__resize-handle note-folder-overview__resize-handle--sections ${isResizingSections ? "is-active" : ""}`}
            onKeyDown={handleSectionResizeKeyDown}
            onPointerDown={handleSectionResizeStart}
            role="separator"
            type="button"
          >
            <span className="note-folder-overview__resize-line" />
          </button>
        ) : null}

        <div
          className={`note-folder-overview__split ${isResizingOverview ? "is-resizing" : ""}`}
          ref={splitRef}
          style={{
            gridTemplateColumns: isTreeCollapsed
              ? getCollapsedOverviewColumns()
              : getResizableOverviewColumns(notesNavigationMode === "section" ? previewSplitPercent : overviewSplitPercent),
          }}
        >
          <section className={`note-folder-overview__section note-folder-overview__section--tree ${isTreeCollapsed ? "is-collapsed" : ""}`}>
            <div className="note-folder-overview__section-header">
              <div className="note-folder-overview__section-heading">
                <button
                  aria-label={isTreeCollapsed ? "Expand navigation pane" : "Collapse navigation pane"}
                  className="icon-action note-folder-overview__collapse-toggle"
                  onClick={toggleTreeCollapsed}
                  title={isTreeCollapsed ? "Expand navigation pane" : "Collapse navigation pane"}
                  type="button"
                >
                  {isTreeCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
                </button>
                {!isTreeCollapsed ? <h4>{notesNavigationMode === "section" ? "Section navigation" : activeSection ? "Section navigation" : "Child folders"}</h4> : null}
              </div>
              {!isTreeCollapsed ? (
                <div className="note-folder-overview__section-actions">
                  <div className="note-folder-overview__sort-menu" ref={navigationSortMenuRef}>
                    <button
                      aria-expanded={isNavigationSortMenuOpen}
                      aria-haspopup="menu"
                      aria-label={`${navigationSortLabel}: ${activeNavigationSortOption.label}`}
                      className="icon-action note-folder-overview__sort-trigger"
                      onClick={() => setIsNavigationSortMenuOpen((current) => !current)}
                      title={`${navigationSortLabel}: ${activeNavigationSortOption.label}`}
                      type="button"
                    >
                      <ArrowUpDown size={15} />
                    </button>
                    {isNavigationSortMenuOpen ? (
                      <div aria-label={navigationSortLabel} className="note-folder-overview__sort-popup" role="menu">
                        {NAVIGATION_SORT_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            aria-checked={navigationSortMode === option.value}
                            className={`note-folder-overview__sort-option ${navigationSortMode === option.value ? "is-active" : ""}`}
                            onClick={() => {
                              setNavigationSortMode(option.value);
                              setIsNavigationSortMenuOpen(false);
                            }}
                            role="menuitemradio"
                            type="button"
                          >
                            <span>{option.label}</span>
                            {navigationSortMode === option.value ? <Check size={14} /> : null}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="note-folder-overview__sort-menu" ref={navigationViewMenuRef}>
                    <button
                      aria-expanded={isNavigationViewMenuOpen}
                      aria-haspopup="menu"
                      aria-label={`Change note row view: ${activeNoteRowViewOption.label}`}
                      className="note-folder-overview__view-trigger"
                      onClick={() => setIsNavigationViewMenuOpen((current) => !current)}
                      title={`Change note row view: ${activeNoteRowViewOption.label}`}
                      type="button"
                    >
                      View
                    </button>
                    {isNavigationViewMenuOpen ? (
                      <div aria-label="Change note row view" className="note-folder-overview__sort-popup" role="menu">
                        {NOTE_ROW_VIEW_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            aria-checked={noteRowViewMode === option.value}
                            className={`note-folder-overview__sort-option ${noteRowViewMode === option.value ? "is-active" : ""}`}
                            onClick={() => {
                              setNoteRowViewMode(option.value);
                              setIsNavigationViewMenuOpen(false);
                            }}
                            role="menuitemradio"
                            title={option.description}
                            type="button"
                          >
                            <span>{option.label}</span>
                            {noteRowViewMode === option.value ? <Check size={14} /> : null}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
            {!isTreeCollapsed ? (
              <div className="note-folder-overview__tree">
                {notesNavigationMode !== "section" ? (
                  <div className={`tree-folder note-tree-folder ${effectiveActiveSection ? (isNoteDragActive || selectedNodeId === effectiveActiveSection.id) ? "is-selected" : "" : isRoot ? "is-selected" : ""}`}>
                    <div className="tree-folder__title">
                      <span
                        className="tree-folder__label note-tree-folder__label"
                        onClick={() => {
                          if (effectiveActiveSection) {
                            onSelectSection(effectiveActiveSection.id);
                            return;
                          }

                          onSelectFolder(null);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            if (effectiveActiveSection) {
                              onSelectSection(effectiveActiveSection.id);
                              return;
                            }

                            onSelectFolder(null);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <span aria-hidden="true" className="folder-toggle folder-toggle--spacer" />
                        <Folder size={16} />
                        <span>
                          {effectiveActiveSection ? effectiveActiveSection.title : rootNodeLabel}{" "}
                          <span className="tree-folder__count">({effectiveActiveSection ? effectiveActiveSection.noteCount : countNotesInTree(sortedNavigationTreeNodes)})</span>
                        </span>
                      </span>
                    </div>
                  </div>
                ) : null}
                {sortedNavigationTreeNodes.length > 0 ? (
                  <div className="tree-folder__children">
                    {visibleNavigationTreeNodes.map((folderNode, index) => (
                      <NoteTreeItem
                        expandedFolderIds={expandedFolderIds}
                        foldersOnly={notesNavigationMode === "folder"}
                        key={`${folderNode.id}:${index}`}
                        node={folderNode}
                        notes={allNotes}
                        noteViewCounts={noteViewCounts}
                        onNoteDragEnd={onNoteDragEnd}
                        onNoteDragStart={onNoteDragStart}
                        onNoteDrop={onMoveNote}
                        pinnedNoteIds={pinnedNoteIds}
                        onOpenHistory={onOpenNoteHistory}
                        onRenameFile={onRenameNote}
                        onSelect={onSelectNote}
                        onTogglePinned={onTogglePinnedNote}
                        onToggleStar={onToggleNoteStar}
                        onToggleFolder={onToggleFolder}
                        searchStateByNodeId={new Map()}
                        selectedNodeId={isNoteDragActive && effectiveActiveSection ? effectiveActiveSection.id : selectedNodeId ?? activeFolderNodeId}
                        viewMode={noteRowViewMode}
                      />
                    ))}
                    {hasMoreNavigationNodes ? (
                      <button
                        className="note-folder-overview__show-more"
                        onClick={() => setVisibleNavigationCount((count) => count + NAVIGATION_PAGE_SIZE)}
                        type="button"
                      >
                        Show more ({sortedNavigationTreeNodes.length - visibleNavigationCount} remaining)
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <p className="muted">{notesNavigationMode === "section" ? "No folders in this section yet." : activeSection ? "No notes or subfolders in this section yet." : "No child folders yet."}</p>
                )}
              </div>
            ) : null}
          </section>

          {!isTreeCollapsed ? (
            <button
              aria-label="Resize note overview panes"
              aria-orientation="vertical"
              className={`note-folder-overview__resize-handle ${isResizingOverview ? "is-active" : ""}`}
              onKeyDown={handleResizeKeyDown}
              onPointerDown={handleResizeStart}
              role="separator"
              type="button"
            >
              <span className="note-folder-overview__resize-line" />
            </button>
          ) : null}

          {notesNavigationMode === "section" ? (
            previewPanel
          ) : (
            <div
              className={`note-folder-overview__notes-split ${isResizingPreview ? "is-resizing" : ""}`}
              ref={previewSplitRef}
              style={{
                gridTemplateColumns: isNotesCollapsed
                  ? getCollapsedOverviewColumns()
                  : getResizableOverviewColumns(previewSplitPercent),
              }}
            >
              <section
                className={`note-folder-overview__section note-folder-overview__section--notes is-list ${isNotesCollapsed ? "is-collapsed" : ""}`}
              >
                <div className="note-folder-overview__section-header">
                  <div className="note-folder-overview__section-heading">
                    <button
                      aria-label={isNotesCollapsed ? "Expand notes list pane" : "Collapse notes list pane"}
                      className="icon-action note-folder-overview__collapse-toggle"
                      onClick={toggleNotesCollapsed}
                      title={isNotesCollapsed ? "Expand notes list pane" : "Collapse notes list pane"}
                      type="button"
                    >
                      {isNotesCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
                    </button>
                    {!isNotesCollapsed ? <h4>{directItemsHeading}</h4> : null}
                  </div>
                  {!isNotesCollapsed ? (
                    <div className="note-folder-overview__section-actions">
                      <div className="note-folder-overview__sort-menu" ref={folderNotesSortMenuRef}>
                        <button
                          aria-expanded={isFolderNotesSortMenuOpen}
                          aria-haspopup="menu"
                          aria-label={`${sortItemsLabel}: ${activeFolderNotesSortOption.label}`}
                          className="icon-action note-folder-overview__sort-trigger"
                          onClick={() => setIsFolderNotesSortMenuOpen((current) => !current)}
                          title={`${sortItemsLabel}: ${activeFolderNotesSortOption.label}`}
                          type="button"
                        >
                          <ArrowUpDown size={15} />
                        </button>
                        {isFolderNotesSortMenuOpen ? (
                          <div aria-label={sortItemsLabel} className="note-folder-overview__sort-popup" role="menu">
                            {FOLDER_NOTES_SORT_OPTIONS.map((option) => (
                              <button
                                key={option.value}
                                aria-checked={folderNotesSortMode === option.value}
                                className={`note-folder-overview__sort-option ${folderNotesSortMode === option.value ? "is-active" : ""}`}
                                onClick={() => {
                                  setFolderNotesSortMode(option.value);
                                  setIsFolderNotesSortMenuOpen(false);
                                }}
                                role="menuitemradio"
                                type="button"
                              >
                                <span>{option.label}</span>
                                {folderNotesSortMode === option.value ? <Check size={14} /> : null}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="note-folder-overview__sort-menu" ref={folderNotesViewMenuRef}>
                        <button
                          aria-expanded={isFolderNotesViewMenuOpen}
                          aria-haspopup="menu"
                          aria-label={`Change note row view: ${activeNoteRowViewOption.label}`}
                          className="note-folder-overview__view-trigger"
                          onClick={() => setIsFolderNotesViewMenuOpen((current) => !current)}
                          title={`Change note row view: ${activeNoteRowViewOption.label}`}
                          type="button"
                        >
                          View
                        </button>
                        {isFolderNotesViewMenuOpen ? (
                          <div aria-label="Change note row view" className="note-folder-overview__sort-popup" role="menu">
                            {NOTE_ROW_VIEW_OPTIONS.map((option) => (
                              <button
                                key={option.value}
                                aria-checked={noteRowViewMode === option.value}
                                className={`note-folder-overview__sort-option ${noteRowViewMode === option.value ? "is-active" : ""}`}
                                onClick={() => {
                                  setNoteRowViewMode(option.value);
                                  setIsFolderNotesViewMenuOpen(false);
                                }}
                                role="menuitemradio"
                                title={option.description}
                                type="button"
                              >
                                <span>{option.label}</span>
                                {noteRowViewMode === option.value ? <Check size={14} /> : null}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
                {!isNotesCollapsed ? (
                  <div className="note-folder-overview__notes-body is-list">
                    {sortedChildNotes.length > 0 ? (
                      <>
                        {visibleChildNotes.map((noteItem) =>
                          useCompactCards ? (
                            <NoteCompactCard
                              key={noteItem.id}
                              isSelected={selectedNodeId === noteItem.id}
                              note={noteItem}
                              onSelect={() => onSelectNote(noteItem.id)}
                            />
                          ) : (
                            <NoteSummaryCard
                              key={noteItem.id}
                              isSelected={selectedNodeId === noteItem.id}
                              isPinned={pinnedNoteIds.has(noteItem.id)}
                              note={noteItem}
                              noteViewCount={noteViewCounts.get(`${noteItem.kind}:${noteItem.id}`) ?? 0}
                              onNoteDragEnd={onNoteDragEnd}
                              onNoteDragStart={onNoteDragStart}
                              onOpenHistory={onOpenNoteHistory ? () => onOpenNoteHistory(noteItem) : undefined}
                              onRenameFile={onRenameNote}
                              onSelect={() => onSelectNote(noteItem.id)}
                              onTogglePinned={onTogglePinnedNote ? (nextPinned) => onTogglePinnedNote(noteItem.id, nextPinned) : undefined}
                              onToggleStar={(nextStarred) => onToggleNoteStar(noteItem, nextStarred)}
                              viewMode={noteRowViewMode}
                            />
                          ),
                        )}
                        {hasMoreChildNotes ? (
                          <button
                            className="note-folder-overview__show-more"
                            onClick={() => setVisibleChildCount((count) => count + CHILD_NOTES_PAGE_SIZE)}
                            type="button"
                          >
                            Show more ({sortedChildNotes.length - visibleChildCount} remaining)
                          </button>
                        ) : null}
                      </>
                    ) : (
                      <p className="muted">{directItemsEmptyText}</p>
                    )}
                  </div>
                ) : null}
              </section>

              {!isNotesCollapsed ? (
                <button
                  aria-label="Resize notes preview panes"
                  aria-orientation="vertical"
                  className={`note-folder-overview__resize-handle ${isResizingPreview ? "is-active" : ""}`}
                  onKeyDown={handlePreviewResizeKeyDown}
                  onPointerDown={handlePreviewResizeStart}
                  role="separator"
                  type="button"
                >
                  <span className="note-folder-overview__resize-line" />
                </button>
              ) : null}

              {previewPanel}
            </div>
          )}
        </div>
      </div>

      <SectionCustomizationDialog
        defaultSection={defaultSectionBeingCustomized}
        onChangeColor={setSectionCustomizationColor}
        onChangeTitle={setSectionCustomizationTitle}
        onClose={closeSectionCustomization}
        onConfirm={confirmSectionCustomization}
        onReset={resetSectionCustomizationDraft}
        section={sectionBeingCustomized}
        sectionColor={sectionCustomizationColor}
        sectionTitle={sectionCustomizationTitle}
      />
    </div>
  );
}

function NoteCompactCard({
  isSelected = false,
  note,
  onSelect,
}: {
  isSelected?: boolean;
  note: Note;
  onSelect: () => void;
}) {
  return (
    <div
      aria-pressed={isSelected}
      className={`note-leaf__main ${isSelected ? "is-selected" : ""}`}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <span className="note-leaf__title">{note.title}</span>
      <span className="note-leaf__meta">{note.summary}</span>
    </div>
  );
}

function NoteSummaryCard({
  isPinned = false,
  note,
  noteViewCount = 0,
  isSelected = false,
  onNoteDragEnd,
  onNoteDragStart,
  onOpenHistory,
  onRenameFile,
  onSelect,
  onTogglePinned,
  onToggleStar,
  viewMode = "detailed",
}: {
  isPinned?: boolean;
  note: Note;
  noteViewCount?: number;
  isSelected?: boolean;
  onNoteDragEnd?: () => void;
  onNoteDragStart?: (sourcePath: string) => void;
  onOpenHistory?: () => void;
  onRenameFile?: (note: Note, nextFileName: string) => Promise<void> | void;
  onSelect: () => void;
  onTogglePinned?: (nextPinned: boolean) => void;
  onToggleStar?: (nextStarred: boolean) => void;
  viewMode?: NoteRowViewMode;
}) {
  const showStar = canEditNote(note) && typeof onToggleStar === "function";
  const showHistory = typeof onOpenHistory === "function" && canEditNote(note) && Boolean(note.sourcePath);
  const showPinnedToggle = typeof onTogglePinned === "function";
  const showTopActions = showHistory || showPinnedToggle || showStar;
  const sourceFileName = getNoteSourceFileName(note);
  const sourcePathTitle = note.sourcePath ? formatNoteTargetLocation(note.sourcePath) : undefined;
  const isCompactView = viewMode === "compact";
  const canRenameFile = Boolean(sourceFileName && canEditNote(note) && onRenameFile);
  const [isEditingFileName, setIsEditingFileName] = useState(false);
  const [fileNameDraft, setFileNameDraft] = useState("");
  const fileNameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isEditingFileName) {
      return;
    }

    window.setTimeout(() => {
      fileNameInputRef.current?.focus();
      fileNameInputRef.current?.select();
    }, 0);
  }, [isEditingFileName]);

  useEffect(() => {
    if (!isEditingFileName) {
      setFileNameDraft(sourceFileName ?? "");
    }
  }, [isEditingFileName, sourceFileName]);

  function startEditingFileName(event: React.MouseEvent) {
    if (!canRenameFile || !sourceFileName) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setFileNameDraft(sourceFileName);
    setIsEditingFileName(true);
  }

  async function commitFileName() {
    if (!isEditingFileName) {
      return;
    }

    setIsEditingFileName(false);
    const trimmedName = fileNameDraft.trim();
    if (!trimmedName || trimmedName === sourceFileName || !onRenameFile) {
      return;
    }

    await onRenameFile(note, trimmedName);
  }

  function cancelFileNameEdit() {
    setIsEditingFileName(false);
    setFileNameDraft(sourceFileName ?? "");
  }

  if (isCompactView) {
    return (
      <div
        aria-pressed={isSelected}
        className={`note-leaf__main note-leaf__main--compact ${isSelected ? "is-selected" : ""}${
          note.sourcePath ? " is-draggable" : ""
        }`}
        draggable={!!note.sourcePath && !isEditingFileName}
        onClick={() => {
          if (!isEditingFileName) {
            onSelect();
          }
        }}
        onDragEnd={() => {
          onNoteDragEnd?.();
        }}
        onDragStart={(event) => {
          if (!note.sourcePath || isEditingFileName) {
            event.preventDefault();
            return;
          }
          onNoteDragStart?.(note.sourcePath);
          event.dataTransfer.setData("application/x-note-sourcepath", note.sourcePath);
          event.dataTransfer.effectAllowed = "move";
        }}
        onKeyDown={(event) => {
          if (isEditingFileName) {
            return;
          }
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect();
          }
        }}
        role="button"
        tabIndex={0}
        title={sourcePathTitle}
      >
        <div className={`note-leaf__tree-top ${showTopActions ? "note-leaf__tree-top--with-actions" : ""}`}>
          {sourceFileName ? (
            isEditingFileName ? (
              <input
                ref={fileNameInputRef}
                className="note-leaf__file-input"
                value={fileNameDraft}
                onBlur={() => {
                  void commitFileName();
                }}
                onChange={(event) => setFileNameDraft(event.target.value)}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    cancelFileNameEdit();
                  }
                }}
                type="text"
              />
            ) : (
              <span className="note-leaf__file" onDoubleClick={startEditingFileName} title={canRenameFile ? "Double-click to rename file" : undefined}>{sourceFileName}</span>
            )
          ) : null}
          {showTopActions ? (
            <div className="note-leaf__summary-actions note-leaf__summary-actions--tree">
              {showHistory ? (
                <button
                  aria-label="View version history"
                  className="note-leaf__summary-action"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenHistory?.();
                  }}
                  title="View version history"
                  type="button"
                >
                  <Clock size={13} />
                </button>
              ) : null}
              {showPinnedToggle ? (
                <button
                  aria-label={isPinned ? "Unpin from dashboard" : "Pin to dashboard"}
                  className={`note-leaf__summary-action ${isPinned ? "is-active" : ""}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onTogglePinned?.(!isPinned);
                  }}
                  title={isPinned ? "Unpin from dashboard" : "Pin to dashboard"}
                  type="button"
                >
                  {isPinned ? <PinOff size={13} /> : <Pin size={13} />}
                </button>
              ) : null}
              {showStar ? (
                <button
                  aria-label={note.starred ? "Remove star" : "Add star"}
                  className={`icon-action note-leaf__star note-leaf__star--inline ${note.starred ? "is-active" : ""}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleStar?.(!note.starred);
                  }}
                  title={note.starred ? "Remove star" : "Add star"}
                  type="button"
                >
                  <Star fill={note.starred ? "currentColor" : "none"} size={15} />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <article
      className={`note-leaf note-leaf--summary ${isSelected ? "is-selected" : ""}${
        note.sourcePath ? " is-draggable" : ""
      }`}
      draggable={!!note.sourcePath && !isEditingFileName}
      onDragEnd={() => {
        onNoteDragEnd?.();
      }}
      onDragStart={(event) => {
        if (!note.sourcePath || isEditingFileName) {
          event.preventDefault();
          return;
        }
        onNoteDragStart?.(note.sourcePath);
        event.dataTransfer.setData("application/x-note-sourcepath", note.sourcePath);
        event.dataTransfer.effectAllowed = "move";
      }}
    >
      <div
        aria-pressed={isSelected}
        className={`note-leaf__tree-main${note.sourcePath ? " is-draggable" : ""}`}
        onClick={() => {
          if (!isEditingFileName) {
            onSelect();
          }
        }}
        onKeyDown={(event) => {
          if (isEditingFileName) {
            return;
          }
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect();
          }
        }}
        role="button"
        tabIndex={0}
      >
        <div className={`note-leaf__tree-top ${showTopActions ? "note-leaf__tree-top--with-actions" : ""}`}>
          {sourceFileName ? (
            isEditingFileName ? (
              <input
                ref={fileNameInputRef}
                className="note-leaf__file-input"
                value={fileNameDraft}
                onBlur={() => {
                  void commitFileName();
                }}
                onChange={(event) => setFileNameDraft(event.target.value)}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    cancelFileNameEdit();
                  }
                }}
                type="text"
              />
            ) : (
              <span className="note-leaf__file" onDoubleClick={startEditingFileName} title={canRenameFile ? "Double-click to rename file" : undefined}>{sourceFileName}</span>
            )
          ) : null}
          {showTopActions ? (
            <div className="note-leaf__summary-actions note-leaf__summary-actions--tree">
              {showHistory ? (
                <button
                  aria-label="View version history"
                  className="note-leaf__summary-action"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenHistory?.();
                  }}
                  title="View version history"
                  type="button"
                >
                  <Clock size={13} />
                </button>
              ) : null}
              {showPinnedToggle ? (
                <button
                  aria-label={isPinned ? "Unpin from dashboard" : "Pin to dashboard"}
                  className={`note-leaf__summary-action ${isPinned ? "is-active" : ""}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onTogglePinned?.(!isPinned);
                  }}
                  title={isPinned ? "Unpin from dashboard" : "Pin to dashboard"}
                  type="button"
                >
                  {isPinned ? <PinOff size={13} /> : <Pin size={13} />}
                </button>
              ) : null}
              {showStar ? (
                <button
                  aria-label={note.starred ? "Remove star" : "Add star"}
                  className={`icon-action note-leaf__star note-leaf__star--inline ${note.starred ? "is-active" : ""}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleStar?.(!note.starred);
                  }}
                  title={note.starred ? "Remove star" : "Add star"}
                  type="button"
                >
                  <Star fill={note.starred ? "currentColor" : "none"} size={15} />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        {!isCompactView ? <span aria-hidden="true" className="note-leaf__separator" /> : null}
        {!isCompactView ? <span className="note-leaf__title" title={sourcePathTitle}>{note.title}</span> : null}
        {!isCompactView ? <span className="note-leaf__meta">{formatNoteTimestamp(note.updatedAt)} · {formatRecentViewCount(noteViewCount)}</span> : null}
      </div>
    </article>
  );
}

function NoteListCard({
  note,
  badgeKind,
  documentName,
  title,
  description,
  timestamp,
  onSelect,
  onToggleStar,
}: {
  note: Note;
  badgeKind: "note" | "wiki";
  documentName: string;
  title: string;
  description: string;
  timestamp: string;
  onSelect: () => void;
  onToggleStar: (nextStarred: boolean) => void;
}) {
  return (
    <article className="recent-entry">
      <button
        aria-label={note.starred ? "Remove star" : "Add star"}
        className={`icon-action recent-entry__delete ${note.starred ? "is-active" : ""}`}
        onClick={() => onToggleStar(!note.starred)}
        title={note.starred ? "Remove star" : "Add star"}
        type="button"
      >
        <Star fill={note.starred ? "currentColor" : "none"} size={14} />
      </button>
      <button className="recent-entry__main" onClick={onSelect} type="button">
        <div className="recent-entry__meta">
          <span className="recent-entry__meta-primary">
            <span className={`category-badge is-${badgeKind}`}>{badgeKind}</span>
            <span className="recent-entry__filename">{documentName}</span>
          </span>
          <span>{timestamp}</span>
        </div>
        <h4 className="recent-entry__title">{title}</h4>
        <span className="recent-entry__subtitle">{description}</span>
      </button>
    </article>
  );
}

function RecentDocumentCard({
  entry,
  note,
  onDelete,
  onSelect,
  onTogglePin,
}: {
  entry: RecentDocumentEntry;
  note: Note | null;
  onDelete: () => void;
  onSelect: () => void;
  onTogglePin: () => void;
}) {
  const documentName =
    entry.kind === "todo"
      ? entry.subtitle || "TODO"
      : note
        ? getNoteSourceFileName(note) || entry.title
        : entry.title;
  const title = note?.title || entry.title;
  const description = entry.kind === "todo" ? entry.preview : note?.summary || entry.preview;
  const primaryActivity = getRecentPrimaryActivity(entry);
  const primaryActivityLabel =
    primaryActivity === "completed"
      ? `Completed ${formatRecentViewedAt(getRecentActivityTimestamp(entry)).replace("Viewed ", "")}`
      : primaryActivity === "edited"
        ? `Edited ${formatRecentViewedAt(getRecentActivityTimestamp(entry)).replace("Viewed ", "")}`
        : formatRecentViewedAt(entry.viewedAt);

  return (
    <article className="recent-entry">
      <button
        aria-label={entry.pinned ? `Unpin ${entry.title} from recents` : `Pin ${entry.title} in recents`}
        className={`icon-action recent-entry__pin ${entry.pinned ? "is-active" : ""}`}
        onClick={onTogglePin}
        title={entry.pinned ? "Unpin recent item" : "Pin recent item"}
        type="button"
      >
        {entry.pinned ? <PinOff size={14} /> : <Pin size={14} />}
      </button>
      <button
        aria-label={`Delete ${entry.title} from recent documents`}
        className="icon-action recent-entry__delete"
        onClick={onDelete}
        title="Delete from recent documents"
        type="button"
      >
        <Trash2 size={14} />
      </button>
      <button className="recent-entry__main" onClick={onSelect} type="button">
        <div className="recent-entry__meta">
          <span className="recent-entry__meta-primary">
            <span className={`category-badge is-${entry.kind}`}>{entry.kind}</span>
            <span className={`recent-entry__activity recent-entry__activity--${primaryActivity}`}>{primaryActivity}</span>
            <span className="recent-entry__filename">{documentName}</span>
          </span>
          <span>
            {primaryActivityLabel} · {formatRecentViewCount(entry.viewCount)}
          </span>
        </div>
        <h4 className="recent-entry__title">{title}</h4>
        <span className="recent-entry__subtitle">{description}</span>
      </button>
    </article>
  );
}


export { NoteTreeItem, NoteFolderOverviewPanel, NoteSummaryCard, NoteListCard, RecentDocumentCard };

// --- Trash Panel ---

export function TrashPanel({
  entries,
  onClose,
  onRestore,
  onPurge,
  onPurgeAll,
}: {
  entries: Array<{ id: string; sourcePath: string; title: string; deletedAt: string }>;
  onClose: () => void;
  onRestore: (id: string) => void;
  onPurge: (id: string) => void;
  onPurgeAll: () => void;
}) {
  return (
    <div className="trash-panel">
      <div className="trash-panel__header">
        <div>
          <p className="eyebrow">Deleted notes</p>
          <h4>Trash</h4>
        </div>
        <div className="trash-panel__header-actions">
          {entries.length > 0 ? (
            <button className="mini-action" onClick={onPurgeAll} type="button">
              <Trash2 size={14} />
              Empty trash
            </button>
          ) : null}
          <button aria-label="Close trash" className="icon-action" onClick={onClose} title="Close trash" type="button"><X size={14} /></button>
        </div>
      </div>
      {entries.length === 0 ? (
        <article className="bookmark-empty">
          <h4>Trash is empty</h4>
          <p>Deleted notes will appear here for recovery.</p>
        </article>
      ) : (
        <div className="trash-panel__list">
          {entries.map((entry) => {
            const deletedLabel = `Deleted ${new Date(entry.deletedAt).toLocaleString()}`;
            const descriptionLabel = `${entry.sourcePath} · ${deletedLabel}`;

            return (
              <div className="trash-panel__entry" key={entry.id}>
                <div className="trash-panel__entry-info">
                  <strong className="trash-panel__entry-title" title={entry.title}>{entry.title}</strong>
                  <span className="muted trash-panel__entry-description" title={descriptionLabel}>{descriptionLabel}</span>
                </div>
                <div className="trash-panel__entry-actions">
                  <button className="mini-action" onClick={() => onRestore(entry.id)} type="button">Restore</button>
                  <button className="mini-action" onClick={() => onPurge(entry.id)} type="button">Delete forever</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// --- Daily Note Navigator ---

export function DailyNoteNavigator({
  currentDate,
  onSelectDate,
}: {
  currentDate: string;
  onSelectDate: (date: string) => void;
}) {
  const [selectedDate, setSelectedDate] = useState(currentDate || new Date().toISOString().slice(0, 10));

  function navigateDay(offset: number) {
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() + offset);
    const newDate = d.toISOString().slice(0, 10);
    setSelectedDate(newDate);
    onSelectDate(newDate);
  }

  return (
    <div className="daily-note-nav">
      <button className="mini-action" onClick={() => navigateDay(-1)} type="button">←</button>
      <input
        className="daily-note-nav__date"
        onChange={(e) => {
          setSelectedDate(e.target.value);
          onSelectDate(e.target.value);
        }}
        type="date"
        value={selectedDate}
      />
      <button className="mini-action" onClick={() => navigateDay(1)} type="button">→</button>
      <button
        className="mini-action"
        onClick={() => {
          const today = new Date().toISOString().slice(0, 10);
          setSelectedDate(today);
          onSelectDate(today);
        }}
        type="button"
      >
        Today
      </button>
    </div>
  );
}

// --- Graph View ---

export function GraphView({
  nodes,
  links,
  onSelectNode,
}: {
  nodes: Array<{ id: string; title: string; sourcePath: string; linkCount: number }>;
  links: Array<{ source: string; target: string }>;
  onSelectNode: (sourcePath: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const positionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || nodes.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.parentElement?.clientWidth ?? 600;
    const height = canvas.parentElement?.clientHeight ?? 400;
    canvas.width = width;
    canvas.height = height;

    // Initialize positions in a circle layout
    const positions = new Map<string, { x: number; y: number; vx: number; vy: number }>();
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.35;

    nodes.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / nodes.length;
      positions.set(node.id, {
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
        vx: 0,
        vy: 0,
      });
    });

    const nodeIdSet = new Set(nodes.map((n) => n.id));
    const validLinks = links.filter((l) => nodeIdSet.has(l.source) && nodeIdSet.has(l.target));

    // Simple force-directed simulation
    let animationFrame: number;
    let iterations = 0;
    const maxIterations = 120;

    function simulate() {
      if (iterations >= maxIterations) {
        // Store final positions
        for (const [id, pos] of positions) {
          positionsRef.current.set(id, { x: pos.x, y: pos.y });
        }
        draw();
        return;
      }
      iterations++;

      // Repulsion
      for (const a of positions.values()) {
        for (const b of positions.values()) {
          if (a === b) continue;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const force = 800 / (dist * dist);
          a.vx += (dx / dist) * force;
          a.vy += (dy / dist) * force;
        }
      }

      // Attraction along links
      for (const link of validLinks) {
        const a = positions.get(link.source);
        const b = positions.get(link.target);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const force = dist * 0.01;
        a.vx += (dx / dist) * force;
        a.vy += (dy / dist) * force;
        b.vx -= (dx / dist) * force;
        b.vy -= (dy / dist) * force;
      }

      // Center gravity
      for (const pos of positions.values()) {
        pos.vx += (cx - pos.x) * 0.002;
        pos.vy += (cy - pos.y) * 0.002;
        pos.x += pos.vx * 0.3;
        pos.y += pos.vy * 0.3;
        pos.vx *= 0.85;
        pos.vy *= 0.85;
      }

      for (const [id, pos] of positions) {
        positionsRef.current.set(id, { x: pos.x, y: pos.y });
      }

      draw();
      animationFrame = requestAnimationFrame(simulate);
    }

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);

      // Draw links
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 1;
      for (const link of validLinks) {
        const a = positions.get(link.source);
        const b = positions.get(link.target);
        if (!a || !b) continue;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      // Draw nodes
      for (const node of nodes) {
        const pos = positions.get(node.id);
        if (!pos) continue;
        const r = 4 + Math.min(node.linkCount * 2, 12);
        const isHovered = hoveredNode === node.id;

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, 2 * Math.PI);
        ctx.fillStyle = isHovered ? "#58a6ff" : "#78e6c6";
        ctx.fill();

        if (isHovered) {
          ctx.font = "12px system-ui";
          ctx.fillStyle = "#e6edf3";
          ctx.textAlign = "center";
          ctx.fillText(node.title, pos.x, pos.y - r - 6);
        }
      }
    }

    simulate();

    return () => cancelAnimationFrame(animationFrame);
  }, [nodes, links, hoveredNode]);

  function handleCanvasClick(event: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;

    for (const node of nodes) {
      const pos = positionsRef.current.get(node.id);
      if (!pos) continue;
      const r = 4 + Math.min(node.linkCount * 2, 12);
      const dx = mx - pos.x;
      const dy = my - pos.y;
      if (dx * dx + dy * dy < (r + 4) * (r + 4)) {
        onSelectNode(node.sourcePath);
        return;
      }
    }
  }

  function handleCanvasMove(event: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;

    for (const node of nodes) {
      const pos = positionsRef.current.get(node.id);
      if (!pos) continue;
      const r = 4 + Math.min(node.linkCount * 2, 12);
      const dx = mx - pos.x;
      const dy = my - pos.y;
      if (dx * dx + dy * dy < (r + 4) * (r + 4)) {
        setHoveredNode(node.id);
        return;
      }
    }
    setHoveredNode(null);
  }

  return (
    <div className="graph-view">
      <div className="graph-view__header">
        <p className="eyebrow">Knowledge graph</p>
        <h4>Note connections</h4>
        <span className="muted">{nodes.length} notes · {links.length} links</span>
      </div>
      <div className="graph-view__canvas-wrapper">
        <canvas
          className="graph-view__canvas"
          onClick={handleCanvasClick}
          onMouseMove={handleCanvasMove}
          ref={canvasRef}
        />
      </div>
    </div>
  );
}

// --- Note Link Autocomplete ---

export function NoteLinkAutocomplete({
  notes,
  textareaRef,
  onInsertLink,
}: {
  notes: Note[];
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onInsertLink: (linkText: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    function handleInput(e: Event) {
      const target = e.target as HTMLTextAreaElement;
      const pos = target.selectionStart;
      const text = target.value.slice(0, pos);
      const lastBrackets = text.lastIndexOf("[[");

      if (lastBrackets !== -1 && !text.slice(lastBrackets).includes("]]")) {
        const partial = text.slice(lastBrackets + 2);
        setFilter(partial);
        setIsOpen(true);

        // Approximate caret position
        const lines = text.split("\n");
        const lineNum = lines.length - 1;
        const charPos = lines[lineNum].length;
        setPosition({ top: lineNum * 20 + 24, left: Math.min(charPos * 8, 300) });
      } else {
        setIsOpen(false);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }

    textarea.addEventListener("input", handleInput);
    textarea.addEventListener("keydown", handleKeyDown);
    return () => {
      textarea.removeEventListener("input", handleInput);
      textarea.removeEventListener("keydown", handleKeyDown);
    };
  }, [textareaRef]);

  const filtered = useMemo(() => {
    if (!isOpen || !filter) return notes.slice(0, 15);
    const lowerFilter = filter.toLowerCase();
    return notes
      .filter((n) => n.title.toLowerCase().includes(lowerFilter))
      .slice(0, 15);
  }, [notes, filter, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="note-link-autocomplete" style={{ top: position.top, left: position.left }}>
      {filtered.length === 0 ? (
        <div className="note-link-autocomplete__empty">No matching notes</div>
      ) : (
        filtered.map((note) => (
          <button
            className="note-link-autocomplete__item"
            key={note.id}
            onClick={() => {
              onInsertLink(`[[${note.title}]]`);
              setIsOpen(false);
            }}
            type="button"
          >
            {note.title}
          </button>
        ))
      )}
    </div>
  );
}

// --- Full-text Search Results ---

export function FullTextSearchResults({
  results,
  query,
  onSelectNote,
}: {
  results: Array<{ noteId: string; sourcePath: string; title: string; snippet: string; matchStart: number; matchEnd: number }>;
  query: string;
  onSelectNote: (sourcePath: string) => void;
}) {
  if (results.length === 0 && query) {
    return (
      <article className="bookmark-empty">
        <h4>No results</h4>
        <p>No notes matched "{query}".</p>
      </article>
    );
  }

  return (
    <div className="fulltext-results">
      {results.map((result, index) => (
        <button
          className="fulltext-results__item"
          key={`${result.noteId}-${index}`}
          onClick={() => onSelectNote(result.sourcePath)}
          type="button"
        >
          <strong>{result.title}</strong>
          <p className="fulltext-results__snippet">
            {result.snippet.slice(0, result.matchStart)}
            <mark>{result.snippet.slice(result.matchStart, result.matchEnd)}</mark>
            {result.snippet.slice(result.matchEnd)}
          </p>
          <span className="muted">{result.sourcePath}</span>
        </button>
      ))}
    </div>
  );
}

// --- Smart Folders ---

export function SmartFoldersList({
  folders,
  onSelect,
  onDelete,
  onAdd,
}: {
  folders: Array<{ id: string; label: string; query: string }>;
  onSelect: (query: string) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="smart-folders">
      <div className="smart-folders__header">
        <h5>Smart Folders</h5>
        <button className="mini-action" onClick={onAdd} type="button">
          <Plus size={14} /> New
        </button>
      </div>
      {folders.length === 0 ? (
        <p className="muted">No smart folders yet. Create one from a search query.</p>
      ) : (
        <div className="smart-folders__list">
          {folders.map((folder) => (
            <div className="smart-folders__item" key={folder.id}>
              <button className="smart-folders__item-main" onClick={() => onSelect(folder.query)} type="button">
                <Folder size={14} />
                <span>{folder.label}</span>
                <span className="muted">{folder.query}</span>
              </button>
              <button className="icon-action" onClick={() => onDelete(folder.id)} title="Remove" type="button">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Workspace Switcher ---

export function WorkspaceSwitcher({
  workspaces,
  onSwitch,
  onAdd,
  onRemove,
}: {
  workspaces: Array<{ id: string; label: string; path: string; isActive: boolean }>;
  onSwitch: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="workspace-switcher">
      <div className="workspace-switcher__header">
        <h5>Workspaces</h5>
        <button className="mini-action" onClick={onAdd} type="button">
          <Plus size={14} /> Add
        </button>
      </div>
      <div className="workspace-switcher__list">
        {workspaces.map((ws) => (
          <div className={`workspace-switcher__item ${ws.isActive ? "is-active" : ""}`} key={ws.id}>
            <button className="workspace-switcher__item-main" onClick={() => onSwitch(ws.id)} type="button">
              <Folder size={14} />
              <div>
                <strong>{ws.label}</strong>
                <span className="muted">{ws.path}</span>
              </div>
              {ws.isActive ? <Check size={14} /> : null}
            </button>
            {!ws.isActive ? (
              <button className="icon-action" onClick={() => onRemove(ws.id)} title="Remove workspace" type="button">
                <X size={14} />
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
