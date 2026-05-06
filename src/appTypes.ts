export const SUPPORTED_NOTE_FILE_TYPES = [".md", ".html", ".mhtml", ".txt"] as const;
export const DEFAULT_SUPPORTED_NOTE_FILE_TYPES = [".md"] as const;

export type SupportedNoteFileType = (typeof SUPPORTED_NOTE_FILE_TYPES)[number];

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
  supportedNoteFileTypes: SupportedNoteFileType[];
  allowIframeScripts: boolean;
}
    