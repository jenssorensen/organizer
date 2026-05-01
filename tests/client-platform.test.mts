import assert from "node:assert/strict";
import test from "node:test";

import {
  ensureMetadataFolderPath,
  getFolderPathPlaceholder,
  isWindowsUserAgent,
  shouldUseManualFolderPaths,
} from "../src/clientPlatform.ts";

test("isWindowsUserAgent detects Windows browsers", () => {
  assert.equal(isWindowsUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), true);
  assert.equal(isWindowsUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"), false);
});

test("shouldUseManualFolderPaths is enabled for Windows user agents", () => {
  assert.equal(shouldUseManualFolderPaths("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), true);
  assert.equal(shouldUseManualFolderPaths("Mozilla/5.0 (X11; Linux x86_64)"), false);
});

test("getFolderPathPlaceholder uses a Windows example path when needed", () => {
  assert.equal(getFolderPathPlaceholder("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), "C:\\Users\\you\\Documents");
  assert.equal(getFolderPathPlaceholder("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"), "/path/to/your/folder");
});

test("ensureMetadataFolderPath appends organizer_meta_data for Windows paths", () => {
  assert.equal(
    ensureMetadataFolderPath("C:\\Users\\you\\Documents"),
    "C:\\Users\\you\\Documents\\organizer_meta_data",
  );
  assert.equal(
    ensureMetadataFolderPath("C:\\Users\\you\\Documents\\organizer_meta_data"),
    "C:\\Users\\you\\Documents\\organizer_meta_data",
  );
});

test("ensureMetadataFolderPath appends organizer_meta_data for POSIX paths", () => {
  assert.equal(ensureMetadataFolderPath("/Users/you/Documents"), "/Users/you/Documents/organizer_meta_data");
  assert.equal(ensureMetadataFolderPath("/Users/you/Documents/organizer_meta_data"), "/Users/you/Documents/organizer_meta_data");
});