import { useRef, useState, useEffect, useMemo, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  AlertTriangle,
  AppWindow,
  Bookmark,
  CalendarClock,
  CheckSquare,
  Clock,
  Command,
  Database,
  Download,
  FileCode2,
  FileText,
  Filter,
  Folder,
  FolderOpen,
  History,
  Inbox,
  Keyboard,
  LayoutGrid,
  LayoutList,
  Link2,
  ListChecks,
  PanelRightClose,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Tag,
  TimerReset,
  TriangleAlert,
  X,
} from "lucide-react";
import type { BookmarkDialogState, Note, NavItem, NoteCreationDialogState, QuickCaptureState, RestorePointSummary, SectionId, TodoItem } from "../types";
import {
  SUPPORTED_NOTE_FILE_TYPES,
  type NoteVersion,
  type AppPrefs,
  type SupportedNoteFileType,
} from "../appTypes";

const NOTE_TEMPLATES = [
  { id: "blank", label: "Blank", icon: FileText, preview: "Start with an empty document" },
  {
    id: "daily",
    label: "Daily Note",
    icon: CalendarClock,
    preview: "Focus, notes, and completed tasks for today",
    content: "# {date}\n\n## Today's Focus\n\n- \n\n## Notes\n\n## Completed Today\n\n- \n",
  },
  {
    id: "meeting",
    label: "Meeting Notes",
    icon: CheckSquare,
    preview: "Attendees, agenda, and action items",
    content: "# Meeting – {date}\n\n## Attendees\n\n- \n\n## Agenda\n\n1. \n\n## Notes\n\n## Action Items\n\n- [ ] \n",
  },
  {
    id: "project",
    label: "Project Brief",
    icon: LayoutGrid,
    preview: "Overview, goals, and task breakdown",
    content: "# {title}\n\n## Overview\n\n## Goals\n\n1. \n\n## Scope\n\n## Tasks\n\n- [ ] \n\n## Notes\n",
  },
  {
    id: "reference",
    label: "Reference",
    icon: Link2,
    preview: "Summary, details, and references",
    content: "# {title}\n\n## Summary\n\n## Details\n\n## References\n\n- \n",
  },
] as const;

const TASK_BUNDLES = [
  {
    id: "weekly-review",
    label: "Weekly Review",
    description: "5-step checklist for reviewing and planning the week",
    listName: "General",
    tasks: [
      "Review last week's completions",
      "Set priorities for this week",
      "Clear inbox",
      "Update project boards",
      "Review goals",
    ],
  },
  {
    id: "sprint-planning",
    label: "Sprint Planning",
    description: "6-step setup for a new development sprint",
    listName: "Development",
    tasks: [
      "Define sprint goal",
      "Break down user stories",
      "Estimate effort",
      "Assign tasks to team",
      "Set up standup cadence",
      "Define done-criteria",
    ],
  },
  {
    id: "project-launch",
    label: "Project Launch",
    description: "Kickoff checklist for starting a new project",
    listName: "Projects",
    tasks: [
      "Define project scope",
      "Set timeline and milestones",
      "Identify stakeholders",
      "Create task breakdown",
      "Set up communication channels",
    ],
  },
  {
    id: "meeting-prep",
    label: "Meeting Prep",
    description: "Preparation steps before a key meeting",
    listName: "General",
    tasks: [
      "Set agenda",
      "Send pre-read material",
      "Confirm attendees",
      "Book room / video link",
      "Prepare talking points",
    ],
  },
] as const;
import { ensureMetadataFolderPath, getClientPlatform, getFolderPathPlaceholder, shouldUseManualFolderPaths } from "../clientPlatform";
import { loadNoteVersionHistory } from "../noteVersionHistory";

function BookmarkDialog({
  state,
  onChange,
  onClose,
  onConfirm,
}: {
  state: BookmarkDialogState;
  onChange: (field: "title" | "url" | "description", value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (state.kind === "closed") {
    return null;
  }

  const isDelete = state.kind === "delete";
  const title =
    state.kind === "add-folder"
      ? "Create folder"
      : state.kind === "add-bookmark"
        ? "Create bookmark"
        : state.kind === "edit-folder"
          ? "Edit folder"
          : state.kind === "edit-bookmark"
            ? "Edit bookmark"
            : "Delete item";

  return (
    <div className="dialog-backdrop" role="presentation">
      <div
        aria-labelledby="bookmark-dialog-title"
        aria-modal="true"
        className="dialog-card"
        role="dialog"
      >
        <div className="dialog-card__header">
          <div>
            <p className="eyebrow">Bookmarks</p>
            <h3 id="bookmark-dialog-title">{title}</h3>
          </div>
          <button aria-label="Close dialog" className="icon-action" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>

        {isDelete ? (
          <p className="dialog-card__body">Delete "{state.title}" from bookmarks?</p>
        ) : (
          <div className="dialog-form">
            <label className="dialog-field">
              <span>Title</span>
              <input
                autoFocus
                onChange={(event) => onChange("title", event.target.value)}
                type="text"
                value={state.title}
              />
            </label>

            {"url" in state ? (
              <label className="dialog-field">
                <span>URL</span>
                <input onChange={(event) => onChange("url", event.target.value)} type="url" value={state.url} />
              </label>
            ) : null}

            {"description" in state ? (
              <label className="dialog-field">
                <span>Description</span>
                <textarea onChange={(event) => onChange("description", event.target.value)} rows={4} value={state.description} />
              </label>
            ) : null}
          </div>
        )}

        <div className="dialog-card__actions">
          <button className="mini-action" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="mini-action is-active" onClick={onConfirm} type="button">
            {isDelete ? "Delete" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function NoteCreationDialog({
  state,
  onChange,
  onClose,
  onConfirm,
  onTemplateChange,
}: {
  state: NoteCreationDialogState;
  onChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  onTemplateChange?: (templateId: string) => void;
}) {
  if (state.kind === "closed") {
    return null;
  }

  const isDocument = state.kind === "document";
  const isSection = state.kind === "section";
  const title = isDocument ? "Create document" : isSection ? "Create section" : "Create folder";
  const eyebrow = isDocument ? "Notes" : isSection ? "Sections" : "Folders";
  const helper = isDocument
    ? "Use a concise title. The app will create a markdown document for you."
    : isSection
      ? "Create a new top-level section under data/docs."
      : "Create a new folder in the current note location.";
  const value = state.name;
  const targetPath = state.targetPath;

  return (
    <div className="dialog-backdrop" role="presentation" onClick={(event) => {
      if (event.target === event.currentTarget) {
        onClose();
      }
    }}>
      <div
        aria-labelledby="note-creation-dialog-title"
        aria-modal="true"
        className="dialog-card"
        role="dialog"
      >
        <div className="dialog-card__header">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h3 id="note-creation-dialog-title">{title}</h3>
          </div>
          <button aria-label="Close dialog" className="icon-action" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>

        <div className="dialog-form">
          <div className="dialog-location">
            <span>Location</span>
            <code>{targetPath}</code>
          </div>
          <label className="dialog-field">
            <span>{isDocument ? "Document name" : isSection ? "Section name" : "Folder name"}</span>
            <input
              autoFocus
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && value.trim()) {
                  event.preventDefault();
                  onConfirm();
                }
              }}
              placeholder={isDocument ? "Architecture notes" : isSection ? "Project BEAT" : "Sprint planning"}
              type="text"
              value={value}
            />
          </label>
          {isDocument && onTemplateChange ? (
            <div className="dialog-template-picker">
              <span className="dialog-template-picker__label">Template</span>
              <div className="dialog-template-picker__options">
                {NOTE_TEMPLATES.map((tpl) => {
                  const TplIcon = tpl.icon;
                  const selectedTemplate = "selectedTemplate" in state ? state.selectedTemplate : "";
                  const isActive = selectedTemplate === tpl.id;
                  return (
                    <button
                      key={tpl.id}
                      className={`dialog-template-option ${isActive ? "is-active" : ""}`}
                      onClick={() => onTemplateChange(tpl.id)}
                      title={tpl.preview}
                      type="button"
                    >
                      <TplIcon size={14} />
                      <span>{tpl.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          <p className="dialog-card__body dialog-card__body--compact">{helper}</p>
        </div>

        <div className="dialog-card__actions">
          <button className="mini-action" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="mini-action is-active" disabled={!value.trim()} onClick={onConfirm} type="button">
            {isDocument ? "Create document" : isSection ? "Create section" : "Create folder"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CommandPalette({
  allNotes,
  canEditSelectedNote,
  isNoteEditing,
  navItems,
  onClose,
  onNavigateSection,
  onOpenNote,
  onStartEditing,
  onCancelEditing,
  onSaveEditing,
  onToggleSidebar,
  onOpenSearch,
  onOpenTags,
  onOpenBrokenLinks,
  onOpenDailyNote,
  onShowTriage,
  onShowTaskTemplates,
  onShowKeyboardHelp,
  onOpenGraphView,
  onCreateDocument,
  onAddTodo,
  onQuickCapture,
  query,
  onQueryChange,
  selectedNote,
  todoItems,
}: {
  allNotes: Note[];
  canEditSelectedNote: boolean;
  isNoteEditing: boolean;
  navItems: NavItem[];
  onClose: () => void;
  onNavigateSection: (section: SectionId) => void;
  onOpenNote: (note: Note) => void;
  onStartEditing: () => void;
  onCancelEditing: () => void;
  onSaveEditing: () => void;
  onToggleSidebar: () => void;
  onOpenSearch: () => void;
  onOpenTags: () => void;
  onOpenBrokenLinks: () => void;
  onOpenDailyNote: () => void;
  onShowTriage: () => void;
  onShowTaskTemplates: () => void;
  onShowKeyboardHelp: () => void;
  onOpenGraphView: () => void;
  onCreateDocument: () => void;
  onAddTodo: () => void;
  onQuickCapture: () => void;
  query: string;
  onQueryChange: (q: string) => void;
  selectedNote: Note | null;
  todoItems: TodoItem[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  interface PaletteCommand {
    id: string;
    label: string;
    subtitle?: string;
    category: string;
    action: () => void;
  }

  const allCommands = useMemo<PaletteCommand[]>(() => {
    const cmds: PaletteCommand[] = [];

    // Section navigation
    for (const item of navItems) {
      cmds.push({
        id: `nav-${item.id}`,
        label: `Go to ${item.label}`,
        subtitle: `Section · ${item.count} items`,
        category: "Navigate",
        action: () => { onNavigateSection(item.id); onClose(); },
      });
    }

    // Note commands
    if (selectedNote && canEditSelectedNote) {
      if (isNoteEditing) {
        cmds.push({ id: "cmd-save", label: "Save note", subtitle: selectedNote.title, category: "Note", action: () => { onSaveEditing(); onClose(); } });
        cmds.push({ id: "cmd-cancel-edit", label: "Cancel editing", subtitle: selectedNote.title, category: "Note", action: () => { onCancelEditing(); onClose(); } });
      } else {
        cmds.push({ id: "cmd-edit", label: "Edit note", subtitle: selectedNote.title, category: "Note", action: () => { onStartEditing(); onClose(); } });
      }
    }

    // Create commands
    cmds.push({ id: "cmd-new-note", label: "New document", subtitle: "Create a new markdown note", category: "Create", action: () => { onCreateDocument(); onClose(); } });
    cmds.push({ id: "cmd-new-todo", label: "New task", subtitle: "Add a todo item", category: "Create", action: () => { onAddTodo(); onClose(); } });
    cmds.push({ id: "cmd-quick-capture", label: "Quick capture", subtitle: "Capture a task, note, or bookmark (Ctrl+Alt+N)", category: "Create", action: () => { onQuickCapture(); onClose(); } });
    cmds.push({ id: "cmd-task-templates", label: "Create tasks from template", subtitle: "Sprint, Weekly Review, Project Launch…", category: "Create", action: () => { onShowTaskTemplates(); onClose(); } });
    cmds.push({ id: "cmd-daily-note", label: "Open today's daily note", subtitle: "Navigate to today's journal entry", category: "Create", action: () => { onOpenDailyNote(); onClose(); } });

    // View commands
    cmds.push({ id: "cmd-triage", label: "Open triage view", subtitle: "Due today, stale notes, unsorted bookmarks…", category: "View", action: () => { onShowTriage(); onClose(); } });
    cmds.push({ id: "cmd-sidebar", label: "Toggle sidebar", category: "View", action: () => { onToggleSidebar(); onClose(); } });
    cmds.push({ id: "cmd-search", label: "Open search panel", category: "View", action: onOpenSearch });
    cmds.push({ id: "cmd-graph", label: "Open graph view", subtitle: "Visualise note connections", category: "View", action: () => { onOpenGraphView(); onClose(); } });
    cmds.push({ id: "cmd-tags", label: "Browse tags", category: "View", action: () => { onOpenTags(); } });
    cmds.push({ id: "cmd-broken-links", label: "Check broken links", category: "View", action: () => { onOpenBrokenLinks(); } });
    cmds.push({ id: "cmd-keyboard", label: "Keyboard shortcuts", subtitle: "View all keyboard shortcuts", category: "Help", action: () => { onShowKeyboardHelp(); onClose(); } });

    // Open notes
    const noteList = allNotes.filter((n) => n.kind !== "wiki").slice(0, 30);
    for (const note of noteList) {
      cmds.push({
        id: `note-${note.id}`,
        label: note.title,
        subtitle: note.sourcePath ?? undefined,
        category: "Notes",
        action: () => { onOpenNote(note); onClose(); },
      });
    }

    // Open todos (top 20 open tasks)
    const openTodos = todoItems.filter((t) => t.status !== "completed").slice(0, 20);
    for (const todo of openTodos) {
      cmds.push({
        id: `todo-${todo.id}`,
        label: todo.title,
        subtitle: `Task · ${todo.status}`,
        category: "Tasks",
        action: () => { onNavigateSection("todo"); onClose(); },
      });
    }

    return cmds;
  }, [allNotes, canEditSelectedNote, isNoteEditing, navItems, onAddTodo, onCancelEditing, onClose, onCreateDocument, onNavigateSection, onOpenBrokenLinks, onOpenDailyNote, onOpenGraphView, onOpenNote, onOpenSearch, onOpenTags, onQuickCapture, onSaveEditing, onShowKeyboardHelp, onShowTaskTemplates, onShowTriage, onStartEditing, onToggleSidebar, selectedNote, todoItems]);

  const filteredCommands = useMemo(() => {
    if (!query.trim()) return allCommands;
    const q = query.toLowerCase();
    return allCommands.filter(
      (cmd) => cmd.label.toLowerCase().includes(q) || cmd.category.toLowerCase().includes(q) || (cmd.subtitle?.toLowerCase().includes(q) ?? false),
    );
  }, [allCommands, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function handleKeyDown(event: ReactKeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      filteredCommands[activeIndex]?.action();
    } else if (event.key === "Escape") {
      onClose();
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div aria-label="Command palette" className="dialog-card command-palette" role="dialog" aria-modal="true">
        <div className="command-palette__search">
          <Command size={16} />
          <input
            ref={inputRef}
            className="command-palette__input"
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search commands or notes..."
            type="text"
            value={query}
          />
          <button aria-label="Close" className="icon-action" onClick={onClose} type="button">
            <X size={14} />
          </button>
        </div>
        <div className="command-palette__list">
          {filteredCommands.length === 0 ? (
            <div className="command-palette__empty">No commands found</div>
          ) : (
            filteredCommands.map((cmd, index) => (
              <button
                key={cmd.id}
                className={`command-palette__item ${index === activeIndex ? "is-active" : ""}`}
                onClick={cmd.action}
                onMouseEnter={() => setActiveIndex(index)}
                type="button"
              >
                <span className="command-palette__item-body">
                  <span className="command-palette__item-label">{cmd.label}</span>
                  {cmd.subtitle ? <span className="command-palette__item-subtitle">{cmd.subtitle}</span> : null}
                </span>
                <span className="category-badge">{cmd.category}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function TagBrowserDialog({
  allTags,
  onClose,
  onSelectTag,
}: {
  allTags: { tag: string; count: number }[];
  onClose: () => void;
  onSelectTag: (tag: string) => void;
}) {
  return (
    <div className="dialog-backdrop" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div aria-labelledby="tag-browser-title" className="dialog-card tag-browser" role="dialog" aria-modal="true">
        <div className="dialog-card__header">
          <div>
            <p className="eyebrow">Knowledge</p>
            <h3 id="tag-browser-title">All tags ({allTags.length})</h3>
          </div>
          <button aria-label="Close tag browser" className="icon-action" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>
        <div className="tag-browser__grid">
          {allTags.length === 0 ? (
            <p className="tag-browser__empty">No tags found in notes or bookmarks.</p>
          ) : (
            allTags.map(({ tag, count }) => (
              <button
                key={tag}
                className="tag-browser__tag"
                onClick={() => onSelectTag(tag)}
                type="button"
                title={`Search for #${tag}`}
              >
                <Tag size={12} />
                <span>{tag}</span>
                <span className="tag-browser__count">{count}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function VersionHistoryDialog({
  note,
  onClose,
  onRestore,
}: {
  note: Note;
  onClose: () => void;
  onRestore: (version: NoteVersion) => void;
}) {
  const versions = note.sourcePath ? loadNoteVersionHistory(note.sourcePath) : [];
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  return (
    <div className="dialog-backdrop" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div aria-labelledby="version-history-title" className="dialog-card version-history" role="dialog" aria-modal="true">
        <div className="dialog-card__header">
          <div>
            <p className="eyebrow">Version history</p>
            <h3 id="version-history-title">{note.title}</h3>
          </div>
          <button aria-label="Close version history" className="icon-action" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>
        {versions.length === 0 ? (
          <p className="dialog-card__body">No versions saved yet. Versions are saved automatically before each save.</p>
        ) : (
          <div className="version-history__layout">
            <div className="version-history__list">
              {versions.map((version, index) => (
                <div
                  key={version.savedAt}
                  className={`version-history__item ${previewIndex === index ? "is-active" : ""}`}
                  onClick={() => setPreviewIndex(index)}
                >
                  <div className="version-history__item-meta">
                    <Clock size={13} />
                    <span>{new Date(version.savedAt).toLocaleString()}</span>
                  </div>
                  <p className="version-history__item-label">{version.label}</p>
                  <button
                    className="mini-action"
                    onClick={(e) => { e.stopPropagation(); onRestore(version); }}
                    type="button"
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
            {previewIndex !== null && versions[previewIndex] ? (
              <div className="version-history__preview">
                <pre className="version-history__preview-content">{versions[previewIndex].content}</pre>
              </div>
            ) : (
              <div className="version-history__preview version-history__preview--empty">
                <Clock size={24} />
                <p>Select a version to preview</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function BrokenLinksDialog({
  brokenLinksMap,
  allNotes,
  onClose,
  onSelectNote,
}: {
  brokenLinksMap: Map<string, string[]>;
  allNotes: Note[];
  onClose: () => void;
  onSelectNote: (note: Note) => void;
}) {
  return (
    <div className="dialog-backdrop" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div aria-labelledby="broken-links-title" className="dialog-card broken-links" role="dialog" aria-modal="true">
        <div className="dialog-card__header">
          <div>
            <p className="eyebrow">Health check</p>
            <h3 id="broken-links-title">Broken links ({brokenLinksMap.size})</h3>
          </div>
          <button aria-label="Close broken links" className="icon-action" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>
        {brokenLinksMap.size === 0 ? (
          <p className="dialog-card__body" style={{ color: "var(--accent)" }}>No broken links found — all links are healthy!</p>
        ) : (
          <div className="broken-links__list">
            {[...brokenLinksMap.entries()].map(([sourcePath, links]) => {
              const note = allNotes.find((n) => n.sourcePath === sourcePath);
              return (
                <div key={sourcePath} className="broken-links__item">
                  <div className="broken-links__note">
                    <button
                      className="broken-links__note-btn"
                      onClick={() => { if (note) { onSelectNote(note); onClose(); } }}
                      type="button"
                    >
                      <FileCode2 size={14} />
                      {note?.title ?? sourcePath}
                    </button>
                    <span className="muted">{sourcePath}</span>
                  </div>
                  <ul className="broken-links__links">
                    {links.map((link, i) => (
                      <li key={i} className="broken-links__link">
                        <TriangleAlert size={12} />
                        <code>{link}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ExportImportDialog({
  noteCount,
  bookmarkCount,
  exportActions,
  restorePoints,
  isLoadingRestorePoints,
  isRestoringRestorePoint,
  onClose,
  onCreateRestorePoint,
  onExport,
  onImport,
  onRestoreRestorePoint,
}: {
  noteCount: number;
  bookmarkCount: number;
  exportActions: Array<{ description: string; id: string; label: string }>;
  restorePoints: RestorePointSummary[];
  isLoadingRestorePoints: boolean;
  isRestoringRestorePoint: boolean;
  onClose: () => void;
  onCreateRestorePoint: () => void;
  onExport: (exportId: string) => void;
  onImport: (file: File) => void;
  onRestoreRestorePoint: (restorePointId: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<"import" | "export" | "restore">("import");

  const tabs: Array<{ id: "import" | "export" | "restore"; label: string; icon: typeof Plus }> = [
    { id: "import", label: "Import", icon: Plus },
    { id: "export", label: "Export", icon: Download },
    { id: "restore", label: "Restore", icon: History },
  ];

  return (
    <div className="dialog-backdrop" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div aria-labelledby="export-import-title" className="dialog-card export-import" role="dialog" aria-modal="true">
        <div className="export-import__layout">
          <nav className="export-import__nav" aria-label="Backup and restore actions">
            <div className="export-import__nav-header">
              <History size={18} />
              <span>Backup &amp; Restore</span>
            </div>
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                aria-controls={`export-import-panel-${id}`}
                aria-selected={activeTab === id}
                className={`export-import__nav-item ${activeTab === id ? "is-active" : ""}`}
                id={`export-import-tab-${id}`}
                onClick={() => setActiveTab(id)}
                role="tab"
                type="button"
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </nav>

          <div className="export-import__content">
            <div className="export-import__content-header">
              <div>
                <p className="eyebrow">Backup &amp; Restore</p>
                <h3 id="export-import-title">
                  {activeTab === "import" ? "Import data" : activeTab === "export" ? "Export data" : "Restore points"}
                </h3>
              </div>
              <button aria-label="Close dialog" className="icon-action" onClick={onClose} type="button">
                <X size={16} />
              </button>
            </div>

            <div className="export-import__body">
          {activeTab === "import" ? (
            <section
              aria-labelledby="export-import-tab-import"
              className="export-import__section"
              id="export-import-panel-import"
              role="tabpanel"
            >
              <h4 className="export-import__section-title">
                <Plus size={15} />
                Import JSON
              </h4>
              <p className="export-import__desc">
                Upload a full workspace snapshot or one of the domain exports. Legacy organizer export files still import.
              </p>
              <input
                ref={fileInputRef}
                className="hidden-input"
                type="file"
                accept=".json,application/json"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) { onImport(f); } e.target.value = ""; }}
              />
              <button
                className="mini-action"
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                <Plus size={13} />
                Choose pack file…
              </button>
            </section>
          ) : null}

          {activeTab === "export" ? (
            <section
              aria-labelledby="export-import-tab-export"
              className="export-import__section"
              id="export-import-panel-export"
              role="tabpanel"
            >
              <h4 className="export-import__section-title">
                <Download size={15} />
                Export data
              </h4>
              <p className="export-import__desc">
                Download full workspace snapshots or focused JSON exports for notes, bookmarks, tasks, recents, smart views, and preferences ({noteCount} notes, {bookmarkCount} bookmarks).
              </p>
              <div className="export-import__action-list">
                {exportActions.map((action) => (
                  <button className="export-import__action" key={action.id} onClick={() => onExport(action.id)} type="button">
                    <span>
                      <strong>{action.label}</strong>
                      <span className="export-import__action-desc">{action.description}</span>
                    </span>
                    <Download size={13} />
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {activeTab === "restore" ? (
            <section
              aria-labelledby="export-import-tab-restore"
              className="export-import__section"
              id="export-import-panel-restore"
              role="tabpanel"
            >
              <h4 className="export-import__section-title">
                <History size={15} />
                Restore points
              </h4>
              <p className="export-import__desc">
                Create a server-backed snapshot of your notes, bookmarks, tasks, recents, smart views, and key preferences.
              </p>
              <button className="mini-action is-active" onClick={onCreateRestorePoint} type="button">
                <Plus size={13} />
                Create restore point
              </button>
              <div className="export-import__restore-list" role="list" aria-label="Restore points">
                {isLoadingRestorePoints ? <p className="export-import__desc">Loading restore points...</p> : null}
                {!isLoadingRestorePoints && restorePoints.length === 0 ? (
                  <p className="export-import__desc">No restore points yet.</p>
                ) : null}
                {!isLoadingRestorePoints
                  ? restorePoints.map((restorePoint) => (
                      <div className="export-import__restore-item" key={restorePoint.id} role="listitem">
                        <div>
                          <strong>{restorePoint.label}</strong>
                          <p className="export-import__desc">
                            {new Date(restorePoint.createdAt).toLocaleString()} · {restorePoint.noteCount} notes · {restorePoint.bookmarkCount} bookmarks · {restorePoint.todoCount} tasks
                            {restorePoint.isAutomatic ? " · automatic" : ""}
                          </p>
                        </div>
                        <button
                          className="mini-action"
                          disabled={isRestoringRestorePoint}
                          onClick={() => onRestoreRestorePoint(restorePoint.id)}
                          type="button"
                        >
                          <RotateCcw size={13} />
                          Restore
                        </button>
                      </div>
                    ))
                  : null}
              </div>
            </section>
          ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   PreferencesDialog — Windows 11–style settings overlay
   ────────────────────────────────────────────────────────────────────────── */

function PreferencesDialog({
  prefs,
  onPrefsChange,
  onClose,
  apiBase,
}: {
  prefs: AppPrefs;
  onPrefsChange: (next: AppPrefs) => void;
  onClose: () => void;
  apiBase: string;
}) {
  const [activeTab, setActiveTab] = useState<"general" | "notes" | "search" | "system">("general");
  const [metaDataPath, setMetaDataPath] = useState<string | null>(null);
  const [todosPath, setTodosPath] = useState<string | null>(null);
  const [notesPath, setNotesPath] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (activeTab !== "system") return;
    fetch(`${apiBase}/api/meta-data-path`)
      .then((r) => r.json())
      .then((d: { path?: string }) => setMetaDataPath(d.path ?? null))
      .catch(() => {});
    fetch(`${apiBase}/api/todo-items/storage-path`)
      .then((r) => r.json())
      .then((d: { path?: string }) => setTodosPath(d.path ?? null))
      .catch(() => {});
    fetch(`${apiBase}/api/docs/source`)
      .then((r) => r.json())
      .then((d: { path?: string }) => setNotesPath(d.path ?? null))
      .catch(() => {});
  }, [activeTab, apiBase]);

  async function handleClearMetaData() {
    setClearing(true);
    try {
      const res = await fetch(`${apiBase}/api/meta-data-path`, { method: "DELETE" });
      if (res.ok) {
        window.location.reload();
      }
    } catch {
      setClearing(false);
      setConfirmClear(false);
    }
  }

  function toggleSupportedNoteFileType(fileType: SupportedNoteFileType) {
    const nextTypes = prefs.supportedNoteFileTypes.includes(fileType)
      ? prefs.supportedNoteFileTypes.filter((currentType) => currentType !== fileType)
      : [...prefs.supportedNoteFileTypes, fileType];

    if (nextTypes.length === 0) {
      return;
    }

    onPrefsChange({
      ...prefs,
      supportedNoteFileTypes: SUPPORTED_NOTE_FILE_TYPES.filter((currentType) => nextTypes.includes(currentType)),
    });
  }

  return (
    <div className="dialog-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog-card prefs-dialog" role="dialog" aria-modal="true" aria-label="Preferences">
        <div className="prefs-layout">
          <nav className="prefs-nav" aria-label="Settings categories">
            <div className="prefs-nav__header">
              <Settings size={18} />
              <span>Settings</span>
            </div>
            <button
              className={`prefs-nav__item ${activeTab === "general" ? "is-active" : ""}`}
              type="button"
              onClick={() => setActiveTab("general")}
            >
              <LayoutGrid size={15} />
              General
            </button>
            <button
              className={`prefs-nav__item ${activeTab === "notes" ? "is-active" : ""}`}
              type="button"
              onClick={() => setActiveTab("notes")}
            >
              <Folder size={15} />
              Notes
            </button>
            <button
              className={`prefs-nav__item ${activeTab === "search" ? "is-active" : ""}`}
              type="button"
              onClick={() => setActiveTab("search")}
            >
              <Search size={15} />
              Search
            </button>
            <button
              className={`prefs-nav__item ${activeTab === "system" ? "is-active" : ""}`}
              type="button"
              onClick={() => setActiveTab("system")}
            >
              <Database size={15} />
              System
            </button>
          </nav>

          <div className="prefs-content">
            <div className="prefs-content__header">
              <h2 className="prefs-content__title">{activeTab === "general" ? "General" : activeTab === "notes" ? "Notes" : activeTab === "search" ? "Search" : "System"}</h2>
              <button className="icon-action" onClick={onClose} type="button" aria-label="Close settings">
                <X size={15} />
              </button>
            </div>

            <div className="prefs-content__body">
            {activeTab === "general" ? (
              <>
                <section className="prefs-section">
                  <h3 className="prefs-section__label">Sidebar</h3>
                  <div className="prefs-row">
                    <div className="prefs-row__icon">
                      <TimerReset size={16} />
                    </div>
                    <div className="prefs-row__body">
                      <p className="prefs-row__title">Recent &amp; Starred layout</p>
                      <p className="prefs-row__desc">
                        Show Recent and Starred as dedicated sidebar sections, or open them as overlay panels — keeping the sidebar compact.
                      </p>
                      <div className="prefs-segmented" role="radiogroup" aria-label="Recent &amp; Starred layout">
                        <button
                          className={`prefs-segmented__btn ${prefs.feedsMode === "own-view" ? "is-active" : ""}`}
                          onClick={() => onPrefsChange({ ...prefs, feedsMode: "own-view" })}
                          role="radio"
                          aria-checked={prefs.feedsMode === "own-view"}
                          type="button"
                        >
                          <LayoutList size={13} />
                          Own section
                        </button>
                        <button
                          className={`prefs-segmented__btn ${prefs.feedsMode === "panel" ? "is-active" : ""}`}
                          onClick={() => onPrefsChange({ ...prefs, feedsMode: "panel" })}
                          role="radio"
                          aria-checked={prefs.feedsMode === "panel"}
                          type="button"
                        >
                          <PanelRightClose size={13} />
                          Overlay panel
                        </button>
                        <button
                          className={`prefs-segmented__btn ${prefs.feedsMode === "popup" ? "is-active" : ""}`}
                          onClick={() => onPrefsChange({ ...prefs, feedsMode: "popup" })}
                          role="radio"
                          aria-checked={prefs.feedsMode === "popup"}
                          type="button"
                        >
                          <AppWindow size={13} />
                          Popup
                        </button>
                      </div>
                    </div>
                  </div>
                </section>
              </>
            ) : activeTab === "notes" ? (
              <>

                <section className="prefs-section">
                  <h3 className="prefs-section__label">Notes</h3>
                  <div className="prefs-row">
                    <div className="prefs-row__icon">
                      <Link2 size={16} />
                    </div>
                    <div className="prefs-row__body">
                      <label className="prefs-row__toggle">
                        <div>
                          <p className="prefs-row__title">Show backlinks</p>
                          <p className="prefs-row__desc">
                            Display a "Linked from" panel below each note listing other notes that link to it.
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={prefs.showBacklinks}
                          onChange={(e) => onPrefsChange({ ...prefs, showBacklinks: e.target.checked })}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="prefs-row">
                    <div className="prefs-row__icon">
                      <Folder size={16} />
                    </div>
                    <div className="prefs-row__body">
                      <p className="prefs-row__title">Supported note file types</p>
                      <p className="prefs-row__desc">
                        Choose which file extensions Organizer indexes as notes. At least one file type must stay enabled.
                      </p>
                      <div className="prefs-choice-list" role="group" aria-label="Supported note file types">
                        {SUPPORTED_NOTE_FILE_TYPES.map((fileType) => {
                          const isSelected = prefs.supportedNoteFileTypes.includes(fileType);

                          return (
                            <label
                              className={`prefs-choice-pill ${isSelected ? "is-active" : ""}`}
                              key={fileType}
                            >
                              <input
                                checked={isSelected}
                                onChange={() => toggleSupportedNoteFileType(fileType)}
                                type="checkbox"
                              />
                              <span>{fileType}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="prefs-row">
                    <div className="prefs-row__icon">
                      <FileCode2 size={16} />
                    </div>
                    <div className="prefs-row__body">
                      <label className="prefs-row__toggle">
                        <div>
                          <p className="prefs-row__title">Allow scripts in preview iframe</p>
                          <p className="prefs-row__desc">
                            Add <code>allow-scripts</code> to sandboxed note previews. Leave this off unless you trust the rendered content.
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={prefs.allowIframeScripts}
                          onChange={(e) => onPrefsChange({ ...prefs, allowIframeScripts: e.target.checked })}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="prefs-row">
                    <div className="prefs-row__icon">
                      <Folder size={16} />
                    </div>
                    <div className="prefs-row__body">
                      <label className="prefs-row__toggle">
                        <div>
                          <p className="prefs-row__title">Show empty folders &amp; sections</p>
                          <p className="prefs-row__desc">
                            Keep folders and sections visible even when they currently contain no note items.
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={prefs.showEmptyFoldersAndSections}
                          onChange={(e) => onPrefsChange({ ...prefs, showEmptyFoldersAndSections: e.target.checked })}
                        />
                      </label>
                    </div>
                  </div>
                </section>
              </>
            ) : activeTab === "search" ? (
              <>

                <section className="prefs-section">
                  <h3 className="prefs-section__label">Search</h3>
                  <div className="prefs-row">
                    <div className="prefs-row__icon">
                      <Search size={16} />
                    </div>
                    <div className="prefs-row__body">
                      <p className="prefs-row__title">Search entry point</p>
                      <p className="prefs-row__desc">
                        Keep search in the top bar, or open it as a dedicated quick-search overlay.
                      </p>
                      <div className="prefs-segmented" role="radiogroup" aria-label="Search entry point">
                        <button
                          className={`prefs-segmented__btn ${prefs.searchInterface === "topbar" ? "is-active" : ""}`}
                          onClick={() => onPrefsChange({ ...prefs, searchInterface: "topbar" })}
                          role="radio"
                          aria-checked={prefs.searchInterface === "topbar"}
                          type="button"
                        >
                          <Search size={13} />
                          Top bar
                        </button>
                        <button
                          className={`prefs-segmented__btn ${prefs.searchInterface === "palette" ? "is-active" : ""}`}
                          onClick={() => onPrefsChange({ ...prefs, searchInterface: "palette" })}
                          role="radio"
                          aria-checked={prefs.searchInterface === "palette"}
                          type="button"
                        >
                          <Command size={13} />
                          Quick search overlay
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="prefs-row">
                    <div className="prefs-row__icon">
                      <PanelRightClose size={16} />
                    </div>
                    <div className="prefs-row__body">
                      <label className="prefs-row__toggle">
                        <div>
                          <p className="prefs-row__title">Show “Open search panel” column</p>
                          <p className="prefs-row__desc">
                            Keep the narrow search launcher visible next to the hero card when top-bar search is enabled.
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={prefs.showCollapsedSearchCard}
                          onChange={(e) => onPrefsChange({ ...prefs, showCollapsedSearchCard: e.target.checked })}
                        />
                      </label>
                    </div>
                  </div>
                </section>
              </>
            ) : (
              <>
                <section className="prefs-section">
                  <h3 className="prefs-section__label">Storage</h3>
                  <p className="prefs-section__desc">
                    Organizer stores metadata (bookmarks, sidebar order, starred notes, recent documents) in a local folder.
                    Your notes and documents are never copied — only referenced by path.
                  </p>

                  <div className="prefs-row">
                    <div className="prefs-row__icon">
                      <Database size={16} />
                    </div>
                    <div className="prefs-row__body">
                      <p className="prefs-row__title">Metadata directory</p>
                      <p className="prefs-row__desc prefs-row__path">{metaDataPath ?? "Not configured"}</p>
                    </div>
                    {metaDataPath ? (
                      <button
                        className="icon-action"
                        type="button"
                        title="Open in Finder"
                        onClick={() => fetch(`${apiBase}/api/open-folder`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ folderPath: metaDataPath }),
                        })}
                      >
                        <FolderOpen size={15} />
                      </button>
                    ) : null}
                  </div>

                  <div className="prefs-row">
                    <div className="prefs-row__icon">
                      <Folder size={16} />
                    </div>
                    <div className="prefs-row__body">
                      <p className="prefs-row__title">Notes folder</p>
                      <p className="prefs-row__desc prefs-row__path">{notesPath ?? "Not configured"}</p>
                    </div>
                    {notesPath ? (
                      <button
                        className="icon-action"
                        type="button"
                        title="Open in Finder"
                        onClick={() => fetch(`${apiBase}/api/open-folder`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ folderPath: notesPath }),
                        })}
                      >
                        <FolderOpen size={15} />
                      </button>
                    ) : null}
                  </div>

                  <div className="prefs-row">
                    <div className="prefs-row__icon">
                      <Folder size={16} />
                    </div>
                    <div className="prefs-row__body">
                      <p className="prefs-row__title">TODO storage</p>
                      <p className="prefs-row__desc prefs-row__path">{todosPath ?? "Not configured"}</p>
                    </div>
                    {todosPath ? (
                      <button
                        className="icon-action"
                        type="button"
                        title="Open in Finder"
                        onClick={() => fetch(`${apiBase}/api/open-folder`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ folderPath: todosPath }),
                        })}
                      >
                        <FolderOpen size={15} />
                      </button>
                    ) : null}
                  </div>
                </section>

                <section className="prefs-section">
                  <h3 className="prefs-section__label">What's stored</h3>
                  <p className="prefs-section__desc">
                    The metadata directory contains: sidebar order, bookmarks, starred notes, recent documents, and docs-source configuration.
                    The TODO directory stores your task items. Clearing metadata will remove all of this data but will <strong>not</strong> delete your original notes or documents.
                  </p>
                </section>

                <section className="prefs-section">
                  <h3 className="prefs-section__label">Danger zone</h3>
                  {!confirmClear ? (
                    <button
                      className="prefs-danger-button"
                      type="button"
                      onClick={() => setConfirmClear(true)}
                    >
                      <AlertTriangle size={14} />
                      Clear all metadata
                    </button>
                  ) : (
                    <div className="prefs-danger-confirm">
                      <p className="prefs-danger-confirm__warning">
                        <AlertTriangle size={14} />
                        This will permanently delete all metadata, bookmarks, starred notes, TODO items, and configuration.
                        Your original notes and documents will not be affected. The app will reload.
                      </p>
                      <div className="prefs-danger-confirm__actions">
                        <button
                          className="prefs-danger-button prefs-danger-button--confirm"
                          type="button"
                          disabled={clearing}
                          onClick={handleClearMetaData}
                        >
                          {clearing ? "Clearing…" : "Yes, clear everything"}
                        </button>
                        <button
                          className="prefs-danger-button prefs-danger-button--cancel"
                          type="button"
                          onClick={() => setConfirmClear(false)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              </>
            )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetaDataSetupDialog({
  apiBase,
  onConfigured,
}: {
  apiBase: string;
  onConfigured: (metaDataPath: string) => void;
}) {
  const shouldUseManualPaths = shouldUseManualFolderPaths();
  const folderPathPlaceholder = getFolderPathPlaceholder();
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualPath, setManualPath] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function readJsonResponse(response: Response) {
    const contentType = response.headers.get("content-type") ?? "";
    const raw = await response.text();

    if (!contentType.includes("application/json")) {
      throw new Error("The Organizer API server is not responding. Start the server and try again.");
    }

    try {
      return JSON.parse(raw) as { path?: string; error?: string };
    } catch {
      throw new Error("The Organizer API server returned an invalid response.");
    }
  }

  async function handlePickFolder() {
    setPicking(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/meta-data-path/pick`, { method: "POST" });
      const data = await readJsonResponse(res);
      if (!res.ok) throw new Error(data.error || "Failed to pick folder");
      if (!data.path) throw new Error("The Organizer API server did not return a folder path.");
      onConfigured(data.path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Folder selection failed");
    } finally {
      setPicking(false);
    }
  }

  async function handleSubmitManual() {
    const trimmed = manualPath.trim();
    if (!trimmed) { setError("Please enter a folder path."); return; }
    setSubmitting(true);
    setError(null);
    try {
      const metaPath = ensureMetadataFolderPath(trimmed);
      const res = await fetch(`${apiBase}/api/meta-data-path`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: metaPath }),
      });
      const data = await readJsonResponse(res);
      if (!res.ok) throw new Error(data.error || "Failed to set path");
      if (!data.path) throw new Error("The Organizer API server did not return a folder path.");
      onConfigured(data.path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set meta data path");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="dialog-backdrop dialog-backdrop--setup" role="presentation">
      <div className="dialog-card meta-data-setup" aria-modal="true">
        <h2>Welcome to Organizer</h2>
        <p className="meta-data-setup__description">
          Choose a folder where Organizer will store your metadata (bookmarks, todos, starred notes, etc.).
          A subfolder called <code>organizer_meta_data</code> will be created inside your chosen location.
        </p>
        {shouldUseManualPaths ? (
          <p className="meta-data-setup__hint">
            On Windows in the browser build, enter the full folder path manually.
          </p>
        ) : null}

        <div className="meta-data-setup__actions">
          {!shouldUseManualPaths ? (
            <>
              <button
                className="meta-data-setup__pick-button"
                onClick={handlePickFolder}
                type="button"
                disabled={picking || submitting}
              >
                {picking ? "Waiting for selection…" : "Choose folder…"}
              </button>

              <div className="meta-data-setup__divider">
                <span>or enter a path manually</span>
              </div>
            </>
          ) : null}

          <div className="meta-data-setup__manual">
            <input
              type="text"
              className="meta-data-setup__input"
              placeholder={folderPathPlaceholder}
              value={manualPath}
              onChange={(e) => setManualPath(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmitManual(); }}
              disabled={picking || submitting}
            />
            <button
              className="meta-data-setup__submit"
              onClick={handleSubmitManual}
              type="button"
              disabled={picking || submitting || !manualPath.trim()}
            >
              {submitting ? "Setting up…" : "Set path"}
            </button>
          </div>
        </div>

        {error ? <p className="meta-data-setup__error">{error}</p> : null}
      </div>
    </div>
  );
}

function KeyboardShortcutsDialog({ onClose }: { onClose: () => void }) {
  const platform = getClientPlatform();
  const modifierLabel = platform === "mac" ? "⌘" : "Ctrl";
  const alternateModifierLabel = platform === "mac" ? "⌥" : "Alt";
  const historyKeys = platform === "mac" ? ["⌘[", "⌘]"] : ["Alt+←", "Alt+→"];
  const platformLabel = platform === "mac" ? "Mac" : platform === "windows" ? "Windows" : "Keyboard";
  const sections = [
    {
      id: "global",
      title: "Global",
      description: "Always available actions for capture, search, and help.",
      shortcuts: [
        { keys: [`${modifierLabel}+K`, platform === "mac" ? "⌘⇧P" : "Ctrl+Shift+P"], description: "Open command palette" },
        { keys: [`${modifierLabel}+F`], description: "Open search" },
        { keys: [`${modifierLabel}+S`], description: "Save note (when editing)" },
        { keys: [`${modifierLabel}+E`], description: "Toggle edit / view mode" },
        { keys: ["Escape"], description: "Close panel / exit immersive mode" },
        { keys: [`${modifierLabel}/`], description: "Open keyboard shortcuts help" },
        { keys: [`${modifierLabel}+${alternateModifierLabel}+N`], description: "Open quick capture" },
      ],
    },
    {
      id: "navigation",
      title: "Navigation",
      description: "Move through sections, history, and quick jumps.",
      shortcuts: [
        { keys: historyKeys, description: "Go back / forward in history" },
        { keys: [`${modifierLabel}+K`, "section"], description: "Jump to Notes, Bookmarks, TODO…" },
        { keys: [`${modifierLabel}+K`, "note title"], description: "Open any note by title" },
      ],
    },
    {
      id: "notes",
      title: "Notes",
      description: "Editing and note-specific actions.",
      shortcuts: [
        { keys: [`${modifierLabel}+S`], description: "Save current note" },
        { keys: [`${modifierLabel}+E`], description: "Start / cancel editing" },
        { keys: ["Escape"], description: "Cancel editing (if unmodified)" },
      ],
    },
    {
      id: "palette",
      title: "Command Palette",
      description: "Navigate and execute palette actions without leaving the keyboard.",
      shortcuts: [
        { keys: ["↑", "↓"], description: "Navigate commands" },
        { keys: ["Enter"], description: "Execute selected command" },
        { keys: ["Escape"], description: "Close palette" },
      ],
    },
  ] as const;
  const [activeSectionId, setActiveSectionId] = useState<(typeof sections)[number]["id"]>("global");
  const activeSection = sections.find((section) => section.id === activeSectionId) ?? sections[0];

  return (
    <div className="dialog-backdrop" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div aria-labelledby="keyboard-shortcuts-title" className="dialog-card keyboard-shortcuts" role="dialog" aria-modal="true">
        <div className="keyboard-shortcuts__layout">
          <nav className="keyboard-shortcuts__nav" aria-label="Shortcut categories">
            <div className="keyboard-shortcuts__nav-header">
              <Keyboard size={18} />
              <span>Shortcuts</span>
            </div>
            <span className="keyboard-shortcuts__platform-badge">{platformLabel}</span>
            {sections.map((section) => (
              <button
                key={section.id}
                className={`keyboard-shortcuts__nav-item ${activeSectionId === section.id ? "is-active" : ""}`}
                onClick={() => setActiveSectionId(section.id)}
                type="button"
              >
                {section.title}
              </button>
            ))}
          </nav>

          <div className="keyboard-shortcuts__content">
            <div className="keyboard-shortcuts__content-header">
              <div>
                <p className="eyebrow">Reference</p>
                <h3 id="keyboard-shortcuts-title">{activeSection.title}</h3>
              </div>
              <button aria-label="Close keyboard shortcuts" className="icon-action" onClick={onClose} type="button">
                <X size={16} />
              </button>
            </div>

            <div className="keyboard-shortcuts__body">
              <p className="keyboard-shortcuts__section-desc">{activeSection.description}</p>
              <div className="keyboard-shortcuts__list">
                {activeSection.shortcuts.map((shortcut) => (
                  <div className="keyboard-shortcuts__item" key={shortcut.description}>
                    <div className="keyboard-shortcuts__keys">
                      {shortcut.keys.map((key) => (
                        <kbd key={key} className="keyboard-shortcuts__key">{key}</kbd>
                      ))}
                    </div>
                    <div className="keyboard-shortcuts__item-body">
                      <strong className="keyboard-shortcuts__item-title">{shortcut.description}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskTemplateDialog({
  onClose,
  onCreateBundle,
}: {
  onClose: () => void;
  onCreateBundle: (tasks: string[], listName: string) => void;
}) {
  return (
    <div className="dialog-backdrop" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div aria-labelledby="task-template-title" className="dialog-card task-template" role="dialog" aria-modal="true">
        <div className="dialog-card__header">
          <div>
            <p className="eyebrow">Templates</p>
            <h3 id="task-template-title">
              <ListChecks size={16} />
              Task template bundles
            </h3>
          </div>
          <button aria-label="Close task templates" className="icon-action" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>
        <div className="task-template__body">
          {TASK_BUNDLES.map((bundle) => (
            <div key={bundle.id} className="task-template__bundle">
              <div className="task-template__bundle-header">
                <div>
                  <strong className="task-template__bundle-title">{bundle.label}</strong>
                  <p className="task-template__bundle-desc">{bundle.description}</p>
                </div>
                <button
                  className="mini-action is-active"
                  onClick={() => onCreateBundle([...bundle.tasks], bundle.listName)}
                  type="button"
                >
                  <Plus size={14} />
                  Create {bundle.tasks.length} tasks
                </button>
              </div>
              <ul className="task-template__task-list">
                {bundle.tasks.map((task) => (
                  <li key={task} className="task-template__task">
                    <CheckSquare size={12} />
                    {task}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type TriageView = "today" | "this-week" | "waiting" | "stale-notes" | "unsorted-bookmarks";

function TriagePanel({
  onClose,
  dueTodayTodos,
  dueThisWeekTodos,
  waitingTodos,
  staleNotes,
  unsortedBookmarks,
  onSelectTodo,
  onOpenNote,
}: {
  onClose: () => void;
  dueTodayTodos: TodoItem[];
  dueThisWeekTodos: TodoItem[];
  waitingTodos: TodoItem[];
  staleNotes: Note[];
  unsortedBookmarks: { id: string; title: string; url: string; domain: string }[];
  onSelectTodo: (id: string) => void;
  onOpenNote: (note: Note) => void;
}) {
  const [activeView, setActiveView] = useState<TriageView>("today");

  const views: { id: TriageView; label: string; count: number; icon: typeof Filter }[] = [
    { id: "today", label: "Due Today", count: dueTodayTodos.length, icon: CalendarClock },
    { id: "this-week", label: "This Week", count: dueThisWeekTodos.length, icon: CalendarClock },
    { id: "waiting", label: "Waiting", count: waitingTodos.length, icon: Clock },
    { id: "stale-notes", label: "Stale Notes", count: staleNotes.length, icon: FileText },
    { id: "unsorted-bookmarks", label: "Unsorted", count: unsortedBookmarks.length, icon: Filter },
  ];

  return (
    <div className="card search-card">
      <div className="card__header">
        <div>
          <p className="eyebrow">Smart triage</p>
          <h3>Triage views</h3>
        </div>
        <button className="icon-action" onClick={onClose} type="button">
          <PanelRightClose size={14} />
        </button>
      </div>
      <div className="triage-panel__tabs">
        {views.map((view) => {
          const Icon = view.icon;
          return (
            <button
              key={view.id}
              className={`triage-panel__tab ${activeView === view.id ? "is-active" : ""}`}
              onClick={() => setActiveView(view.id)}
              type="button"
            >
              <Icon size={12} />
              {view.label}
              {view.count > 0 ? <span className="triage-panel__tab-count">{view.count}</span> : null}
            </button>
          );
        })}
      </div>
      <div className="triage-panel__content">
        {activeView === "today" ? (
          dueTodayTodos.length === 0 ? (
            <p className="triage-panel__empty">No tasks due today. Great job!</p>
          ) : (
            dueTodayTodos.map((todo) => (
              <button key={todo.id} className="triage-panel__item" onClick={() => onSelectTodo(todo.id)} type="button">
                <CheckSquare size={13} />
                <span className="triage-panel__item-title">{todo.title}</span>
                {todo.priority !== "medium" ? (
                  <span className={`triage-panel__item-badge is-${todo.priority}`}>{todo.priority}</span>
                ) : null}
              </button>
            ))
          )
        ) : activeView === "this-week" ? (
          dueThisWeekTodos.length === 0 ? (
            <p className="triage-panel__empty">No tasks due this week.</p>
          ) : (
            dueThisWeekTodos.map((todo) => (
              <button key={todo.id} className="triage-panel__item" onClick={() => onSelectTodo(todo.id)} type="button">
                <CheckSquare size={13} />
                <span className="triage-panel__item-title">{todo.title}</span>
                <span className="triage-panel__item-date">{todo.expectedCompletionDate?.slice(0, 10)}</span>
              </button>
            ))
          )
        ) : activeView === "waiting" ? (
          waitingTodos.length === 0 ? (
            <p className="triage-panel__empty">No waiting / paused tasks.</p>
          ) : (
            waitingTodos.map((todo) => (
              <button key={todo.id} className="triage-panel__item" onClick={() => onSelectTodo(todo.id)} type="button">
                <Clock size={13} />
                <span className="triage-panel__item-title">{todo.title}</span>
                <span className="triage-panel__item-date">{todo.updatedAt.slice(0, 10)}</span>
              </button>
            ))
          )
        ) : activeView === "stale-notes" ? (
          staleNotes.length === 0 ? (
            <p className="triage-panel__empty">No stale notes (all modified within 30 days).</p>
          ) : (
            staleNotes.map((note) => (
              <button key={note.id} className="triage-panel__item" onClick={() => onOpenNote(note)} type="button">
                <FileText size={13} />
                <span className="triage-panel__item-title">{note.title}</span>
                <span className="triage-panel__item-date">{note.updatedAt.slice(0, 10)}</span>
              </button>
            ))
          )
        ) : (
          unsortedBookmarks.length === 0 ? (
            <p className="triage-panel__empty">All bookmarks are tagged and organised.</p>
          ) : (
            unsortedBookmarks.map((bm) => (
              <button
                key={bm.id}
                className="triage-panel__item"
                onClick={() => window.open(bm.url, "_blank", "noopener,noreferrer")}
                type="button"
              >
                <Filter size={13} />
                <span className="triage-panel__item-title">{bm.title}</span>
                <span className="triage-panel__item-date">{bm.domain}</span>
              </button>
            ))
          )
        )}
      </div>
    </div>
  );
}

function QuickCaptureDialog({
  state,
  todoLists,
  onClose,
  onChange,
  onCaptureTask,
  onCaptureNote,
  onCaptureBookmark,
}: {
  state: QuickCaptureState;
  todoLists: string[];
  onClose: () => void;
  onChange: (patch: Partial<QuickCaptureState>) => void;
  onCaptureTask: (title: string, listName: string, toInbox: boolean) => void;
  onCaptureNote: (title: string, templateId: string, toInbox: boolean) => void;
  onCaptureBookmark: (title: string, url: string, description: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [state.tab]);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") onClose();
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleConfirm();
    }
  }

  function handleConfirm() {
    if (!state.title.trim()) return;
    if (state.tab === "task") {
      onCaptureTask(state.title.trim(), state.listName, state.toInbox);
    } else if (state.tab === "note") {
      onCaptureNote(state.title.trim(), state.noteTemplate, state.toInbox);
    } else {
      onCaptureBookmark(state.title.trim(), state.url.trim(), state.description.trim());
    }
    onClose();
  }

  const tabs: Array<{ id: QuickCaptureState["tab"]; label: string; icon: typeof Inbox }> = [
    { id: "task", label: "Task", icon: CheckSquare },
    { id: "note", label: "Note", icon: FileText },
    { id: "bookmark", label: "Bookmark", icon: Bookmark },
  ];

  return (
    <div className="dialog-backdrop quick-capture-backdrop" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} onKeyDown={handleKeyDown}>
      <div aria-labelledby="quick-capture-title" className="dialog-card quick-capture" role="dialog" aria-modal="true">
        <div className="quick-capture__tabs">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`quick-capture__tab ${state.tab === id ? "is-active" : ""}`}
              onClick={() => onChange({ tab: id })}
              type="button"
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
          <div className="quick-capture__tab-spacer" />
          <button aria-label="Close" className="icon-action" onClick={onClose} type="button">
            <X size={15} />
          </button>
        </div>

        <div className="quick-capture__body">
          <input
            ref={inputRef}
            className="quick-capture__title-input"
            id="quick-capture-title"
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder={
              state.tab === "task" ? "Task title…" :
              state.tab === "note" ? "Note title…" :
              "Bookmark title…"
            }
            type="text"
            value={state.title}
          />

          {state.tab === "task" ? (
            <div className="quick-capture__options">
              <label className="quick-capture__option">
                <input
                  checked={state.toInbox}
                  onChange={(e) => onChange({ toInbox: e.target.checked })}
                  type="checkbox"
                />
                <Inbox size={13} />
                Add to Inbox (sort later)
              </label>
              {!state.toInbox ? (
                <label className="quick-capture__option quick-capture__option--list">
                  <span>List</span>
                  <select
                    onChange={(e) => onChange({ listName: e.target.value })}
                    value={state.listName}
                  >
                    {todoLists.map((l) => <option key={l} value={l}>{l}</option>)}
                    <option value="">+ New list…</option>
                  </select>
                </label>
              ) : null}
            </div>
          ) : state.tab === "note" ? (
            <div className="quick-capture__options">
              <label className="quick-capture__option">
                <input
                  checked={state.toInbox}
                  onChange={(e) => onChange({ toInbox: e.target.checked })}
                  type="checkbox"
                />
                <Inbox size={13} />
                Inbox (unsorted, no folder)
              </label>
              {!state.toInbox ? (
                <label className="quick-capture__option quick-capture__option--list">
                  <span>Template</span>
                  <select
                    onChange={(e) => onChange({ noteTemplate: e.target.value })}
                    value={state.noteTemplate}
                  >
                    {NOTE_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </label>
              ) : null}
            </div>
          ) : (
            <div className="quick-capture__options quick-capture__options--bookmark">
              <input
                className="quick-capture__url-input"
                onChange={(e) => onChange({ url: e.target.value })}
                placeholder="URL (optional)"
                type="url"
                value={state.url}
              />
              <input
                className="quick-capture__desc-input"
                onChange={(e) => onChange({ description: e.target.value })}
                placeholder="Description (optional)"
                type="text"
                value={state.description}
              />
            </div>
          )}
        </div>

        <div className="quick-capture__footer">
          <span className="quick-capture__hint">Enter to capture · Esc to dismiss</span>
          <button
            className="mini-action is-active"
            disabled={!state.title.trim()}
            onClick={handleConfirm}
            type="button"
          >
            <Plus size={14} />
            Capture
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDialog({
  message,
  confirmLabel = "Yes",
  cancelLabel = "No",
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        aria-modal="true"
        className="dialog-card"
        role="alertdialog"
        aria-label="Confirm action"
      >
        <div className="dialog-card__header">
          <h3>Are you sure?</h3>
          <button aria-label="Close dialog" className="icon-action" onClick={onCancel} type="button">
            <X size={16} />
          </button>
        </div>
        <p className="dialog-card__body">{message}</p>
        <div className="dialog-card__actions">
          <button autoFocus className="mini-action" onClick={onCancel} type="button">{cancelLabel}</button>
          <button className="mini-action is-danger" onClick={onConfirm} type="button">{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function UnsavedChangesDialog({
  onDiscard,
  onKeepEditing,
  onSave,
  isSaving = false,
}: {
  onDiscard: () => void;
  onKeepEditing: () => void;
  onSave: () => void;
  isSaving?: boolean;
}) {
  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onKeepEditing();
      return;
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!isSaving) {
        onSave();
      }
    }
  }

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onClick={(event) => { if (event.target === event.currentTarget) onKeepEditing(); }}
      onKeyDown={handleKeyDown}
    >
      <div
        aria-labelledby="unsaved-changes-title"
        aria-modal="true"
        className="dialog-card"
        role="alertdialog"
      >
        <div className="dialog-card__header">
          <h3 id="unsaved-changes-title">Unsaved changes</h3>
          <button aria-label="Keep editing" className="icon-action" onClick={onKeepEditing} type="button">
            <X size={16} />
          </button>
        </div>
        <p className="dialog-card__body">Save changes before closing this document?</p>
        <div className="dialog-card__actions">
          <button autoFocus className="mini-action" onClick={onKeepEditing} type="button">
            Keep editing
          </button>
          <button className="mini-action" disabled={isSaving} onClick={onDiscard} type="button">
            Discard
          </button>
          <button className="mini-action is-active" disabled={isSaving} onClick={onSave} type="button">
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

export {
  BookmarkDialog,
  CommandPalette,
  ConfirmDialog,
  UnsavedChangesDialog,
  TagBrowserDialog,
  VersionHistoryDialog,
  BrokenLinksDialog,
  ExportImportDialog,
  PreferencesDialog,
  NoteCreationDialog,
  MetaDataSetupDialog,
  KeyboardShortcutsDialog,
  TaskTemplateDialog,
  TriagePanel,
  QuickCaptureDialog,
  NOTE_TEMPLATES,
};
