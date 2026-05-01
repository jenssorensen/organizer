export type ImmersiveChromeInput = {
  isImmersive: boolean;
  isSearchPanelOpen: boolean;
  isFeedPanelOpen: boolean;
  isSidebarCollapsed: boolean;
};

export type ImmersiveChromeState = {
  isSidebarCollapsed: boolean;
  isTopbarCollapsed: boolean;
  showCollapsedSearchCard: boolean;
  useSingleColumnDashboard: boolean;
};

export function getImmersiveChromeState({
  isImmersive,
  isSearchPanelOpen,
  isFeedPanelOpen,
  isSidebarCollapsed,
}: ImmersiveChromeInput): ImmersiveChromeState {
  return {
    isSidebarCollapsed,
    isTopbarCollapsed: isImmersive,
    showCollapsedSearchCard: !isImmersive && !isSearchPanelOpen && !isFeedPanelOpen,
    useSingleColumnDashboard: isImmersive && !isSearchPanelOpen && !isFeedPanelOpen,
  };
}
