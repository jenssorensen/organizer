import { useCallback, useState } from "react";
import { createSyncEntryId, enqueueSyncEntry, loadSyncQueue } from "./syncQueue";
import type { TodoItem, TodoPayload, TodoViewMode } from "./types";

const EMPTY_TODO_PAYLOAD: TodoPayload = {
  items: [],
  viewMode: "list",
  selectedTodoId: null,
};

export function useTodoData({ apiBase, onSyncQueueChange }: { apiBase: string; onSyncQueueChange?: (count: number) => void }) {
  const [todoItems, setTodoItems] = useState<TodoItem[]>([]);
  const [todoViewMode, setTodoViewModeState] = useState<TodoViewMode>("list");
  const [selectedTodoId, setSelectedTodoId] = useState<string | null>(null);
  const [todoStatus, setTodoStatus] = useState("Loading TODO items...");
  const [hasLoadedTodoItems, setHasLoadedTodoItems] = useState(false);
  const [todoStoragePath, setTodoStoragePath] = useState<string | null>(null);

  const applyPayload = useCallback((payload: TodoPayload, statusMessage?: string) => {
    setTodoItems(payload.items);
    setTodoViewModeState(payload.viewMode);
    setSelectedTodoId(payload.selectedTodoId ?? payload.items[0]?.id ?? null);
    setTodoStatus(statusMessage ?? `${payload.items.length} tasks synced`);
  }, []);

  const loadTodoItems = useCallback(async () => {
    try {
      const [response, pathResponse] = await Promise.all([
        fetch(`${apiBase}/api/todo-items`),
        fetch(`${apiBase}/api/todo-items/storage-path`),
      ]);
      if (!response.ok) {
        throw new Error("Failed to load todo items");
      }

      const data = (await response.json()) as TodoPayload;
      applyPayload(data);

      if (pathResponse.ok) {
        const pathData = (await pathResponse.json()) as { path: string };
        setTodoStoragePath(pathData.path);
      }

      return data;
    } catch {
      setTodoStatus("TODO API offline");
      return EMPTY_TODO_PAYLOAD;
    } finally {
      setHasLoadedTodoItems(true);
    }
  }, [apiBase, applyPayload]);

  const persistTodoItems = useCallback(
    async (payload: TodoPayload, statusMessage?: string) => {
      setTodoStatus("Saving tasks...");
      applyPayload(payload, "Saving tasks...");

      try {
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          const queuedAt = Date.now();
          const nextQueue = enqueueSyncEntry(loadSyncQueue(), {
            id: createSyncEntryId("todo-save", "todo-items", queuedAt),
            kind: "todo-save",
            resourceKey: "todo-items",
            queuedAt,
            payload,
          });
          onSyncQueueChange?.(nextQueue.length);
          setTodoStatus(statusMessage ?? "Tasks queued for sync");
          return { ok: true as const, queued: true as const, payload };
        }

        const response = await fetch(`${apiBase}/api/todo-items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error("Failed to save todo items");
        }

        const saved = (await response.json()) as TodoPayload;
        applyPayload(saved, statusMessage ?? "Tasks saved");
        return { ok: true as const, payload: saved };
      } catch {
        const queuedAt = Date.now();
        const nextQueue = enqueueSyncEntry(loadSyncQueue(), {
          id: createSyncEntryId("todo-save", "todo-items", queuedAt),
          kind: "todo-save",
          resourceKey: "todo-items",
          queuedAt,
          payload,
        });
        onSyncQueueChange?.(nextQueue.length);
        setTodoStatus("Tasks queued for sync");
        return { ok: true as const, queued: true as const, payload };
      }
    },
    [apiBase, applyPayload, onSyncQueueChange],
  );

  const setTodoViewMode = useCallback(
    async (nextViewMode: TodoViewMode) => {
      return persistTodoItems({ items: todoItems, viewMode: nextViewMode, selectedTodoId }, "Task view updated");
    },
    [persistTodoItems, selectedTodoId, todoItems],
  );

  return {
    todoItems,
    todoViewMode,
    selectedTodoId,
    todoStatus,
    todoStoragePath,
    hasLoadedTodoItems,
    setSelectedTodoId,
    setTodoStatus,
    loadTodoItems,
    persistTodoItems,
    setTodoViewMode,
  };
}
