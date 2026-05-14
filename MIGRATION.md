# Migration Guide: HTTP Server → Tauri

This guide helps you migrate your existing HTTP-based code to use Tauri commands.

## Overview

The app now supports both modes:
- **Tauri mode**: Native desktop app using Tauri commands
- **HTTP mode**: Legacy Node.js server (for development/testing)

The unified API in `src/tauriApi.ts` automatically detects which mode to use.

## Key Changes

### 1. API Calls

**Before (HTTP):**
```typescript
import { apiFetch } from './apiFetch';

const response = await apiFetch('/api/notes');
const notes = await response.json();
```

**After (Unified):**
```typescript
import { api } from './tauriApi';

const notes = await api.readNotes(docsDir);
```

### 2. File Operations

**Before:**
```typescript
const response = await apiFetch(`/api/docs/file?path=${encodeURIComponent(path)}`);
const content = await response.text();
```

**After:**
```typescript
const content = await api.readFileContent(path);
```

### 3. Folder Picker

**Before:**
```typescript
const response = await apiFetch('/api/meta-data-path/pick', { method: 'POST' });
const data = await response.json();
const path = data.path;
```

**After:**
```typescript
const path = await api.pickFolder();
```

### 4. Real-time Updates (SSE → Events)

**Before (Server-Sent Events):**
```typescript
const eventSource = new EventSource('/api/events');
eventSource.addEventListener('notes-changed', (e) => {
  const data = JSON.parse(e.data);
  handleUpdate(data);
});
```

**After (Tauri Events):**
```typescript
const unlisten = await api.listen('notes-changed', (data) => {
  handleUpdate(data);
});

// Cleanup
unlisten();
```

### 5. Opening External Files/Folders

**Before:**
```typescript
await apiFetch('/api/open-folder', {
  method: 'POST',
  body: JSON.stringify({ path }),
});
```

**After:**
```typescript
await api.openExternal(path);
```

## Step-by-Step Migration

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Update Import Statements

Find and replace across your codebase:
```typescript
// Old
import { apiFetch } from './apiFetch';

// New
import { api } from './tauriApi';
```

### Step 3: Update API Calls

Update each API call to use the new unified API. Use find/replace with care:

| Old Pattern | New Pattern |
|------------|-------------|
| `apiFetch('/api/notes')` | `api.readNotes(docsDir)` |
| `apiFetch('/api/docs/file?path=...')` | `api.readFileContent(path)` |
| `apiFetch('/api/docs/create', {...})` | `api.createNote(...)` |
| `apiFetch('/api/meta-data-path/pick')` | `api.pickFolder()` |

### Step 4: Update Event Listeners

Replace EventSource with the unified event system:

```typescript
// Remove EventSource setup
const eventSource = new EventSource('/api/events');

// Use unified listener
const unlisten = await api.listen('event-name', handler);
```

### Step 5: Test Both Modes

**Test Tauri Mode:**
```bash
npm run dev
```

**Test HTTP Mode (fallback):**
```bash
# Terminal 1
npm run dev:server

# Terminal 2  
npm run dev:client
# Open http://127.0.0.1:5173 in browser
```

### Step 6: Handle Platform Differences

```typescript
import { isTauri } from './tauriApi';

if (isTauri) {
  // Tauri-specific code
} else {
  // Browser/HTTP fallback
}
```

## Common Patterns

### Pattern 1: File System Operations

```typescript
// Read file
const content = await api.readFileContent(filePath);

// Write file
await api.writeFileContent(filePath, content);

// Read JSON
const data = await api.readJsonFile(jsonPath);

// Write JSON
await api.writeJsonFile(jsonPath, data);
```

### Pattern 2: User Interactions

```typescript
// Pick folder
const folder = await api.pickFolder();
if (folder) {
  // User selected a folder
}

// Open in file manager
await api.openExternal(folderPath);
```

### Pattern 3: State Synchronization

```typescript
// Set up listener
useEffect(() => {
  let unlisten: (() => void) | undefined;
  
  api.listen('data-changed', (payload) => {
    // Update local state
    setData(payload);
  }).then((fn) => {
    unlisten = fn;
  });

  return () => {
    if (unlisten) unlisten();
  };
}, []);
```

## Rust Backend Customization

If you need to add new commands:

### 1. Add Rust Command

Edit `src-tauri/src/main.rs`:

```rust
#[tauri::command]
async fn my_custom_command(param: String) -> Result<String, String> {
    // Your implementation
    Ok(format!("Processed: {}", param))
}

// Register in main():
.invoke_handler(tauri::generate_handler![
    // ...existing commands...
    my_custom_command,
])
```

### 2. Add TypeScript Wrapper

Edit `src/tauriApi.ts`:

```typescript
export const tauriApi = {
  // ...existing methods...
  
  async myCustomCommand(param: string): Promise<string> {
    return invoke('my_custom_command', { param });
  },
};

export const api = {
  // ...existing methods...
  
  async myCustomCommand(param: string): Promise<string> {
    if (isTauri) {
      return tauriApi.myCustomCommand(param);
    }
    // HTTP fallback if needed
    const response = await httpApiFetch('/api/my-endpoint', {
      method: 'POST',
      body: JSON.stringify({ param }),
    });
    return response.text();
  },
};
```

### 3. Use in Components

```typescript
import { api } from './tauriApi';

const result = await api.myCustomCommand('test');
```

## Troubleshooting

### Issue: "Tauri command not found"
- Make sure the command is registered in `main.rs`
- Rebuild: `npm run tauri:build` or restart `npm run dev`

### Issue: "Permission denied" when accessing files
- Update `fs.scope` in `tauri.conf.json`
- Grant broader permissions if needed

### Issue: "Cannot find module '@tauri-apps/api'"
- Run `npm install`
- Make sure all Tauri dependencies are installed

### Issue: HTTP mode not working
- Ensure the Node.js server is running (`npm run dev:server`)
- Check port 3532 is not in use
- Verify `isTauri` is `false` in browser console

## Performance Tips

1. **Batch operations**: Group multiple file reads/writes
2. **Use streaming**: For large files, consider chunking
3. **Cache results**: Store frequently accessed data in state
4. **Debounce saves**: Avoid writing on every keystroke

## Security Considerations

1. **File system scope**: Limit access in `tauri.conf.json`
2. **Validate paths**: Always validate user input paths
3. **CSP**: Configure Content Security Policy if needed
4. **Updates**: Plan for secure auto-updates

## Next Steps

1. Complete the migration
2. Test on all target platforms
3. Generate proper app icons
4. Set up code signing
5. Configure auto-updates (optional)
6. Remove old HTTP server code if not needed

## Resources

- [Tauri Documentation](https://tauri.app/v2/guides/)
- [Tauri API Reference](https://tauri.app/v2/reference/javascript/api/)
- [Rust Book](https://doc.rust-lang.org/book/)
- [Cargo Book](https://doc.rust-lang.org/cargo/)
