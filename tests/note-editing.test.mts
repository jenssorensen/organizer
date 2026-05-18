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
  assert.equal(clampEditorSplitPercent(58.37), 58.37);
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
  const markdownEditorSource = await readFile(new URL("../src/components/markdown/MarkdownEditor.tsx", import.meta.url), "utf8");
  const markdownCodeMirrorSource = await readFile(new URL("../src/components/markdown/MarkdownCodeMirrorInput.tsx", import.meta.url), "utf8");
  const markdownFormattingToolbarSource = await readFile(new URL("../src/components/markdown/MarkdownEditorFormattingToolbar.tsx", import.meta.url), "utf8");
  const markdownContentSource = await readFile(new URL("../src/components/markdown/MarkdownContent.tsx", import.meta.url), "utf8");
  const markdownChromeSource = await readFile(new URL("../src/components/markdown/MarkdownEditorChrome.tsx", import.meta.url), "utf8");
  const markdownDiffSource = await readFile(new URL("../src/components/markdown/MarkdownRevisionDiffView.tsx", import.meta.url), "utf8");
  const previewFrameSource = await readFile(new URL("../src/components/markdown/MarkdownPreviewFrame.tsx", import.meta.url), "utf8");
  const stylesheet = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(appSource, /const STORED_MARKDOWN_EDITOR_PREVIEW_VISIBILITY_KEY = "organizer:markdown-editor-preview-visible";/);
  assert.match(appSource, /const STORED_MARKDOWN_EDITOR_PREVIEW_LAYOUT_KEY = "organizer:markdown-editor-preview-layout";/);
  assert.match(appSource, /const STORED_SELECTED_NOTES_NODE_KEY = "organizer:selected-notes-node";/);
  assert.match(appSource, /canEditNote\(selectedNote\)/);
  assert.match(appSource, /canTrashNote\(selectedNote\)/);
  assert.match(appSource, /markdown-body__edit/);
  assert.match(appSource, /aria-label="Move to trash"/);
  assert.match(appSource, /markdown-body__close/);
  assert.match(appSource, /const canCloseDocument = isMarkdownImmersive;/);
  assert.match(appSource, /className="icon-action markdown-body__close"[\s\S]*disabled=\{!canCloseDocument\}/);
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
  assert.match(appSource, /if \(isEscapeKey && isMarkdownEditorAutocompleteEscapeTarget\(event\.target\)\) \{\s*return;\s*\}/);
  assert.match(appSource, /function isMarkdownEditorAutocompleteEscapeTarget\(eventTarget: EventTarget \| null\) \{/);
  assert.match(appSource, /eventTarget\.closest\("\.markdown-editor__input"\)/);
  assert.match(appSource, /editorInput\.querySelector\("\.cm-tooltip-autocomplete"\) !== null/);
  assert.match(appSource, /if \(!isEscapeKey\) \{\s*return;\s*\}/);
  assert.match(appSource, /if \(isNoteEditing\) \{\s*if \(!isNoteDraftDirty\) \{\s*handleCancelNoteEditing\(\);\s*handleCloseSelectedNote\(\);/);
  assert.match(appSource, /void handleCloseNoteEditor\(\);/);
  assert.match(markdownEditorSource, /markdown-editor/);
  assert.match(markdownEditorSource, /markdown-editor__resize-handle/);
  assert.match(markdownEditorSource, /pendingResizePercentRef/);
  assert.match(markdownEditorSource, /window\.requestAnimationFrame\(\(\) => \{/);
  assert.match(markdownEditorSource, /setResizePercent\(pendingResizePercentRef\.current\);/);
  assert.match(markdownEditorSource, /markdown-editor__preview-body/);
  assert.match(markdownEditorSource, /isImmersive\?: boolean;/);
  assert.match(markdownEditorSource, /onEnterImmersive\?: \(\) => void;/);
  assert.match(markdownCodeMirrorSource, /spellcheck: "true"/);
  assert.match(markdownEditorSource, /canSave: boolean;/);
  assert.match(markdownChromeSource, /showPreview \? "Hide preview" : "Show preview"/);
  assert.match(markdownChromeSource, /isRevisionDiffOpen \? "Hide revision diff" : "Show revision diff"/);
  assert.match(markdownChromeSource, /focusCurrentBlockOnly \? "Show full preview" : "Focus current block"/);
  assert.match(markdownChromeSource, /aria-label="Enter immersive mode"/);
  assert.match(markdownChromeSource, /!isImmersive && onEnterImmersive/);
  assert.match(markdownChromeSource, /showPreview \? <EyeOff size=\{16\} \/> : <Eye size=\{16\} \/>/);
  assert.match(markdownFormattingToolbarSource, /isOutlineVisible \? "Hide outline" : "Show outline"/);
  assert.match(markdownFormattingToolbarSource, /isOutlineVisible \? <ChevronUp size=\{14\} \/> : <ChevronDown size=\{14\} \/>/);
  assert.match(markdownFormattingToolbarSource, /className=\{`markdown-format-toolbar__button markdown-format-toolbar__button--outline \$\{isOutlineVisible \? "is-active" : ""\}`\.trim\(\)\}/);
  assert.match(markdownFormattingToolbarSource, /className="markdown-format-toolbar__spacer"/);
  assert.match(markdownFormattingToolbarSource, /title="Clear formatting" type="button"><Paintbrush size=\{14\} \/><\/button>/);
  assert.match(appSource, /showPreview=\{showMarkdownEditorPreview\}/);
  assert.match(appSource, /setShowPreview=\{setShowMarkdownEditorPreview\}/);
  assert.match(appSource, /previewLayout=\{markdownEditorPreviewLayout\}/);
  assert.match(appSource, /setPreviewLayout=\{setMarkdownEditorPreviewLayout\}/);
  assert.match(markdownEditorSource, /showPreview \? layoutStyle : undefined/);
  assert.match(markdownChromeSource, /previewLayout === "side-by-side" \? <SplitSquareVertical size=\{16\} \/> : <SplitSquareHorizontal size=\{16\} \/>/);
  assert.match(markdownChromeSource, /previewLayout === "side-by-side" \? "Below preview" : "Side by side"/);
  assert.match(markdownChromeSource, /previewLayout === "side-by-side" \? <SplitSquareVertical size=\{16\} \/> : <SplitSquareHorizontal size=\{16\} \/>/);
  assert.doesNotMatch(markdownEditorSource, /title="Bullet list"/);
  assert.match(markdownChromeSource, /className=\{`markdown-body__toolbar-side \$\{showPreview \? "" : "is-disabled"\}`\.trim\(\)\}/);
  assert.match(markdownChromeSource, /disabled=\{saveState === "saving" \|\| !showPreview\}/);
  assert.match(markdownChromeSource, /aria-label=\{previewLayout === "side-by-side" \? "Below preview" : "Side by side"\}[\s\S]*disabled=\{saveState === "saving" \|\| !showPreview\}/);
  assert.match(markdownChromeSource, /className="markdown-body__toolbar-side markdown-editor__toolbar-actions"/);
  assert.match(markdownChromeSource, /className="icon-action markdown-editor__save"/);
  assert.match(markdownChromeSource, /disabled=\{saveState === "saving" \|\| !canSave\}/);
  assert.match(markdownChromeSource, /aria-label="Close document"/);
  assert.match(previewFrameSource, /function SandboxedPreviewFrame\(/);
  assert.match(previewFrameSource, /allowScripts \? "allow-scripts" : ""/);
  assert.match(markdownContentSource, /useSandboxFrame\?: boolean;/);
  assert.match(markdownContentSource, /focusCurrentBlockOnly\?: boolean;/);
  assert.match(markdownContentSource, /buildDocumentPreviewSrcDoc\(markdown, noteSourcePath\)/);
  assert.match(markdownEditorSource, /loadNoteVersionHistory\(noteSourcePath\)/);
  assert.match(markdownEditorSource, /const STORED_MARKDOWN_EDITOR_OUTLINE_VISIBILITY_KEY = "organizer:markdown-editor-outline-visible";/);
  assert.match(markdownEditorSource, /function getStoredMarkdownEditorOutlineVisibility\(\)/);
  assert.match(markdownEditorSource, /return false;/);
  assert.match(markdownEditorSource, /window\.localStorage\.getItem\(STORED_MARKDOWN_EDITOR_OUTLINE_VISIBILITY_KEY\) === "true"/);
  assert.match(markdownEditorSource, /const \[isOutlineVisible, setIsOutlineVisible\] = useState\(getStoredMarkdownEditorOutlineVisibility\);/);
  assert.match(markdownEditorSource, /window\.localStorage\.setItem\(STORED_MARKDOWN_EDITOR_OUTLINE_VISIBILITY_KEY, String\(isOutlineVisible\)\);/);
  assert.match(markdownEditorSource, /function handleToggleFocusedPreview\(\)/);
  assert.match(markdownEditorSource, /function handleCycleRevision\(direction: -1 \| 1\)/);
  assert.match(markdownEditorSource, /function handleRestoreRevision\(index: number\)/);
  assert.match(markdownEditorSource, /<MarkdownRevisionDiffView/);
  assert.match(markdownEditorSource, /isOutlineVisible=\{isOutlineVisible\}/);
  assert.match(markdownEditorSource, /onToggleOutline=\{\(\) => setIsOutlineVisible\(\(current\) => !current\)\}/);
  assert.match(markdownEditorSource, /focusCurrentBlockOnly=\{focusCurrentBlockOnly\}/);
  assert.match(markdownEditorSource, /isImmersive=\{isImmersive\}/);
  assert.match(markdownEditorSource, /onEnterImmersive=\{onEnterImmersive\}/);
  assert.match(markdownEditorSource, /onRestoreVersion=\{handleRestoreRevision\}/);
  assert.match(markdownEditorSource, /toggleFocusedPreview: handleToggleFocusedPreview/);
  assert.match(markdownEditorSource, /cycleRevision: handleCycleRevision/);
  assert.match(markdownEditorSource, /\{isOutlineVisible \? \(/);
  assert.match(markdownCodeMirrorSource, /buildMarkdownUrlPasteInsertion/);
  assert.match(markdownCodeMirrorSource, /getMarkdownSlashCommands/);
  assert.match(markdownCodeMirrorSource, /isMarkdownEmbedDirectivePrefix/);
  assert.match(markdownCodeMirrorSource, /function shouldUseStandaloneUrlPreview/);
  assert.match(markdownCodeMirrorSource, /function isEmbedDirectivePasteTarget/);
  assert.match(markdownCodeMirrorSource, /if \(isEmbedDirectivePasteTarget\(view\.state\.doc\.toString\(\), selection\.from, selection\.to\)\) \{/);
  assert.match(markdownCodeMirrorSource, /const slashCommandCompletions = \(context: CompletionContext\) => \{/);
  assert.match(markdownCodeMirrorSource, /override: \[slashCommandCompletions, wikiLinkCompletions\]/);
  assert.match(markdownCodeMirrorSource, /keymap\.of\(\[\s*\.\.\.completionKeymap,\s*\.\.\.defaultKeymap,/);
  assert.match(markdownCodeMirrorSource, /key: "Escape",[\s\S]*return closeCompletion\(view\);/);
  assert.match(markdownContentSource, /allowIframeScripts=\{allowIframeScripts\}/);
  assert.match(stylesheet, /\.markdown-external-embed \{/);
  assert.match(stylesheet, /\.markdown-external-embed__frame \{/);
  assert.match(markdownCodeMirrorSource, /key: "Mod-Alt-p"/);
  assert.match(markdownCodeMirrorSource, /key: "Alt-PageUp"/);
  assert.match(markdownCodeMirrorSource, /key: "Alt-PageDown"/);
  assert.match(markdownDiffSource, /buildMarkdownDiffRows/);
  assert.match(markdownDiffSource, /Restore into draft/);
  assert.match(markdownDiffSource, /onRestoreVersion: \(index: number\) => void;/);
  assert.doesNotMatch(markdownEditorSource, /Cancel/);
  assert.match(markdownEditorSource, /markdown-editor__split--side-by-side/);
  assert.match(markdownEditorSource, /showPreview \? \(/);
  assert.match(markdownEditorSource, /onScroll=\{handleEditorScroll\}/);
  assert.match(appSource, /canSave=\{isNoteDraftDirty\}/);
  assert.match(appSource, /isImmersive=\{isMarkdownImmersive\}/);
  assert.match(appSource, /onEnterImmersive=\{\(\) => setForceImmersive\(true\)\}/);
  assert.match(appSource, /onClose=\{\(\) => void handleCloseNoteEditor\(\)\}/);
  assert.match(appSource, /toolbarActions=\{showDetachedStandaloneNoteToolbar \? undefined : standaloneNoteViewerToolbarActions\}[\s\S]*useSandboxFrame/);
  assert.match(stylesheet, /\.markdown-body__toolbar-side\.is-disabled \{[\s\S]*opacity: 0\.55;/);
  assert.match(stylesheet, /\.markdown-editor__toolbar-actions \{[\s\S]*margin-left: auto;/);
  assert.match(stylesheet, /\.markdown-format-toolbar__spacer \{/);
  assert.match(stylesheet, /\.markdown-format-toolbar__button--outline \{/);
  assert.match(stylesheet, /\.markdown-body__sandbox-frame \{[\s\S]*width: 100%;/);
  assert.match(stylesheet, /\.markdown-revision-diff \{/);
  assert.match(stylesheet, /\.markdown-revision-diff__content-header \{/);
  assert.match(stylesheet, /data-focus-current-block="true"/);
  assert.match(appSource, /const isMarkdownImmersive = \(Boolean\(selectedNote\) \|\| isNoteEditing\) && !shouldShowPreviewInPanel;/);
  assert.match(appSource, /consumeScopedSearchInputWithCurrentScopes\(value, searchScope, searchNoteSectionScope, searchFolderScopePath\)/);
  assert.match(appSource, /folder: \{searchFolderScopePath\.join\(" \/ "\)\}/);
});

test("folder overview renders contextual header copy and an expandable tree", async () => {
  const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const noteComponentsSource = await readFile(new URL("../src/components/NoteComponents.tsx", import.meta.url), "utf8");
  const stylesheet = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(noteComponentsSource, /note-folder-overview__tree/);
  assert.match(noteComponentsSource, /foldersOnly/);
  assert.match(appSource, /navigationTreeNodes=\{visibleOverviewNavigationTreeNodes\}/);
  assert.match(noteComponentsSource, /Organize structure/);
  assert.match(noteComponentsSource, /in this folder/);
  assert.match(appSource, /showPersistentFolderOverview/);
  assert.match(appSource, /NoteFolderOverviewPanel/);
  assert.match(appSource, /aria-label="Navigation mode"/);
  assert.match(appSource, />\s*Folder\s*</);
  assert.match(appSource, />\s*Section\s*</);
  assert.match(noteComponentsSource, /showNavigationModeInSectionsHeader/);
  assert.match(noteComponentsSource, /showNavigationModeInNavigationHeader/);
  assert.match(noteComponentsSource, /note-folder-overview__section--overview/);
  assert.doesNotMatch(noteComponentsSource, /note-folder-overview__section note-folder-overview__section--tree/);
  assert.doesNotMatch(noteComponentsSource, /Change navigation view:/);
  assert.match(stylesheet, /\.note-folder-overview__tree/);
  assert.match(stylesheet, /\.note-folder-overview__tree-item/);
  assert.match(stylesheet, /\.note-folder-overview__grid\.has-sections\s*\{[\s\S]*?grid-template-columns:\s*minmax\(70px,\s*0\.72fr\)\s*auto\s*minmax\(0,\s*1fr\);/);
  assert.match(stylesheet, /\.note-folder-overview__section--overview\s*\{/);
});

test("folder overview notes section keeps the current list layout and sort controls", async () => {
  const noteComponentsSource = await readFile(new URL("../src/components/NoteComponents.tsx", import.meta.url), "utf8");
  const stylesheet = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(noteComponentsSource, /className=\{`note-folder-overview__notes-split \$\{isResizingPreview \? "is-resizing" : ""\}`\}/);
  assert.match(noteComponentsSource, /note-folder-overview__section note-folder-overview__section--notes is-list/);
  assert.match(noteComponentsSource, /isSectionView \? \(\s*<div className="note-folder-overview__overview-block note-folder-overview__overview-block--notes">/);
  assert.match(noteComponentsSource, /note-folder-overview__notes-body is-list/);
  assert.match(noteComponentsSource, /note-folder-overview__sort-menu/);
  assert.match(noteComponentsSource, /note-folder-overview__sort-trigger/);
  assert.match(stylesheet, /\.note-folder-overview__overview-block\s*\{/);
  assert.match(stylesheet, /\.note-folder-overview__notes-split\s*\{/);
  assert.match(stylesheet, /\.note-folder-overview__section--notes\s*\{/);
  assert.match(stylesheet, /\.note-folder-overview__notes-body\.is-list/);
  assert.match(stylesheet, /\.note-folder-overview__sort-menu/);
  assert.match(stylesheet, /\.note-folder-overview__sort-trigger/);
});

test("section view renders notes in this section as a folder tree", async () => {
  const noteComponentsSource = await readFile(new URL("../src/components/NoteComponents.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(noteComponentsSource, /sectionHeaderClassName/);
  assert.doesNotMatch(noteComponentsSource, /note-folder-overview__section-header/);
  assert.match(noteComponentsSource, /const sortedSectionNotesTreeNodes = useMemo\(/);
  assert.match(noteComponentsSource, /sortNavigationNodes\([\s\S]*folderNotesSortMode,[\s\S]*folderSortSnapshotViewCounts\.current,[\s\S]*folderSortSnapshotRecentViewedAt\.current/);
  assert.match(noteComponentsSource, /const directItemsHeading = notesNavigationMode === "section"/);
  assert.match(noteComponentsSource, /\$\{capitalizedItemLabelPlural\} in this section/);
  assert.match(noteComponentsSource, /notesNavigationMode === "section" \? \(/);
  assert.match(noteComponentsSource, /className="note-folder-overview__tree note-folder-overview__notes-tree"/);
  assert.match(noteComponentsSource, /\{sortedSectionNotesTreeNodes\.length > 0 \? \(/);
  assert.match(noteComponentsSource, /\{visibleSectionNotesTreeNodes\.map\(\(folderNode, index\) => \(/);
  assert.match(noteComponentsSource, /<NoteTreeItem[\s\S]*?foldersOnly[\s\S]*?key=\{`\$\{folderNode\.id\}:\$\{index\}`\}/);
  assert.match(noteComponentsSource, /foldersOnly=\{false\}/);
  assert.match(noteComponentsSource, /key=\{`\$\{folderNode\.id\}:notes:\$\{index\}`\}/);
  assert.match(noteComponentsSource, /No \$\{itemLabelPlural\} or subfolders in this section yet\./);
});

test("folder overview summary cards reuse the tree note row shell", async () => {
  const noteComponentsSource = await readFile(new URL("../src/components/NoteComponents.tsx", import.meta.url), "utf8");
  const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");

  assert.match(noteComponentsSource, /function NoteSummaryCard\(/);
  assert.match(noteComponentsSource, /onStartEditingNote\?: \(note: Note, nodeId: string\) => void;/);
  assert.match(noteComponentsSource, /onDoubleClick=\{\(\) => \{[\s\S]*onStartEditing\?\.[\s\S]*\}\}/);
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
  assert.match(appSource, /function handleStartEditingNote\(note: Note, nodeId: string \| null\)/);
  assert.match(appSource, /onStartEditingNote=\{section === "notes" \? handleStartEditingNote : undefined\}/);
});

test("app preserves the current folder context when a selected note disappears", async () => {
  const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const notesDataSource = await readFile(new URL("../src/useNotesData.ts", import.meta.url), "utf8");

  assert.match(appSource, /const lastValidNoteContextNodeIdRef = useRef\(ROOT_NOTE_NODE_ID\);/);
  assert.match(appSource, /getFallbackSelectedNoteNodeId: \(\) => lastValidNoteContextNodeIdRef\.current/);
  assert.match(appSource, /lastValidNoteContextNodeIdRef\.current = folderTrail\.at\(-1\)\?\.id \?\? ROOT_NOTE_NODE_ID;/);
  assert.match(notesDataSource, /getFallbackSelectedNoteNodeId\?: \(\) => string \| null;/);
  assert.match(notesDataSource, /const fallbackSelectedNoteNodeId = getFallbackSelectedNoteNodeId\?\.\(\) \?\? null;/);
  assert.match(notesDataSource, /resolveSelectedNoteNodeId\(\{[\s\S]*fallbackSelectedNoteNodeId,[\s\S]*tree: data\.tree,[\s\S]*\}\)/);
});

test("folder overview keeps only the notes-list view menu", async () => {
  const noteComponentsSource = await readFile(new URL("../src/components/NoteComponents.tsx", import.meta.url), "utf8");
  const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const stylesheet = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(noteComponentsSource, /type NoteRowViewMode = "detailed" \| "compact";/);
  assert.match(noteComponentsSource, /const NOTE_ROW_VIEW_OPTIONS: Array<\{ description: string; label: string; value: NoteRowViewMode \}> = \[/);
  assert.match(noteComponentsSource, /const \[noteRowViewMode, setNoteRowViewMode\] = useState<NoteRowViewMode>\(getStoredNoteRowViewMode\);/);
  assert.match(noteComponentsSource, /window\.localStorage\.setItem\(STORED_NOTE_ROW_VIEW_MODE_KEY, noteRowViewMode\);/);
  assert.match(noteComponentsSource, /className="note-folder-overview__view-trigger"/);
  assert.match(noteComponentsSource, /Change note row view: \$\{activeNoteRowViewOption\.label\}/);
  assert.match(appSource, /setNotesNavigationMode\("folder"\)/);
  assert.match(appSource, /setNotesNavigationMode\("section"\)/);
  assert.doesNotMatch(noteComponentsSource, /onChangeNavigationMode/);
  assert.match(stylesheet, /\.note-folder-overview__section-actions\s*\{/);
  assert.match(stylesheet, /\.note-folder-overview__header-mode-actions\s*\{/);
  assert.match(stylesheet, /\.note-folder-overview__segmented\s*\{/);
  assert.match(stylesheet, /\.note-folder-overview__header-primary-actions\s*\{/);
  assert.match(stylesheet, /\.note-folder-overview__header-action--adaptive\s*\{[\s\S]*width:\s*28px;[\s\S]*height:\s*28px;/);
  assert.match(stylesheet, /\.note-folder-overview__header-action-label--adaptive\s*\{[\s\S]*display:\s*none;/);
  assert.match(stylesheet, /\.note-folder-overview__header-utility-actions\s*\{/);
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
  assert.match(noteComponentsSource, /gridTemplateColumns: \(isSectionView \? isOverviewPaneCollapsed : isTreeCollapsed\)[\s\S]*getResizableOverviewColumns\(isSectionView \? previewSplitPercent : overviewSplitPercent\)/);
  assert.doesNotMatch(noteComponentsSource, /getResizableOverviewColumns\(notesNavigationMode === "section" \? previewSplitPercent : overviewSplitPercent\)/);
  assert.match(noteComponentsSource, /className=\{`note-folder-overview__notes-split \$\{isResizingPreview \? "is-resizing" : ""\}`\}/);
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
  const markdownEditorSource = await readFile(new URL("../src/components/markdown/MarkdownEditor.tsx", import.meta.url), "utf8");

  assert.match(appSource, /const viewerContentRef = useRef<HTMLDivElement>\(null\);/);
  assert.match(appSource, /const \[showMarkdownEditorPreview, setShowMarkdownEditorPreview\] = useState\(getStoredMarkdownEditorPreviewVisibility\(\)\);/);
  assert.match(appSource, /const \[markdownEditorPreviewLayout, setMarkdownEditorPreviewLayout\] = useState\(getStoredMarkdownEditorPreviewLayout\(\)\);/);
  assert.match(appSource, /window\.localStorage\.setItem\(STORED_MARKDOWN_EDITOR_PREVIEW_VISIBILITY_KEY, String\(showMarkdownEditorPreview\)\);/);
  assert.match(appSource, /window\.localStorage\.setItem\(STORED_MARKDOWN_EDITOR_PREVIEW_LAYOUT_KEY, markdownEditorPreviewLayout\);/);
  assert.match(appSource, /const \[pendingEditorScrollRatio, setPendingEditorScrollRatio\] = useState\(0\);/);
  assert.match(appSource, /setPendingEditorScrollRatio\(getScrollProgress\(viewerContentRef\.current\)\);/);
  assert.match(appSource, /contentRef=\{viewerContentRef\}/);
  assert.match(appSource, /initialScrollRatio=\{pendingEditorScrollRatio\}/);
  assert.match(markdownEditorSource, /useEffect\(\(\) => \{\s*const editorInput = editorInputRef\.current;/);
  assert.match(markdownEditorSource, /const hasAppliedInitialScrollRef = useRef\(false\);/);
  assert.match(markdownEditorSource, /if \(hasAppliedInitialScrollRef\.current\) \{\s*return;\s*\}/);
  assert.match(markdownEditorSource, /hasAppliedInitialScrollRef\.current = true;/);
  assert.match(markdownEditorSource, /editorInput\.scrollTop = initialScrollRatio \* maxEditorScrollTop;/);
  assert.doesNotMatch(markdownEditorSource, /\}, \[initialScrollRatio, markdown\]\);/);
  assert.match(markdownEditorSource, /\}, \[initialScrollRatio\]\);/);
  assert.match(markdownEditorSource, /getPreviewScrollTopForEditorSelection\(\{/);
  assert.match(markdownEditorSource, /selectionStart: formatting\.editorSelection,/);
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
