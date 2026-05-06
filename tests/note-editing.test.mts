/// <reference path="./node-test-shims.d.ts" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  canTrashNote,
  canEditNote,
  clampEditorSplitPercent,
  getPreviewScrollTopForEditorSelection,
  getSyncedPreviewScrollTop,
} from "../src/noteEditing.ts";

test("allows editing persisted markdown documents", () => {
  assert.equal(
    canEditNote({
      id: "note-1",
      title: "Doc",
      summary: "Summary",
      tags: [],
      updatedAt: "2026-03-25T00:00:00.000Z",
      kind: "note",
      content: "# Hello",
      sourcePath: "client/onboarding.md",
    }),
    true,
  );

  assert.equal(
    canEditNote({
      id: "wiki-1",
      title: "Wiki",
      summary: "Summary",
      tags: [],
      updatedAt: "2026-03-25T00:00:00.000Z",
      kind: "wiki",
      content: "# Hello",
      sourcePath: "wiki/reference.md",
    }),
    true,
  );
});

test("disallows editing generated or unsaved documents", () => {
  assert.equal(
    canEditNote({
      id: "note-1",
      title: "Doc",
      summary: "Summary",
      tags: [],
      updatedAt: "2026-03-25T00:00:00.000Z",
      kind: "note",
      content: "# Hello",
    }),
    false,
  );

  assert.equal(canEditNote(null), false);
  assert.equal(canTrashNote(null), false);
  assert.equal(
    canEditNote({
      id: "wiki-2",
      title: "External Wiki",
      summary: "Summary",
      tags: [],
      updatedAt: "2026-03-25T00:00:00.000Z",
      kind: "wiki",
      content: "# Hello",
      sourcePath: "https://wiki.example.com/page",
    }),
    false,
  );
  assert.equal(
    canTrashNote({
      id: "wiki-2",
      title: "External Wiki",
      summary: "Summary",
      tags: [],
      updatedAt: "2026-03-25T00:00:00.000Z",
      kind: "wiki",
      content: "# Hello",
      sourcePath: "https://wiki.example.com/page",
    }),
    false,
  );
});

test("allows trashing local file-backed notes regardless of extension", () => {
  assert.equal(
    canTrashNote({
      id: "note-html",
      title: "HTML Doc",
      summary: "Summary",
      tags: [],
      updatedAt: "2026-03-25T00:00:00.000Z",
      kind: "note",
      content: "<html></html>",
      sourcePath: "docs/reference.html",
    }),
    true,
  );

  assert.equal(
    canTrashNote({
      id: "note-mhtml",
      title: "MHTML Doc",
      summary: "Summary",
      tags: [],
      updatedAt: "2026-03-25T00:00:00.000Z",
      kind: "note",
      content: "MHTML",
      sourcePath: "docs/capture.mhtml",
    }),
    true,
  );

  assert.equal(
    canTrashNote({
      id: "note-txt",
      title: "Text Doc",
      summary: "Summary",
      tags: [],
      updatedAt: "2026-03-25T00:00:00.000Z",
      kind: "note",
      content: "Plain text",
      sourcePath: "docs/notes.txt",
    }),
    true,
  );
});

test("clamps the split editor divider to usable bounds", () => {
  assert.equal(clampEditorSplitPercent(12), 25);
  assert.equal(clampEditorSplitPercent(58), 58);
  assert.equal(clampEditorSplitPercent(91), 75);
});

test("maps editor scroll position into preview scroll space", () => {
  assert.equal(
    getSyncedPreviewScrollTop({
      sourceScrollTop: 150,
      sourceScrollHeight: 900,
      sourceClientHeight: 300,
      targetScrollHeight: 1200,
      targetClientHeight: 400,
    }),
    200,
  );

  assert.equal(
    getSyncedPreviewScrollTop({
      sourceScrollTop: 0,
      sourceScrollHeight: 300,
      sourceClientHeight: 300,
      targetScrollHeight: 1200,
      targetClientHeight: 400,
    }),
    0,
  );
});

test("keeps the active editor selection visible in preview", () => {
  assert.equal(
    getPreviewScrollTopForEditorSelection({
      markdown: "one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten",
      selectionStart: "one\ntwo\nthree\nfour\nfive\nsix\nseven\n".length,
      currentPreviewScrollTop: 0,
      targetScrollHeight: 1200,
      targetClientHeight: 300,
    }),
    505,
  );

  assert.equal(
    getPreviewScrollTopForEditorSelection({
      markdown: "one\ntwo\nthree\nfour",
      selectionStart: 0,
      currentPreviewScrollTop: 0,
      targetScrollHeight: 200,
      targetClientHeight: 300,
    }),
    0,
  );
});

test("app wires the note editor controls and split layout", async () => {
  const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const markdownComponentsSource = await readFile(new URL("../src/components/MarkdownComponents.tsx", import.meta.url), "utf8");
  const stylesheet = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(appSource, /const STORED_MARKDOWN_EDITOR_PREVIEW_VISIBILITY_KEY = "organizer:markdown-editor-preview-visible";/);
  assert.match(appSource, /const STORED_MARKDOWN_EDITOR_PREVIEW_LAYOUT_KEY = "organizer:markdown-editor-preview-layout";/);
  assert.match(appSource, /const STORED_SELECTED_NOTES_NODE_KEY = "organizer:selected-notes-node";/);
  assert.match(appSource, /canEditNote\(selectedNote\)/);
  assert.match(appSource, /canTrashNote\(selectedNote\)/);
  assert.match(appSource, /markdown-body__edit/);
  assert.match(appSource, /aria-label="Move to trash"/);
  assert.match(appSource, /markdown-body__close/);
  assert.match(appSource, /markdown-body__toolbar-leading/);
  assert.match(appSource, /markdown-body__toolbar-title/);
  assert.match(appSource, /getNoteSourceFileName\(selectedNote\) \|\| selectedNote\.title/);
  assert.match(appSource, /const isNoteDraftDirty = Boolean\(selectedNote && isNoteEditing && noteDraft !== selectedNote\.content\);/);
  assert.match(appSource, /async function handleCloseNoteEditor\(\)/);
  assert.match(appSource, /const \[isUnsavedCloseDialogOpen, setIsUnsavedCloseDialogOpen\] = useState\(false\);/);
  assert.match(appSource, /setIsUnsavedCloseDialogOpen\(true\);/);
  assert.match(appSource, /function handleDiscardNoteChanges\(\) \{\s*handleCancelNoteEditing\(\);\s*handleCloseSelectedNote\(\);/);
  assert.match(appSource, /async function handleSaveAndCloseNoteEditor\(\)/);
  assert.match(appSource, /<UnsavedChangesDialog/);
  assert.match(appSource, /const isEscapeKey = event\.key === "Escape" \|\| event\.key === "Esc" \|\| event\.code === "Escape";/);
  assert.match(appSource, /if \(!isEscapeKey\) \{\s*return;\s*\}/);
  assert.match(appSource, /if \(isNoteEditing\) \{\s*if \(!isNoteDraftDirty\) \{\s*handleCancelNoteEditing\(\);\s*handleCloseSelectedNote\(\);/);
  assert.match(appSource, /void handleCloseNoteEditor\(\);/);
  assert.match(markdownComponentsSource, /markdown-editor/);
  assert.match(markdownComponentsSource, /markdown-editor__resize-handle/);
  assert.match(markdownComponentsSource, /markdown-editor__preview-body/);
  assert.match(markdownComponentsSource, /spellCheck/);
  assert.match(markdownComponentsSource, /canSave: boolean;/);
  assert.match(markdownComponentsSource, /showPreview \? "Hide preview" : "Show preview"/);
  assert.match(markdownComponentsSource, /showPreview \? <EyeOff size=\{16\} \/> : <Eye size=\{16\} \/>/);
  assert.match(appSource, /showPreview=\{showMarkdownEditorPreview\}/);
  assert.match(appSource, /setShowPreview=\{setShowMarkdownEditorPreview\}/);
  assert.match(appSource, /previewLayout=\{markdownEditorPreviewLayout\}/);
  assert.match(appSource, /setPreviewLayout=\{setMarkdownEditorPreviewLayout\}/);
  assert.match(markdownComponentsSource, /showPreview \? layoutStyle : undefined/);
  assert.match(markdownComponentsSource, /showPreview && previewLayout === "side-by-side" \? "vertical" : "horizontal"/);
  assert.match(markdownComponentsSource, /previewLayout === "side-by-side" \? "Below preview" : "Side by side"/);
  assert.match(markdownComponentsSource, /previewLayout === "side-by-side" \? <SplitSquareVertical size=\{16\} \/> : <SplitSquareHorizontal size=\{16\} \/>/);
  assert.doesNotMatch(markdownComponentsSource, /title="Bullet list"/);
  assert.match(markdownComponentsSource, /className=\{`markdown-body__toolbar-side \$\{showPreview \? "" : "is-disabled"\}`\.trim\(\)\}/);
  assert.match(markdownComponentsSource, /disabled=\{saveState === "saving" \|\| !showPreview\}/);
  assert.match(markdownComponentsSource, /aria-label=\{previewLayout === "side-by-side" \? "Below preview" : "Side by side"\}[\s\S]*disabled=\{saveState === "saving" \|\| !showPreview\}/);
  assert.match(markdownComponentsSource, /className="markdown-body__toolbar-side markdown-editor__toolbar-actions"/);
  assert.match(markdownComponentsSource, /className="icon-action markdown-editor__save"/);
  assert.match(markdownComponentsSource, /disabled=\{saveState === "saving" \|\| !canSave\}/);
  assert.match(markdownComponentsSource, /aria-label="Close document"/);
  assert.match(markdownComponentsSource, /function SandboxedPreviewFrame\(/);
  assert.match(markdownComponentsSource, /allowScripts \? "allow-scripts" : ""/);
  assert.match(markdownComponentsSource, /useSandboxFrame\?: boolean;/);
  assert.match(markdownComponentsSource, /buildDocumentPreviewSrcDoc\(markdown, noteSourcePath\)/);
  assert.doesNotMatch(markdownComponentsSource, /Cancel/);
  assert.match(markdownComponentsSource, /markdown-editor__split--side-by-side/);
  assert.match(markdownComponentsSource, /showPreview \? \(/);
  assert.match(markdownComponentsSource, /onScroll=\{handleEditorScroll\}/);
  assert.match(appSource, /canSave=\{isNoteDraftDirty\}/);
  assert.match(appSource, /onClose=\{\(\) => void handleCloseNoteEditor\(\)\}/);
  assert.match(appSource, /toolbarActions=\{showDetachedStandaloneNoteToolbar \? undefined : standaloneNoteViewerToolbarActions\}[\s\S]*useSandboxFrame/);
  assert.match(stylesheet, /\.markdown-body__toolbar-side\.is-disabled \{[\s\S]*opacity: 0\.55;/);
  assert.match(stylesheet, /\.markdown-editor__toolbar-actions \{[\s\S]*margin-left: auto;/);
  assert.match(stylesheet, /\.markdown-body__sandbox-frame \{[\s\S]*width: 100%;/);
  assert.match(appSource, /const isMarkdownImmersive = \(Boolean\(selectedNote\) \|\| isNoteEditing\) && !shouldShowPreviewInPanel;/);
  assert.match(appSource, /consumeScopedSearchInputWithCurrentScopes\(value, searchScope, searchNoteSectionScope, searchFolderScopePath\)/);
  assert.match(appSource, /folder: \{searchFolderScopePath\.join\(" \/ "\)\}/);
});

test("folder overview renders child folders as an expandable tree", async () => {
  const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const noteComponentsSource = await readFile(new URL("../src/components/NoteComponents.tsx", import.meta.url), "utf8");
  const stylesheet = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(noteComponentsSource, /note-folder-overview__tree/);
  assert.match(noteComponentsSource, /foldersOnly/);
  assert.match(appSource, /navigationTreeNodes=\{visibleOverviewNavigationTreeNodes\}/);
  assert.match(noteComponentsSource, /Child folders/);
  assert.match(appSource, /showPersistentFolderOverview/);
  assert.match(appSource, /NoteFolderOverviewPanel/);
  assert.match(stylesheet, /\.note-folder-overview__tree/);
  assert.match(stylesheet, /\.note-folder-overview__tree-item/);
  assert.match(stylesheet, /\.note-folder-overview__grid\.has-sections\s*\{[\s\S]*?grid-template-columns:\s*minmax\(70px,\s*0\.72fr\)\s*auto\s*minmax\(0,\s*1fr\);/);
  assert.match(stylesheet, /\.note-folder-overview__section--notes\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/);
});

test("folder overview notes section keeps the current list layout and sort controls", async () => {
  const noteComponentsSource = await readFile(new URL("../src/components/NoteComponents.tsx", import.meta.url), "utf8");
  const stylesheet = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(noteComponentsSource, /note-folder-overview__section--notes is-list/);
  assert.match(noteComponentsSource, /note-folder-overview__notes-body is-list/);
  assert.match(noteComponentsSource, /note-folder-overview__sort-menu/);
  assert.match(noteComponentsSource, /note-folder-overview__sort-trigger/);
  assert.match(stylesheet, /\.note-folder-overview__section--notes\.is-list/);
  assert.match(stylesheet, /\.note-folder-overview__notes-body\.is-list/);
  assert.match(stylesheet, /\.note-folder-overview__sort-menu/);
  assert.match(stylesheet, /\.note-folder-overview__sort-trigger/);
});

test("folder overview summary cards reuse the tree note row shell", async () => {
  const noteComponentsSource = await readFile(new URL("../src/components/NoteComponents.tsx", import.meta.url), "utf8");

  assert.match(noteComponentsSource, /function NoteSummaryCard\(/);
  assert.match(noteComponentsSource, /noteViewCount\?: number;/);
  assert.match(noteComponentsSource, /viewMode\?: NoteRowViewMode;/);
  assert.match(noteComponentsSource, /const sourceFileName = getNoteSourceFileName\(note\);/);
  assert.match(noteComponentsSource, /className=\{`note-leaf__tree-main\$\{note\.sourcePath \? " is-draggable" : ""\}`\}/);
  assert.match(noteComponentsSource, /className=\{`note-leaf__tree-top \$\{showTopActions \? "note-leaf__tree-top--with-actions" : ""\}`\}/);
  assert.match(noteComponentsSource, /note-leaf__summary-actions note-leaf__summary-actions--tree/);
  assert.doesNotMatch(noteComponentsSource, /aria-label="Edit note"/);
  assert.match(noteComponentsSource, /formatNoteTimestamp\(note\.updatedAt\)[\s\S]*formatRecentViewCount\((noteViewCount|viewCount)\)/);
  assert.match(noteComponentsSource, /noteViewCount=\{noteViewCounts\.get\(`\$\{noteItem\.kind\}:\$\{noteItem\.id\}`\) \?\? 0\}/);
  assert.match(noteComponentsSource, /\{!isCompactView \? <span aria-hidden="true" className="note-leaf__separator" \/> : null\}/);
  assert.match(noteComponentsSource, /viewMode=\{noteRowViewMode\}/);
});

test("folder overview exposes a shared detailed and compact row view menu", async () => {
  const noteComponentsSource = await readFile(new URL("../src/components/NoteComponents.tsx", import.meta.url), "utf8");
  const stylesheet = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(noteComponentsSource, /type NoteRowViewMode = "detailed" \| "compact";/);
  assert.match(noteComponentsSource, /const NOTE_ROW_VIEW_OPTIONS: Array<\{ description: string; label: string; value: NoteRowViewMode \}> = \[/);
  assert.match(noteComponentsSource, /const \[noteRowViewMode, setNoteRowViewMode\] = useState<NoteRowViewMode>\(getStoredNoteRowViewMode\);/);
  assert.match(noteComponentsSource, /window\.localStorage\.setItem\(STORED_NOTE_ROW_VIEW_MODE_KEY, noteRowViewMode\);/);
  assert.match(noteComponentsSource, /className="note-folder-overview__view-trigger"/);
  assert.match(noteComponentsSource, /Change note row view: \$\{activeNoteRowViewOption\.label\}/);
  assert.match(stylesheet, /\.note-folder-overview__section-actions\s*\{/);
  assert.match(stylesheet, /\.note-folder-overview__view-trigger\s*\{/);
  assert.match(stylesheet, /\.note-leaf--compact \.note-leaf__file,/);
});

test("section rail text truncates instead of wrapping", async () => {
  const stylesheet = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(stylesheet, /\.note-section-rail__body strong\s*\{[\s\S]*overflow:\s*hidden;[\s\S]*text-overflow:\s*ellipsis;[\s\S]*white-space:\s*nowrap;/);
  assert.match(stylesheet, /\.note-section-rail__body span\s*\{[\s\S]*overflow:\s*hidden;[\s\S]*text-overflow:\s*ellipsis;[\s\S]*white-space:\s*nowrap;/);
});

test("section group headers expose a hide action for multi-root notes", async () => {
  const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const noteComponentsSource = await readFile(new URL("../src/components/NoteComponents.tsx", import.meta.url), "utf8");
  const stylesheet = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(appSource, /hiddenRootFolderIds: \[\.\.\.current\.hiddenRootFolderIds, rootFolderId\]/);
  assert.match(appSource, /filterNotesByHiddenRootFolderIds\(notes, hiddenRootFolderIds, hiddenRootFolderIdByTitle\)/);
  assert.match(appSource, /filterNoteTreeByHiddenRootFolderIds\(rawResolvedNotesTree, hiddenRootFolderIds\)/);
  assert.match(noteComponentsSource, /onHideSectionGroup\?: \(rootFolderId: string\) => void;/);
  assert.match(noteComponentsSource, /aria-label=\{`Hide \$\{group\.rootFolderTitle\} from notes`\}/);
  assert.match(noteComponentsSource, /className="icon-action note-section-rail__group-action"/);
  assert.match(stylesheet, /\.note-section-rail__group-action\s*\{/);
});

test("folder overview uses the same width logic for section navigation and notes list panes", async () => {
  const noteComponentsSource = await readFile(new URL("../src/components/NoteComponents.tsx", import.meta.url), "utf8");

  assert.match(noteComponentsSource, /function clampNotesPreviewSplitPercent\(value: number\) \{\s*return clampNotesOverviewSplitPercent\(value\);\s*\}/);
  assert.match(noteComponentsSource, /function getResizableOverviewColumns\(splitPercent: number\) \{\s*return `minmax\(\$\{MIN_NOTE_TREE_MAIN_WIDTH\}px, \$\{splitPercent\}fr\) auto minmax\(260px, \$\{100 - splitPercent\}fr\)`;\s*\}/);
  assert.match(noteComponentsSource, /function getCollapsedOverviewColumns\(\) \{\s*return `\$\{COLLAPSED_OVERVIEW_PANE_WIDTH\}px minmax\(260px, 1fr\)`;\s*\}/);
  assert.match(noteComponentsSource, /gridTemplateColumns: getCollapsedOverviewColumns\(\)[\s\S]*gridTemplateColumns: getResizableOverviewColumns\(overviewSplitPercent\)/);
  assert.match(noteComponentsSource, /getCollapsedOverviewColumns\(\)[\s\S]*getResizableOverviewColumns\(notesNavigationMode === "section" \? previewSplitPercent : overviewSplitPercent\)/);
  assert.match(noteComponentsSource, /getCollapsedOverviewColumns\(\)[\s\S]*getResizableOverviewColumns\(previewSplitPercent\)/);
});

test("closing a selected document expands and selects its parent folder", async () => {
  const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");

  assert.match(appSource, /const \[selectedNoteNodeId, setSelectedNoteNodeId\] = useState<string \| null>\(getStoredSelectedNotesNodeId\(\)\);/);
  assert.match(appSource, /window\.localStorage\.setItem\(STORED_SELECTED_NOTES_NODE_KEY, selectedNoteNodeId \?\? ROOT_NOTE_NODE_ID\);/);
  assert.match(appSource, /if \(section !== "notes"\) \{\s*return;\s*\}/);
  assert.match(appSource, /selectedNoteTreeTrail\.filter\(\(node\): node is NoteFolderNode => node\.type === "folder"\)/);
  assert.match(appSource, /expandNoteFolders\(/);
  assert.match(appSource, /navigateNoteSelection\(currentFolderContextNode\?\.id \?\? ROOT_NOTE_NODE_ID\)/);
});

test("markdown toolbar uses compact icon sizing", async () => {
  const stylesheet = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(stylesheet, /\.markdown-body__toolbar \.icon-action/);
  assert.match(stylesheet, /\.markdown-body__toolbar-leading/);
  assert.match(stylesheet, /\.markdown-body__toolbar-title/);
  assert.match(stylesheet, /\.markdown-editor__toolbar\s*\{[\s\S]*flex-wrap:\s*wrap;/);
  assert.match(stylesheet, /width:\s*28px/);
  assert.match(stylesheet, /height:\s*28px/);
  assert.match(stylesheet, /\.note-leaf__star/);
  assert.match(stylesheet, /\.markdown-editor__split--side-by-side/);
  assert.match(stylesheet, /\.markdown-editor__resize-handle--vertical/);
  assert.match(stylesheet, /\.markdown-editor__resize-handle--vertical\s*\{[\s\S]*cursor:\s*col-resize;/);
  assert.match(stylesheet, /\.markdown-editor__resize-handle--vertical\s+\.markdown-editor__resize-line\s*\{[\s\S]*width:\s*2px;/);
});

test("ui typography uses a larger readable baseline scale", async () => {
  const stylesheet = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(stylesheet, /html\s*\{[\s\S]*font-size:\s*13px;/);
  assert.match(stylesheet, /\.eyebrow\s*\{[\s\S]*font-size:\s*0\.78rem;/);
  assert.match(stylesheet, /\.nav-item\s*\{[\s\S]*font-size:\s*1\.02rem;/);
  assert.match(stylesheet, /\.note-folder-overview__summary\s*\{[\s\S]*color:\s*var\(--muted\);/);
  assert.match(stylesheet, /\.nav-item__count,\s*\.muted\s*\{[\s\S]*font-size:\s*0\.96rem;/);
});

test("search popup stays above immersive document chrome", async () => {
  const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const stylesheet = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.doesNotMatch(appSource, /!isMarkdownImmersive && !isSearchPanelOpen && hasActiveSearch && !isSearchPopupDismissed/);
  assert.match(appSource, /!isSearchScopePopupOpen && !isSearchPanelOpen && !isSearchDialogOpen && hasActiveSearch && !isSearchPopupDismissed/);
  assert.match(stylesheet, /\.topbar\s*\{[\s\S]*z-index:\s*60;/);
  assert.match(stylesheet, /\.topbar\s*\{[\s\S]*overflow:\s*visible;/);
  assert.match(stylesheet, /\.searchbar\s*\{[\s\S]*z-index:\s*61;/);
  assert.match(stylesheet, /\.searchbar\s*\{[\s\S]*overflow:\s*visible;/);
  assert.match(stylesheet, /\.searchbar__popup\s*\{[\s\S]*z-index:\s*70;/);
});

test("clicking immersive content does not force a menu state reset when bookmark menus are already closed", async () => {
  const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");

  assert.match(appSource, /setOpenMenuPath\(\(current\) => \(current\.length > 0 \? \[\] : current\)\)/);
  assert.doesNotMatch(appSource, /if \(!clickedWithinMenuBar \|\| !clickedWithinOpenMenu\) \{\s*setOpenMenuPath\(\[\]\);\s*\}/);
});

test("entering edit mode preserves the current document scroll position", async () => {
  const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const markdownComponentsSource = await readFile(new URL("../src/components/MarkdownComponents.tsx", import.meta.url), "utf8");

  assert.match(appSource, /const viewerContentRef = useRef<HTMLDivElement>\(null\);/);
  assert.match(appSource, /const \[showMarkdownEditorPreview, setShowMarkdownEditorPreview\] = useState\(getStoredMarkdownEditorPreviewVisibility\(\)\);/);
  assert.match(appSource, /const \[markdownEditorPreviewLayout, setMarkdownEditorPreviewLayout\] = useState\(getStoredMarkdownEditorPreviewLayout\(\)\);/);
  assert.match(appSource, /window\.localStorage\.setItem\(STORED_MARKDOWN_EDITOR_PREVIEW_VISIBILITY_KEY, String\(showMarkdownEditorPreview\)\);/);
  assert.match(appSource, /window\.localStorage\.setItem\(STORED_MARKDOWN_EDITOR_PREVIEW_LAYOUT_KEY, markdownEditorPreviewLayout\);/);
  assert.match(appSource, /const \[pendingEditorScrollRatio, setPendingEditorScrollRatio\] = useState\(0\);/);
  assert.match(appSource, /setPendingEditorScrollRatio\(getScrollProgress\(viewerContentRef\.current\)\);/);
  assert.match(appSource, /contentRef=\{viewerContentRef\}/);
  assert.match(appSource, /initialScrollRatio=\{pendingEditorScrollRatio\}/);
  assert.match(markdownComponentsSource, /useEffect\(\(\) => \{\s*const editorInput = editorInputRef\.current;/);
  assert.match(markdownComponentsSource, /const hasAppliedInitialScrollRef = useRef\(false\);/);
  assert.match(markdownComponentsSource, /if \(hasAppliedInitialScrollRef\.current\) \{\s*return;\s*\}/);
  assert.match(markdownComponentsSource, /hasAppliedInitialScrollRef\.current = true;/);
  assert.match(markdownComponentsSource, /editorInput\.scrollTop = initialScrollRatio \* maxEditorScrollTop;/);
  assert.doesNotMatch(markdownComponentsSource, /\}, \[initialScrollRatio, markdown\]\);/);
  assert.match(markdownComponentsSource, /\}, \[initialScrollRatio\]\);/);
  assert.match(markdownComponentsSource, /getPreviewScrollTopForEditorSelection\(\{/);
  assert.match(markdownComponentsSource, /selectionStart: editorSelection,/);
});

test("recent entries expose a delete action", async () => {
  const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const noteComponentsSource = await readFile(new URL("../src/components/NoteComponents.tsx", import.meta.url), "utf8");
  const stylesheet = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(appSource, /handleRemoveRecentDocument/);
  assert.match(noteComponentsSource, /recent-entry__delete/);
  assert.match(noteComponentsSource, /Delete .* recent documents/);
  assert.match(stylesheet, /\.recent-entry__delete/);
});

test("app restore point and note overview settings persist across reloads", async () => {
  const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const noteComponentsSource = await readFile(new URL("../src/components/NoteComponents.tsx", import.meta.url), "utf8");

  assert.match(appSource, /const STORED_ACTIVE_SECTION_KEY = "organizer:active-section";/);
  assert.match(appSource, /const STORED_SELECTED_BOOKMARK_KEY = "organizer:selected-bookmark";/);
  assert.match(appSource, /const STORED_SIDEBAR_COLLAPSED_KEY = "organizer:sidebar-collapsed";/);
  assert.match(appSource, /const STORED_BOOKMARK_RENDER_MODE_KEY = "organizer:bookmark-render-mode";/);
  assert.match(appSource, /const STORED_BOOKMARK_COMPACT_MODE_KEY = "organizer:bookmark-compact-mode";/);
  assert.match(appSource, /const STORED_BOOKMARK_EXPANDED_FOLDERS_KEY = "organizer:bookmark-expanded-folders";/);
  assert.match(appSource, /const \[section, setSection\] = useState<SectionId>\(getStoredActiveSection\(\)\);/);
  assert.match(appSource, /const \[selectedBookmarkId, setSelectedBookmarkId\] = useState<string \| null>\(getStoredSelectedBookmarkId\(\)\);/);
  assert.match(appSource, /const \[expandedFolderIds, setExpandedFolderIds\] = useState<Set<string>>\(getStoredBookmarkExpandedFolderIds\);/);
  assert.match(appSource, /const \[bookmarkRenderMode, setBookmarkRenderMode\] = useState<"tree" \| "domain">\(getStoredBookmarkRenderMode\(\)\);/);
  assert.match(appSource, /const \[bookmarkCompactMode, setBookmarkCompactMode\] = useState\(getStoredBookmarkCompactMode\(\)\);/);
  assert.match(appSource, /const \[isSidebarCollapsed, setIsSidebarCollapsed\] = useState\(getStoredSidebarCollapsed\(\)\);/);
  assert.match(appSource, /window\.localStorage\.setItem\(STORED_ACTIVE_SECTION_KEY, section\);/);
  assert.match(appSource, /window\.localStorage\.setItem\(STORED_SELECTED_BOOKMARK_KEY, selectedBookmarkId\);/);
  assert.match(appSource, /window\.localStorage\.removeItem\(STORED_SELECTED_BOOKMARK_KEY\);/);
  assert.match(appSource, /window\.localStorage\.setItem\(STORED_SIDEBAR_COLLAPSED_KEY, String\(isSidebarCollapsed\)\);/);
  assert.match(appSource, /window\.localStorage\.setItem\(STORED_BOOKMARK_RENDER_MODE_KEY, bookmarkRenderMode\);/);
  assert.match(appSource, /window\.localStorage\.setItem\(STORED_BOOKMARK_COMPACT_MODE_KEY, String\(bookmarkCompactMode\)\);/);
  assert.match(appSource, /window\.localStorage\.setItem\(STORED_BOOKMARK_EXPANDED_FOLDERS_KEY, JSON\.stringify\(\[\.\.\.expandedFolderIds\]\)\);/);

  assert.match(noteComponentsSource, /const STORED_NOTES_SECTIONS_SORT_MODE_KEY = "organizer:notes-sections-sort-mode:v1";/);
  assert.match(noteComponentsSource, /const STORED_NOTES_NAVIGATION_SORT_MODE_KEY = "organizer:notes-navigation-sort-mode:v1";/);
  assert.match(noteComponentsSource, /const STORED_NOTES_FOLDER_ITEMS_SORT_MODE_KEY = "organizer:notes-folder-items-sort-mode:v1";/);
  assert.match(noteComponentsSource, /const STORED_NOTES_TREE_COLLAPSED_KEY = "organizer:notes-tree-collapsed:v1";/);
  assert.match(noteComponentsSource, /const STORED_NOTES_LIST_COLLAPSED_KEY = "organizer:notes-list-collapsed:v1";/);
  assert.match(noteComponentsSource, /const STORED_COLLAPSED_SECTION_GROUPS_KEY = "organizer:notes-collapsed-section-groups:v1";/);
  assert.match(noteComponentsSource, /const \[isTreeCollapsed, setIsTreeCollapsed\] = useState\(getStoredNotesTreeCollapsed\);/);
  assert.match(noteComponentsSource, /const \[isNotesCollapsed, setIsNotesCollapsed\] = useState\(getStoredNotesListCollapsed\);/);
  assert.match(noteComponentsSource, /const \[sectionsSortMode, setSectionsSortMode\] = useState<SectionsSortMode>\(getStoredSectionsSortMode\);/);
  assert.match(noteComponentsSource, /const \[navigationSortMode, setNavigationSortMode\] = useState<NavigationSortMode>\(getStoredNavigationSortMode\);/);
  assert.match(noteComponentsSource, /const \[folderNotesSortMode, setFolderNotesSortMode\] = useState<FolderNotesSortMode>\(getStoredFolderNotesSortMode\);/);
  assert.match(noteComponentsSource, /const \[collapsedSectionRootIds, setCollapsedSectionRootIds\] = useState<Set<string>>\(getStoredCollapsedSectionRootIds\);/);
  assert.match(noteComponentsSource, /window\.localStorage\.setItem\(STORED_NOTES_SECTIONS_SORT_MODE_KEY, sectionsSortMode\);/);
  assert.match(noteComponentsSource, /window\.localStorage\.setItem\(STORED_NOTES_NAVIGATION_SORT_MODE_KEY, navigationSortMode\);/);
  assert.match(noteComponentsSource, /window\.localStorage\.setItem\(STORED_NOTES_FOLDER_ITEMS_SORT_MODE_KEY, folderNotesSortMode\);/);
  assert.match(noteComponentsSource, /window\.localStorage\.setItem\(STORED_NOTES_TREE_COLLAPSED_KEY, String\(isTreeCollapsed\)\);/);
  assert.match(noteComponentsSource, /window\.localStorage\.setItem\(STORED_NOTES_LIST_COLLAPSED_KEY, String\(isNotesCollapsed\)\);/);
  assert.match(noteComponentsSource, /window\.localStorage\.setItem\(STORED_COLLAPSED_SECTION_GROUPS_KEY, JSON\.stringify\(\[\.\.\.collapsedSectionRootIds\]\)\);/);
});
