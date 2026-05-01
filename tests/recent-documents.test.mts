/// <reference path="./node-test-shims.d.ts" />

import test from "node:test";
import assert from "node:assert/strict";

import {
  getRecentActivityTimestamp,
  mergeRecentDocuments,
  pruneRecentDocuments,
  toRecentDocumentPayload,
  togglePinnedRecentDocument,
  type RecentDocumentEntry,
  type RecentDocumentPayload,
} from "../src/recentDocuments.ts";

const entryA: RecentDocumentEntry = {
  id: "note:a-1",
  documentId: "note:a",
  kind: "note",
  title: "A",
  subtitle: "notes",
  preview: "preview",
  pinned: false,
  viewedAt: 3,
  viewCount: 4,
  lastEditedAt: 9,
  lastCompletedAt: 0,
  snapshot: {
    section: "notes",
    selectedNoteNodeId: "node-a",
    selectedBookmarkId: null,
    selectedTodoId: null,
  },
};

const entryB: RecentDocumentEntry = {
  id: "wiki:b-1",
  documentId: "wiki:b",
  kind: "wiki",
  title: "B",
  subtitle: "wiki",
  preview: "preview",
  pinned: false,
  viewedAt: 2,
  viewCount: 7,
  lastEditedAt: 0,
  lastCompletedAt: 0,
  snapshot: {
    section: "wiki",
    selectedNoteNodeId: "node-b",
    selectedBookmarkId: null,
    selectedTodoId: null,
  },
};

const entryTodo: RecentDocumentEntry = {
  id: "todo:c-1",
  documentId: "todo:c",
  kind: "todo",
  title: "C",
  subtitle: "Sprint",
  preview: "In progress",
  pinned: true,
  viewedAt: 4,
  viewCount: 2,
  lastEditedAt: 1,
  lastCompletedAt: 12,
  snapshot: {
    section: "todo",
    selectedNoteNodeId: null,
    selectedBookmarkId: null,
    selectedTodoId: "todo-c",
  },
};

test("prunes recent documents that no longer resolve to visible note nodes", () => {
  const pruned = pruneRecentDocuments([entryA, entryB, entryTodo], {
    visibleNoteNodeIds: new Set(["node-a"]),
    visibleTodoIds: new Set(["todo-c"]),
    visibleWikiNodeIds: new Set<string>(),
  });

  assert.deepEqual(pruned, [entryA, entryTodo]);
});

test("serializes recent documents into the server payload shape", () => {
  const payload = toRecentDocumentPayload([entryA, entryB, entryTodo]);

  assert.deepEqual(payload, {
    entries: [entryA, entryB, entryTodo],
  } satisfies RecentDocumentPayload);
});

test("merges recent activity by document and keeps the newest activity timestamp", () => {
  const merged = mergeRecentDocuments(
    [entryA],
    [{
      ...entryA,
      id: "note:a-2",
      preview: "Edited preview",
      viewedAt: 1,
      viewCount: 8,
      lastEditedAt: 15,
    }],
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, "note:a-2");
  assert.equal(merged[0].viewCount, 8);
  assert.equal(getRecentActivityTimestamp(merged[0]), 15);
});

test("toggles recent pins without removing the entry", () => {
  const [toggled] = togglePinnedRecentDocument([entryA], entryA.id);
  assert.equal(toggled.pinned, true);
});
