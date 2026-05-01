import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeRestorePointSnapshot, toRestorePointSummary } from "../server/restorePoints.mjs";

test("sanitizes restore point snapshots", () => {
  const snapshot = sanitizeRestorePointSnapshot({
    version: 1,
    createdAt: 456,
    label: "  Manual restore point  ",
    isAutomatic: false,
    notes: [
      {
        sourcePath: "Projects/Alpha.md",
        title: "Alpha",
        tags: ["release", ""],
        content: "# Alpha",
        updatedAt: "2026-04-30T10:00:00.000Z",
      },
      {
        sourcePath: "",
        title: "Ignore",
        tags: [],
        content: "",
        updatedAt: "2026-04-30T10:00:00.000Z",
      },
    ],
    bookmarks: [],
    todo: { items: [], viewMode: "list", selectedTodoId: null },
    recentDocuments: [],
    savedSearches: [{ id: "smart-release", label: "Release", query: "tag:release" }],
    pinnedNoteIds: ["note-a"],
    prefs: { feedsMode: "panel", showBacklinks: true, showEmptyFoldersAndSections: false },
    sidebarOrder: ["notes", "wiki", "bookmarks", "todo", "starred", "recent"],
    starredNotePaths: ["Projects/Alpha.md"],
  });

  assert.equal(snapshot.label, "Manual restore point");
  assert.equal(snapshot.notes.length, 1);
  assert.deepEqual(snapshot.notes[0].tags, ["release"]);
  assert.equal(snapshot.prefs.feedsMode, "panel");
});

test("rejects invalid restore point versions", () => {
  assert.throws(() => sanitizeRestorePointSnapshot({ version: 2 }), /invalid restore point snapshot/i);
});

test("summarizes restore point snapshots", () => {
  const summary = toRestorePointSummary("rp-1", sanitizeRestorePointSnapshot({
    version: 1,
    createdAt: 456,
    label: "Manual restore point",
    isAutomatic: true,
    notes: [{ sourcePath: "Projects/Alpha.md", title: "Alpha", tags: [], content: "# Alpha", updatedAt: "2026-04-30T10:00:00.000Z" }],
    bookmarks: [
      {
        id: "folder-root",
        type: "folder",
        title: "Root",
        children: [
          { id: "bookmark-a", type: "bookmark", title: "Docs", url: "https://example.com", domain: "example.com", icon: "", tags: [] },
        ],
      },
    ],
    todo: { items: [], viewMode: "list", selectedTodoId: null },
    recentDocuments: [],
    savedSearches: [],
    pinnedNoteIds: [],
    prefs: { feedsMode: "own-view", showBacklinks: false, showEmptyFoldersAndSections: false },
    sidebarOrder: ["notes", "wiki", "bookmarks", "todo", "starred", "recent"],
    starredNotePaths: [],
  }));

  assert.deepEqual(summary, {
    id: "rp-1",
    label: "Manual restore point",
    createdAt: 456,
    isAutomatic: true,
    noteCount: 1,
    bookmarkCount: 1,
    todoCount: 0,
    recentDocumentCount: 0,
  });
});
