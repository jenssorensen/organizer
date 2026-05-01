/// <reference path="./node-test-shims.d.ts" />

import test from "node:test";
import assert from "node:assert/strict";

import {
  TODO_CALENDAR_NO_DUE_DATE_LABEL,
  buildTodoPayload,
  createDefaultTodoItem,
  groupTodoItemsByCalendarDate,
  removeTodoItems,
  reorderTodoItems,
  updateTodoItems,
} from "../src/todoState.ts";
import type { TodoItem } from "../src/types.ts";

function createTodo(overrides: Partial<TodoItem> & Pick<TodoItem, "id" | "title">): TodoItem {
  return {
    id: overrides.id,
    title: overrides.title,
    description: overrides.description ?? "",
    status: overrides.status ?? "not-started",
    priority: overrides.priority ?? "medium",
    tags: overrides.tags ?? [],
    color: overrides.color ?? "#88c0d0",
    listName: overrides.listName ?? "Sprint",
    createdAt: overrides.createdAt ?? "2026-01-01T10:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-01-01T10:00:00.000Z",
    startDate: overrides.startDate ?? null,
    expectedCompletionDate: overrides.expectedCompletionDate ?? null,
    completedAt: overrides.completedAt ?? null,
    pinned: overrides.pinned ?? false,
    starred: overrides.starred ?? false,
    order: overrides.order ?? 0,
    parentId: overrides.parentId ?? null,
  };
}

test("creates a default todo item with deterministic ids and sibling ordering", () => {
  const item = createDefaultTodoItem({
    color: "#ffd166",
    listName: "Inbox",
    parentId: null,
    siblingItems: [createTodo({ id: "todo-a", title: "Existing", order: 0 })],
    timestamp: "2026-02-02T12:00:00.000Z",
  });

  assert.match(item.id, /^todo-[a-z0-9]+$/);
  assert.equal(item.order, 1);
  assert.equal(item.title, "New task");
  assert.equal(item.color, "#ffd166");
});

test("updates completion timestamps when todo status changes", () => {
  const base = createTodo({ id: "todo-a", title: "Ship release" });
  const completed = updateTodoItems([base], "todo-a", { status: "completed" }, "2026-02-02T12:00:00.000Z");
  const reopened = updateTodoItems(completed, "todo-a", { status: "in-progress" }, "2026-02-03T12:00:00.000Z");

  assert.equal(completed[0].completedAt, "2026-02-02T12:00:00.000Z");
  assert.equal(reopened[0].completedAt, null);
  assert.equal(reopened[0].updatedAt, "2026-02-03T12:00:00.000Z");
});

test("removes a todo item together with its descendants", () => {
  const remaining = removeTodoItems(
    [
      createTodo({ id: "todo-parent", title: "Parent", order: 0 }),
      createTodo({ id: "todo-child", title: "Child", order: 0, parentId: "todo-parent" }),
      createTodo({ id: "todo-sibling", title: "Sibling", order: 1 }),
    ],
    "todo-parent",
  );

  assert.deepEqual(remaining.map((item) => item.id), ["todo-sibling"]);
  assert.equal(remaining[0].order, 0);
});

test("reorders todo items before a sibling and keeps sibling order normalized", () => {
  const reordered = reorderTodoItems(
    [
      createTodo({ id: "todo-a", title: "A", order: 0 }),
      createTodo({ id: "todo-b", title: "B", order: 1 }),
      createTodo({ id: "todo-c", title: "C", order: 2 }),
    ],
    "todo-c",
    "todo-a",
    "before",
    "2026-02-02T12:00:00.000Z",
  );

  assert.deepEqual(
    reordered
      .slice()
      .sort((left, right) => left.order - right.order)
      .map((item) => item.id),
    ["todo-c", "todo-a", "todo-b"],
  );
  assert.equal(reordered.find((item) => item.id === "todo-c")?.updatedAt, "2026-02-02T12:00:00.000Z");
});

test("groups todo items for calendar view and keeps undated items last", () => {
  const groups = groupTodoItemsByCalendarDate([
    createTodo({ id: "todo-undated", title: "Undated" }),
    createTodo({ id: "todo-late", title: "Later", expectedCompletionDate: "2026-03-04T10:00:00.000Z" }),
    createTodo({ id: "todo-soon", title: "Soon", expectedCompletionDate: "2026-03-01T10:00:00.000Z" }),
  ]);

  assert.deepEqual(
    groups.map(([date, entries]) => [date, entries.map((item) => item.id)]),
    [
      ["2026-03-01", ["todo-soon"]],
      ["2026-03-04", ["todo-late"]],
      [TODO_CALENDAR_NO_DUE_DATE_LABEL, ["todo-undated"]],
    ],
  );
});

test("falls back to the first remaining todo when the selected todo disappears", () => {
  const payload = buildTodoPayload(
    [
      createTodo({ id: "todo-b", title: "B", order: 0 }),
      createTodo({ id: "todo-a", title: "A", order: 1 }),
    ],
    "calendar",
    "todo-missing",
  );

  assert.equal(payload.viewMode, "calendar");
  assert.equal(payload.selectedTodoId, "todo-b");
  assert.deepEqual(payload.items.map((item) => item.order), [0, 1]);
});