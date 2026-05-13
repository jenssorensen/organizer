/// <reference path="./node-test-shims.d.ts" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("rendered markdown enables soft line breaks", async () => {
  const renderedMarkdownSource = await readFile(new URL("../src/components/markdown/RenderedMarkdownDocument.tsx", import.meta.url), "utf8");

  assert.match(renderedMarkdownSource, /import remarkBreaks from "remark-breaks";/);
  assert.match(renderedMarkdownSource, /const markdownRemarkPlugins: any\[\] = \[[\s\S]*remarkGfm,[\s\S]*remarkBreaks,[\s\S]*remarkEmoji,[\s\S]*\];/);
});