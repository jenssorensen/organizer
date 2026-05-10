/// <reference path="./node-test-shims.d.ts" />

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMarkdownTable,
  insertLinkWithUrlInMarkdown,
  insertTableRowBelowCursorInMarkdown,
  removeTableColumnAtCursorInMarkdown,
  toggleWrapSelectionInMarkdown,
} from "../src/components/markdown/useMarkdownEditorFormatting.ts";

test("toggleWrapSelectionInMarkdown wraps and unwraps markdown formatting", () => {
  assert.deepEqual(
    toggleWrapSelectionInMarkdown({
      value: "hello",
      selectionStart: 0,
      selectionEnd: 5,
      prefix: "**",
      suffix: "**",
      placeholder: "bold text",
    }),
    {
      value: "**hello**",
      selectionStart: 0,
      selectionEnd: 9,
    },
  );

  assert.deepEqual(
    toggleWrapSelectionInMarkdown({
      value: "**hello**",
      selectionStart: 0,
      selectionEnd: 9,
      prefix: "**",
      suffix: "**",
      placeholder: "bold text",
    }),
    {
      value: "hello",
      selectionStart: 0,
      selectionEnd: 5,
    },
  );
});

test("insertLinkWithUrlInMarkdown inserts a markdown link around the selection", () => {
  assert.deepEqual(
    insertLinkWithUrlInMarkdown({
      value: "Read docs",
      selectionStart: 5,
      selectionEnd: 9,
      url: "https://example.com",
    }),
    {
      value: "Read [docs](https://example.com)",
      selectionStart: 5,
      selectionEnd: 33,
    },
  );
});

test("buildMarkdownTable creates a bounded markdown table", () => {
  assert.equal(
    buildMarkdownTable(2, 2),
    "\n| Column 1 | Column 2 |\n| --- | --- |\n|   |   |\n|   |   |\n",
  );
});

test("insertTableRowBelowCursorInMarkdown inserts a row in the active table", () => {
  const table = "| Column 1 | Column 2 |\n| --- | --- |\n| a | b |\n| c | d |";
  const selectionStart = table.indexOf("| a | b |");

  assert.deepEqual(
    insertTableRowBelowCursorInMarkdown(table, selectionStart, selectionStart),
    {
      value: "| Column 1 | Column 2 |\n| --- | --- |\n| a | b |\n|   |   |\n| c | d |",
      selectionStart: 38,
      selectionEnd: 38,
    },
  );
});

test("removeTableColumnAtCursorInMarkdown removes the active column", () => {
  const table = "| Column 1 | Column 2 |\n| --- | --- |\n| a | b |";
  const selectionStart = table.indexOf("b");

  assert.deepEqual(
    removeTableColumnAtCursorInMarkdown(table, selectionStart, selectionStart),
    {
      value: "| Column 1 |\n| --- |\n| a |",
      selectionStart: 26,
      selectionEnd: 26,
    },
  );
});