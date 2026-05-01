function getClientUserAgent() {
  if (typeof navigator === "undefined") {
    return "";
  }

  return navigator.userAgent ?? "";
}

export function isWindowsUserAgent(userAgent: string) {
  return /\bWindows\b/i.test(userAgent);
}

export function isMacUserAgent(userAgent: string) {
  return /\bMac(?:intosh| OS X)?\b/i.test(userAgent);
}

export function getClientPlatform(userAgent = getClientUserAgent()) {
  if (isMacUserAgent(userAgent)) {
    return "mac" as const;
  }

  if (isWindowsUserAgent(userAgent)) {
    return "windows" as const;
  }

  return "other" as const;
}

export function shouldUseManualFolderPaths(userAgent = getClientUserAgent()) {
  return isWindowsUserAgent(userAgent);
}

export function getFolderPathPlaceholder(userAgent = getClientUserAgent()) {
  return shouldUseManualFolderPaths(userAgent) ? "C:\\Users\\you\\Documents" : "/path/to/your/folder";
}

export function ensureMetadataFolderPath(inputPath: string) {
  const trimmed = inputPath.trim();
  if (!trimmed) {
    return "";
  }

  if (/[\\/]organizer_meta_data$/i.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.endsWith("\\") || trimmed.endsWith("/")) {
    return `${trimmed}organizer_meta_data`;
  }

  const separator = trimmed.includes("\\") ? "\\" : "/";
  return `${trimmed}${separator}organizer_meta_data`;
}