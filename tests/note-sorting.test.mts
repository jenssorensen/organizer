/// <reference path="./node-test-shims.d.ts" />

import test from "node:test";
import assert from "node:assert/strict";

import { sortFolderNotes } from "../src/noteSorting.ts";
import type { Note } from "../src/types.ts";

const baseNotes: Note[] = [
  {
    id: "alpha",
    title: "Alpha",
    summary: "",
    tags: [],
    createdAt: "2026-04-10T10:00:00.000Z",
    updatedAt: "2026-04-13T09:00:00.000Z",
    kind: "note",
    content: "",
  },
  {
    id: "beta",
    title: "Beta",
    summary: "",
    tags: [],
    createdAt: "2026-04-12T10:00:00.000Z",
    updatedAt: "2026-04-12T12:00:00.000Z",
    kind: "note",
    content: "",
  },
  {
    id: "gamma",
    title: "Gamma",
    summary: "",
    tags: [],
    createdAt: "2026-04-11T10:00:00.000Z",
    updatedAt: "2026-04-14T12:00:00.000Z",
    kind: "note",
    content: "",
  },
];

test("sortFolderNotes sorts by created, modified, recent, and views", () => {
  const noteViewCounts = new Map([
    ["note:alpha", 2],
    ["note:beta", 5],
    ["note:gamma", 3],
  ]);
  const noteRecentViewedAt = new Map([
    ["note:alpha", 100],
    ["note:beta", 300],
    ["note:gamma", 200],
  ]);

  assert.deepEqual(sortFolderNotes(baseNotes, "created", noteViewCounts, noteRecentViewedAt).map((note) => note.id), ["beta", "gamma", "alpha"]);
  assert.deepEqual(sortFolderNotes(baseNotes, "modified", noteViewCounts, noteRecentViewedAt).map((note) => note.id), ["gamma", "alpha", "beta"]);
  assert.deepEqual(sortFolderNotes(baseNotes, "recent", noteViewCounts, noteRecentViewedAt).map((note) => note.id), ["beta", "gamma", "alpha"]);
  assert.deepEqual(sortFolderNotes(baseNotes, "views", noteViewCounts, noteRecentViewedAt).map((note) => note.id), ["beta", "gamma", "alpha"]);
});