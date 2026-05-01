/// <reference path="./node-test-shims.d.ts" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { getMarkdownLinkAttributes } from "../src/markdownLinks.ts";

test("treats hash links as in-document navigation", () => {
  assert.deepEqual(getMarkdownLinkAttributes("#what-apheleia-looks-like-locally"), {
    href: "#what-apheleia-looks-like-locally",
  });
});

test("keeps external markdown links opening in a new tab", () => {
  assert.deepEqual(getMarkdownLinkAttributes("https://example.com/docs"), {
    href: "https://example.com/docs",
    rel: "noreferrer noopener",
    target: "_blank",
  });
});

test("app uses markdown link attributes helper", async () => {
  const markdownComponentsSource = await readFile(new URL("../src/components/MarkdownComponents.tsx", import.meta.url), "utf8");

  assert.match(markdownComponentsSource, /getMarkdownLinkAttributes/);
});
