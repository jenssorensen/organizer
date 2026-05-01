import assert from "node:assert/strict";
import test from "node:test";

import { isPickerRequestMethod } from "../server/requestMethods.mjs";

test("isPickerRequestMethod accepts GET requests", () => {
  assert.equal(isPickerRequestMethod("GET"), true);
});

test("isPickerRequestMethod accepts POST requests", () => {
  assert.equal(isPickerRequestMethod("POST"), true);
});

test("isPickerRequestMethod rejects unsupported methods", () => {
  assert.equal(isPickerRequestMethod("PUT"), false);
  assert.equal(isPickerRequestMethod("DELETE"), false);
  assert.equal(isPickerRequestMethod("OPTIONS"), false);
});