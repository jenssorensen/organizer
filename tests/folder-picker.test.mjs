import assert from "node:assert/strict";
import test from "node:test";

import { getFolderPickerCommand, parsePickedPaths } from "../server/folderPicker.mjs";

test("getFolderPickerCommand uses AppleScript on macOS", () => {
  const command = getFolderPickerCommand({
    prompt: "Select your documents folder",
    platform: "darwin",
  });

  assert.equal(command.command, "osascript");
  assert.deepEqual(command.args, [
    "-e",
    'set theFolder to choose folder with prompt "Select your documents folder"',
    "-e",
    "return POSIX path of theFolder",
  ]);
});

test("getFolderPickerCommand enables multi-select folder picking on Windows", () => {
  const command = getFolderPickerCommand({
    prompt: "Select folders to import notes from",
    multiple: true,
    platform: "win32",
  });

  assert.equal(command.command, "powershell.exe");
  assert.deepEqual(command.args.slice(0, 5), ["-NoProfile", "-ExecutionPolicy", "Bypass", "-STA", "-EncodedCommand"]);
  const decoded = Buffer.from(command.args[5], "base64").toString("utf16le");
  assert.doesNotMatch(decoded, /`n/);
  assert.match(decoded, /\n\$shell = New-Object -ComObject Shell\.Application/);
  assert.match(decoded, /Shell\.Application/);
  assert.match(decoded, /BrowseForFolder/);
});

test("getFolderPickerCommand uses single-folder Windows picker for metadata selection", () => {
  const command = getFolderPickerCommand({
    prompt: "Select folder for organizer metadata",
    platform: "win32",
  });

  assert.equal(command.command, "powershell.exe");
  assert.deepEqual(command.args.slice(0, 5), ["-NoProfile", "-ExecutionPolicy", "Bypass", "-STA", "-EncodedCommand"]);
  const decoded = Buffer.from(command.args[5], "base64").toString("utf16le");
  assert.doesNotMatch(decoded, /`n/);
  assert.match(decoded, /\n\$shell = New-Object -ComObject Shell\.Application/);
  assert.match(decoded, /Shell\.Application/);
  assert.match(decoded, /BrowseForFolder/);
  assert.match(decoded, /Select folder for organizer metadata/);
});

test("parsePickedPaths trims separators and de-duplicates Windows selections", () => {
  const selectedPaths = parsePickedPaths("C:\\Notes\\\r\nC:\\Notes\r\nD:\\Archive\\\r\n", { platform: "win32" });

  assert.deepEqual(selectedPaths, ["C:\\Notes", "D:\\Archive"]);
});

test("parsePickedPaths preserves the filesystem root", () => {
  const selectedPaths = parsePickedPaths("/\n/Users/test/docs/\n", { platform: "darwin" });

  assert.deepEqual(selectedPaths, ["/", "/Users/test/docs"]);
});