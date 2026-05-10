import { Eye, EyeOff, Minus, Plus, Save, SplitSquareHorizontal, SplitSquareVertical, X } from "lucide-react";

export function MarkdownEditorChrome({
  canSave,
  onClose,
  onSave,
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
  canSave: boolean;
  onClose: () => void;
  onSave: () => void;
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
      <div className="markdown-body__toolbar-side">
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
      </div>
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
  );
}