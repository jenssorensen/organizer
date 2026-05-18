import { FolderOpen } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

import type { Note } from "../../types";
import { loadNoteVersionHistory } from "../../noteVersionHistory";
import {
  clampEditorSplitPercent,
  getPreviewScrollTopForEditorSelection,
  getSyncedPreviewScrollTop,
} from "../../noteEditing";
import { MarkdownCodeMirrorInput, type MarkdownCodeMirrorHandle } from "./MarkdownCodeMirrorInput";
import { MarkdownEditorChrome } from "./MarkdownEditorChrome";
import { MarkdownEditorFormattingToolbar } from "./MarkdownEditorFormattingToolbar";
import { MarkdownEditorOutline } from "./MarkdownEditorOutline";
import { MarkdownContent } from "./MarkdownContent";
import {
  buildLineStartOffsets,
  buildOutlineBreadcrumbs,
  getOffsetForLineColumn,
  moveMarkdownSectionBefore,
  parseMarkdownOutline,
  parseSourcePosition,
} from "./markdownEditorUtils";
import { MarkdownRevisionDiffView } from "./MarkdownRevisionDiffView";
import { useMarkdownEditorFileDrop } from "./useMarkdownEditorFileDrop";
import { useMarkdownEditorFormatting } from "./useMarkdownEditorFormatting";
import { useMarkdownEditorPopovers } from "./useMarkdownEditorPopovers";

const STORED_MARKDOWN_EDITOR_OUTLINE_VISIBILITY_KEY = "organizer:markdown-editor-outline-visible";

function getStoredMarkdownEditorOutlineVisibility() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(STORED_MARKDOWN_EDITOR_OUTLINE_VISIBILITY_KEY) === "true";
}

export function MarkdownEditor({
  allowIframeScripts = false,
  canGoBack = false,
  canGoForward = false,
  documentPath,
  editorContextLabel,
  isImmersive = false,
  noteSourcePath,
  notes,
  backlinks,
  canSave,
  draftStatus,
  markdown,
  onChange,
  onClose,
  onCreateMissingNote,
  onEnterImmersive,
  onGoBack,
  onGoForward,
  onOpenDocumentFolder,
  onOpenBacklink,
  onZoomIn,
  onZoomOut,
  onSave,
  previewContentScale = 100,
  previewLayout,
  resizePercent,
  setResizePercent,
  setPreviewLayout,
  showPreview,
  setShowPreview,
  initialScrollRatio,
  saveState,
  saveError,
}: {
  allowIframeScripts?: boolean;
  canGoBack?: boolean;
  canGoForward?: boolean;
  documentPath: string;
  editorContextLabel?: string;
  isImmersive?: boolean;
  noteSourcePath?: string;
  notes: Note[];
  backlinks: Note[];
  canSave: boolean;
  draftStatus: "idle" | "autosaved" | "recovered";
  markdown: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onCreateMissingNote?: (label: string) => void;
  onEnterImmersive?: () => void;
  onGoBack?: () => void;
  onGoForward?: () => void;
  onOpenDocumentFolder?: () => void;
  onOpenBacklink: (note: Note) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onSave: () => void;
  previewContentScale?: number;
  previewLayout: "below" | "side-by-side";
  resizePercent: number;
  setResizePercent: (value: number) => void;
  setPreviewLayout: (value: "below" | "side-by-side" | ((current: "below" | "side-by-side") => "below" | "side-by-side")) => void;
  showPreview: boolean;
  setShowPreview: (value: boolean | ((current: boolean) => boolean)) => void;
  initialScrollRatio: number;
  saveState: "idle" | "saving" | "saved" | "error";
  saveError: string | null;
}) {
  const editorRootRef = useRef<HTMLDivElement>(null);
  const splitRef = useRef<HTMLDivElement>(null);
  const editorInputRef = useRef<MarkdownCodeMirrorHandle>(null);
  const previewBodyRef = useRef<HTMLDivElement>(null);
  const actionPaletteInputRef = useRef<HTMLInputElement>(null);
  const paneHeadingRef = useRef<HTMLDivElement>(null);
  const documentHeadingRef = useRef<HTMLDivElement>(null);
  const breadcrumbsRef = useRef<HTMLDivElement>(null);
  const pendingResizePercentRef = useRef(resizePercent);
  const resizeFrameRef = useRef<number | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [linkEditorUrl, setLinkEditorUrl] = useState("");
  const [isActionPaletteOpen, setIsActionPaletteOpen] = useState(false);
  const [actionPaletteQuery, setActionPaletteQuery] = useState("");
  const [activeActionIndex, setActiveActionIndex] = useState(0);
  const [isOutlineVisible, setIsOutlineVisible] = useState(getStoredMarkdownEditorOutlineVisibility);
  const [focusCurrentBlockOnly, setFocusCurrentBlockOnly] = useState(false);
  const [isRevisionDiffOpen, setIsRevisionDiffOpen] = useState(false);
  const [selectedRevisionIndex, setSelectedRevisionIndex] = useState<number | null>(null);
  const [hideBreadcrumbs, setHideBreadcrumbs] = useState(false);
  const popovers = useMarkdownEditorPopovers({ editorRootRef });
  const formatting = useMarkdownEditorFormatting({
    markdown,
    onChange,
    editorSelectionBridge: {
      focusEditor: () => editorInputRef.current?.focus(),
      getSelection: () => editorInputRef.current?.getSelection() ?? null,
      setSelectionRange: (selectionStart, selectionEnd) => editorInputRef.current?.setSelectionRange(selectionStart, selectionEnd),
    },
  });
  const fileDrop = useMarkdownEditorFileDrop({
    markdown,
    noteSourcePath,
    onChange,
    getSelectionStart: () => editorInputRef.current?.getSelection()?.selectionStart ?? markdown.length,
  });

  const layoutStyle = useMemo<CSSProperties>(
    () => ({
      ...(previewLayout === "side-by-side"
        ? { gridTemplateColumns: `minmax(280px, ${resizePercent}fr) auto minmax(280px, ${100 - resizePercent}fr)` }
        : { gridTemplateRows: `minmax(160px, ${resizePercent}fr) auto minmax(160px, ${100 - resizePercent}fr)` }),
    }),
    [previewLayout, resizePercent],
  );
  const outlineEntries = useMemo(() => parseMarkdownOutline(markdown), [markdown]);
  const activeSourceLine = useMemo(() => {
    const lineStarts = buildLineStartOffsets(markdown);
    let currentLine = 1;

    for (let index = lineStarts.length - 1; index >= 0; index -= 1) {
      if (formatting.editorSelection >= lineStarts[index]) {
        currentLine = index + 1;
        break;
      }
    }

    return currentLine;
  }, [formatting.editorSelection, markdown]);

  const activeOutlineEntryId = useMemo(() => {
    for (let index = outlineEntries.length - 1; index >= 0; index -= 1) {
      if (outlineEntries[index].line <= activeSourceLine) {
        return outlineEntries[index].id;
      }
    }

    return null;
  }, [activeSourceLine, outlineEntries]);
  const draftStatusLabel = draftStatus === "recovered"
    ? "Recovered draft"
    : draftStatus === "autosaved"
      ? "Draft saved locally"
      : null;
  const activeBreadcrumbs = useMemo(
    () => buildOutlineBreadcrumbs(outlineEntries, activeOutlineEntryId),
    [activeOutlineEntryId, outlineEntries],
  );

  useEffect(() => {
    if (activeBreadcrumbs.length === 0) {
      setHideBreadcrumbs(false);
      return;
    }

    function updateBreadcrumbVisibility() {
      const headingElement = paneHeadingRef.current;
      const documentElement = documentHeadingRef.current;
      const breadcrumbsElement = breadcrumbsRef.current;

      if (!headingElement || !documentElement || !breadcrumbsElement) {
        return;
      }

      const availableWidth = headingElement.clientWidth - documentElement.offsetWidth - 10;
      setHideBreadcrumbs(breadcrumbsElement.scrollWidth > Math.max(availableWidth, 0));
    }

    updateBreadcrumbVisibility();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateBreadcrumbVisibility);
      return () => window.removeEventListener("resize", updateBreadcrumbVisibility);
    }

    const resizeObserver = new ResizeObserver(() => {
      updateBreadcrumbVisibility();
    });

    if (paneHeadingRef.current) {
      resizeObserver.observe(paneHeadingRef.current);
    }

    if (documentHeadingRef.current) {
      resizeObserver.observe(documentHeadingRef.current);
    }

    if (breadcrumbsRef.current) {
      resizeObserver.observe(breadcrumbsRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [activeBreadcrumbs]);

  const noteVersions = useMemo(
    () => (noteSourcePath ? loadNoteVersionHistory(noteSourcePath) : []),
    [noteSourcePath, saveState],
  );
  const actionPaletteActions = useMemo(() => {
    const actions = [
      { id: "bold", label: "Bold", keywords: "format strong", run: () => formatting.toggleWrapSelection("**", "**", "bold text") },
      { id: "italic", label: "Italic", keywords: "format emphasis", run: () => formatting.toggleWrapSelection("*", "*", "italic text") },
      { id: "list", label: "Toggle bullet list", keywords: "list bullets markdown", run: formatting.toggleListMarkers },
      { id: "task", label: "Toggle task list", keywords: "todo checkbox", run: formatting.toggleTaskLists },
      { id: "h1", label: "Heading 1", keywords: "title heading", run: () => formatting.applyHeading(1) },
      { id: "h2", label: "Heading 2", keywords: "subtitle heading", run: () => formatting.applyHeading(2) },
      { id: "quote", label: "Blockquote", keywords: "quote callout", run: () => formatting.prefixSelectedLines(() => "> ") },
      { id: "callout-note", label: "Insert note callout", keywords: "admonition note", run: () => formatting.insertCallout("note") },
      { id: "callout-tip", label: "Insert tip callout", keywords: "admonition tip", run: () => formatting.insertCallout("tip") },
      { id: "callout-warning", label: "Insert warning callout", keywords: "admonition warning", run: () => formatting.insertCallout("warning") },
      { id: "code", label: "Code block", keywords: "snippet code fence", run: () => formatting.insertCodeBlockWithLanguage("text") },
      { id: "mermaid", label: "Mermaid snippet", keywords: "diagram snippet", run: () => formatting.insertCodeBlockWithLanguage("mermaid") },
      { id: "agenda", label: "Meeting agenda snippet", keywords: "template meeting agenda", run: () => formatting.insertAtCursor("## Agenda\n\n1. \n\n## Notes\n\n## Action Items\n\n- [ ] \n", "## Agenda\n\n1. ".length) },
      { id: "actions", label: "Action items snippet", keywords: "template tasks", run: () => formatting.insertAtCursor("## Action Items\n\n- [ ] \n- [ ] \n", "## Action Items\n\n- [ ] ".length) },
      { id: "toc", label: "Insert table of contents", keywords: "toc outline", run: formatting.insertToc },
      { id: "footnote", label: "Insert footnote", keywords: "reference note", run: formatting.insertFootnote },
      { id: "table", label: "Insert 3x3 table", keywords: "spreadsheet markdown table", run: () => formatting.insertTable(3, 3) },
    ];

    const query = actionPaletteQuery.trim().toLowerCase();
    if (!query) {
      return actions;
    }

    return actions.filter((action) => `${action.label} ${action.keywords}`.toLowerCase().includes(query));
  }, [actionPaletteQuery, formatting]);

  useEffect(() => {
    if (!isActionPaletteOpen) {
      return;
    }

    actionPaletteInputRef.current?.focus();
    setActiveActionIndex(0);
  }, [isActionPaletteOpen]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(STORED_MARKDOWN_EDITOR_OUTLINE_VISIBILITY_KEY, String(isOutlineVisible));
  }, [isOutlineVisible]);

  useEffect(() => {
    if (activeActionIndex >= actionPaletteActions.length) {
      setActiveActionIndex(0);
    }
  }, [actionPaletteActions.length, activeActionIndex]);

  useEffect(() => {
    pendingResizePercentRef.current = resizePercent;
  }, [resizePercent]);

  useEffect(() => () => {
    if (resizeFrameRef.current !== null) {
      window.cancelAnimationFrame(resizeFrameRef.current);
    }
  }, []);

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    function applyResizePercent(nextPercent: number) {
      const splitElement = splitRef.current;
      if (!splitElement) {
        return;
      }

      if (previewLayout === "side-by-side") {
        splitElement.style.gridTemplateColumns = `minmax(280px, ${nextPercent}fr) auto minmax(280px, ${100 - nextPercent}fr)`;
        return;
      }

      splitElement.style.gridTemplateRows = `minmax(160px, ${nextPercent}fr) auto minmax(160px, ${100 - nextPercent}fr)`;
    }

    function handlePointerMove(event: PointerEvent) {
      const bounds = splitRef.current?.getBoundingClientRect();
      if (!bounds) {
        return;
      }

      const nextPercent = previewLayout === "side-by-side"
        ? ((event.clientX - bounds.left) / bounds.width) * 100
        : ((event.clientY - bounds.top) / bounds.height) * 100;
      pendingResizePercentRef.current = clampEditorSplitPercent(nextPercent);
      if (resizeFrameRef.current !== null) {
        return;
      }

      resizeFrameRef.current = window.requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        applyResizePercent(pendingResizePercentRef.current);
      });
    }

    function handlePointerUp() {
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }

      setResizePercent(pendingResizePercentRef.current);
      setIsResizing(false);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }

      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isResizing, previewLayout, setResizePercent]);

  useEffect(() => {
    if (!popovers.isLinkEditorOpen) {
      setLinkEditorUrl("");
    }
  }, [popovers.isLinkEditorOpen]);

  useEffect(() => {
    if (selectedRevisionIndex !== null && selectedRevisionIndex >= noteVersions.length) {
      setSelectedRevisionIndex(noteVersions.length > 0 ? 0 : null);
    }
  }, [noteVersions.length, selectedRevisionIndex]);

  useEffect(() => {
    if (!isRevisionDiffOpen) {
      return;
    }

    setShowPreview(true);
    if (selectedRevisionIndex === null && noteVersions.length > 0) {
      setSelectedRevisionIndex(0);
    }
  }, [isRevisionDiffOpen, noteVersions.length, selectedRevisionIndex, setShowPreview]);

  useEffect(() => {
    const previewBody = previewBodyRef.current;
    const editorMetrics = editorInputRef.current?.getScrollMetrics();
    if (!previewBody || !editorMetrics || !showPreview) {
      return;
    }

    previewBody.scrollTop = getSyncedPreviewScrollTop({
      sourceScrollTop: editorMetrics.scrollTop,
      sourceScrollHeight: editorMetrics.scrollHeight,
      sourceClientHeight: editorMetrics.clientHeight,
      targetScrollHeight: previewBody.scrollHeight,
      targetClientHeight: previewBody.clientHeight,
    });
  }, [markdown, showPreview]);

  useEffect(() => {
    const previewBody = previewBodyRef.current;
    if (!previewBody || !showPreview) {
      return;
    }

    previewBody.scrollTop = getPreviewScrollTopForEditorSelection({
      markdown,
      selectionStart: formatting.editorSelection,
      currentPreviewScrollTop: previewBody.scrollTop,
      targetScrollHeight: previewBody.scrollHeight,
      targetClientHeight: previewBody.clientHeight,
    });
  }, [formatting.editorSelection, markdown, showPreview]);

  function handleResizeStart(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    setIsResizing(true);
  }

  function handleEditorScroll(metrics: { scrollTop: number; scrollHeight: number; clientHeight: number }) {
    const previewBody = previewBodyRef.current;
    if (!previewBody) {
      return;
    }

    previewBody.scrollTop = getSyncedPreviewScrollTop({
      sourceScrollTop: metrics.scrollTop,
      sourceScrollHeight: metrics.scrollHeight,
      sourceClientHeight: metrics.clientHeight,
      targetScrollHeight: previewBody.scrollHeight,
      targetClientHeight: previewBody.clientHeight,
    });
  }

  function handlePreviewSourcePositionSelect(sourcePos: string) {
    const sourcePosition = parseSourcePosition(sourcePos);
    if (!sourcePosition) {
      return;
    }

    const nextOffset = getOffsetForLineColumn(markdown, sourcePosition.line, sourcePosition.column);
    editorInputRef.current?.setSelectionRange(nextOffset, nextOffset);
    formatting.handleEditorCursorActivity(nextOffset);
  }

  function handleSelectOutlineEntry(entry: (typeof outlineEntries)[number]) {
    editorInputRef.current?.setSelectionRange(entry.from, entry.from);
    formatting.handleEditorCursorActivity(entry.from);
  }

  function handleMoveOutlineEntry(sourceEntry: (typeof outlineEntries)[number], targetEntry: (typeof outlineEntries)[number]) {
    const moved = moveMarkdownSectionBefore(markdown, sourceEntry.id, targetEntry.id);
    if (!moved) {
      return;
    }

    onChange(moved.markdown);
    window.requestAnimationFrame(() => {
      editorInputRef.current?.setSelectionRange(moved.selectionStart, moved.selectionStart);
      formatting.handleEditorCursorActivity(moved.selectionStart);
    });
  }

  function handleFoldAll() {
    for (const entry of outlineEntries) {
      editorInputRef.current?.foldLine(entry.line);
    }
  }

  function handleUnfoldAll() {
    for (const entry of outlineEntries) {
      editorInputRef.current?.unfoldLine(entry.line);
    }
  }

  function handleToggleFocusedPreview() {
    setShowPreview(true);
    setIsRevisionDiffOpen(false);
    setFocusCurrentBlockOnly((current) => !current);
  }

  function handleCycleRevision(direction: -1 | 1) {
    if (noteVersions.length === 0) {
      return;
    }

    setShowPreview(true);
    setIsRevisionDiffOpen(true);
    setFocusCurrentBlockOnly(false);
    setSelectedRevisionIndex((current) => {
      if (current === null) {
        return 0;
      }

      return (current + direction + noteVersions.length) % noteVersions.length;
    });
  }

  function handleRestoreRevision(index: number) {
    const version = noteVersions[index];
    if (!version || version.content === markdown) {
      return;
    }

    onChange(version.content);
  }

  function closeActionPalette() {
    setIsActionPaletteOpen(false);
    setActionPaletteQuery("");
    window.requestAnimationFrame(() => {
      editorInputRef.current?.focus();
    });
  }

  function executeActionPaletteAction(index = activeActionIndex) {
    const action = actionPaletteActions[index];
    if (!action) {
      return;
    }

    action.run();
    closeActionPalette();
  }

  return (
    <div className="markdown-editor" ref={editorRootRef}>
      <MarkdownEditorChrome
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        canSave={canSave}
        contextLabel={editorContextLabel}
        focusCurrentBlockOnly={focusCurrentBlockOnly}
        isImmersive={isImmersive}
        isRevisionDiffOpen={isRevisionDiffOpen}
        onClose={onClose}
        onEnterImmersive={onEnterImmersive}
        onGoBack={onGoBack}
        onGoForward={onGoForward}
        onSave={onSave}
        onToggleFocusCurrentBlock={handleToggleFocusedPreview}
        onTogglePreview={() => {
          setShowPreview((current) => {
            const next = !current;
            if (!next) {
              setIsRevisionDiffOpen(false);
            }
            return next;
          });
        }}
        onToggleRevisionDiff={() => {
          setIsRevisionDiffOpen((current) => !current);
          setShowPreview(true);
        }}
        onTogglePreviewLayout={() => setPreviewLayout((current) => (current === "side-by-side" ? "below" : "side-by-side"))}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        previewContentScale={previewContentScale}
        previewLayout={previewLayout}
        saveState={saveState}
        setShowPreview={setShowPreview}
        showPreview={showPreview}
      />
      <div
        className={`markdown-editor__split ${showPreview && previewLayout === "side-by-side" ? "markdown-editor__split--side-by-side" : ""}`}
        ref={splitRef}
        style={showPreview ? layoutStyle : undefined}
      >
        <section className="markdown-editor__pane markdown-editor__pane--input">
          <div className="markdown-editor__pane-header markdown-editor__pane-header--input">
            <div className="markdown-editor__pane-header-trailing">
              <div className="markdown-editor__pane-heading" ref={paneHeadingRef}>
                <div className="markdown-editor__document-heading" ref={documentHeadingRef}>
                  {onOpenDocumentFolder ? (
                    <button
                      aria-label="Open folder in file manager"
                      className="markdown-editor__document-folder"
                      onClick={onOpenDocumentFolder}
                      title="Open folder in file manager"
                      type="button"
                    >
                      <FolderOpen size={14} />
                    </button>
                  ) : null}
                  <span className="markdown-editor__document-path" title={documentPath}>{documentPath}</span>
                </div>
                {activeBreadcrumbs.length > 0 ? (
                  <div
                    aria-hidden={hideBreadcrumbs}
                    className={`markdown-editor__breadcrumbs ${hideBreadcrumbs ? "is-hidden" : ""}`}
                    aria-label="Current section"
                    ref={breadcrumbsRef}
                  >
                    {activeBreadcrumbs.map((entry) => (
                      <button
                        className={`markdown-editor__breadcrumb ${entry.id === activeOutlineEntryId ? "is-active" : ""}`}
                        key={entry.id}
                        onClick={() => handleSelectOutlineEntry(entry)}
                        type="button"
                      >
                        {entry.title}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <span aria-hidden="true" className="markdown-editor__pane-divider" />
              <div className="markdown-editor__pane-meta">
                {draftStatusLabel ? <span className="status-pill subtle">{draftStatusLabel}</span> : null}
                <span className="muted">{markdown.length} chars</span>
              </div>
            </div>
          </div>
          {isActionPaletteOpen ? (
            <section className="markdown-editor__action-palette" aria-label="Selection actions">
              <div className="markdown-editor__action-palette-header">
                <span className="status-pill subtle">Selection actions</span>
                <button className="mini-action" onClick={closeActionPalette} type="button">Close</button>
              </div>
              <input
                className="markdown-editor__action-palette-input"
                onChange={(event) => setActionPaletteQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    closeActionPalette();
                    return;
                  }

                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setActiveActionIndex((current) => Math.min(current + 1, Math.max(actionPaletteActions.length - 1, 0)));
                    return;
                  }

                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setActiveActionIndex((current) => Math.max(current - 1, 0));
                    return;
                  }

                  if (event.key === "Enter") {
                    event.preventDefault();
                    executeActionPaletteAction();
                  }
                }}
                placeholder="Filter actions for the current selection"
                ref={actionPaletteInputRef}
                type="text"
                value={actionPaletteQuery}
              />
              <div className="markdown-editor__action-palette-list">
                {actionPaletteActions.map((action, index) => (
                  <button
                    className={`markdown-editor__action-palette-item ${index === activeActionIndex ? "is-active" : ""}`}
                    key={action.id}
                    onClick={() => executeActionPaletteAction(index)}
                    type="button"
                  >
                    <strong>{action.label}</strong>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          <MarkdownEditorFormattingToolbar
            activeColumnNumber={formatting.activeColumnNumber}
            activeDataRowNumber={formatting.activeDataRowNumber}
            codeLanguagePickerButtonRef={popovers.codeLanguagePickerButtonRef}
            codeLanguagePickerPopoverRef={popovers.codeLanguagePickerPopoverRef}
            codeLanguagePickerPosition={popovers.positions.code}
            headingButtonRef={popovers.headingButtonRef}
            headingMenuPosition={popovers.positions.heading}
            headingPopoverRef={popovers.headingPopoverRef}
            isBoldActive={formatting.isBoldActive}
            isCodeLanguagePickerOpen={popovers.isCodeLanguagePickerOpen}
            isCursorInsideTable={formatting.isCursorInsideTable}
            isHeadingMenuOpen={popovers.isHeadingMenuOpen}
            isItalicActive={formatting.isItalicActive}
            isLinkEditorOpen={popovers.isLinkEditorOpen}
            isOutlineVisible={isOutlineVisible}
            isStrikeActive={formatting.isStrikeActive}
            isTableMenuOpen={popovers.isTableMenuOpen}
            linkEditorButtonRef={popovers.linkEditorButtonRef}
            linkEditorInputRef={popovers.linkEditorInputRef}
            linkEditorPopoverRef={popovers.linkEditorPopoverRef}
            linkEditorPosition={popovers.positions.link}
            linkEditorUrl={linkEditorUrl}
            onApplyHeading={(level) => {
              formatting.applyHeading(level);
              popovers.closePopover("heading");
            }}
            onClearFormatting={formatting.clearFormatting}
            onClearTablePickerSelection={formatting.clearTablePickerSelection}
            onInsertBlockquote={() => formatting.prefixSelectedLines(() => "> ")}
            onInsertCodeBlockWithLanguage={(language) => {
              formatting.insertCodeBlockWithLanguage(language);
              popovers.closePopover("code");
            }}
            onInsertFootnote={formatting.insertFootnote}
            onInsertHorizontalRule={() => formatting.insertAtCursor("\n---\n")}
            onInsertImage={() => formatting.wrapSelection("![", "](image.png)", "alt text")}
            onInsertInlineCode={() => formatting.wrapSelection("`", "`", "code")}
            onInsertMath={formatting.insertMath}
            onInsertNumberedList={() => formatting.prefixSelectedLines((lineIndex) => `${lineIndex + 1}. `)}
            onInsertTable={(rows, cols) => {
              formatting.insertTable(rows, cols);
              popovers.closePopover("table");
            }}
            onInsertTableColumn={formatting.insertTableColumnRightOfCursor}
            onInsertTableRow={formatting.insertTableRowBelowCursor}
            onInsertToc={formatting.insertToc}
            onIndent={() => formatting.prefixSelectedLines(() => "  ")}
            onLinkEditorUrlChange={setLinkEditorUrl}
            onOpenFindReplace={() => editorInputRef.current?.openSearch()}
            onOutdent={formatting.outdentSelectedLines}
            onRemoveTableColumn={formatting.removeTableColumnAtCursor}
            onRemoveTableRow={formatting.removeTableRowAtCursor}
            onSubmitLink={() => {
              formatting.insertLinkWithUrl(linkEditorUrl || "https://");
              popovers.closePopover("link");
              setLinkEditorUrl("");
            }}
            onToggleBold={() => formatting.toggleWrapSelection("**", "**", "bold text")}
            onToggleCodeLanguagePicker={popovers.toggleCodeLanguagePicker}
            onToggleHeadingMenu={popovers.toggleHeadingMenu}
            onToggleItalic={() => formatting.toggleWrapSelection("*", "*", "italic text")}
            onToggleLinkEditor={popovers.toggleLinkEditor}
            onToggleList={formatting.toggleListMarkers}
            onToggleOutline={() => setIsOutlineVisible((current) => !current)}
            onToggleStrike={() => formatting.toggleWrapSelection("~~", "~~", "strikethrough")}
            onToggleTableMenu={popovers.toggleTableMenu}
            onToggleTaskList={formatting.toggleTaskLists}
            onUpdateTablePicker={formatting.updateTablePicker}
            tableButtonRef={popovers.tableButtonRef}
            tableMenuPosition={popovers.positions.table}
            tablePickerCols={formatting.tablePickerCols}
            tablePickerRows={formatting.tablePickerRows}
            tablePopoverRef={popovers.tablePopoverRef}
          />
          {isOutlineVisible ? (
            <MarkdownEditorOutline
              activeEntryId={activeOutlineEntryId}
              entries={outlineEntries}
              onFoldAll={handleFoldAll}
              onFoldEntry={(entry) => editorInputRef.current?.foldLine(entry.line)}
              onMoveEntry={handleMoveOutlineEntry}
              onSelectEntry={handleSelectOutlineEntry}
              onUnfoldAll={handleUnfoldAll}
              onUnfoldEntry={(entry) => editorInputRef.current?.unfoldLine(entry.line)}
            />
          ) : null}
          {backlinks.length > 0 ? (
            <section className="markdown-editor__backlinks" aria-label="Linked from">
              <div className="markdown-editor__backlinks-header">
                <span className="status-pill subtle">Linked from</span>
                <span className="muted">{backlinks.length} note{backlinks.length === 1 ? "" : "s"}</span>
              </div>
              <div className="markdown-editor__backlinks-list">
                {backlinks.map((note) => (
                  <button
                    className="markdown-editor__backlink"
                    key={note.id}
                    onClick={() => onOpenBacklink(note)}
                    type="button"
                  >
                    <strong>{note.title}</strong>
                    <span>{note.summary || note.sourcePath || "Linked note"}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          <MarkdownCodeMirrorInput
            initialScrollRatio={initialScrollRatio}
            isDragOver={fileDrop.isDragOver}
            markdown={markdown}
            noteSourcePath={noteSourcePath}
            notes={notes}
            onChange={onChange}
            onCreateMissingNote={onCreateMissingNote}
            onDragEnter={fileDrop.handleDragEnter}
            onDragLeave={fileDrop.handleDragLeave}
            onDragOver={fileDrop.handleDragOver}
            onDrop={fileDrop.handleFileDrop}
            onScroll={handleEditorScroll}
            onSelectionChange={formatting.handleEditorCursorActivity}
            keyCommands={{
              applyHeading: formatting.applyHeading,
              cycleRevision: handleCycleRevision,
              toggleList: formatting.toggleListMarkers,
              toggleFocusedPreview: handleToggleFocusedPreview,
              toggleTaskList: formatting.toggleTaskLists,
              insertCallout: formatting.insertCallout,
              openActionPalette: () => setIsActionPaletteOpen(true),
            }}
            ref={editorInputRef}
          />
        </section>
        {showPreview ? (
          <>
            <button
              aria-label="Resize editor panes"
              className={`markdown-editor__resize-handle ${showPreview && previewLayout === "side-by-side" ? "markdown-editor__resize-handle--vertical" : ""}`}
              onPointerDown={handleResizeStart}
              type="button"
            >
              <span className="markdown-editor__resize-line" />
            </button>
            <section className="markdown-editor__pane markdown-editor__pane--preview">
              <div className="markdown-editor__pane-header">
                <span className="status-pill subtle">{isRevisionDiffOpen ? "Revision diff" : focusCurrentBlockOnly ? "Focused preview" : "Markdown preview"}</span>
              </div>
              <div className="markdown-editor__preview-body" ref={previewBodyRef}>
                {isRevisionDiffOpen ? (
                  <MarkdownRevisionDiffView
                    currentContent={markdown}
                    onRestoreVersion={handleRestoreRevision}
                    onSelectVersion={setSelectedRevisionIndex}
                    selectedVersionIndex={selectedRevisionIndex}
                    versions={noteVersions}
                  />
                ) : (
                  <MarkdownContent
                    activeSourceLine={activeSourceLine}
                    allowIframeScripts={allowIframeScripts}
                    contentScale={previewContentScale}
                    focusCurrentBlockOnly={focusCurrentBlockOnly}
                    markdown={markdown}
                    noteSourcePath={noteSourcePath}
                    onSourcePositionSelect={handlePreviewSourcePositionSelect}
                    useSandboxFrame
                  />
                )}
              </div>
            </section>
          </>
        ) : null}
      </div>
      {saveError ? <p className="markdown-editor__error">{saveError}</p> : null}
    </div>
  );
}