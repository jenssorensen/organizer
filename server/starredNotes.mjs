function normalizeSourcePath(value) {
  if (typeof value !== "string") {
    throw new Error("Invalid starred notes payload");
  }

  const normalized = value.trim().replace(/^\/+/, "");
  if (!normalized) {
    throw new Error("Invalid starred notes payload");
  }

  return normalized;
}

export function sanitizeStarredNotesPayload(payload) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.entries)) {
    throw new Error("Invalid starred notes payload");
  }

  return {
    entries: payload.entries.map((entry) => {
      if (!entry || typeof entry !== "object" || typeof entry.starred !== "boolean") {
        throw new Error("Invalid starred notes payload");
      }

      return {
        sourcePath: normalizeSourcePath(entry.sourcePath),
        starred: entry.starred,
      };
    }),
  };
}

export function toStarredNotesMap(entries) {
  return new Map(entries.filter((entry) => entry.starred).map((entry) => [entry.sourcePath, true]));
}

export function mergeStarredNotes(notes, starredMap) {
  return notes.map((note) => ({
    ...note,
    starred: Boolean(note.sourcePath && starredMap.get(note.sourcePath)),
  }));
}

export function toggleStarredNote(entries, sourcePath, starred) {
  const normalizedPath = normalizeSourcePath(sourcePath);
  const nextEntries = entries.filter((entry) => entry.sourcePath !== normalizedPath);

  if (starred) {
    nextEntries.push({
      sourcePath: normalizedPath,
      starred: true,
    });
  }

  nextEntries.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath));
  return nextEntries;
}
