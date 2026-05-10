/// <reference path="./node-test-shims.d.ts" />

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("mermaid diagrams expose a zoom viewer with adjustable controls", async () => {
  const mermaidDiagramSource = await readFile(new URL("../src/components/markdown/MermaidDiagram.tsx", import.meta.url), "utf8");
  const stylesheet = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(mermaidDiagramSource, /const DEFAULT_ZOOM_PERCENT = 160;/);
  assert.match(mermaidDiagramSource, /const WHEEL_ZOOM_STEP = 10;/);
  assert.match(mermaidDiagramSource, /const \[isZoomViewerOpen, setIsZoomViewerOpen\] = useState\(false\);/);
  assert.match(mermaidDiagramSource, /const \[isPanningViewer, setIsPanningViewer\] = useState\(false\);/);
  assert.match(mermaidDiagramSource, /aria-label="Zoom diagram"/);
  assert.match(mermaidDiagramSource, /onClick=\{openZoomViewer\}/);
  assert.match(mermaidDiagramSource, /setZoomPercentAroundPoint\(zoomPercent - 20\);/);
  assert.match(mermaidDiagramSource, /setZoomPercentAroundPoint\(zoomPercent \+ 20\);/);
  assert.match(mermaidDiagramSource, /setZoomPercentAroundPoint\(DEFAULT_ZOOM_PERCENT\);/);
  assert.match(mermaidDiagramSource, /event\.button !== 0 \|\| !event\.ctrlKey/);
  assert.match(mermaidDiagramSource, /window\.addEventListener\("mousemove", handleWindowMouseMove\);/);
  assert.match(mermaidDiagramSource, /window\.addEventListener\("mouseup", finishViewerPan\);/);
  assert.match(mermaidDiagramSource, /viewerBody\.scrollLeft = panSession\.startScrollLeft - deltaX;/);
  assert.match(mermaidDiagramSource, /event\.preventDefault\(\);[\s\S]*setZoomPercentAroundPoint\(zoomPercent \+ zoomDelta, event\.clientX, event\.clientY\);/);
  assert.match(mermaidDiagramSource, /role="dialog"[\s\S]*Zoom diagram/);
  assert.match(mermaidDiagramSource, /className="mermaid-diagram__viewer-zoom-value">\{zoomPercent\}%<\/span>/);
  assert.match(mermaidDiagramSource, /className="mini-action" onClick=\{handleZoomReset\} type="button">Reset<\/button>/);
  assert.match(mermaidDiagramSource, /style=\{\{ width: `\$\{zoomPercent\}%` \}\}/);
  assert.match(mermaidDiagramSource, /onMouseDown=\{handleViewerMouseDown\}/);
  assert.match(mermaidDiagramSource, /onWheel=\{handleViewerWheel\}/);

  assert.match(stylesheet, /\.mermaid-diagram__viewer-backdrop\s*\{/);
  assert.match(stylesheet, /\.mermaid-diagram__viewer\s*\{[\s\S]*max-height:\s*min\(88vh, 920px\);/);
  assert.match(stylesheet, /\.mermaid-diagram__viewer-body\s*\{[\s\S]*overflow:\s*auto;/);
  assert.match(stylesheet, /\.mermaid-diagram__viewer-body\.is-panning\s*\{[\s\S]*cursor:\s*grabbing;/);
  assert.match(stylesheet, /\.mermaid-diagram__viewer-body\.is-panning \*\s*\{[\s\S]*cursor:\s*grabbing;/);
  assert.match(stylesheet, /\.mermaid-diagram__viewer-canvas svg\s*\{[\s\S]*max-width:\s*none;/);
});