/// <reference path="./node-test-shims.d.ts" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("sandboxed markdown preview keeps iframe height in sync with async content changes", async () => {
  const previewFrameSource = await readFile(new URL("../src/components/markdown/MarkdownPreviewFrame.tsx", import.meta.url), "utf8");

  assert.match(previewFrameSource, /let mutationObserver: MutationObserver \| null = null;/);
  assert.match(previewFrameSource, /const disconnectObservers = \(\) => \{/);
  assert.match(previewFrameSource, /window\.requestAnimationFrame\(observeFrameContent\);/);
  assert.match(previewFrameSource, /const resizeTargets = \[[\s\S]*frameDocument\.documentElement,[\s\S]*\]\.filter/);
  assert.match(previewFrameSource, /mutationObserver = new MutationObserver\(\(\) => scheduleHeightSync\(\)\);/);
  assert.match(previewFrameSource, /mutationObserver\.observe\(frameDocument\.documentElement, \{[\s\S]*subtree: true,[\s\S]*\}\);/);
  assert.match(previewFrameSource, /const pendingImages = Array\.from\(frameDocument\.images\)\.filter\(\(image\) => !image\.complete\);/);
  assert.match(previewFrameSource, /image\.addEventListener\("load", handleImageLoad\);/);
  assert.match(previewFrameSource, /iframe\.addEventListener\("load", observeFrameContent\);/);
});