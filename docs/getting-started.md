# Getting Started With Organizer

Organizer is a local-first workspace for markdown notes, bookmarks, recent files, and TODOs. This guide gives new users a quick path from an empty folder to a working setup.

## What Organizer Can Do

- Browse notes as a folder tree and a searchable note map.
- Edit markdown files in place without moving them into a separate database.
- Track recent documents and star important notes for quick access.
- Manage TODO items alongside your notes.
- Import browser bookmarks and additional note folders.
- Restore deleted notes from Organizer's trash and review restore points.
- Search across note titles, content, tags, and links.

## First Setup

1. Open Organizer.
2. When prompted, choose the folder you want Organizer to use for your notes.
3. Organizer will keep your markdown files in that folder and create its metadata folders next to them.
4. This file is added automatically so you have a quick reference inside the workspace.

## Recommended First Steps

1. Create a few markdown files in the selected folder, or open the notes you already have.
2. Use search to confirm Organizer is indexing the files you expect.
3. Star one or two important notes so they are easy to return to.
4. Add a TODO item for anything you want to track separately from notes.
5. Import bookmarks or extra note folders if your material lives in more than one place.

## How Organizer Stores Data

Organizer does not move your markdown notes into a database. It leaves your note files where they are and adds Organizer-owned support folders in the selected workspace:

```text
your-folder/
	getting-started.md
	project-notes.md
	.organizer-data/
	todo/
```

- `.organizer-data/` stores Organizer metadata such as recent items, stars, bookmarks, and saved workspace state.
- `todo/` stores Organizer TODO data.
- Your markdown files remain normal files that can still be edited outside Organizer.

## Features To Try Next

- Create folders and notes directly from the app.
- Open a note and use the section navigation to jump around longer documents.
- Use backlinks and link-aware search to navigate connected notes.
- Review recent documents when returning to work after a break.
- Add additional docs folders if your notes are split across projects.

## Tips

- Keep note names descriptive so search results stay easy to scan.
- Use markdown headings consistently to improve outline navigation.
- If you already have notes elsewhere, add them as additional folders instead of copying them.
- Organizer metadata can be reset without deleting your note files.
