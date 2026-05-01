import type { TodoItem, TodoPayload, TodoRecurrence, TodoStatus, TodoViewMode } from "./types";

export const TODO_CALENDAR_NO_DUE_DATE_LABEL = "No due date";

export function formatTodoStatus(status: TodoStatus) {
  if (status === "not-started") return "Not started";
  if (status === "in-progress") return "In progress";
  if (status === "paused") return "Paused";
  return "Completed";
}

export function getTodoRecentPreview(item: TodoItem) {
  const normalizedDescription = item.description.trim();
  if (normalizedDescription) {
    return normalizedDescription;
  }

  const details = [formatTodoStatus(item.status), `${item.priority} priority`];
  if (item.expectedCompletionDate) {
    details.push(`Due ${formatTodoDate(item.expectedCompletionDate)}`);
  }
  if (item.tags.length > 0) {
    details.push(item.tags.slice(0, 2).map((tag) => `#${tag}`).join(" "));
  }

  return details.join(" · ");
}

export function buildTodoPayload(items: TodoItem[], viewMode: TodoViewMode, selectedTodoId: string | null): TodoPayload {
  const normalizedItems = normalizeTodoItems(items);
  return {
    items: normalizedItems,
    viewMode,
    selectedTodoId:
      selectedTodoId && normalizedItems.some((item) => item.id === selectedTodoId)
        ? selectedTodoId
        : normalizedItems[0]?.id ?? null,
  };
}

export function createDefaultTodoItem({
  color,
  listName,
  parentId,
  siblingItems,
  timestamp = new Date().toISOString(),
  inboxItem = false,
}: {
  color: string;
  listName: string;
  parentId: string | null;
  siblingItems: TodoItem[];
  timestamp?: string;
  inboxItem?: boolean;
}): TodoItem {
  return {
    id: `todo-${createTodoNodeId(`${parentId ?? "root"}-${timestamp}-${siblingItems.length}`)}`,
    title: parentId ? "New Subtask" : "New task",
    description: "",
    status: "not-started",
    priority: "medium",
    tags: [],
    color,
    listName,
    createdAt: timestamp,
    updatedAt: timestamp,
    startDate: null,
    expectedCompletionDate: null,
    completedAt: null,
    pinned: false,
    starred: false,
    reminderAt: null,
    recurrence: null,
    snoozeUntil: null,
    inboxItem,
    order: siblingItems.length,
    parentId,
  };
}

export function normalizeTodoItems(items: TodoItem[]): TodoItem[] {
  const orderById = new Map<string, number>();
  const groupedByParent = new Map<string | null, TodoItem[]>();

  for (const item of items) {
    const current = groupedByParent.get(item.parentId) ?? [];
    current.push(item);
    groupedByParent.set(item.parentId, current);
  }

  for (const siblings of groupedByParent.values()) {
    siblings
      .slice()
      .sort((left, right) => left.order - right.order || left.createdAt.localeCompare(right.createdAt))
      .forEach((item, index) => {
        orderById.set(item.id, index);
      });
  }

  return items.map((item) => ({
    ...item,
    order: orderById.get(item.id) ?? item.order,
  }));
}

export function updateTodoItems(
  items: TodoItem[],
  todoId: string,
  update: Partial<TodoItem>,
  updatedAt = new Date().toISOString(),
) {
  return normalizeTodoItems(
    items.map((item) => {
      if (item.id !== todoId) {
        return item;
      }

      const nextStatus = update.status ?? item.status;
      return {
        ...item,
        ...update,
        completedAt:
          nextStatus === "completed"
            ? item.completedAt ?? updatedAt
            : update.status && update.status !== "completed"
              ? null
              : item.completedAt,
        updatedAt,
      };
    }),
  );
}

export function removeTodoItems(items: TodoItem[], todoId: string) {
  const blockedIds = collectTodoIdsForRemoval(items, todoId);
  return normalizeTodoItems(items.filter((item) => !blockedIds.has(item.id)));
}

export function reorderTodoItems(
  items: TodoItem[],
  sourceId: string,
  targetId: string,
  placement: "before" | "after",
  updatedAt = new Date().toISOString(),
) {
  const sourceItem = items.find((item) => item.id === sourceId);
  const targetItem = items.find((item) => item.id === targetId);
  if (!sourceItem || !targetItem) {
    return items;
  }

  const blockedTargetIds = collectTodoIdsForRemoval(items, sourceId);
  if (blockedTargetIds.has(targetId)) {
    return items;
  }

  const nextParentId = targetItem.parentId;
  const baseItems = items.filter((item) => item.id !== sourceId);
  const targetSiblings = baseItems
    .filter((item) => item.parentId === nextParentId)
    .sort((left, right) => left.order - right.order);
  const targetIndex = targetSiblings.findIndex((item) => item.id === targetId);

  if (targetIndex === -1) {
    return items;
  }

  const movedItem: TodoItem = {
    ...sourceItem,
    parentId: nextParentId,
    updatedAt,
  };
  const insertionIndex = targetIndex + (placement === "after" ? 1 : 0);
  targetSiblings.splice(insertionIndex, 0, movedItem);

  const orderById = new Map<string, number>();
  targetSiblings.forEach((item, index) => orderById.set(item.id, index));

  if (sourceItem.parentId !== nextParentId) {
    baseItems
      .filter((item) => item.parentId === sourceItem.parentId)
      .sort((left, right) => left.order - right.order)
      .forEach((item, index) => orderById.set(item.id, index));
  }

  return normalizeTodoItems(
    [...baseItems, movedItem].map((item) =>
      orderById.has(item.id)
        ? { ...item, order: orderById.get(item.id) ?? item.order }
        : item,
    ),
  );
}

export function groupTodoItemsByCalendarDate(items: TodoItem[]) {
  const byDate = new Map<string, TodoItem[]>();

  for (const item of items) {
    const key = item.expectedCompletionDate ? item.expectedCompletionDate.slice(0, 10) : TODO_CALENDAR_NO_DUE_DATE_LABEL;
    const current = byDate.get(key) ?? [];
    current.push(item);
    byDate.set(key, current);
  }

  return Array.from(byDate.entries())
    .sort((left, right) => {
      if (left[0] === TODO_CALENDAR_NO_DUE_DATE_LABEL) {
        return 1;
      }
      if (right[0] === TODO_CALENDAR_NO_DUE_DATE_LABEL) {
        return -1;
      }
      return left[0].localeCompare(right[0]);
    })
    .map(([date, entries]) => [
      date,
      [...entries].sort((left, right) => left.order - right.order || left.title.localeCompare(right.title)),
    ] as const);
}

/**
 * Advance a date string by one recurrence interval.
 */
export function advanceByRecurrence(dateIso: string, recurrence: TodoRecurrence): string {
  const d = new Date(dateIso);
  switch (recurrence.unit) {
    case "day":   d.setDate(d.getDate() + recurrence.interval); break;
    case "week":  d.setDate(d.getDate() + recurrence.interval * 7); break;
    case "month": d.setMonth(d.getMonth() + recurrence.interval); break;
    case "year":  d.setFullYear(d.getFullYear() + recurrence.interval); break;
  }
  return d.toISOString();
}

/**
 * When a recurring task is completed, spawn the next occurrence.
 * Returns the updated items array (original completed + new open one).
 */
export function spawnNextRecurrence(items: TodoItem[], completedId: string, timestamp = new Date().toISOString()): TodoItem[] {
  const completed = items.find((i) => i.id === completedId);
  if (!completed?.recurrence) return items;

  const baseDate = completed.expectedCompletionDate ?? timestamp;
  const nextDue = advanceByRecurrence(baseDate, completed.recurrence);

  if (completed.recurrence.endDate && nextDue > completed.recurrence.endDate) {
    return items;
  }

  const siblings = items.filter((i) => i.parentId === null);
  const nextItem: TodoItem = {
    ...completed,
    id: `todo-${createTodoNodeId(`recur-${completedId}-${nextDue}`)}`,
    status: "not-started",
    createdAt: timestamp,
    updatedAt: timestamp,
    completedAt: null,
    snoozeUntil: null,
    reminderAt: null,
    expectedCompletionDate: nextDue,
    order: siblings.length,
  };

  return normalizeTodoItems([...items, nextItem]);
}

export const TODO_OVERDUE_LABEL = "Overdue";

/**
 * Group open todos into overdue / today / upcoming / no-due-date buckets for list view.
 */
export function groupTodoItemsForListView(items: TodoItem[]) {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  const overdue: TodoItem[] = [];
  const dueToday: TodoItem[] = [];
  const upcoming: TodoItem[] = [];
  const noDueDate: TodoItem[] = [];

  for (const item of items) {
    if (!item.expectedCompletionDate) {
      noDueDate.push(item);
      continue;
    }
    const dueStr = item.expectedCompletionDate.slice(0, 10);
    if (dueStr < todayStr) overdue.push(item);
    else if (dueStr === todayStr) dueToday.push(item);
    else upcoming.push(item);
  }

  return { overdue, dueToday, upcoming, noDueDate };
}

function collectTodoIdsForRemoval(items: TodoItem[], todoId: string) {
  const blockedIds = new Set<string>([todoId]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const item of items) {
      if (item.parentId && blockedIds.has(item.parentId) && !blockedIds.has(item.id)) {
        blockedIds.add(item.id);
        changed = true;
      }
    }
  }

  return blockedIds;
}

function createTodoNodeId(value: string) {
  let hash = 0;

  for (const character of value) {
    hash = (hash * 31 + character.codePointAt(0)!) >>> 0;
  }

  return hash.toString(36);
}

function formatTodoDate(value: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }

  const date = new Date(parsed);
  return value.includes("T") ? date.toLocaleString() : date.toLocaleDateString();
}

export function getDueTodoReminders(items: TodoItem[], now = new Date()) {
  return items.filter((item) => {
    if (!item.reminderAt || item.status === "completed") return false;
    return new Date(item.reminderAt) <= now;
  });
}