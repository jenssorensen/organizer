/// <reference path="./node-test-shims.d.ts" />

import test from "node:test";
import assert from "node:assert/strict";

import { buildWorkspaceBackupSnapshot, getWorkspaceBackupSnapshotFingerprint, toRestorePointSummary } from "../src/restorePoints.ts";

test("builds a restore point snapshot from restorable app data", () => {
  const snapshot = buildWorkspaceBackupSnapshot({
    label: "Manual restore point",
    isAutomatic: false,
    notes: [
      {
        id: "note-a",
        title: "Alpha",
        summary: "",
        tags: ["release"],
        updatedAt: "2026-04-30T10:00:00.000Z",
        createdAt: "2026-04-20T10:00:00.000Z",
        starred: true,
        kind: "note",
        content: "# Alpha",
        sourcePath: "Projects/Alpha.md",
      },
      {
        id: "note-unsaved",
        title: "Scratch",
        summary: "",
        tags: [],
        updatedAt: "2026-04-30T10:00:00.000Z",
        kind: "note",
        content: "temp",
      },
    ],
    bookmarks: [],
    todo: { items: [], viewMode: "list", selectedTodoId: null },
    recentDocuments: [],
    savedSearches: [{ id: "smart-release", label: "Release", query: "tag:release" }],
    pinnedNoteIds: ["note-a"],
    prefs: { feedsMode: "panel", showBacklinks: true, showEmptyFoldersAndSections: false, showCollapsedSearchCard: true, searchInterface: "topbar" },
    sidebarOrder: ["notes", "wiki", "bookmarks", "todo", "starred", "recent"],
    now: 123,
  });

  assert.equal(snapshot.notes.length, 1);
  assert.equal(snapshot.notes[0].sourcePath, "Projects/Alpha.md");
  assert.deepEqual(snapshot.starredNotePaths, ["Projects/Alpha.md"]);
  assert.equal(snapshot.createdAt, 123);
});

test("creates a stable restore point fingerprint for unchanged content", () => {
  const base = buildWorkspaceBackupSnapshot({
    label: "Automatic restore point",
    isAutomatic: true,
    notes: [],
    bookmarks: [],
    todo: { items: [], viewMode: "list", selectedTodoId: null },
    recentDocuments: [],
    savedSearches: [],
    pinnedNoteIds: [],
    prefs: { feedsMode: "own-view", showBacklinks: false, showEmptyFoldersAndSections: false, showCollapsedSearchCard: true, searchInterface: "topbar" },
    sidebarOrder: ["notes", "wiki", "bookmarks", "todo", "starred", "recent"],
    now: 123,
  });
  const later = { ...base, createdAt: 999, label: "Different label" };

  assert.equal(getWorkspaceBackupSnapshotFingerprint(base), getWorkspaceBackupSnapshotFingerprint(later));
});

test("summarizes restore point counts", () => {
  const snapshot = buildWorkspaceBackupSnapshot({
    label: "Manual restore point",
    isAutomatic: false,
    notes: [
      {
        id: "note-a",
        title: "Alpha",
        summary: "",
        tags: [],
        updatedAt: "2026-04-30T10:00:00.000Z",
        kind: "note",
        content: "# Alpha",
        sourcePath: "Projects/Alpha.md",
      },
    ],
    bookmarks: [
      {
        id: "folder-root",
        type: "folder",
        title: "Root",
        children: [
          {
            id: "bookmark-a",
            type: "bookmark",
            title: "Docs",
            url: "https://example.com",
            domain: "example.com",
            icon: "",
            tags: [],
          },
        ],
      },
    ],
    todo: {
      items: [
        {
          id: "todo-a",
          title: "Ship",
          description: "",
          status: "not-started",
          priority: "medium",
          tags: [],
          color: "",
          listName: "",
          createdAt: "2026-04-30T10:00:00.000Z",
          updatedAt: "2026-04-30T10:00:00.000Z",
          startDate: null,
          expectedCompletionDate: null,
          completedAt: null,
          pinned: false,
          starred: false,
          order: 0,
          parentId: null,
          reminderAt: null,
          recurrence: null,
          snoozeUntil: null,
          inboxItem: false,
        },
      ],
      viewMode: "list",
      selectedTodoId: null,
    },
    recentDocuments: [],
    savedSearches: [],
    pinnedNoteIds: [],
    prefs: { feedsMode: "own-view", showBacklinks: false, showEmptyFoldersAndSections: false, showCollapsedSearchCard: true, searchInterface: "topbar" },
    sidebarOrder: ["notes", "wiki", "bookmarks", "todo", "starred", "recent"],
    now: 123,
  });

  assert.deepEqual(toRestorePointSummary("rp-1", snapshot), {
    id: "rp-1",
    label: "Manual restore point",
    createdAt: 123,
    isAutomatic: false,
    noteCount: 1,
    bookmarkCount: 1,
    todoCount: 1,
    recentDocumentCount: 0,
  });
});
