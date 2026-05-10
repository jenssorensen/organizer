import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type UIEvent } from "react";

import {
  clampEditorSplitPercent,
  getPreviewScrollTopForEditorSelection,
  getSyncedPreviewScrollTop,
} from "../../noteEditing";
import { MarkdownEditorChrome } from "./MarkdownEditorChrome";
import { MarkdownEditorFormattingToolbar } from "./MarkdownEditorFormattingToolbar";
import { MarkdownContent } from "./MarkdownContent";
import { useMarkdownEditorFileDrop } from "./useMarkdownEditorFileDrop";
import { useMarkdownEditorFormatting } from "./useMarkdownEditorFormatting";
import { useMarkdownEditorPopovers } from "./useMarkdownEditorPopovers";

export function MarkdownEditor({
  allowIframeScripts = false,
  documentPath,
  noteSourcePath,
  canSave,
  markdown,
  onChange,
  onClose,
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
  documentPath: string;
  noteSourcePath?: string;
  canSave: boolean;
  markdown: string;
  onChange: (value: string) => void;
  onClose: () => void;
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
  const editorInputRef = useRef<HTMLTextAreaElement>(null);
  const previewBodyRef = useRef<HTMLDivElement>(null);
  const hasAppliedInitialScrollRef = useRef(false);
  const [isResizing, setIsResizing] = useState(false);
  const [linkEditorUrl, setLinkEditorUrl] = useState("");
  const formatting = useMarkdownEditorFormatting({ markdown, onChange, editorInputRef });
  const popovers = useMarkdownEditorPopovers({ editorRootRef });
  const fileDrop = useMarkdownEditorFileDrop({ markdown, noteSourcePath, onChange, editorInputRef });

  const layoutStyle = useMemo<CSSProperties>(
    () => ({
      ...(previewLayout === "side-by-side"
        ? { gridTemplateColumns: `minmax(280px, ${resizePercent}fr) auto minmax(280px, ${100 - resizePercent}fr)` }
        : { gridTemplateRows: `minmax(160px, ${resizePercent}fr) auto minmax(160px, ${100 - resizePercent}fr)` }),
    }),
    [previewLayout, resizePercent],
  );

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    function handlePointerMove(event: PointerEvent) {
      const bounds = splitRef.current?.getBoundingClientRect();
      if (!bounds) {
        return;
      }

      const nextPercent =
        previewLayout === "side-by-side"
          ? ((event.clientX - bounds.left) / bounds.width) * 100
          : ((event.clientY - bounds.top) / bounds.height) * 100;
      setResizePercent(clampEditorSplitPercent(nextPercent));
    }

    function handlePointerUp() {
      setIsResizing(false);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
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
    const editorInput = editorInputRef.current;
    if (!editorInput) {
      return;
    }

    if (hasAppliedInitialScrollRef.current) {
      return;
    }

    const maxEditorScrollTop = Math.max(editorInput.scrollHeight - editorInput.clientHeight, 0);
    editorInput.scrollTop = initialScrollRatio * maxEditorScrollTop;
    hasAppliedInitialScrollRef.current = true;
  }, [initialScrollRatio]);

  useEffect(() => {
    const editorInput = editorInputRef.current;
    const previewBody = previewBodyRef.current;
    if (!editorInput || !previewBody || !showPreview) {
      return;
    }

    previewBody.scrollTop = getSyncedPreviewScrollTop({
      sourceScrollTop: editorInput.scrollTop,
      sourceScrollHeight: editorInput.scrollHeight,
      sourceClientHeight: editorInput.clientHeight,
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

  function handleEditorScroll(event: UIEvent<HTMLTextAreaElement>) {
    const previewBody = previewBodyRef.current;
    if (!previewBody) {
      return;
    }

    previewBody.scrollTop = getSyncedPreviewScrollTop({
      sourceScrollTop: event.currentTarget.scrollTop,
      sourceScrollHeight: event.currentTarget.scrollHeight,
      sourceClientHeight: event.currentTarget.clientHeight,
      targetScrollHeight: previewBody.scrollHeight,
      targetClientHeight: previewBody.clientHeight,
    });
  }

  return (
    <div className="markdown-editor" ref={editorRootRef}>
      <MarkdownEditorChrome
        canSave={canSave}
        onClose={onClose}
        onSave={onSave}
        onTogglePreview={() => setShowPreview((current) => !current)}
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
          <div className="markdown-editor__pane-header">
            <span className="markdown-editor__document-path" title={documentPath}>{documentPath}</span>
            <span className="muted">{markdown.length} chars</span>
          </div>
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
          <textarea
            aria-label="Raw markdown editor"
            className={`markdown-editor__input ${fileDrop.isDragOver ? "is-drag-over" : ""}`}
            onChange={(event) => {
              onChange(event.target.value);
              formatting.setEditorSelection(event.currentTarget.selectionStart);
            }}
            onDragEnter={fileDrop.handleDragEnter}
            onDragLeave={fileDrop.handleDragLeave}
            onDragOver={fileDrop.handleDragOver}
            onDrop={fileDrop.handleFileDrop}
            onKeyUp={formatting.handleEditorCursorActivity}
            onScroll={handleEditorScroll}
            onSelect={formatting.handleEditorCursorActivity}
            ref={editorInputRef}
            spellCheck
            value={markdown}
          />
        </section>
        {showPreview ? (
          <>
            <button
              aria-label="Resize editor panes"
              className={`markdown-editor__resize-handle ${
                showPreview && previewLayout === "side-by-side" ? "markdown-editor__resize-handle--vertical" : ""
              }`}
              onPointerDown={handleResizeStart}
              type="button"
            >
              <span className="markdown-editor__resize-line" />
            </button>
            <section className="markdown-editor__pane markdown-editor__pane--preview">
              <div className="markdown-editor__pane-header">
                <span className="status-pill subtle">Markdown preview</span>
              </div>
              <div className="markdown-editor__preview-body" ref={previewBodyRef}>
                <MarkdownContent allowIframeScripts={allowIframeScripts} contentScale={previewContentScale} markdown={markdown} noteSourcePath={noteSourcePath} useSandboxFrame />
              </div>
            </section>
          </>
        ) : null}
      </div>
      {saveError ? <p className="markdown-editor__error">{saveError}</p> : null}
    </div>
  );
}