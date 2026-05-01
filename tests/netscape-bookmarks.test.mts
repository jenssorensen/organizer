/// <reference path="./node-test-shims.d.ts" />

import test from "node:test";
import assert from "node:assert/strict";

import { parseNetscapeBookmarkHtml } from "../src/netscapeBookmarks.ts";

test("parses nested Netscape bookmark folders and links", () => {
  const tree = parseNetscapeBookmarkHtml(`<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
  <DT><H3>Favorites Bar</H3>
  <DL><p>
    <DT><H3>Cisco</H3>
    <DL><p>
      <DT><A HREF="https://example.com/a">Example A</A>
    </DL><p>
    <DT><A HREF="https://example.com/root">Root Link</A>
  </DL><p>
</DL><p>`);

  assert.equal(tree.length, 2);
  assert.equal(tree[0]?.type, "folder");
  assert.equal(tree[0]?.title, "Cisco");
  if (tree[0]?.type === "folder") {
    assert.equal(tree[0].children[0]?.type, "bookmark");
  }
  assert.equal(tree[1]?.type, "bookmark");
  if (tree[1]?.type === "bookmark") {
    assert.equal(tree[1].title, "Root Link");
  }
});

test("falls back to hostname when bookmark title is empty", () => {
  const tree = parseNetscapeBookmarkHtml(`<DL><p>
  <DT><A HREF="https://onesearch.cisco.com/ciscoit/chatgpt/home"></A>
</DL><p>`);

  assert.equal(tree.length, 1);
  assert.equal(tree[0]?.type, "bookmark");
  if (tree[0]?.type === "bookmark") {
    assert.equal(tree[0].title, "onesearch.cisco.com");
    assert.equal(tree[0].domain, "onesearch.cisco.com");
  }
});

test("ignores the top-level Favorites Bar wrapper while keeping its children", () => {
  const tree = parseNetscapeBookmarkHtml(`<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
  <DT><H3>Favorites Bar</H3>
  <DL><p>
    <DT><H3>Cisco</H3>
    <DL><p>
      <DT><A HREF="https://example.com/a">Example A</A>
    </DL><p>
    <DT><A HREF="https://example.com/root">Root Link</A>
  </DL><p>
</DL><p>`);

  assert.equal(tree.length, 2);
  assert.equal(tree[0]?.type, "folder");
  assert.equal(tree[0]?.title, "Cisco");
  assert.equal(tree[1]?.type, "bookmark");
  if (tree[1]?.type === "bookmark") {
    assert.equal(tree[1].title, "Root Link");
  }
});
