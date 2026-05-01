/// <reference path="./node-test-shims.d.ts" />

import test from "node:test";
import assert from "node:assert/strict";

import {
  getStoredExpandedNoteFolderIds,
  expandExpandedNoteFolders,
  syncExpandedNoteFolderIds,
  toggleExpandedNoteFolder,
} from "../src/useExpandedNoteFolders.ts";

test("initial note folder sync waits until folders are available", () => {
  const result = syncExpandedNoteFolderIds(new Set(), new Set(), false);

  assert.equal(result.hasInitialized, false);
  assert.deepEqual([...result.expandedFolderIds], []);
});

test("initial note folder sync expands all folders once", () => {
  const result = syncExpandedNoteFolderIds(new Set(), new Set(["a", "b"]), false);

  assert.equal(result.hasInitialized, true);
  assert.deepEqual([...result.expandedFolderIds], ["a", "b"]);
});

test("subsequent note folder sync preserves user-collapsed folders", () => {
  const result = syncExpandedNoteFolderIds(new Set(["a"]), new Set(["a", "b"]), true);

  assert.equal(result.hasInitialized, true);
  assert.deepEqual([...result.expandedFolderIds], ["a"]);
});

test("note folder sync drops folders that no longer exist", () => {
  const result = syncExpandedNoteFolderIds(new Set(["a", "stale"]), new Set(["a", "b"]), true);

  assert.deepEqual([...result.expandedFolderIds], ["a"]);
});

test("toggleExpandedNoteFolder adds and removes folder ids", () => {
  assert.deepEqual([...toggleExpandedNoteFolder(new Set(["a"]), "b")], ["a", "b"]);
  assert.deepEqual([...toggleExpandedNoteFolder(new Set(["a", "b"]), "b")], ["a"]);
});

test("expandExpandedNoteFolders adds the selected folder trail without re-expanding stale ids", () => {
  assert.deepEqual(
    [...expandExpandedNoteFolders(new Set(["root", "other"]), ["root", "team", "doc-folder"], new Set(["root", "team", "doc-folder", "other"]))],
    ["root", "other", "team", "doc-folder"],
  );

  assert.deepEqual(
    [...expandExpandedNoteFolders(new Set(["other"]), ["missing", "team"], new Set(["team", "other"]))],
    ["other", "team"],
  );
});

test("getStoredExpandedNoteFolderIds returns null without a browser storage context", () => {
  assert.equal(getStoredExpandedNoteFolderIds(), null);
});
