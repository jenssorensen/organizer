import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import mermaid from "mermaid";
import { Check, Copy, Maximize2, Minus, Plus, X } from "lucide-react";

const DEFAULT_ZOOM_PERCENT = 160;
const WHEEL_ZOOM_STEP = 10;
const MIN_ZOOM_PERCENT = 100;
const MAX_ZOOM_PERCENT = 300;

function hashString(value: string) {
  let hash = 0;

  for (const character of value) {
    hash = (hash * 31 + character.codePointAt(0)!) >>> 0;
  }

  return hash.toString(36);
}

export function MermaidDiagram({ chart, theme }: { chart: string; theme: "dark" | "light" }) {
  const renderId = useId().replace(/:/g, "");
  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);
  const [isZoomViewerOpen, setIsZoomViewerOpen] = useState(false);
  const [isPanningViewer, setIsPanningViewer] = useState(false);
  const [pngSizeMenuOpen, setPngSizeMenuOpen] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<"idle" | "text" | "image" | "svg">("idle");
  const [zoomPercent, setZoomPercent] = useState(DEFAULT_ZOOM_PERCENT);
  const [copyMenuPosition, setCopyMenuPosition] = useState({ top: 0, left: 0 });
  const [pngSubmenuPosition, setPngSubmenuPosition] = useState({ top: 0, left: 0 });
  const copyTriggerRef = useRef<HTMLButtonElement>(null);
  const copyMenuRef = useRef<HTMLDivElement>(null);
  const pngMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const pngSubmenuRef = useRef<HTMLDivElement>(null);
  const pngSubmenuCloseTimeoutRef = useRef<number | null>(null);
  const zoomViewerBodyRef = useRef<HTMLDivElement>(null);
  const panSessionRef = useRef<{
    startClientX: number;
    startClientY: number;
    startScrollLeft: number;
    startScrollTop: number;
  } | null>(null);

  function getFloatingMenuPosition(anchor: HTMLElement, xOffset = 0, yOffset = 6) {
    const rect = anchor.getBoundingClientRect();
    return {
      top: Math.round(rect.bottom + yOffset),
      left: Math.round(rect.left + xOffset),
    };
  }

  function getDiagramFileBaseName() {
    return `mermaid-${hashString(chart).slice(0, 8)}`;
  }

  async function renderPngBlob(size: "small" | "medium" | "large" | "xlarge") {
    if (!svg) {
      return null;
    }

    const maxEdgeBySize: Record<"small" | "medium" | "large" | "xlarge", number> = {
      small: 512,
      medium: 1024,
      large: 2048,
      xlarge: 4096,
    };

    const source = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(source);

    try {
      const image = new Image();
      const loaded = await new Promise<HTMLImageElement>((resolve, reject) => {
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Unable to load diagram image"));
        image.src = svgUrl;
      });

      const canvas = document.createElement("canvas");
      const baseWidth = Math.max(1, Math.ceil(loaded.naturalWidth || loaded.width || 1));
      const baseHeight = Math.max(1, Math.ceil(loaded.naturalHeight || loaded.height || 1));
      const maxDimension = 8192;
      const longestEdge = Math.max(baseWidth, baseHeight);
      const targetLongestEdge = maxEdgeBySize[size];
      const scale = targetLongestEdge / longestEdge;

      canvas.width = Math.min(maxDimension, Math.max(1, Math.round(baseWidth * scale)));
      canvas.height = Math.min(maxDimension, Math.max(1, Math.round(baseHeight * scale)));

      const context = canvas.getContext("2d");
      if (!context) {
        return null;
      }

      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(loaded, 0, 0, canvas.width, canvas.height);

      return await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((blob) => resolve(blob), "image/png");
      });
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
  }

  async function copyDiagramText() {
    try {
      await navigator.clipboard.writeText(chart);
      setCopyFeedback("text");
      window.setTimeout(() => setCopyFeedback("idle"), 1200);
      setCopyMenuOpen(false);
      setPngSizeMenuOpen(false);
    } catch {
      setCopyFeedback("idle");
    }
  }

  async function copyDiagramPng(size: "small" | "medium" | "large" | "xlarge") {
    const pngBlob = await renderPngBlob(size);
    if (!pngBlob || !window.ClipboardItem) {
      return;
    }

    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "image/png": pngBlob,
        }),
      ]);

      setCopyFeedback("image");
      window.setTimeout(() => setCopyFeedback("idle"), 1200);
      setCopyMenuOpen(false);
      setPngSizeMenuOpen(false);
    } catch {
      setCopyFeedback("idle");
    }
  }

  function saveDiagramSvg() {
    if (!svg) {
      return;
    }

    const source = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(source);
    const link = document.createElement("a");
    link.href = svgUrl;
    link.download = `${getDiagramFileBaseName()}.svg`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(svgUrl);

    setCopyFeedback("svg");
    window.setTimeout(() => setCopyFeedback("idle"), 1200);
    setCopyMenuOpen(false);
    setPngSizeMenuOpen(false);
  }

  function closePngSubmenuSoon() {
    if (pngSubmenuCloseTimeoutRef.current) {
      window.clearTimeout(pngSubmenuCloseTimeoutRef.current);
    }
    pngSubmenuCloseTimeoutRef.current = window.setTimeout(() => {
      setPngSizeMenuOpen(false);
      pngSubmenuCloseTimeoutRef.current = null;
    }, 120);
  }

  function cancelPngSubmenuClose() {
    if (pngSubmenuCloseTimeoutRef.current) {
      window.clearTimeout(pngSubmenuCloseTimeoutRef.current);
      pngSubmenuCloseTimeoutRef.current = null;
    }
  }

  function openPngSubmenu() {
    cancelPngSubmenuClose();
    setPngSizeMenuOpen(true);
    if (pngMenuTriggerRef.current) {
      const rect = pngMenuTriggerRef.current.getBoundingClientRect();
      setPngSubmenuPosition({ top: Math.round(rect.top), left: Math.round(rect.right + 6) });
    }
  }

  function openZoomViewer() {
    setZoomPercent(DEFAULT_ZOOM_PERCENT);
    setCopyMenuOpen(false);
    setPngSizeMenuOpen(false);
    setIsZoomViewerOpen(true);
  }

  function closeZoomViewer() {
    setIsZoomViewerOpen(false);
    setIsPanningViewer(false);
    panSessionRef.current = null;
  }

  function setZoomPercentAroundPoint(nextZoomPercent: number, anchorClientX?: number, anchorClientY?: number) {
    const boundedZoomPercent = Math.min(MAX_ZOOM_PERCENT, Math.max(MIN_ZOOM_PERCENT, nextZoomPercent));
    const zoomViewerBody = zoomViewerBodyRef.current;

    if (boundedZoomPercent === zoomPercent) {
      return;
    }

    if (zoomViewerBody) {
      const rect = zoomViewerBody.getBoundingClientRect();
      const viewportX = anchorClientX === undefined ? zoomViewerBody.clientWidth / 2 : anchorClientX - rect.left;
      const viewportY = anchorClientY === undefined ? zoomViewerBody.clientHeight / 2 : anchorClientY - rect.top;
      const contentX = zoomViewerBody.scrollLeft + viewportX;
      const contentY = zoomViewerBody.scrollTop + viewportY;
      const zoomRatio = boundedZoomPercent / zoomPercent;

      setZoomPercent(boundedZoomPercent);
      window.requestAnimationFrame(() => {
        const viewerBody = zoomViewerBodyRef.current;
        if (!viewerBody) {
          return;
        }
        viewerBody.scrollLeft = Math.max(0, contentX * zoomRatio - viewportX);
        viewerBody.scrollTop = Math.max(0, contentY * zoomRatio - viewportY);
      });
      return;
    }

    setZoomPercent(boundedZoomPercent);
  }

  function handleZoomOut() {
    setZoomPercentAroundPoint(zoomPercent - 20);
  }

  function handleZoomIn() {
    setZoomPercentAroundPoint(zoomPercent + 20);
  }

  function handleZoomReset() {
    setZoomPercentAroundPoint(DEFAULT_ZOOM_PERCENT);
  }

  function handleViewerWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();

    const zoomDelta = event.deltaY < 0 ? WHEEL_ZOOM_STEP : -WHEEL_ZOOM_STEP;
    setZoomPercentAroundPoint(zoomPercent + zoomDelta, event.clientX, event.clientY);
  }

  function handleViewerMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    if (event.button !== 0 || !event.ctrlKey) {
      return;
    }

    event.preventDefault();
    panSessionRef.current = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      startScrollLeft: event.currentTarget.scrollLeft,
      startScrollTop: event.currentTarget.scrollTop,
    };
    setIsPanningViewer(true);
  }

  useEffect(() => {
    if (!copyMenuOpen) {
      return;
    }

    function updateCopyMenuPosition() {
      const trigger = copyTriggerRef.current;
      if (!trigger) {
        return;
      }
      setCopyMenuPosition(getFloatingMenuPosition(trigger));
    }

    updateCopyMenuPosition();
    window.addEventListener("resize", updateCopyMenuPosition);
    window.addEventListener("scroll", updateCopyMenuPosition, true);

    return () => {
      window.removeEventListener("resize", updateCopyMenuPosition);
      window.removeEventListener("scroll", updateCopyMenuPosition, true);
    };
  }, [copyMenuOpen]);

  useEffect(() => {
    if (!isZoomViewerOpen) {
      return;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsZoomViewerOpen(false);
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isZoomViewerOpen]);

  useEffect(() => {
    if (isZoomViewerOpen) {
      return;
    }

    setIsPanningViewer(false);
    panSessionRef.current = null;
  }, [isZoomViewerOpen]);

  useEffect(() => {
    if (!isPanningViewer) {
      return;
    }

    function handleWindowMouseMove(event: MouseEvent) {
      const panSession = panSessionRef.current;
      const viewerBody = zoomViewerBodyRef.current;
      if (!panSession || !viewerBody) {
        return;
      }

      const deltaX = event.clientX - panSession.startClientX;
      const deltaY = event.clientY - panSession.startClientY;
      viewerBody.scrollLeft = panSession.startScrollLeft - deltaX;
      viewerBody.scrollTop = panSession.startScrollTop - deltaY;
    }

    function finishViewerPan() {
      panSessionRef.current = null;
      setIsPanningViewer(false);
    }

    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", finishViewerPan);
    window.addEventListener("blur", finishViewerPan);

    return () => {
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", finishViewerPan);
      window.removeEventListener("blur", finishViewerPan);
    };
  }, [isPanningViewer]);

  useEffect(() => {
    return () => {
      if (pngSubmenuCloseTimeoutRef.current) {
        window.clearTimeout(pngSubmenuCloseTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!pngSizeMenuOpen) {
      return;
    }

    function updateSubmenuPosition() {
      const trigger = pngMenuTriggerRef.current;
      if (!trigger) {
        return;
      }
      const rect = trigger.getBoundingClientRect();
      setPngSubmenuPosition({
        top: Math.round(rect.top),
        left: Math.round(rect.right + 6),
      });
    }

    updateSubmenuPosition();
    window.addEventListener("resize", updateSubmenuPosition);
    window.addEventListener("scroll", updateSubmenuPosition, true);

    return () => {
      window.removeEventListener("resize", updateSubmenuPosition);
      window.removeEventListener("scroll", updateSubmenuPosition, true);
    };
  }, [pngSizeMenuOpen]);

  useEffect(() => {
    if (!copyMenuOpen) {
      return;
    }

    function handleOutsidePointer(event: MouseEvent) {
      const target = event.target as Node;
      const withinTrigger = copyTriggerRef.current?.contains(target);
      const withinMenu = copyMenuRef.current?.contains(target);
      const withinSubmenu = pngSubmenuRef.current?.contains(target);

      if (!withinTrigger && !withinMenu && !withinSubmenu) {
        setCopyMenuOpen(false);
        setPngSizeMenuOpen(false);
      }
    }

    window.addEventListener("mousedown", handleOutsidePointer);
    return () => {
      window.removeEventListener("mousedown", handleOutsidePointer);
    };
  }, [copyMenuOpen]);

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      try {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "loose",
          theme: theme === "dark" ? "dark" : "default",
        });

        const { svg: renderedSvg } = await mermaid.render(`mermaid-${renderId}-${hashString(chart)}`, chart);

        if (!cancelled) {
          setSvg(renderedSvg);
          setError(null);
        }
      } catch (renderError) {
        if (!cancelled) {
          setError(renderError instanceof Error ? renderError.message : "Unable to render mermaid diagram");
          setSvg("");
        }
      }
    }

    void renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [chart, renderId, theme]);

  if (error) {
    return (
      <div className="mermaid-diagram mermaid-diagram--error">
        <p>Mermaid render failed: {error}</p>
        <pre>{chart}</pre>
      </div>
    );
  }

  if (!svg) {
    return <div className="mermaid-diagram mermaid-diagram--loading">Rendering diagram...</div>;
  }

  return (
    <>
      <div className="mermaid-diagram">
        <div className="mermaid-diagram__copy-actions">
          <button
            aria-label="Zoom diagram"
            className="mini-action mermaid-diagram__action-button"
            onClick={openZoomViewer}
            title="Zoom"
            type="button"
          >
            <Maximize2 size={14} />
            Zoom
          </button>
          <button
            ref={copyTriggerRef}
            aria-label={copyFeedback === "idle" ? "Copy diagram" : copyFeedback === "text" ? "Copied text" : copyFeedback === "image" ? "Copied image" : "Saved SVG"}
            className="mini-action mermaid-diagram__action-button mermaid-diagram__copy-trigger"
            onClick={() => {
              setCopyMenuOpen((current) => {
                const next = !current;
                if (next && copyTriggerRef.current) {
                  setCopyMenuPosition(getFloatingMenuPosition(copyTriggerRef.current));
                }
                return next;
              });
              setPngSizeMenuOpen(false);
            }}
            title={copyFeedback === "idle" ? "Copy" : copyFeedback === "text" ? "Copied text" : copyFeedback === "image" ? "Copied image" : "Saved SVG"}
            type="button"
          >
            {copyFeedback === "idle" ? <Copy size={14} /> : <Check size={14} />}
            {copyFeedback === "idle" ? "Copy" : copyFeedback === "svg" ? "Saved" : "Copied"}
          </button>
        </div>
        <div dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
      {copyMenuOpen && typeof document !== "undefined" ? createPortal(
        <div
          className="mermaid-diagram__copy-menu mermaid-diagram__copy-menu--floating"
          ref={copyMenuRef}
          role="menu"
          style={{ left: copyMenuPosition.left, top: copyMenuPosition.top }}
        >
          <button className="mermaid-diagram__copy-option" onClick={() => void copyDiagramText()} role="menuitem" type="button">Copy Text</button>
          <div className="mermaid-diagram__copy-option-row">
            <button
              className="mermaid-diagram__copy-option mermaid-diagram__copy-option--submenu"
              onFocus={openPngSubmenu}
              onMouseEnter={openPngSubmenu}
              onMouseLeave={closePngSubmenuSoon}
              ref={pngMenuTriggerRef}
              role="menuitem"
              type="button"
            >
              <span>Copy PNG</span>
              <span aria-hidden="true">▸</span>
            </button>
          </div>
          <button className="mermaid-diagram__copy-option" onClick={() => saveDiagramSvg()} role="menuitem" type="button">Save as SVG</button>
        </div>,
        document.body,
      ) : null}
      {copyMenuOpen && pngSizeMenuOpen && typeof document !== "undefined" ? createPortal(
        <div
          className="mermaid-diagram__copy-submenu mermaid-diagram__copy-submenu--floating"
          ref={pngSubmenuRef}
          onMouseEnter={cancelPngSubmenuClose}
          onMouseLeave={() => setPngSizeMenuOpen(false)}
          role="menu"
          style={{ left: pngSubmenuPosition.left, top: pngSubmenuPosition.top }}
        >
          <button className="mermaid-diagram__copy-option" onClick={() => void copyDiagramPng("small")} role="menuitem" type="button">Small</button>
          <button className="mermaid-diagram__copy-option" onClick={() => void copyDiagramPng("medium")} role="menuitem" type="button">Medium</button>
          <button className="mermaid-diagram__copy-option" onClick={() => void copyDiagramPng("large")} role="menuitem" type="button">Large</button>
          <button className="mermaid-diagram__copy-option" onClick={() => void copyDiagramPng("xlarge")} role="menuitem" type="button">X-large</button>
        </div>,
        document.body,
      ) : null}
      {isZoomViewerOpen && typeof document !== "undefined" ? createPortal(
        <div
          className="mermaid-diagram__viewer-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeZoomViewer();
            }
          }}
          role="presentation"
        >
          <div
            aria-labelledby={`${renderId}-zoom-title`}
            aria-modal="true"
            className="mermaid-diagram__viewer"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="mermaid-diagram__viewer-header">
              <div>
                <p className="eyebrow">Diagram viewer</p>
                <h3 id={`${renderId}-zoom-title`}>Zoom diagram</h3>
              </div>
              <div className="mermaid-diagram__viewer-controls">
                <button aria-label="Zoom out" className="icon-action" onClick={handleZoomOut} type="button">
                  <Minus size={16} />
                </button>
                <span className="mermaid-diagram__viewer-zoom-value">{zoomPercent}%</span>
                <button aria-label="Zoom in" className="icon-action" onClick={handleZoomIn} type="button">
                  <Plus size={16} />
                </button>
                <button className="mini-action" onClick={handleZoomReset} type="button">Reset</button>
                <button aria-label="Close zoom viewer" className="icon-action" onClick={closeZoomViewer} type="button">
                  <X size={16} />
                </button>
              </div>
            </div>
            <div
              className={`mermaid-diagram__viewer-body ${isPanningViewer ? "is-panning" : ""}`.trim()}
              onMouseDown={handleViewerMouseDown}
              onWheel={handleViewerWheel}
              ref={zoomViewerBodyRef}
            >
              <div
                className="mermaid-diagram__viewer-canvas"
                dangerouslySetInnerHTML={{ __html: svg }}
                style={{ width: `${zoomPercent}%` }}
              />
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}