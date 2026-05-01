/// <reference path="./node-test-shims.d.ts" />

import test from "node:test";
import assert from "node:assert/strict";

import { getImmersiveChromeState } from "../src/immersiveLayout.ts";

test("keeps the existing chrome state outside immersive mode", () => {
  const state = getImmersiveChromeState({
    isImmersive: false,
    isSearchPanelOpen: false,
    isFeedPanelOpen: false,
    isSidebarCollapsed: false,
  });

  assert.deepEqual(state, {
    isSidebarCollapsed: false,
    isTopbarCollapsed: false,
    showCollapsedSearchCard: true,
    useSingleColumnDashboard: false,
  });
});

test("forces the immersive reader chrome while preserving the closed search panel", () => {
  const state = getImmersiveChromeState({
    isImmersive: true,
    isSearchPanelOpen: false,
    isFeedPanelOpen: false,
    isSidebarCollapsed: false,
  });

  assert.deepEqual(state, {
    isSidebarCollapsed: true,
    isTopbarCollapsed: true,
    showCollapsedSearchCard: false,
    useSingleColumnDashboard: true,
  });
});

test("keeps the search panel layout available when it was already open", () => {
  const state = getImmersiveChromeState({
    isImmersive: true,
    isSearchPanelOpen: true,
    isFeedPanelOpen: false,
    isSidebarCollapsed: true,
  });

  assert.deepEqual(state, {
    isSidebarCollapsed: true,
    isTopbarCollapsed: true,
    showCollapsedSearchCard: false,
    useSingleColumnDashboard: false,
  });
});
