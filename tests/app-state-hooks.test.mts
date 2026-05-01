/// <reference path="./node-test-shims.d.ts" />

import test from "node:test";
import assert from "node:assert/strict";

import {
  createNavigationSnapshot,
  getHistoryTraversalResult,
  initialNavigationHistoryState,
} from "../src/useNavigationHistoryState.ts";
import {
  hydrateRecentDocumentsState,
  recordRecentDocumentView,
  removeRecentDocumentById,
} from "../src/useRecentDocumentsState.ts";

test("recordRecentDocumentView updates the head entry when the same document is viewed again", () => {
  const snapshot = {
    section: "notes",
    selectedNoteNodeId: "note-1",
    selectedBookmarkId: null,
  } as const;

  const current = [
    {
      id: "note:1-100",
      documentId: "note:1",
      kind: "note",
      title: "Apheleia",
      subtitle: "backend / apheleia",
      preview: "preview",
      viewedAt: 100,
      snapshot,
    },
  ];

  const next = recordRecentDocumentView(
    current,
    {
      documentId: "note:1",
      kind: "note",
      title: "Apheleia",
      subtitle: "backend / apheleia",
      preview: "updated preview",
      snapshot,
    },
    200,
  );

  assert.equal(next.length, 1);
  assert.equal(next[0]?.id, "note:1-100");
  assert.equal(next[0]?.viewedAt, 200);
  assert.equal(next[0]?.preview, "updated preview");
});

test("recordRecentDocumentView deduplicates the same document across different snapshots", () => {
  const current = [
    {
      id: "note:1-100",
      documentId: "note:1",
      kind: "note",
      title: "Apheleia",
      subtitle: "backend / apheleia",
      preview: "old preview",
      viewedAt: 100,
      snapshot: {
        section: "notes",
        selectedNoteNodeId: "note-1",
        selectedBookmarkId: null,
      },
    },
    {
      id: "wiki:1-90",
      documentId: "wiki:1",
      kind: "wiki",
      title: "Wiki",
      subtitle: "wiki",
      preview: "wiki preview",
      viewedAt: 90,
      snapshot: {
        section: "wiki",
        selectedNoteNodeId: "wiki-1",
        selectedBookmarkId: null,
      },
    },
  ];

  const next = recordRecentDocumentView(
    current,
    {
      documentId: "note:1",
      kind: "note",
      title: "Apheleia revised",
      subtitle: "backend / updated",
      preview: "new preview",
      snapshot: {
        section: "notes",
        selectedNoteNodeId: "note-1-alias",
        selectedBookmarkId: null,
      },
    },
    200,
  );

  assert.equal(next.length, 2);
  assert.deepEqual(
    next.map((entry) => [entry.documentId, entry.viewedAt, entry.snapshot.selectedNoteNodeId]),
    [
      ["note:1", 200, "note-1-alias"],
      ["wiki:1", 90, "wiki-1"],
    ],
  );
  assert.equal(next[0]?.title, "Apheleia revised");
  assert.equal(next[0]?.preview, "new preview");
});

test("hydrateRecentDocumentsState merges backend entries and marks hydration complete", () => {
  const result = hydrateRecentDocumentsState(
    [
      {
        id: "note:2-120",
        documentId: "note:2",
        kind: "note",
        title: "Existing",
        subtitle: "docs",
        preview: "local",
        viewedAt: 120,
        snapshot: {
          section: "notes",
          selectedNoteNodeId: "note-2",
          selectedBookmarkId: null,
        },
      },
    ],
    [
      {
        id: "note:2-130",
        documentId: "note:2",
        kind: "note",
        title: "Existing",
        subtitle: "docs",
        preview: "server",
        viewedAt: 130,
        snapshot: {
          section: "notes",
          selectedNoteNodeId: "note-2",
          selectedBookmarkId: null,
        },
      },
      {
        id: "wiki:1-140",
        documentId: "wiki:1",
        kind: "wiki",
        title: "Wiki",
        subtitle: "wiki",
        preview: "server wiki",
        viewedAt: 140,
        snapshot: {
          section: "wiki",
          selectedNoteNodeId: "wiki-1",
          selectedBookmarkId: null,
        },
      },
    ],
  );

  assert.equal(result.hasLoadedRecentDocuments, true);
  assert.equal(result.pendingRecentDocuments, null);
  assert.deepEqual(
    result.recentDocuments.map((entry) => [entry.documentId, entry.viewedAt]),
    [
      ["wiki:1", 140],
      ["note:2", 130],
    ],
  );
});

test("hydrateRecentDocumentsState deduplicates matching document ids across snapshots", () => {
  const result = hydrateRecentDocumentsState(
    [
      {
        id: "note:2-120",
        documentId: "note:2",
        kind: "note",
        title: "Existing",
        subtitle: "docs",
        preview: "local",
        viewedAt: 120,
        snapshot: {
          section: "notes",
          selectedNoteNodeId: "note-2",
          selectedBookmarkId: null,
        },
      },
    ],
    [
      {
        id: "note:2-130",
        documentId: "note:2",
        kind: "note",
        title: "Existing updated",
        subtitle: "docs / updated",
        preview: "server",
        viewedAt: 130,
        snapshot: {
          section: "notes",
          selectedNoteNodeId: "note-2-shortcut",
          selectedBookmarkId: null,
        },
      },
      {
        id: "wiki:1-140",
        documentId: "wiki:1",
        kind: "wiki",
        title: "Wiki",
        subtitle: "wiki",
        preview: "server wiki",
        viewedAt: 140,
        snapshot: {
          section: "wiki",
          selectedNoteNodeId: "wiki-1",
          selectedBookmarkId: null,
        },
      },
    ],
  );

  assert.deepEqual(
    result.recentDocuments.map((entry) => [entry.documentId, entry.viewedAt, entry.snapshot.selectedNoteNodeId]),
    [
      ["wiki:1", 140, "wiki-1"],
      ["note:2", 130, "note-2-shortcut"],
    ],
  );
  assert.equal(result.recentDocuments[1]?.title, "Existing updated");
});

test("removeRecentDocumentById removes the matching entry", () => {
  const next = removeRecentDocumentById(
    [
      {
        id: "note:1-100",
        documentId: "note:1",
        kind: "note",
        title: "Keep",
        subtitle: "docs",
        preview: "preview",
        viewedAt: 100,
        snapshot: {
          section: "notes",
          selectedNoteNodeId: "note-1",
          selectedBookmarkId: null,
        },
      },
      {
        id: "note:2-200",
        documentId: "note:2",
        kind: "note",
        title: "Delete",
        subtitle: "docs",
        preview: "preview",
        viewedAt: 200,
        snapshot: {
          section: "notes",
          selectedNoteNodeId: "note-2",
          selectedBookmarkId: null,
        },
      },
    ],
    "note:2-200",
  );

  assert.deepEqual(next.map((entry) => entry.id), ["note:1-100"]);
});

test("getHistoryTraversalResult returns the next snapshot and updated index", () => {
  const history = {
    entries: [
      createNavigationSnapshot("notes", "root", null),
      createNavigationSnapshot("notes", "note-1", null),
      createNavigationSnapshot("recent", "note-1", null),
    ],
    index: 2,
  };

  const result = getHistoryTraversalResult(history, -1);

  assert.ok(result);
  assert.equal(result.history.index, 1);
  assert.deepEqual(result.snapshot, createNavigationSnapshot("notes", "note-1", null));
});

test("createNavigationSnapshot applies partial navigation state over the current snapshot", () => {
  const snapshot = createNavigationSnapshot(
    { section: "notes", selectedNoteNodeId: "root", selectedBookmarkId: null },
    { section: "bookmarks", selectedBookmarkId: "bm-1" },
  );

  assert.deepEqual(snapshot, {
    section: "bookmarks",
    selectedNoteNodeId: "root",
    selectedBookmarkId: "bm-1",
  });
});

test("initialNavigationHistoryState seeds the stack with the root note snapshot", () => {
  const state = initialNavigationHistoryState("root-node");

  assert.deepEqual(state, {
    entries: [
      {
        section: "notes",
        selectedNoteNodeId: "root-node",
        selectedBookmarkId: null,
      },
    ],
    index: 0,
  });
});
