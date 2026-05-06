import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("server binds explicitly to loopback for local dev", async () => {
  const source = await readFile(new URL("../server/server.mjs", import.meta.url), "utf8");

  assert.match(source, /server\.listen\(port,\s*"127\.0\.0\.1"/);
  assert.match(source, /"\.mhtml": "multipart\/related"/);
  assert.match(source, /"Content-Disposition": getContentDisposition\(absolutePath, contentType\)/);
  assert.match(source, /return `\$\{isInlinePreview \? "inline" : "attachment"\}; filename="\$\{fileName\}"`;/);
  assert.match(source, /"Content-Security-Policy": "sandbox allow-downloads; default-src 'self' data: blob: https: http:; script-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'"/);
  assert.match(source, /"X-Content-Type-Options": "nosniff"/);
  assert.match(source, /function resolveNoteAbsolutePath\(normalizedPath\) \{\s*return resolveNoteAssetAbsolutePath\(normalizedPath\);\s*\}/);
  assert.match(source, /const fileExtension = path\.extname\(normalizedPath\);[\s\S]*title: titleMatch\?\.\[1\] \|\| path\.basename\(normalizedPath, fileExtension\)/);
});
