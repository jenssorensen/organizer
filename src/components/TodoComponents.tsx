import { useMemo, useState, useEffect, useRef, type CSSProperties, type DragEvent } from "react";
import { createPortal } from "react-dom";
import { MarkdownContent } from "./MarkdownComponents";
import {
  ChevronDown,
  ChevronUp,
  Check,
  Clock,
  GripVertical,
  Pencil,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  SkipForward,
  Star,
  Timer,
  Trash2,
  Bell,
  X,
} from "lucide-react";
import { groupTodoItemsByCalendarDate, groupTodoItemsForListView, TODO_CALENDAR_NO_DUE_DATE_LABEL } from "../todoState";
import type { PomodoroState, TodoItem, TodoPriority, TodoRecurrenceUnit, TodoStatus, TodoViewMode } from "../types";

const TODO_STATUS_OPTIONS: Array<{ label: string; value: TodoStatus }> = [
  { label: "Not started", value: "not-started" },
  { label: "In progress", value: "in-progress" },
  { label: "Paused", value: "paused" },
  { label: "Completed", value: "completed" },
];

const TODO_PRIORITY_OPTIONS: Array<{ label: string; value: TodoPriority }> = [
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
  { label: "Urgent", value: "urgent" },
];

const TODO_COLOR_PRESETS = ["#78e6c6", "#58a6ff", "#ffca80", "#ff7e8a", "#b794f4", "#7dd3fc"];

export function TodoWorkspace({
  items,
  listSplitMode,
  onConsumeRequestedEditorTodoId,
  selectedTodoId,
  viewMode,
  onAddTodo,
  onDeleteTodo,
  onMoveTodo,
  onSelectTodo,
  onTransitionTodoStatus,
  onUpdateTodo,
  requestedEditorTodoId,
}: {
  items: TodoItem[];
  listSplitMode: "side-by-side" | "stacked";
  onConsumeRequestedEditorTodoId?: () => void;
  selectedTodoId: string | null;
  viewMode: TodoViewMode;
  onAddTodo: (parentId?: string | null, openEditor?: boolean) => void;
  onDeleteTodo: (id: string) => void;
  onMoveTodo: (sourceId: string, targetId: string, placement: "before" | "after") => void;
  onSelectTodo: (id: string | null) => void;
  onTransitionTodoStatus: (todoId: string, nextStatus: TodoStatus) => void;
  onUpdateTodo: (id: string, update: Partial<TodoItem>) => void;
  requestedEditorTodoId?: string | null;
}) {
  const [editorTodoId, setEditorTodoId] = useState<string | null>(null);
  const itemsByParentId = useMemo(() => groupTodosByParent(items), [items]);
  const rootTodos = useMemo(() => items.filter((item) => item.parentId === null).sort((a, b) => a.order - b.order), [items]);
  const completedTodos = useMemo(
    () => rootTodos.filter((item) => item.status === "completed").sort((a, b) => b.order - a.order),
    [rootTodos],
  );
  const now = useMemo(() => new Date().toISOString(), []);
  const openTodos = useMemo(
    () => rootTodos.filter((item) => item.status !== "completed" && (!item.snoozeUntil || item.snoozeUntil <= now)),
    [rootTodos, now],
  );
  const snoozedTodos = useMemo(
    () => rootTodos.filter((item) => item.status !== "completed" && item.snoozeUntil && item.snoozeUntil > now),
    [rootTodos, now],
  );
  const overdueGroups = useMemo(() => groupTodoItemsForListView(openTodos), [openTodos]);
  const showBothEmptyColumns = openTodos.length === 0 && completedTodos.length === 0;
  const editorTodo = useMemo(() => (editorTodoId ? items.find((item) => item.id === editorTodoId) ?? null : null), [editorTodoId, items]);
  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  useEffect(() => {
    if (editorTodoId && !editorTodo) {
      setEditorTodoId(null);
    }
  }, [editorTodo, editorTodoId]);

  useEffect(() => {
    if (!requestedEditorTodoId) {
      return;
    }

    const requestedTodo = items.find((item) => item.id === requestedEditorTodoId);
    if (!requestedTodo) {
      return;
    }

    setEditorTodoId(requestedEditorTodoId);
    onConsumeRequestedEditorTodoId?.();
  }, [items, onConsumeRequestedEditorTodoId, requestedEditorTodoId]);

  return (
    <div className="todo-workspace">
      <div className={`todo-workspace__body ${viewMode === "calendar" ? "is-calendar" : "is-list"}`}>
        <section className="todo-board">
          {viewMode === "list" ? (
            <div className={`todo-list-split ${listSplitMode === "stacked" ? "is-stacked" : "is-side-by-side"}`}>
              <TodoColumn
                emptyText="No open tasks yet."
                forceShowEmptyBody={showBothEmptyColumns}
                items={openTodos}
                itemsByParentId={itemsByParentId}
                onAddSubtask={onAddTodo}
                onCompleteTodo={(todoId) => onTransitionTodoStatus(todoId, "completed")}
                onReopenTodo={(todoId) => onTransitionTodoStatus(todoId, "in-progress")}
                onDeleteTodo={onDeleteTodo}
                onMoveTodo={onMoveTodo}
                onOpenEditor={(todo) => setEditorTodoId(todo.id)}
                onSelectTodo={onSelectTodo}
                onSetColumnStatus={(todoId) => onTransitionTodoStatus(todoId, "in-progress")}
                onToggleStarred={(todo) => onUpdateTodo(todo.id, { starred: !todo.starred })}
                onUpdateTodo={onUpdateTodo}
                overdueCount={overdueGroups.overdue.length}
                selectedTodoId={selectedTodoId}
                snoozedCount={snoozedTodos.length}
                title="Active tasks"
              />
              <TodoColumn
                emptyText="Completed tasks will appear here."
                forceShowEmptyBody={showBothEmptyColumns}
                items={completedTodos}
                itemsByParentId={itemsByParentId}
                onAddSubtask={onAddTodo}
                onCompleteTodo={(todoId) => onTransitionTodoStatus(todoId, "completed")}
                onReopenTodo={(todoId) => onTransitionTodoStatus(todoId, "in-progress")}
                onDeleteTodo={onDeleteTodo}
                onMoveTodo={onMoveTodo}
                onOpenEditor={(todo) => setEditorTodoId(todo.id)}
                onSelectTodo={onSelectTodo}
                onSetColumnStatus={(todoId) => onTransitionTodoStatus(todoId, "completed")}
                onToggleStarred={(todo) => onUpdateTodo(todo.id, { starred: !todo.starred })}
                onUpdateTodo={onUpdateTodo}
                selectedTodoId={selectedTodoId}
                title="Completed"
              />
            </div>
          ) : (
            <TodoCalendar items={items} onSelectTodo={onSelectTodo} selectedTodoId={selectedTodoId} />
          )}
        </section>
      </div>

      {editorTodo ? (
        <TodoEditorModal
          item={editorTodo}
          parentTodo={editorTodo.parentId ? itemsById.get(editorTodo.parentId) ?? null : null}
          subtasks={itemsByParentId.get(editorTodo.id) ?? []}
          onAddSubtask={() => onAddTodo(editorTodo.id, true)}
          onComplete={() => {
            onTransitionTodoStatus(editorTodo.id, "completed");
            setEditorTodoId(null);
          }}
          onClose={() => setEditorTodoId(null)}
          onSave={(update) => onUpdateTodo(editorTodo.id, update)}
        />
      ) : null}
    </div>
  );
}

function TodoColumn({
  emptyText,
  forceShowEmptyBody,
  items,
  itemsByParentId,
  onAddSubtask,
  onCompleteTodo,
  onReopenTodo,
  onDeleteTodo,
  onMoveTodo,
  onOpenEditor,
  onSelectTodo,
  onSetColumnStatus,
  onToggleStarred,
  onUpdateTodo,
  overdueCount = 0,
  selectedTodoId,
  snoozedCount = 0,
  title,
}: {
  emptyText: string;
  forceShowEmptyBody?: boolean;
  items: TodoItem[];
  itemsByParentId: Map<string | null, TodoItem[]>;
  onAddSubtask: (parentId?: string | null, openEditor?: boolean) => void;
  onCompleteTodo: (todoId: string) => void;
  onReopenTodo: (todoId: string) => void;
  onDeleteTodo: (id: string) => void;
  onMoveTodo: (sourceId: string, targetId: string, placement: "before" | "after") => void;
  onOpenEditor: (todo: TodoItem) => void;
  onSelectTodo: (id: string | null) => void;
  onSetColumnStatus: (todoId: string) => void;
  onToggleStarred: (todo: TodoItem) => void;
  onUpdateTodo: (id: string, update: Partial<TodoItem>) => void;
  overdueCount?: number;
  selectedTodoId: string | null;
  snoozedCount?: number;
  title: string;
}) {
  const [isDropTargetActive, setIsDropTargetActive] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const dragDepthRef = useRef(0);
  const isCompletedColumn = title.toLowerCase() === "completed";
  const isCompletedEmpty = isCompletedColumn && items.length === 0 && !forceShowEmptyBody;
  const showBody = !isCollapsed && !isCompletedEmpty;

  function handleColumnDragEnter(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes("text/todo-id")) {
      return;
    }

    dragDepthRef.current += 1;
    setIsDropTargetActive(true);
  }

  function handleColumnDragLeave(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes("text/todo-id")) {
      return;
    }

    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDropTargetActive(false);
    }
  }

  function handleColumnDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDropTargetActive(false);
    const sourceId = event.dataTransfer.getData("text/todo-id");
    if (!sourceId) {
      return;
    }

    onSetColumnStatus(sourceId);
  }

  return (
    <article
      className={`todo-column ${isDropTargetActive ? "is-drop-target" : ""} ${isCompletedEmpty ? "is-empty-completed" : ""}`}
      onDragEnter={handleColumnDragEnter}
      onDragLeave={handleColumnDragLeave}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("text/todo-id")) {
          event.preventDefault();
        }
      }}
      onDrop={handleColumnDrop}
    >
      <div className="todo-column__header">
        <h5>{title}</h5>
        <div className="todo-column__header-actions">
          {overdueCount > 0 ? (
            <span className="status-pill is-urgent" title={`${overdueCount} overdue`}>{overdueCount} overdue</span>
          ) : null}
          {snoozedCount > 0 ? (
            <span className="status-pill subtle" title={`${snoozedCount} snoozed`}>
              <Clock size={10} /> {snoozedCount}
            </span>
          ) : null}
          <span className="status-pill subtle">{items.length}</span>
          <button
            aria-expanded={!isCollapsed}
            aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${title.toLowerCase()} tasks`}
            className="icon-action"
            disabled={isCompletedEmpty}
            onClick={() => setIsCollapsed((current) => !current)}
            type="button"
          >
            {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>
      {showBody ? (
        <div className="todo-column__body">
          {items.length > 0 ? (
            items.map((item) => (
              <TodoCard
                item={item}
                itemsByParentId={itemsByParentId}
                key={item.id}
                onAddSubtask={onAddSubtask}
                onCompleteTodo={onCompleteTodo}
                onReopenTodo={onReopenTodo}
                onDeleteTodo={onDeleteTodo}
                onMoveTodo={onMoveTodo}
                onOpenEditor={onOpenEditor}
                onSelectTodo={onSelectTodo}
                onToggleStarred={onToggleStarred}
                onUpdateTodo={onUpdateTodo}
                selected={selectedTodoId === item.id}
              />
            ))
          ) : (
            <p className="muted">{emptyText}</p>
          )}
        </div>
      ) : null}
    </article>
  );
}

function TodoCard({
  item,
  itemsByParentId,
  onAddSubtask,
  onCompleteTodo,
  onReopenTodo,
  onDeleteTodo,
  onMoveTodo,
  onOpenEditor,
  onSelectTodo,
  onToggleStarred,
  onUpdateTodo,
  selected,
}: {
  item: TodoItem;
  itemsByParentId: Map<string | null, TodoItem[]>;
  onAddSubtask: (parentId?: string | null, openEditor?: boolean) => void;
  onCompleteTodo: (todoId: string) => void;
  onReopenTodo: (todoId: string) => void;
  onDeleteTodo: (id: string) => void;
  onMoveTodo: (sourceId: string, targetId: string, placement: "before" | "after") => void;
  onOpenEditor: (todo: TodoItem) => void;
  onSelectTodo: (id: string | null) => void;
  onToggleStarred: (todo: TodoItem) => void;
  onUpdateTodo: (id: string, update: Partial<TodoItem>) => void;
  selected: boolean;
}) {
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const [statusPopupPosition, setStatusPopupPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [dropPlacement, setDropPlacement] = useState<"before" | "after" | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [expandedSubtaskId, setExpandedSubtaskId] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ id: string; label: string } | null>(null);
  const statusMenuRef = useRef<HTMLDivElement>(null);
  const statusPopupRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  function startEditingTitle(event: React.MouseEvent) {
    event.stopPropagation();
    setTitleDraft(item.title);
    setIsEditingTitle(true);
    setTimeout(() => titleInputRef.current?.select(), 0);
  }

  function commitTitle() {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== item.title) {
      onUpdateTodo(item.id, { title: trimmed });
    }
    setIsEditingTitle(false);
  }

  function cancelTitle() {
    setIsEditingTitle(false);
  }
  const subtasks = itemsByParentId.get(item.id) ?? [];

  useEffect(() => {
    if (expandedSubtaskId && !subtasks.some((subtask) => subtask.id === expandedSubtaskId)) {
      setExpandedSubtaskId(null);
    }
  }, [expandedSubtaskId, subtasks]);

  function getDropPlacement(event: DragEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
  }

  useEffect(() => {
    if (!isStatusMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!statusMenuRef.current?.contains(target) && !statusPopupRef.current?.contains(target)) {
        setIsStatusMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsStatusMenuOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isStatusMenuOpen]);

  useEffect(() => {
    if (!isStatusMenuOpen) {
      return;
    }

    if (!statusMenuRef.current) {
      return;
    }

    function updatePopupPosition() {
      const menuHost = statusMenuRef.current;
      if (!menuHost) {
        return;
      }
      const hostRect = menuHost.getBoundingClientRect();
      const popupHeight = statusPopupRef.current?.offsetHeight ?? 160;
      const viewportMargin = 10;
      const gap = 6;

      let nextTop = hostRect.bottom + gap;
      if (nextTop + popupHeight > window.innerHeight - viewportMargin) {
        nextTop = Math.max(viewportMargin, hostRect.top - popupHeight - gap);
      }

      setStatusPopupPosition({
        top: nextTop,
        left: Math.max(viewportMargin, hostRect.right - 150),
      });
    }

    const frameId = window.requestAnimationFrame(updatePopupPosition);
    window.addEventListener("resize", updatePopupPosition);
    window.addEventListener("scroll", updatePopupPosition, true);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", updatePopupPosition);
      window.removeEventListener("scroll", updatePopupPosition, true);
    };
  }, [isStatusMenuOpen]);

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    const sourceId = event.dataTransfer.getData("text/todo-id");
    setDropPlacement(null);
    if (!sourceId || sourceId === item.id) {
      return;
    }

    const placement = getDropPlacement(event);
    onMoveTodo(sourceId, item.id, placement);
  }

  return (
    <div
      className={`todo-card ${selected ? "is-selected" : ""} ${isDragging ? "is-dragging" : ""} ${dropPlacement === "before" ? "is-drop-target-before" : ""} ${dropPlacement === "after" ? "is-drop-target-after" : ""}`}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDropPlacement(null);
        }
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("text/todo-id")) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        setDropPlacement(getDropPlacement(event));
      }}
      onDrop={handleDrop}
      style={{ "--todo-color": item.color } as CSSProperties}
    >
      <div
        className="todo-card__main"
          draggable={!isEditingTitle}
        onClick={() => { if (!isEditingTitle) { onSelectTodo(item.id); } }}
        onDoubleClick={() => { if (!isEditingTitle) { onOpenEditor(item); } }}
        onKeyDown={(event) => {
          if (!isEditingTitle && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            onSelectTodo(item.id);
          }
        }}
        onDragStart={(event) => {
          event.dataTransfer.setData("text/todo-id", item.id);
          setIsDragging(true);
        }}
        onDragEnd={() => {
          setIsDragging(false);
          setDropPlacement(null);
        }}
        role="button"
        tabIndex={0}
      >
        <div className="todo-card__title-row">
          <span className="todo-card__drag"><GripVertical size={12} /></span>
          <span className="todo-card__color" />
          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              className="todo-card__title-input"
              value={titleDraft}
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={commitTitle}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === "Enter") { event.preventDefault(); commitTitle(); }
                if (event.key === "Escape") { event.preventDefault(); cancelTitle(); }
              }}
              type="text"
            />
          ) : (
            <strong onDoubleClick={startEditingTitle}>{item.title}</strong>
          )}
          <div className="todo-card__status-menu" ref={statusMenuRef}>
            <button
              aria-expanded={isStatusMenuOpen}
              className={`todo-card__status is-${item.status}`}
              onClick={(event) => {
                event.stopPropagation();
                setIsStatusMenuOpen((current) => !current);
              }}
              type="button"
            >
              {formatStatus(item.status)}
            </button>
            {isStatusMenuOpen && typeof document !== "undefined"
              ? createPortal(
                <div
                  className="todo-card__status-popup"
                  ref={statusPopupRef}
                  role="menu"
                  style={{ left: `${statusPopupPosition.left}px`, top: `${statusPopupPosition.top}px` }}
                >
                  {TODO_STATUS_OPTIONS.map((option) => (
                    <button
                      className={`todo-card__status-option ${option.value === item.status ? "is-active" : ""}`}
                      key={option.value}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (option.value !== item.status) {
                          onUpdateTodo(item.id, { status: option.value });
                        }
                        setIsStatusMenuOpen(false);
                      }}
                      aria-checked={option.value === item.status}
                      role="menuitemradio"
                      type="button"
                    >
                      <span className={`todo-card__status-dot is-${option.value}`} />
                      <span className="todo-card__status-option-label">{option.label}</span>
                    </button>
                  ))}
                </div>,
                document.body,
              )
              : null}
          </div>
          <div className="todo-card__actions">
            {item.status !== "completed" ? (
              <button
                className="icon-action"
                onClick={() => onCompleteTodo(item.id)}
                title="Mark completed"
                type="button"
              >
                <Check size={13} />
              </button>
            ) : null}
            {item.status === "completed" ? (
              <button
                className="icon-action"
                onClick={() => onReopenTodo(item.id)}
                title="Move back to active"
                type="button"
              >
                <RotateCcw size={13} />
              </button>
            ) : (
              <button
                className="icon-action"
                onClick={() => onOpenEditor(item)}
                title="Edit task"
                type="button"
              >
                <Pencil size={13} />
              </button>
            )}
            <button className={`icon-action ${item.starred ? "is-active" : ""}`} onClick={() => onToggleStarred(item)} title={item.starred ? "Unstar" : "Star"} type="button">
              <Star fill={item.starred ? "currentColor" : "none"} size={13} />
            </button>
            {item.status !== "completed" ? (
              <button className="icon-action" onClick={() => onAddSubtask(item.id, true)} title="Add subtask" type="button">
                <Plus size={13} />
              </button>
            ) : null}
            <button className="icon-action" onClick={() => setDeleteConfirmation({ id: item.id, label: item.title })} title="Delete task" type="button">
              <Trash2 size={13} />
            </button>
            <button
              className={`icon-action ${isDescriptionExpanded ? "is-active" : ""}`}
              onClick={() => setIsDescriptionExpanded((current) => !current)}
              title={isDescriptionExpanded ? "Hide description" : "Show description"}
              type="button"
            >
              {isDescriptionExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>
        </div>
        <div className="todo-card__meta">
          <span>{buildTodoMetaSentence(item)}</span>
        </div>
        {item.tags.length > 0 ? (
          <div className="tag-row">
            {item.tags.map((tag) => (
              <span className="tag" key={tag}>#{tag}</span>
            ))}
          </div>
        ) : null}
      </div>
      {subtasks.length > 0 ? (
        <div className="todo-card__subtasks">
          <span>{subtasks.length} subtask{subtasks.length === 1 ? "" : "s"}</span>
          <div className="todo-card__subtask-list">
            {subtasks.slice(0, 3).map((subtask) => {
              const isSubtaskExpanded = expandedSubtaskId === subtask.id;
              return (
                <div className={`todo-card__subtask-entry ${isSubtaskExpanded ? "is-expanded" : ""}`.trim()} key={subtask.id}>
                  <div className="todo-card__subtask-pill">
                    <span className="todo-card__subtask-indicator" title={formatStatus(subtask.status)}>
                      <span className="todo-card__subtask-status-icon">{renderTodoStatusIcon(subtask.status, 10)}</span>
                      <span className="todo-card__subtask-color-chip" style={{ backgroundColor: subtask.color }} />
                    </span>
                    <button
                      className="todo-card__subtask-title"
                      onClick={(event) => {
                        event.stopPropagation();
                        setExpandedSubtaskId((current) => (current === subtask.id ? null : subtask.id));
                      }}
                      aria-expanded={isSubtaskExpanded}
                      type="button"
                    >
                      {subtask.title}
                    </button>
                    <div className="todo-card__subtask-actions">
                      <button
                        className="todo-card__subtask-action"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenEditor(subtask);
                        }}
                        aria-label="Edit subtask"
                        title="Edit subtask"
                        type="button"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        className="todo-card__subtask-action is-danger"
                        onClick={(event) => {
                          event.stopPropagation();
                          setDeleteConfirmation({ id: subtask.id, label: subtask.title });
                        }}
                        aria-label="Delete subtask"
                        title="Delete subtask"
                        type="button"
                      >
                        <Trash2 size={12} />
                      </button>
                      <button
                        className={`todo-card__subtask-action ${isSubtaskExpanded ? "is-active" : ""}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setExpandedSubtaskId((current) => (current === subtask.id ? null : subtask.id));
                        }}
                        aria-expanded={isSubtaskExpanded}
                        aria-label={isSubtaskExpanded ? "Collapse subtask description" : "Expand subtask description"}
                        title={isSubtaskExpanded ? "Collapse description" : "Expand description"}
                        type="button"
                      >
                        {isSubtaskExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                    </div>
                  </div>
                  {isSubtaskExpanded ? (
                    <div className="todo-card__subtask-child">
                      <div className="todo-card__subtask-child-header">
                        <span className="todo-card__subtask-child-label">Description</span>
                        <button
                          className="todo-card__subtask-close"
                          onClick={(event) => {
                            event.stopPropagation();
                            setExpandedSubtaskId(null);
                          }}
                          aria-label="Close subtask description"
                          title="Close"
                          type="button"
                        >
                          <X size={12} />
                        </button>
                      </div>
                      <div className="todo-card__subtask-child-markdown markdown-body">
                        {subtask.description.trim() ? (
                          <MarkdownContent markdown={subtask.description} omitRootWrapper />
                        ) : (
                          <p className="muted">No description yet.</p>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
      {isDescriptionExpanded ? (
        <div className="todo-card__description">
          <span className="todo-card__description-label">Description</span>
          <div className="todo-card__description-markdown markdown-body">
            {item.description.trim() ? (
              <MarkdownContent markdown={item.description} omitRootWrapper />
            ) : (
              <p className="muted">No description yet. Use Edit to add details, checkboxes, and links.</p>
            )}
          </div>
        </div>
      ) : null}

      {deleteConfirmation ? (
        <div className="dialog-backdrop" role="presentation" onClick={(event) => { event.stopPropagation(); setDeleteConfirmation(null); }}>
          <div
            aria-labelledby="delete-confirm-title"
            aria-modal="true"
            className="dialog-card"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="dialog-card__header">
              <div>
                <p className="eyebrow">Confirm delete</p>
                <h3 id="delete-confirm-title">Delete &ldquo;{deleteConfirmation.label}&rdquo;?</h3>
              </div>
              <button aria-label="Close dialog" className="icon-action" onClick={(event) => { event.stopPropagation(); setDeleteConfirmation(null); }} type="button">
                <X size={16} />
              </button>
            </div>
            <p className="dialog-card__body">This action cannot be undone.</p>
            <div className="dialog-card__actions">
              <button className="mini-action" onClick={(event) => { event.stopPropagation(); setDeleteConfirmation(null); }} type="button">
                Cancel
              </button>
              <button className="mini-action is-danger" onClick={(event) => { event.stopPropagation(); onDeleteTodo(deleteConfirmation.id); setDeleteConfirmation(null); }} type="button">
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TodoEditorModal({
  item,
  parentTodo,
  subtasks,
  onAddSubtask,
  onComplete,
  onClose,
  onSave,
}: {
  item: TodoItem;
  parentTodo: TodoItem | null;
  subtasks: TodoItem[];
  onAddSubtask: () => void;
  onComplete: () => void;
  onClose: () => void;
  onSave: (update: Partial<TodoItem>) => void;
}) {
  const isSubtask = item.parentId !== null;
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !hasUnsavedChanges) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [hasUnsavedChanges, onClose]);

  return createPortal(
    <div
      className="dialog-backdrop dialog-backdrop--todo-editor"
      onClick={(event) => {
        if (event.target === event.currentTarget && !hasUnsavedChanges) {
          onClose();
        }
      }}
      role="presentation"
    >
      <div
        aria-labelledby="todo-editor-dialog-title"
        aria-modal="true"
        className="dialog-card todo-editor-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="dialog-card__header">
          <h3 id="todo-editor-dialog-title">{isSubtask ? "Edit Subtask" : "Edit task"}</h3>
          <button aria-label="Close task editor" className="icon-action" onClick={onClose} type="button">
            <X size={14} />
          </button>
        </div>
        <div className="dialog-card__body todo-editor-modal__body">
          <TodoEditor
            item={item}
            parentTodo={parentTodo}
            subtasks={subtasks}
            onAddSubtask={onAddSubtask}
            onComplete={onComplete}
            onClose={onClose}
            onDirtyChange={setHasUnsavedChanges}
            onSave={onSave}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}

function TodoEditor({
  item,
  parentTodo,
  subtasks,
  onAddSubtask,
  onComplete,
  onClose,
  onDirtyChange,
  onSave,
}: {
  item: TodoItem;
  parentTodo: TodoItem | null;
  subtasks: TodoItem[];
  onAddSubtask: () => void;
  onComplete: () => void;
  onClose: () => void;
  onDirtyChange: (hasChanges: boolean) => void;
  onSave: (update: Partial<TodoItem>) => void;
}) {
  const [draft, setDraft] = useState<TodoItem>(() => ({ ...item }));
  const isSubtask = item.parentId !== null;
  const isFreshTask = isNewTodoDraft(item);
  const isFreshParentTask = item.parentId === null && isFreshTask;
  const disableAddSubtask = isSubtask || isFreshParentTask;
  const updateDraft = (changes: Partial<TodoItem>) => setDraft((d) => ({ ...d, ...changes }));

  useEffect(() => {
    onDirtyChange(hasTodoEditorChanges(draft, item));
  }, [draft, item, onDirtyChange]);

  return (
    <div className="todo-editor">
      <div className="todo-editor__header">
        <div>
          <p className="eyebrow">Task editor</p>
          <h4>{draft.title}</h4>
        </div>
        <div className="inline-actions">
          <button
            className="mini-action"
            disabled={disableAddSubtask}
            onClick={onAddSubtask}
            title={isSubtask ? "Subtasks cannot have nested subtasks" : isFreshParentTask ? "Save the parent task first" : "Add subtask"}
            type="button"
          >
            <Plus size={14} />
            Subtask
          </button>
          <button
            className="mini-action"
            disabled={item.status === "completed" || isFreshTask}
            onClick={onComplete}
            title="Mark completed"
            type="button"
          >
            <Check size={14} />
            Complete
          </button>
          <button className="mini-action" disabled={!draft.description.trim()} onClick={() => { onSave(draft); onClose(); }} title={!draft.description.trim() ? "Description is required" : "Save changes"} type="button">
            <Check size={14} />
            Save
          </button>
        </div>
      </div>

      <div className="todo-editor__form">
        {parentTodo ? (
          <div className="todo-editor__parent-link">
            <span>Parent task</span>
            <strong>{parentTodo.title}</strong>
          </div>
        ) : null}
        <label className="dialog-field">
          <span>Title</span>
          <input onChange={(event) => updateDraft({ title: event.target.value })} type="text" value={draft.title} />
        </label>
        <label className="dialog-field">
          <span className="field-required">Description * required</span>
          <textarea autoFocus onChange={(event) => updateDraft({ description: event.target.value })} required rows={5} value={draft.description} />
        </label>
        <div className="todo-editor__grid">
          <label className="dialog-field">
            <span>Status</span>
            <select onChange={(event) => updateDraft({ status: event.target.value as TodoStatus })} value={draft.status}>
              {TODO_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="dialog-field">
            <span>Priority</span>
            <select onChange={(event) => updateDraft({ priority: event.target.value as TodoPriority })} value={draft.priority}>
              {TODO_PRIORITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="dialog-field">
            <span>List</span>
            <input onChange={(event) => updateDraft({ listName: event.target.value })} type="text" value={draft.listName} />
          </label>
          <label className="dialog-field">
            <span>Tags</span>
            <input
              onChange={(event) => updateDraft({ tags: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })}
              type="text"
              value={draft.tags.join(", ")}
            />
          </label>
          <label className="dialog-field">
            <span>Start date</span>
            <input
              onChange={(event) => updateDraft({ startDate: event.target.value || null })}
              type="datetime-local"
              value={toDateTimeInputValue(draft.startDate)}
            />
          </label>
          <label className="dialog-field">
            <span>Expected completion</span>
            <input
              onChange={(event) => updateDraft({ expectedCompletionDate: event.target.value || null })}
              type="datetime-local"
              value={toDateTimeInputValue(draft.expectedCompletionDate)}
            />
          </label>
          <label className="dialog-field">
            <span>Reminder</span>
            <input
              onChange={(event) => updateDraft({ reminderAt: event.target.value || null })}
              type="datetime-local"
              value={toDateTimeInputValue(draft.reminderAt)}
            />
          </label>
          <label className="dialog-field">
            <span>Snooze until</span>
            <input
              onChange={(event) => updateDraft({ snoozeUntil: event.target.value || null })}
              title="Hide this task from the active list until this date/time"
              type="datetime-local"
              value={toDateTimeInputValue(draft.snoozeUntil)}
            />
          </label>
        </div>
        <div className="todo-editor__recurrence">
          <div className="todo-editor__recurrence-header">
            <span>
              <RefreshCw size={13} />
              Recurrence
            </span>
            <button
              className={`mini-action ${draft.recurrence ? "is-active" : ""}`}
              onClick={() => updateDraft({ recurrence: draft.recurrence ? null : { unit: "week", interval: 1, endDate: null } })}
              type="button"
            >
              {draft.recurrence ? "Remove" : "Add recurrence"}
            </button>
          </div>
          {draft.recurrence ? (
            <div className="todo-editor__recurrence-fields">
              <label className="dialog-field">
                <span>Every</span>
                <div className="inline-actions">
                  <input
                    className="todo-editor__recurrence-interval"
                    min={1}
                    max={365}
                    onChange={(event) => updateDraft({ recurrence: { ...draft.recurrence!, interval: Math.max(1, parseInt(event.target.value, 10) || 1) } })}
                    type="number"
                    value={draft.recurrence.interval}
                  />
                  <select
                    onChange={(event) => updateDraft({ recurrence: { ...draft.recurrence!, unit: event.target.value as TodoRecurrenceUnit } })}
                    value={draft.recurrence.unit}
                  >
                    {(["day", "week", "month", "year"] as const).map((u) => (
                      <option key={u} value={u}>{draft.recurrence!.interval === 1 ? u : `${u}s`}</option>
                    ))}
                  </select>
                </div>
              </label>
              <label className="dialog-field">
                <span>End date (optional)</span>
                <input
                  onChange={(event) => updateDraft({ recurrence: { ...draft.recurrence!, endDate: event.target.value || null } })}
                  type="date"
                  value={draft.recurrence.endDate?.slice(0, 10) ?? ""}
                />
              </label>
            </div>
          ) : null}
        </div>
        <div className="todo-editor__colors">
          <span>Color</span>
          <div className="todo-editor__swatches">
            {TODO_COLOR_PRESETS.map((color) => (
              <button
                aria-label={`Set color ${color}`}
                className={`todo-editor__swatch ${draft.color === color ? "is-active" : ""}`}
                key={color}
                onClick={() => updateDraft({ color })}
                style={{ backgroundColor: color }}
                type="button"
              >
                {draft.color === color ? <Check size={12} /> : null}
              </button>
            ))}
            <label className="todo-editor__color-picker">
              <span>Custom</span>
              <input onChange={(event) => updateDraft({ color: event.target.value })} type="color" value={draft.color} />
            </label>
          </div>
        </div>
        {subtasks.length > 0 ? (
          <div className="todo-editor__subtasks">
            <span>Subtasks</span>
            <div className="todo-editor__subtask-list">
              {subtasks.map((subtask) => (
                <div className="todo-editor__subtask-item" key={subtask.id}>
                  <span className={`todo-card__status is-${subtask.status}`}>{formatStatus(subtask.status)}</span>
                  <strong>{subtask.title}</strong>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div className="todo-editor__timeline">
          <span>History</span>
          <ul>
            <li>Created {formatDateTimeLabel(item.createdAt)}</li>
            <li>Updated {formatDateTimeLabel(item.updatedAt)}</li>
            {draft.startDate ? <li>Starts {formatDateLabel(draft.startDate)}</li> : null}
            {draft.expectedCompletionDate ? <li>Expected by {formatDateLabel(draft.expectedCompletionDate)}</li> : null}
            {item.completedAt ? <li>Completed {formatDateTimeLabel(item.completedAt)}</li> : null}
            {draft.reminderAt ? <li><Bell size={12} /> Reminder {formatDateTimeLabel(draft.reminderAt)}</li> : null}
            {draft.snoozeUntil ? <li><Clock size={12} /> Snoozed until {formatDateTimeLabel(draft.snoozeUntil)}</li> : null}
            {draft.recurrence ? <li><RefreshCw size={12} /> Repeats every {draft.recurrence.interval} {draft.recurrence.interval === 1 ? draft.recurrence.unit : `${draft.recurrence.unit}s`}</li> : null}
          </ul>
        </div>
      </div>
    </div>
  );
}

function TodoCalendar({
  items,
  onSelectTodo,
  selectedTodoId,
}: {
  items: TodoItem[];
  onSelectTodo: (id: string | null) => void;
  selectedTodoId: string | null;
}) {
  const groups = useMemo(() => groupTodoItemsByCalendarDate(items), [items]);

  if (groups.length === 0) {
    return (
      <article className="todo-calendar">
        <div className="todo-calendar__empty">
          <p className="muted">No active tasks yet. Create a task to populate the calendar.</p>
        </div>
      </article>
    );
  }

  return (
    <article className="todo-calendar">
      <div className="todo-calendar__grid">
        {groups.map(([date, entries]) => (
          <section className="todo-calendar__day" key={date}>
            <h5>{date === TODO_CALENDAR_NO_DUE_DATE_LABEL ? date : formatDateLabel(date)}</h5>
            <div className="todo-calendar__items">
              {entries.map((item) => (
                <button
                  className={`todo-calendar__item ${selectedTodoId === item.id ? "is-selected" : ""}`}
                  key={item.id}
                  onClick={() => onSelectTodo(item.id)}
                  type="button"
                >
                  <span className="todo-calendar__chip" style={{ backgroundColor: item.color }} />
                  <span>{item.title}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}

const POMODORO_WORK_SECONDS = 25 * 60;
const POMODORO_BREAK_SECONDS = 5 * 60;
const POMODORO_LONG_BREAK_SECONDS = 15 * 60;
const POMODORO_SESSIONS_BEFORE_LONG_BREAK = 4;

export function PomodoroTimer({
  linkedTodo,
  onLinkTodo,
}: {
  linkedTodo: TodoItem | null;
  onLinkTodo: () => void;
}) {
  const [state, setState] = useState<PomodoroState>({
    isRunning: false,
    mode: "work",
    timeRemaining: POMODORO_WORK_SECONDS,
    sessionsCompleted: 0,
    linkedTodoId: null,
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!state.isRunning) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      setState((prev) => {
        if (prev.timeRemaining <= 1) {
          // Timer ended, switch mode
          if (prev.mode === "work") {
            const sessionsCompleted = prev.sessionsCompleted + 1;
            const isLongBreak = sessionsCompleted % POMODORO_SESSIONS_BEFORE_LONG_BREAK === 0;
            return {
              ...prev,
              isRunning: false,
              mode: isLongBreak ? "longBreak" : "break",
              timeRemaining: isLongBreak ? POMODORO_LONG_BREAK_SECONDS : POMODORO_BREAK_SECONDS,
              sessionsCompleted,
            };
          }
          return {
            ...prev,
            isRunning: false,
            mode: "work",
            timeRemaining: POMODORO_WORK_SECONDS,
          };
        }
        return { ...prev, timeRemaining: prev.timeRemaining - 1 };
      });
    }, 1000);

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [state.isRunning]);

  const minutes = Math.floor(state.timeRemaining / 60);
  const seconds = state.timeRemaining % 60;
  const modeLabel = state.mode === "work" ? "Focus" : state.mode === "break" ? "Break" : "Long Break";

  return (
    <div className={`pomodoro-timer pomodoro-timer--${state.mode}`}>
      <div className="pomodoro-timer__display">
        <Timer size={14} />
        <span className="pomodoro-timer__mode">{modeLabel}</span>
        <span className="pomodoro-timer__time">
          {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
        </span>
      </div>
      <div className="pomodoro-timer__controls">
        <button
          className="icon-action"
          onClick={() => setState((prev) => ({ ...prev, isRunning: !prev.isRunning }))}
          title={state.isRunning ? "Pause" : "Start"}
          type="button"
        >
          {state.isRunning ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button
          className="icon-action"
          onClick={() => {
            const duration = state.mode === "work" ? POMODORO_WORK_SECONDS
              : state.mode === "break" ? POMODORO_BREAK_SECONDS
              : POMODORO_LONG_BREAK_SECONDS;
            setState((prev) => ({ ...prev, isRunning: false, timeRemaining: duration }));
          }}
          title="Reset"
          type="button"
        >
          <RotateCcw size={14} />
        </button>
        <button
          className="icon-action"
          onClick={() => {
            setState((prev) => {
              if (prev.mode === "work") {
                const sessionsCompleted = prev.sessionsCompleted + 1;
                const isLongBreak = sessionsCompleted % POMODORO_SESSIONS_BEFORE_LONG_BREAK === 0;
                return {
                  ...prev,
                  isRunning: false,
                  mode: isLongBreak ? "longBreak" : "break",
                  timeRemaining: isLongBreak ? POMODORO_LONG_BREAK_SECONDS : POMODORO_BREAK_SECONDS,
                  sessionsCompleted,
                };
              }
              return { ...prev, isRunning: false, mode: "work", timeRemaining: POMODORO_WORK_SECONDS };
            });
          }}
          title="Skip"
          type="button"
        >
          <SkipForward size={14} />
        </button>
        <button className="icon-action" onClick={onLinkTodo} title="Link to current task" type="button">
          <Clock size={14} />
        </button>
      </div>
      {linkedTodo ? (
        <div className="pomodoro-timer__linked">
          Working on: <strong>{linkedTodo.title}</strong>
        </div>
      ) : null}
      <div className="pomodoro-timer__sessions">
        {state.sessionsCompleted} session{state.sessionsCompleted === 1 ? "" : "s"} completed
      </div>
    </div>
  );
}

function groupTodosByParent(items: TodoItem[]) {
  const grouped = new Map<string | null, TodoItem[]>();
  for (const item of items) {
    const current = grouped.get(item.parentId) ?? [];
    current.push(item);
    grouped.set(item.parentId, current.sort((left, right) => left.order - right.order));
  }
  return grouped;
}

function formatStatus(status: TodoStatus) {
  if (status === "not-started") return "Not started";
  if (status === "in-progress") return "In progress";
  if (status === "paused") return "Paused";
  return "Completed";
}

function isNewTodoDraft(item: Pick<TodoItem, "title" | "createdAt" | "updatedAt">) {
  return (item.title === "New task" || item.title === "New Subtask") && item.updatedAt === item.createdAt;
}

function hasTodoEditorChanges(draft: TodoItem, item: TodoItem) {
  return (
    draft.title !== item.title ||
    draft.description !== item.description ||
    draft.status !== item.status ||
    draft.priority !== item.priority ||
    draft.color !== item.color ||
    draft.listName !== item.listName ||
    draft.startDate !== item.startDate ||
    draft.expectedCompletionDate !== item.expectedCompletionDate ||
    draft.tags.length !== item.tags.length ||
    draft.tags.some((tag, index) => tag !== item.tags[index])
  );
}

function renderTodoStatusIcon(status: TodoStatus, size = 12) {
  if (status === "not-started") return <Clock size={size} />;
  if (status === "in-progress") return <Play size={size} />;
  if (status === "paused") return <Pause size={size} />;
  return <Check size={size} />;
}

function buildTodoMetaSentence(item: Pick<TodoItem, "priority" | "listName" | "expectedCompletionDate">) {
  const fragments = [`${capitalize(item.priority)} priority`];

  if (item.listName.trim()) {
    fragments.push(`in ${item.listName.trim()}`);
  }

  if (item.expectedCompletionDate) {
    fragments.push(`due ${formatDateLabel(item.expectedCompletionDate)}`);
  }

  return `${fragments.join(" · ")}.`;
}

function capitalize(value: string) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}

function formatDateLabel(value: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }

  const date = new Date(parsed);
  return value.includes("T") ? date.toLocaleString() : date.toLocaleDateString();
}

function toDateTimeInputValue(value: string | null) {
  if (!value) {
    return "";
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return value.slice(0, 16);
  }

  const date = new Date(parsed);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatDateTimeLabel(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString() : value;
}
