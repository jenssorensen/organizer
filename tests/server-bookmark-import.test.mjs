import test from "node:test";
import assert from "node:assert/strict";

import { replaceBookmarkTree } from "../server/bookmarkImport.mjs";

test("bookmark import replaces the tree without merging", () => {
  const result = replaceBookmarkTree([
    {
      id: "folder-a",
      type: "folder",
      title: "Imported",
      children: [
        {
          id: "bookmark-a",
          type: "bookmark",
          title: "Example",
          url: "https://example.com",
          icon: "EX",
          tags: [],
          starred: false,
        },
      ],
    },
  ]);

  assert.equal(result.imported, 1);
  assert.equal(result.duplicatesFiltered, 0);
  assert.equal(result.tree.length, 1);
  assert.equal(result.tree[0].title, "Imported");
});

test("bookmark import flattens top-level Favorites Bar folders into the root", () => {
  const result = replaceBookmarkTree([
    {
      id: "folder-favorites-a",
      type: "folder",
      title: "Favorites Bar",
      children: [
        {
          id: "bookmark-a",
          type: "bookmark",
          title: "A",
          url: "https://a.example.com",
          icon: "A",
          tags: [],
          starred: false,
        },
      ],
    },
    {
      id: "folder-favorites-b",
      type: "folder",
      title: "Favorites Bar",
      children: [
        {
          id: "folder-cisco",
          type: "folder",
          title: "Cisco",
          children: [],
        },
      ],
    },
    {
      id: "bookmark-root",
      type: "bookmark",
      title: "Root bookmark",
      url: "https://root.example.com",
      icon: "R",
      tags: [],
      starred: false,
    },
  ]);

  assert.equal(result.tree.length, 3);
  assert.deepEqual(
    result.tree.map((node) => node.title),
    ["A", "Cisco", "Root bookmark"],
  );
});

test("bookmark import merges duplicate top-level folders after flattening favorites roots", () => {
  const result = replaceBookmarkTree([
    {
      id: "folder-favorites-a",
      type: "folder",
      title: "Favorites Bar",
      children: [
        {
          id: "folder-meetings-a",
          type: "folder",
          title: "Meetings DLT",
          children: [
            {
              id: "bookmark-a",
              type: "bookmark",
              title: "One",
              url: "https://one.example.com",
              icon: "O",
              tags: [],
              starred: false,
            },
          ],
        },
      ],
    },
    {
      id: "folder-favorites-b",
      type: "folder",
      title: "Favorites Bar",
      children: [
        {
          id: "folder-meetings-b",
          type: "folder",
          title: "Meetings DLT",
          children: [
            {
              id: "bookmark-b",
              type: "bookmark",
              title: "Two",
              url: "https://two.example.com",
              icon: "T",
              tags: [],
              starred: false,
            },
          ],
        },
      ],
    },
  ]);

  assert.equal(result.tree.length, 1);
  assert.equal(result.tree[0].type, "folder");
  assert.equal(result.tree[0].title, "Meetings DLT");
  assert.equal(result.tree[0].children.length, 2);
});
