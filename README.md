# Organizer

Organizer is a local-first workspace for browsing, editing, and organizing markdown notes, bookmarks, recent documents, and TODO items in one interface. It combines a React + Vite client with a small Node server that scans your selected docs folder and stores Organizer state next to it.

## Overview

Organizer is built for people who keep working notes across folders and want one place to search, sort, review, and maintain them. You choose a primary docs folder, optionally import additional note folders and bookmarks, and Organizer keeps the UI in sync with the local filesystem.

![Organizer Image](./docs/organizer.png)

## Features

- Notes map with folder view, section navigation, preview, and markdown editing.
- Support for a primary docs folder plus additional imported note folders.
- Bookmark import and bookmark-folder browsing.
- Global search, saved searches, tag browsing, and broken-link checks.
- Version history, backlinks, starred notes, and recent documents.
- TODO view for managing task lists stored alongside your docs.
- Trash view with restore, delete forever, and empty-trash support.
- Create folders, create documents, and upload files from the app.
- Export / import packs for bookmarks, saved searches, and note metadata.
- Command palette, preferences, and local file watching.

## Installation

### Prerequisites

- Node.js 18+ recommended.
- npm.

### Install dependencies

```bash
npm install
```

### Run in development

This starts both the Vite client and the local Node server.

```bash
npm run dev
```

Client:

- `http://127.0.0.1:5173`

Server:

- `http://127.0.0.1:3532`

### Run only the server

```bash
npm run dev:server
```

### Build for production

```bash
npm run build
```

### Preview the built client

```bash
npm run preview
```

### Start the server directly

```bash
npm run start
```

## Getting Started

### Notes

1. Start the app.
2. Choose your primary docs folder when prompted.
3. Organizer scans markdown files in that folder and builds the notes map.
4. Use Import notes if you want to add more note folders without moving them.

### Bookmarks

1. Open the Bookmarks area.
2. Import a bookmarks file.
3. Organizer keeps the bookmark structure available alongside notes, recent items, starred items, and search results.

## Storage Layout

After you select a docs folder, Organizer keeps your markdown files where they are and creates two Organizer-owned folders inside that same folder:

```text
your-docs-folder/
  notes/
  project-plan.md
  .organizer-data/
    bookmarks.json
    docs-source.json
    recent-documents.json
    sidebar-order.json
    starred-notes.json
    trash.json
    workspaces.json
    trash/
  todo/
    todo-items.json
```

`.organizer-data` stores Organizer metadata. Metadata is the app's own JSON state about your workspace, such as bookmarks, stars, recent history, saved note organization, trash records, and selected docs sources. It does not replace your note content; your markdown files stay in your docs folders.

The `todo/` folder stores Organizer's TODO list data separately from your markdown notes.

## Additional Notes

- Imported notes remain in their original folders; Organizer indexes them rather than copying them into the app.
- `.organizer-config.json` in the project root remembers which `.organizer-data` folder Organizer is currently using.

## Resetting

To re-trigger docs-folder setup, delete the config file:

```bash
rm .organizer-config.json
```

To fully reset Organizer state for a selected docs folder, also delete that folder's Organizer data:

```bash
rm .organizer-config.json
rm -rf /path/to/your-docs-folder/.organizer-data
rm -rf /path/to/your-docs-folder/todo
```

If you only delete `.organizer-config.json`, Organizer will ask you to choose a docs folder again, but the existing `.organizer-data` and `todo` folders remain intact.
