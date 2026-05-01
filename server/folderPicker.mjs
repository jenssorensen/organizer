import { execFile } from "node:child_process";
import path from "node:path";

const PICKER_TIMEOUT_MS = 60_000;

export async function pickFolders({ prompt, multiple = false, platform = process.platform }) {
  const { command, args } = getFolderPickerCommand({ prompt, multiple, platform });
  logPickerInfo(`Launching folder picker on ${platform} (multiple=${multiple})`, {
    prompt,
    command,
    args: summarizeCommandArgs(args),
  });
  const stdout = await runPickerCommand(command, args);
  const selectedPaths = parsePickedPaths(stdout, { platform });

  if (selectedPaths.length === 0) {
    logPickerWarn("Folder picker returned no selections", { prompt, platform, multiple });
    throw new Error("Folder selection was cancelled");
  }

  logPickerInfo(`Folder picker completed with ${selectedPaths.length} selection(s)`, {
    prompt,
    platform,
    multiple,
    selectedPaths,
  });

  return selectedPaths;
}

export function getFolderPickerCommand({ prompt, multiple = false, platform = process.platform }) {
  if (platform === "darwin") {
    return {
      command: "osascript",
      args: buildMacOsPickerArgs(prompt, multiple),
    };
  }

  if (platform === "win32") {
    const script = buildWindowsPickerScript(prompt, multiple);
    const encoded = Buffer.from(script, "utf16le").toString("base64");
    return {
      command: "powershell.exe",
      args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-STA", "-EncodedCommand", encoded],
    };
  }

  throw new Error(`Folder selection is not supported on ${platform}`);
}

export function parsePickedPaths(stdout, { platform = process.platform } = {}) {
  const pathModule = platform === "win32" ? path.win32 : path.posix;
  const selectedPaths = [];
  const seen = new Set();

  for (const line of stdout.split(/\r?\n/)) {
    const normalized = normalizePickedPath(line, pathModule);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    selectedPaths.push(normalized);
  }

  return selectedPaths;
}

function buildMacOsPickerArgs(prompt, multiple) {
  if (multiple) {
    return [
      "-e", `set theFolders to choose folder with prompt ${toAppleScriptString(prompt)} with multiple selections allowed`,
      "-e", 'set output to ""',
      "-e", "repeat with f in theFolders",
      "-e", 'set output to output & POSIX path of f & "\\n"',
      "-e", "end repeat",
      "-e", "return output",
    ];
  }

  return [
    "-e", `set theFolder to choose folder with prompt ${toAppleScriptString(prompt)}`,
    "-e", "return POSIX path of theFolder",
  ];
}

function buildWindowsPickerScript(prompt, multiple) {
  const escapedPrompt = escapeForPowerShellSingleQuotedString(prompt);

  if (!multiple) {
    // Single-folder selection via the Windows shell dialog
    return [
      "$ErrorActionPreference = 'Stop'",
      "$shell = New-Object -ComObject Shell.Application",
      "$folder = $shell.BrowseForFolder(0, '" + escapedPrompt + "', 0x0040 + 0x0010, 0)",
      "if ($folder -ne $null -and $folder.Self -ne $null) {",
      "  Write-Output $folder.Self.Path",
      "} else {",
      "  exit 1",
      "}",
    ].join("\n");
  }

  // Multi-folder selection via IFileOpenDialog COM interface
  return [
    "Add-Type -AssemblyName System.Windows.Forms",
    "$s = Add-Type -MemberDefinition @'",
    "[DllImport(\"shell32.dll\")] public static extern int SHBrowseForFolder(ref BROWSEINFO bi);",
    "'@ -Name FP -Namespace Win32 -PassThru -ErrorAction Stop 2>$null",
    "$shell = New-Object -ComObject Shell.Application",
    "$folder = $shell.BrowseForFolder(0, '" + escapedPrompt + "', 0x0040 + 0x0010, 0)",
    "if ($folder -ne $null) {",
    "  Write-Output $folder.Self.Path",
    "} else {",
    "  exit 1",
    "}",
  ].join("\n");
}

function toAppleScriptString(value) {
  return `"${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function escapeForPowerShellSingleQuotedString(value) {
  return String(value).replaceAll("'", "''");
}

function normalizePickedPath(value, pathModule) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return "";
  }

  const normalized = pathModule.normalize(trimmed);
  const root = pathModule.parse(normalized).root;
  if (normalized === root) {
    return normalized;
  }

  return normalized.replace(/[\\/]+$/, "");
}

function runPickerCommand(command, args) {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { timeout: PICKER_TIMEOUT_MS, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          logPickerError("Folder picker command failed", {
            command,
            args: summarizeCommandArgs(args),
            code: error.code,
            message: error.message,
            stdout: summarizeOutput(stdout),
            stderr: summarizeOutput(stderr),
          });
          reject(new Error(error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" ? "Selection timed out" : "Folder selection failed"));
          return;
        }
        if (typeof stderr === "string" && stderr.trim()) {
          logPickerWarn("Folder picker command wrote to stderr", {
            command,
            stderr: summarizeOutput(stderr),
          });
        }
        resolve(stdout);
      },
    );
  });
}

function summarizeCommandArgs(args) {
  return args.map((arg, index) => {
    if (args[index - 1] === "-EncodedCommand") {
      return `<encoded:${String(arg).length}>`;
    }

    return String(arg);
  });
}

function summarizeOutput(value, maxLength = 400) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return "";
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}...`;
}

function logPickerInfo(message, details) {
  console.info(`[picker] ${message}`, details);
}

function logPickerWarn(message, details) {
  console.warn(`[picker] ${message}`, details);
}

function logPickerError(message, details) {
  console.error(`[picker] ${message}`, details);
}