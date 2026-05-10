import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Command, X } from "lucide-react";

import type { NavItem, Note, SectionId, TodoItem } from "../../types";

interface CommandPaletteProps {
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
  onQueryChange: (query: string) => void;
  selectedNote: Note | null;
  todoItems: TodoItem[];
}

interface PaletteCommand {
  id: string;
  label: string;
  subtitle?: string;
  category: string;
  action: () => void;
}

export function CommandPalette({
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
}: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const allCommands = useMemo<PaletteCommand[]>(() => {
    const commands: PaletteCommand[] = [];

    for (const item of navItems) {
      commands.push({
        id: `nav-${item.id}`,
        label: `Go to ${item.label}`,
        subtitle: `Section · ${item.count} items`,
        category: "Navigate",
        action: () => {
          onNavigateSection(item.id);
          onClose();
        },
      });
    }

    if (selectedNote && canEditSelectedNote) {
      if (isNoteEditing) {
        commands.push({
          id: "cmd-save",
          label: "Save note",
          subtitle: selectedNote.title,
          category: "Note",
          action: () => {
            onSaveEditing();
            onClose();
          },
        });
        commands.push({
          id: "cmd-cancel-edit",
          label: "Cancel editing",
          subtitle: selectedNote.title,
          category: "Note",
          action: () => {
            onCancelEditing();
            onClose();
          },
        });
      } else {
        commands.push({
          id: "cmd-edit",
          label: "Edit note",
          subtitle: selectedNote.title,
          category: "Note",
          action: () => {
            onStartEditing();
            onClose();
          },
        });
      }
    }

    commands.push({
      id: "cmd-new-note",
      label: "New document",
      subtitle: "Create a new markdown note",
      category: "Create",
      action: () => {
        onCreateDocument();
        onClose();
      },
    });
    commands.push({
      id: "cmd-new-todo",
      label: "New task",
      subtitle: "Add a todo item",
      category: "Create",
      action: () => {
        onAddTodo();
        onClose();
      },
    });
    commands.push({
      id: "cmd-quick-capture",
      label: "Quick capture",
      subtitle: "Capture a task, note, or bookmark (Ctrl+Alt+N)",
      category: "Create",
      action: () => {
        onQuickCapture();
        onClose();
      },
    });
    commands.push({
      id: "cmd-task-templates",
      label: "Create tasks from template",
      subtitle: "Sprint, Weekly Review, Project Launch…",
      category: "Create",
      action: () => {
        onShowTaskTemplates();
        onClose();
      },
    });
    commands.push({
      id: "cmd-daily-note",
      label: "Open today's daily note",
      subtitle: "Navigate to today's journal entry",
      category: "Create",
      action: () => {
        onOpenDailyNote();
        onClose();
      },
    });

    commands.push({
      id: "cmd-triage",
      label: "Open triage view",
      subtitle: "Due today, stale notes, unsorted bookmarks…",
      category: "View",
      action: () => {
        onShowTriage();
        onClose();
      },
    });
    commands.push({
      id: "cmd-sidebar",
      label: "Toggle sidebar",
      category: "View",
      action: () => {
        onToggleSidebar();
        onClose();
      },
    });
    commands.push({ id: "cmd-search", label: "Open search panel", category: "View", action: onOpenSearch });
    commands.push({
      id: "cmd-graph",
      label: "Open graph view",
      subtitle: "Visualise note connections",
      category: "View",
      action: () => {
        onOpenGraphView();
        onClose();
      },
    });
    commands.push({ id: "cmd-tags", label: "Browse tags", category: "View", action: onOpenTags });
    commands.push({ id: "cmd-broken-links", label: "Check broken links", category: "View", action: onOpenBrokenLinks });
    commands.push({
      id: "cmd-keyboard",
      label: "Keyboard shortcuts",
      subtitle: "View all keyboard shortcuts",
      category: "Help",
      action: () => {
        onShowKeyboardHelp();
        onClose();
      },
    });

    for (const note of allNotes.filter((candidate) => candidate.kind !== "wiki").slice(0, 30)) {
      commands.push({
        id: `note-${note.id}`,
        label: note.title,
        subtitle: note.sourcePath ?? undefined,
        category: "Notes",
        action: () => {
          onOpenNote(note);
          onClose();
        },
      });
    }

    for (const todo of todoItems.filter((candidate) => candidate.status !== "completed").slice(0, 20)) {
      commands.push({
        id: `todo-${todo.id}`,
        label: todo.title,
        subtitle: `Task · ${todo.status}`,
        category: "Tasks",
        action: () => {
          onNavigateSection("todo");
          onClose();
        },
      });
    }

    return commands;
  }, [
    allNotes,
    canEditSelectedNote,
    isNoteEditing,
    navItems,
    onAddTodo,
    onCancelEditing,
    onClose,
    onCreateDocument,
    onNavigateSection,
    onOpenBrokenLinks,
    onOpenDailyNote,
    onOpenGraphView,
    onOpenNote,
    onOpenSearch,
    onOpenTags,
    onQuickCapture,
    onSaveEditing,
    onShowKeyboardHelp,
    onShowTaskTemplates,
    onShowTriage,
    onStartEditing,
    onToggleSidebar,
    selectedNote,
    todoItems,
  ]);

  const filteredCommands = useMemo(() => {
    if (!query.trim()) {
      return allCommands;
    }

    const normalizedQuery = query.toLowerCase();
    return allCommands.filter((command) => (
      command.label.toLowerCase().includes(normalizedQuery)
      || command.category.toLowerCase().includes(normalizedQuery)
      || (command.subtitle?.toLowerCase().includes(normalizedQuery) ?? false)
    ));
  }, [allCommands, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function handleKeyDown(event: ReactKeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((currentIndex) => Math.min(currentIndex + 1, filteredCommands.length - 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((currentIndex) => Math.max(currentIndex - 1, 0));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      filteredCommands[activeIndex]?.action();
      return;
    }

    if (event.key === "Escape") {
      onClose();
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div aria-label="Command palette" aria-modal="true" className="dialog-card command-palette" role="dialog">
        <div className="command-palette__search">
          <Command size={16} />
          <input
            ref={inputRef}
            className="command-palette__input"
            onChange={(event) => onQueryChange(event.target.value)}
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
            filteredCommands.map((command, index) => (
              <button
                key={command.id}
                className={`command-palette__item ${index === activeIndex ? "is-active" : ""}`}
                onClick={command.action}
                onMouseEnter={() => setActiveIndex(index)}
                type="button"
              >
                <span className="command-palette__item-body">
                  <span className="command-palette__item-label">{command.label}</span>
                  {command.subtitle ? <span className="command-palette__item-subtitle">{command.subtitle}</span> : null}
                </span>
                <span className="category-badge">{command.category}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}