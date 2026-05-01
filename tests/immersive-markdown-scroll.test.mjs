import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("immersive markdown keeps its own viewport scroll container", async () => {
  const stylesheet = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(stylesheet, /\.app-shell--immersive\s*\{[\s\S]*?height:\s*100dvh;/);

  assert.match(
    stylesheet,
    /\.note-detail-panel\.is-immersive\s*\{[\s\S]*?display:\s*flex;[\s\S]*?flex-direction:\s*column;[\s\S]*?min-height:\s*100%;/,
  );

  assert.match(
    stylesheet,
    /\.markdown-body\.is-immersive\s*\{[\s\S]*?flex:\s*1;[\s\S]*?min-height:\s*0;[\s\S]*?height:\s*100%;[\s\S]*?overflow:\s*auto;/,
  );

  assert.doesNotMatch(stylesheet, /\.markdown-body\.is-immersive\s*\{[\s\S]*?height:\s*calc\(100dvh - 236px\);/);
});
