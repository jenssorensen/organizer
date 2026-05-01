 export interface NoteVersion {
  savedAt: number;
  content: string;
  label: string;
}

export interface AppPrefs {
  feedsMode: "own-view" | "panel" | "popup";
  showBacklinks: boolean;
  showEmptyFoldersAndSections: boolean;
  showCollapsedSearchCard: boolean;
  searchInterface: "topbar" | "palette";
}
    