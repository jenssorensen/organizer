/// <reference path="./node-test-shims.d.ts" />

import test from "node:test";
import assert from "node:assert/strict";

import { hasMarkdownMathSyntax } from "../src/components/markdown/markdownMath.ts";

test("detects inline and block markdown math", () => {
  assert.equal(hasMarkdownMathSyntax("Energy is $mc^2$."), true);
  assert.equal(hasMarkdownMathSyntax("$$\na^2 + b^2 = c^2\n$$"), true);
  assert.equal(hasMarkdownMathSyntax("\\(x + y\\)"), true);
});

test("ignores code spans and fenced code blocks when detecting math", () => {
  assert.equal(hasMarkdownMathSyntax("Use `price = $5` in code."), false);
  assert.equal(hasMarkdownMathSyntax("```js\nconst value = '$5';\n```"), false);
  assert.equal(hasMarkdownMathSyntax("Plain text only."), false);
});