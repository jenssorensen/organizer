import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

export function resolveNoteAssetUrl(src: string, noteSourcePath: string | undefined): string {
  if (!src || !noteSourcePath) return src;
  if (/^https?:\/\/|^data:/i.test(src)) return src;
  if (src.startsWith("/") || src.startsWith("#")) return src;

  let decoded = src;
  try { decoded = decodeURIComponent(src); } catch {}
  const normalizedSrc = decoded.replace(/\\/g, "/").replace(/^\.\//, "");

  const noteDir = noteSourcePath.includes("/")
    ? noteSourcePath.slice(0, noteSourcePath.lastIndexOf("/"))
    : "";
  const assetPath = noteDir ? `${noteDir}/${normalizedSrc}` : normalizedSrc;
  return `/api/docs/file?path=${encodeURIComponent(assetPath)}`;
}

function getNotePreviewExtension(noteSourcePath?: string) {
  const fileName = noteSourcePath?.split("/").pop() ?? "";
  const extensionMatch = fileName.match(/\.[^.]+$/);
  return extensionMatch ? extensionMatch[0].toLowerCase() : ".md";
}

export function getNotePreviewKind(noteSourcePath?: string) {
  const extension = getNotePreviewExtension(noteSourcePath);

  if (extension === ".html" || extension === ".mhtml" || extension === ".txt") {
    return "document";
  }

  return "markdown";
}

export function buildSandboxFrameMarkup(bodyClassName: string) {
  return `<!doctype html><html><head><meta charset="utf-8" /><base target="_blank" /></head><body class="${bodyClassName}"><div id="organizer-sandbox-root"></div></body></html>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function decodeQuotedPrintable(value: string) {
  return value
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
}

function decodeBase64ToUtf8(value: string) {
  if (typeof atob !== "function") {
    return value;
  }

  const binary = atob(value.replace(/\s+/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));

  if (typeof TextDecoder === "function") {
    return new TextDecoder("utf-8").decode(bytes);
  }

  return binary;
}

function decodeMhtmlPartBody(headers: string, body: string) {
  const transferEncoding = headers.match(/content-transfer-encoding:\s*([^\r\n;]+)/i)?.[1]?.trim().toLowerCase();
  const trimmedBody = body.trim();

  if (transferEncoding === "quoted-printable") {
    return decodeQuotedPrintable(trimmedBody);
  }

  if (transferEncoding === "base64") {
    return decodeBase64ToUtf8(trimmedBody);
  }

  return trimmedBody;
}

function extractHtmlFromMhtml(mhtml: string) {
  const boundary = mhtml.match(/boundary="?([^";\r\n]+)"?/i)?.[1];
  if (!boundary) {
    return "";
  }

  const parts = mhtml.split(`--${boundary}`);
  for (const part of parts) {
    if (!/content-type:\s*text\/html/i.test(part)) {
      continue;
    }

    const splitIndex = part.search(/\r?\n\r?\n/);
    if (splitIndex === -1) {
      continue;
    }

    const headers = part.slice(0, splitIndex);
    const body = part.slice(splitIndex).replace(/^\r?\n\r?\n/, "");
    return decodeMhtmlPartBody(headers, body);
  }

  return "";
}

function buildPlainTextPreviewSrcDoc(content: string) {
  return `<!doctype html><html><head><meta charset="utf-8" /><base target="_blank" /><style>body{margin:0;padding:24px;font:14px/1.6 Consolas, "Courier New", monospace;background:#0f1720;color:#e6edf3;}pre{white-space:pre-wrap;word-break:break-word;margin:0;}</style></head><body><pre>${escapeHtml(content)}</pre></body></html>`;
}

function sanitizePreviewHtmlDocument(html: string, noteSourcePath?: string) {
  if (typeof DOMParser !== "function") {
    return buildPlainTextPreviewSrcDoc(html);
  }

  const previewDocument = new DOMParser().parseFromString(html, "text/html");

  previewDocument.querySelectorAll("script, noscript, object, embed").forEach((node) => node.remove());

  for (const element of Array.from(previewDocument.querySelectorAll("*"))) {
    for (const attribute of Array.from(element.attributes)) {
      if (/^on/i.test(attribute.name)) {
        element.removeAttribute(attribute.name);
      }
    }
  }

  const head = previewDocument.head ?? previewDocument.createElement("head");
  if (!previewDocument.head) {
    previewDocument.documentElement.prepend(head);
  }

  head.querySelectorAll("base").forEach((node) => node.remove());
  const baseElement = previewDocument.createElement("base");
  baseElement.target = "_blank";
  head.prepend(baseElement);

  for (const element of Array.from(previewDocument.querySelectorAll("[src], [href]"))) {
    if (element.hasAttribute("src")) {
      element.setAttribute("src", resolveNoteAssetUrl(element.getAttribute("src") ?? "", noteSourcePath));
    }

    const tagName = element.tagName.toLowerCase();
    if (element.hasAttribute("href") && (tagName === "a" || tagName === "link")) {
      element.setAttribute("href", resolveNoteAssetUrl(element.getAttribute("href") ?? "", noteSourcePath));
    }
  }

  return `<!doctype html>${previewDocument.documentElement.outerHTML}`;
}

export function buildDocumentPreviewSrcDoc(content: string, noteSourcePath?: string) {
  const extension = getNotePreviewExtension(noteSourcePath);

  if (extension === ".txt") {
    return buildPlainTextPreviewSrcDoc(content);
  }

  if (extension === ".mhtml") {
    const html = extractHtmlFromMhtml(content);
    return sanitizePreviewHtmlDocument(html || content, noteSourcePath);
  }

  return sanitizePreviewHtmlDocument(content, noteSourcePath);
}

function cloneStylesIntoFrame(frameDocument: Document) {
  if (frameDocument.head.querySelector("[data-organizer-frame-styles='true']")) {
    return;
  }

  const marker = frameDocument.createElement("meta");
  marker.setAttribute("data-organizer-frame-styles", "true");
  frameDocument.head.appendChild(marker);

  for (const node of Array.from(document.head.querySelectorAll("style, link[rel='stylesheet']"))) {
    if (node instanceof HTMLStyleElement) {
      const style = frameDocument.createElement("style");
      style.textContent = node.textContent;
      frameDocument.head.appendChild(style);
      continue;
    }

    if (node instanceof HTMLLinkElement && node.href) {
      const link = frameDocument.createElement("link");
      link.rel = "stylesheet";
      link.href = node.href;
      frameDocument.head.appendChild(link);
    }
  }
}

export function SandboxedPreviewFrame({
  className,
  contentRef,
  frameTitle,
  frameSrc,
  frameSrcDoc,
  allowScripts = false,
  portalContent,
}: {
  className: string;
  contentRef?: RefObject<HTMLDivElement | null>;
  frameTitle: string;
  frameSrc?: string;
  frameSrcDoc?: string;
  allowScripts?: boolean;
  portalContent?: ReactNode;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || frameSrc) {
      setPortalRoot(null);
      return;
    }

    const frameDocument = iframe.contentDocument;
    if (!frameDocument) {
      return;
    }

    frameDocument.open();
    frameDocument.write(frameSrcDoc ?? buildSandboxFrameMarkup("markdown-body markdown-body--frame"));
    frameDocument.close();
    cloneStylesIntoFrame(frameDocument);
    setPortalRoot(frameDocument.getElementById("organizer-sandbox-root"));
  }, [frameSrc, frameSrcDoc]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) {
      return;
    }

    let resizeObserver: ResizeObserver | null = null;
    let mutationObserver: MutationObserver | null = null;
    let cleanupImageListeners: (() => void) | null = null;

    const syncFrameHeight = () => {
      const frameDocument = iframe.contentDocument;
      if (!frameDocument) {
        return;
      }

      const root = frameDocument.getElementById("organizer-sandbox-root") ?? frameDocument.body;
      const nextHeight = Math.max(
        root.scrollHeight,
        frameDocument.body.scrollHeight,
        frameDocument.documentElement.scrollHeight,
        1,
      );
      iframe.style.height = `${nextHeight}px`;
    };

    const disconnectObservers = () => {
      resizeObserver?.disconnect();
      resizeObserver = null;
      mutationObserver?.disconnect();
      mutationObserver = null;
      cleanupImageListeners?.();
      cleanupImageListeners = null;
    };

    const observeFrameContent = () => {
      const frameDocument = iframe.contentDocument;
      if (!frameDocument) {
        return;
      }

      if (frameSrc) {
        cloneStylesIntoFrame(frameDocument);
      }

      disconnectObservers();
      syncFrameHeight();

      const scheduleHeightSync = () => {
        window.requestAnimationFrame(syncFrameHeight);
      };

      if (typeof ResizeObserver !== "undefined") {
        const resizeTargets = [
          frameDocument.getElementById("organizer-sandbox-root"),
          frameDocument.body,
          frameDocument.documentElement,
        ].filter((target): target is HTMLElement => Boolean(target));
        resizeObserver = new ResizeObserver(() => syncFrameHeight());
        for (const resizeTarget of resizeTargets) {
          resizeObserver.observe(resizeTarget);
        }
      }

      if (typeof MutationObserver !== "undefined") {
        mutationObserver = new MutationObserver(() => scheduleHeightSync());
        mutationObserver.observe(frameDocument.documentElement, {
          attributes: true,
          characterData: true,
          childList: true,
          subtree: true,
        });
      }

      const pendingImages = Array.from(frameDocument.images).filter((image) => !image.complete);
      if (pendingImages.length > 0) {
        const handleImageLoad = () => scheduleHeightSync();
        for (const image of pendingImages) {
          image.addEventListener("load", handleImageLoad);
          image.addEventListener("error", handleImageLoad);
        }
        cleanupImageListeners = () => {
          for (const image of pendingImages) {
            image.removeEventListener("load", handleImageLoad);
            image.removeEventListener("error", handleImageLoad);
          }
        };
      }
    };

    iframe.addEventListener("load", observeFrameContent);
    window.requestAnimationFrame(observeFrameContent);

    return () => {
      iframe.removeEventListener("load", observeFrameContent);
      disconnectObservers();
    };
  }, [frameSrc, portalRoot, portalContent]);

  return (
    <div className={className} ref={contentRef}>
      <iframe
        className="markdown-body__sandbox-frame"
        ref={iframeRef}
        sandbox={[
          "allow-downloads",
          "allow-popups",
          "allow-popups-to-escape-sandbox",
          "allow-same-origin",
          allowScripts ? "allow-scripts" : "",
        ].filter(Boolean).join(" ")}
        src={frameSrc}
        srcDoc={frameSrc ? undefined : frameSrcDoc}
        title={frameTitle}
      />
      {portalRoot && portalContent ? createPortal(portalContent, portalRoot) : null}
    </div>
  );
}