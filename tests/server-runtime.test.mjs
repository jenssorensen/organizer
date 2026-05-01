import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("server binds explicitly to loopback for local dev", async () => {
  const source = await readFile(new URL("../server/server.mjs", import.meta.url), "utf8");

  assert.match(source, /server\.listen\(port,\s*"127\.0\.0\.1"/);
});
