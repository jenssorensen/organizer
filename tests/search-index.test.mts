/// <reference path="./node-test-shims.d.ts" />

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

import type { BookmarkItem, Note, NoteTreeNode, RecentDocumentEntry, TodoItem } from "../src/types.ts";

test("buildSearchEntries uses the extracted search index across notes, code, bookmarks, todos, and tags", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "organizer-search-index-"));
  try {
    const outputFile = join(tempDir, "searchIndex.mjs");
    await build({
      bundle: true,
      entryPoints: ["c:/dev/organizer/src/searchIndex.ts"],
      format: "esm",
      outfile: outputFile,
      platform: "node",
    });
    const { buildSearchEntries, buildSearchIndex } = await import(pathToFileURL(outputFile).href);

    const notes: Note[] = [
      {
        id: "note-1",
        title: "Retry logic",
        summary: "Circuit breaker rollout notes",
        tags: ["backend", "release"],
        updatedAt: "2026-04-30T10:00:00.000Z",
        starred: true,
        kind: "note",
        content: "# Retry logic\n\n```ts\nexport const retry = true;\n```",
        path: ["Backend", "Apheleia"],
        sourcePath: "Backend/Apheleia/retry-logic.md",
      },
    ];

    const notesTree: NoteTreeNode[] = [
      {
        id: "folder-backend",
        type: "folder",
        title: "Backend",
        children: [
          {
            id: "folder-apheleia",
            type: "folder",
            title: "Apheleia",
            children: [{ id: "note-node-1", type: "note", noteId: "note-1" }],
          },
        ],
      },
    ];

    const wikiNotes: Note[] = [];
    const wikiTree: NoteTreeNode[] = [];

    const bookmarks: BookmarkItem[] = [
      {
        id: "bookmark-1",
        title: "Release dashboard",
        description: "Ops dashboard for rollout",
        url: "https://example.com/release",
        domain: "example.com",
        icon: "RD",
        tags: ["release"],
        path: ["Dashboards"],
        starred: false,
      },
    ];

    const todoItems: TodoItem[] = [
      {
        id: "todo-1",
        title: "Ship rollout",
        description: "Coordinate final retry rollout",
        status: "in-progress",
        priority: "high",
        tags: ["release"],
        color: "blue",
        listName: "Launch",
        createdAt: "2026-04-29T10:00:00.000Z",
        updatedAt: "2026-04-30T10:00:00.000Z",
        startDate: null,
        expectedCompletionDate: "2026-05-01",
        completedAt: null,
        pinned: false,
        starred: true,
        order: 0,
        parentId: null,
        reminderAt: null,
        recurrence: null,
        snoozeUntil: null,
        inboxItem: false,
      },
    ];

    const recentDocuments: RecentDocumentEntry[] = [
      {
        id: "recent-1",
        documentId: "note:note-1",
        kind: "note",
        title: "Retry logic",
        subtitle: "Backend / Apheleia",
        preview: "Circuit breaker rollout notes",
        snapshot: { section: "notes", selectedNoteNodeId: "note-node-1" },
        pinned: false,
        viewedAt: Date.now(),
        viewCount: 3,
        lastEditedAt: 0,
        lastCompletedAt: 0,
      },
    ];

    const searchIndex = buildSearchIndex(notesTree, notes, wikiTree, wikiNotes, bookmarks, todoItems, recentDocuments);
    const retryEntries = buildSearchEntries("retry", searchIndex);
    const releaseEntries = buildSearchEntries("tag:release", searchIndex);
    const recentEntries = buildSearchEntries("in:recent", searchIndex);

    assert.equal(searchIndex.notes.length, 1);
    assert.equal(searchIndex.bookmarks.length, 1);
    assert.equal(searchIndex.todos.length, 1);
    assert.ok(searchIndex.tags.includes("release"));

    assert.ok(retryEntries.some((entry) => entry.category === "note" && entry.targetId === "note-1"));
    assert.ok(retryEntries.some((entry) => entry.category === "code" && entry.targetId === "note-1"));
    assert.ok(releaseEntries.some((entry) => entry.category === "bookmark" && entry.targetId === "bookmark-1"));
    assert.ok(releaseEntries.some((entry) => entry.category === "todo" && entry.targetId === "todo-1"));
    assert.ok(releaseEntries.some((entry) => entry.category === "note" && entry.targetId === "note-1"));
    assert.deepEqual(
      recentEntries.map((entry) => ({ category: entry.category, targetId: entry.targetId })),
      [
        { category: "note", targetId: "note-1" },
        { category: "code", targetId: "note-1" },
      ],
    );
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
});