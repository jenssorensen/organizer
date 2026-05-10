import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import mermaid from "mermaid";
import { Check, Copy } from "lucide-react";

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
  const [pngSizeMenuOpen, setPngSizeMenuOpen] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<"idle" | "text" | "image" | "svg">("idle");
  const [copyMenuPosition, setCopyMenuPosition] = useState({ top: 0, left: 0 });
  const [pngSubmenuPosition, setPngSubmenuPosition] = useState({ top: 0, left: 0 });
  const copyTriggerRef = useRef<HTMLButtonElement>(null);
  const copyMenuRef = useRef<HTMLDivElement>(null);
  const pngMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const pngSubmenuRef = useRef<HTMLDivElement>(null);
  const pngSubmenuCloseTimeoutRef = useRef<number | null>(null);

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
            ref={copyTriggerRef}
            aria-label={copyFeedback === "idle" ? "Copy diagram" : copyFeedback === "text" ? "Copied text" : copyFeedback === "image" ? "Copied image" : "Saved SVG"}
            className="mini-action mermaid-diagram__copy-trigger"
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
    </>
  );
}