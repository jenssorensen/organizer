import { ChevronLeft, ChevronRight, Eye, EyeOff, History, Maximize2, Minus, Plus, Save, SplitSquareHorizontal, SplitSquareVertical, X } from "lucide-react";

export function MarkdownEditorChrome({
  canGoBack,
  canGoForward,
  canSave,
  contextLabel,
  focusCurrentBlockOnly,
  isImmersive,
  isRevisionDiffOpen,
  onClose,
  onEnterImmersive,
  onGoBack,
  onGoForward,
  onSave,
  onToggleFocusCurrentBlock,
  onToggleRevisionDiff,
  onTogglePreview,
  onTogglePreviewLayout,
  onZoomIn,
  onZoomOut,
  previewContentScale,
  previewLayout,
  saveState,
  setShowPreview,
  showPreview,
}: {
  canGoBack?: boolean;
  canGoForward?: boolean;
  canSave: boolean;
  contextLabel?: string;
  focusCurrentBlockOnly: boolean;
  isImmersive: boolean;
  isRevisionDiffOpen: boolean;
  onClose: () => void;
  onEnterImmersive?: () => void;
  onGoBack?: () => void;
  onGoForward?: () => void;
  onSave: () => void;
  onToggleFocusCurrentBlock: () => void;
  onToggleRevisionDiff: () => void;
  onTogglePreview?: () => void;
  onTogglePreviewLayout?: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  previewContentScale: number;
  previewLayout: "below" | "side-by-side";
  saveState: "idle" | "saving" | "saved" | "error";
  setShowPreview: (value: boolean | ((current: boolean) => boolean)) => void;
  showPreview: boolean;
}) {
  return (
    <div className="markdown-body__toolbar markdown-editor__toolbar">
      {onGoBack || onGoForward ? (
        <div aria-label="Navigation history" className="history-rail markdown-editor__history" role="group">
          <button
            aria-label="Go back"
            className="history-action"
            disabled={!canGoBack || saveState === "saving"}
            onClick={onGoBack}
            type="button"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            aria-label="Go forward"
            className="history-action"
            disabled={!canGoForward || saveState === "saving"}
            onClick={onGoForward}
            type="button"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      ) : null}
      {contextLabel ? (
        <div className="markdown-body__toolbar-side markdown-editor__toolbar-context">
          <span className="markdown-editor__toolbar-context-text" title={contextLabel}>{contextLabel}</span>
        </div>
      ) : null}
      <div className="markdown-body__toolbar-side markdown-editor__toolbar-trailing">
        <div className="markdown-body__toolbar-side markdown-editor__toolbar-primary">
          <button
            aria-label={showPreview ? "Hide preview" : "Show preview"}
            className="mini-action"
            disabled={saveState === "saving"}
            onClick={onTogglePreview ?? (() => setShowPreview((current) => !current))}
            title={showPreview ? "Hide preview" : "Show preview"}
            type="button"
          >
            {showPreview ? <EyeOff size={16} /> : <Eye size={16} />}
            {showPreview ? "Hide preview" : "Show preview"}
          </button>
          <button
            aria-label={previewLayout === "side-by-side" ? "Below preview" : "Side by side"}
            className="mini-action"
            disabled={saveState === "saving" || !showPreview}
            onClick={onTogglePreviewLayout ?? (() => undefined)}
            title={previewLayout === "side-by-side" ? "Switch to below preview" : "Switch to side-by-side preview"}
            type="button"
          >
            {previewLayout === "side-by-side" ? <SplitSquareVertical size={16} /> : <SplitSquareHorizontal size={16} />}
            {previewLayout === "side-by-side" ? "Below preview" : "Side by side"}
          </button>
          <button
            aria-label={isRevisionDiffOpen ? "Hide revision diff" : "Show revision diff"}
            className="mini-action"
            disabled={saveState === "saving"}
            onClick={onToggleRevisionDiff}
            title={isRevisionDiffOpen ? "Hide revision diff" : "Show revision diff"}
            type="button"
          >
            <History size={16} />
            {isRevisionDiffOpen ? "Hide diff" : "Revision diff"}
          </button>
          <button
            aria-label={focusCurrentBlockOnly ? "Show full preview" : "Focus current block"}
            className="mini-action"
            disabled={saveState === "saving" || !showPreview || isRevisionDiffOpen}
            onClick={onToggleFocusCurrentBlock}
            title={focusCurrentBlockOnly ? "Show full preview" : "Focus current block"}
            type="button"
          >
            {focusCurrentBlockOnly ? "Full preview" : "Focus block"}
          </button>
        </div>
        <span aria-hidden="true" className="markdown-editor__toolbar-divider" />
        <div className="markdown-body__toolbar-side markdown-editor__toolbar-actions">
          <div className={`markdown-body__toolbar-side ${showPreview ? "" : "is-disabled"}`.trim()}>
            <button
              aria-label="Zoom out"
              className="icon-action markdown-body__zoom"
              disabled={saveState === "saving" || !showPreview}
              onClick={onZoomOut}
              title="Zoom out"
              type="button"
            >
              <Minus size={16} />
            </button>
            <span className="markdown-body__zoom-value">{previewContentScale}%</span>
            <button
              aria-label="Zoom in"
              className="icon-action markdown-body__zoom"
              disabled={saveState === "saving" || !showPreview}
              onClick={onZoomIn}
              title="Zoom in"
              type="button"
            >
              <Plus size={16} />
            </button>
          </div>
          <button
            aria-label="Save note"
            className="icon-action markdown-editor__save"
            disabled={saveState === "saving" || !canSave}
            onClick={onSave}
            title={saveState === "saving" ? "Saving note" : canSave ? "Save note" : "No changes to save"}
            type="button"
          >
            <Save size={16} />
          </button>
          {!isImmersive && onEnterImmersive ? (
            <button
              aria-label="Enter immersive mode"
              className="icon-action"
              disabled={saveState === "saving"}
              onClick={onEnterImmersive}
              title="Enter immersive mode"
              type="button"
            >
              <Maximize2 size={16} />
            </button>
          ) : null}
          <button
            aria-label="Close document"
            className="icon-action markdown-body__close"
            disabled={saveState === "saving"}
            onClick={onClose}
            title="Close document"
            type="button"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}