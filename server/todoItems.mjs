const validStatuses = new Set(["not-started", "in-progress", "paused", "completed"]);
const validPriorities = new Set(["low", "medium", "high", "urgent"]);
const validViewModes = new Set(["list", "calendar"]);

export function sanitizeTodoPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid todo payload");
  }

  const items = Array.isArray(payload.items) ? payload.items.map(sanitizeTodoItem) : [];
  const viewMode = validViewModes.has(payload.viewMode) ? payload.viewMode : "list";
  const selectedTodoId = typeof payload.selectedTodoId === "string" && payload.selectedTodoId.trim().length > 0
    ? payload.selectedTodoId.trim()
    : null;

  return {
    items,
    viewMode,
    selectedTodoId: selectedTodoId && items.some((item) => item.id === selectedTodoId) ? selectedTodoId : null,
  };
}

function sanitizeTodoItem(item, index) {
  if (!item || typeof item !== "object") {
    throw new Error("Invalid todo item");
  }

  const id = typeof item.id === "string" && item.id.trim().length > 0 ? item.id.trim() : null;
  const title = typeof item.title === "string" ? item.title.trim() : "";
  if (!id || !title) {
    throw new Error("Invalid todo item");
  }

  return {
    id,
    title,
    description: typeof item.description === "string" ? item.description : "",
    status: validStatuses.has(item.status) ? item.status : "not-started",
    priority: validPriorities.has(item.priority) ? item.priority : "medium",
    tags: Array.isArray(item.tags)
      ? item.tags.filter((tag) => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean)
      : [],
    color: typeof item.color === "string" && item.color.trim().length > 0 ? item.color.trim() : "#78e6c6",
    listName: typeof item.listName === "string" && item.listName.trim().length > 0 ? item.listName.trim() : "General",
    createdAt: normalizeDateValue(item.createdAt),
    updatedAt: normalizeDateValue(item.updatedAt),
    startDate: normalizeNullableDateValue(item.startDate),
    expectedCompletionDate: normalizeNullableDateValue(item.expectedCompletionDate),
    completedAt: normalizeNullableDateValue(item.completedAt),
    pinned: Boolean(item.pinned),
    starred: Boolean(item.starred),
    reminderAt: normalizeNullableDateValue(item.reminderAt),
    order: Number.isFinite(item.order) ? Number(item.order) : index,
    parentId: typeof item.parentId === "string" && item.parentId.trim().length > 0 ? item.parentId.trim() : null,
  };
}

function normalizeDateValue(value) {
  if (typeof value !== "string") {
    return new Date().toISOString();
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

function normalizeNullableDateValue(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}
