/// <reference path="./node-test-shims.d.ts" />

import test from "node:test";
import assert from "node:assert/strict";

import { commitNavigationHistory } from "../src/navigationHistory.ts";

test("pushes a new snapshot for a newly viewed file", () => {
  const history = commitNavigationHistory(
    {
      entries: [{ section: "notes", selectedNoteNodeId: "__root__", selectedBookmarkId: null, selectedTodoId: null }],
      index: 0,
    },
    {
      section: "notes",
      selectedNoteNodeId: "note-a",
      selectedBookmarkId: null,
      selectedTodoId: null,
    },
    "push",
  );

  assert.equal(history.index, 1);
  assert.equal(history.entries[1].selectedNoteNodeId, "note-a");
});

test("does not push duplicate snapshots", () => {
  const history = commitNavigationHistory(
    {
      entries: [{ section: "recent", selectedNoteNodeId: null, selectedBookmarkId: null, selectedTodoId: null }],
      index: 0,
    },
    {
      section: "recent",
      selectedNoteNodeId: null,
      selectedBookmarkId: null,
      selectedTodoId: null,
    },
    "push",
  );

  assert.equal(history.index, 0);
  assert.equal(history.entries.length, 1);
});

test("replaces the current snapshot for corrective navigation", () => {
  const history = commitNavigationHistory(
    {
      entries: [{ section: "bookmarks", selectedNoteNodeId: null, selectedBookmarkId: "bookmark-a", selectedTodoId: null }],
      index: 0,
    },
    {
      section: "bookmarks",
      selectedNoteNodeId: null,
      selectedBookmarkId: "bookmark-b",
      selectedTodoId: null,
    },
    "replace",
  );

  assert.equal(history.index, 0);
  assert.equal(history.entries[0].selectedBookmarkId, "bookmark-b");
});

test("pushes a distinct snapshot when the selected todo changes", () => {
  const history = commitNavigationHistory(
    {
      entries: [{ section: "todo", selectedNoteNodeId: null, selectedBookmarkId: null, selectedTodoId: "todo-a" }],
      index: 0,
    },
    {
      section: "todo",
      selectedNoteNodeId: null,
      selectedBookmarkId: null,
      selectedTodoId: "todo-b",
    },
    "push",
  );

  assert.equal(history.index, 1);
  assert.equal(history.entries[1].selectedTodoId, "todo-b");
});
