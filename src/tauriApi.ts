/**
 * Tauri API adapter - provides a similar interface to the HTTP API
 * but uses Tauri commands instead.
 */

import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { open as openPath } from '@tauri-apps/plugin-shell';

// Check if running in Tauri environment
export const isTauri = '__TAURI__' in window;

// Tauri command wrappers
export const tauriApi = {
  // Meta data path
  async getMetaDataPath(): Promise<string | null> {
    return invoke('get_meta_data_path');
  },

  async setMetaDataPath(path: string): Promise<void> {
    return invoke('set_meta_data_path', { path });
  },

  async pickFolder(): Promise<string | null> {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select Folder',
    });
    return selected || null;
  },

  // Notes operations
  async readNotes(docsDir: string): Promise<any[]> {
    return invoke('read_notes', { docsDir });
  },

  async readFileContent(filePath: string): Promise<string> {
    return invoke('read_file_content', { filePath });
  },

  async writeFileContent(filePath: string, content: string): Promise<void> {
    return invoke('write_file_content', { filePath, content });
  },

  async createNote(docsDir: string, targetPath: string, fileName: string): Promise<string> {
    return invoke('create_note', { docsDir, targetPath, fileName });
  },

  async createFolder(docsDir: string, targetPath: string, folderName: string): Promise<string> {
    return invoke('create_folder', { docsDir, targetPath, folderName });
  },

  async renameNote(docsDir: string, sourcePath: string, newName: string): Promise<void> {
    return invoke('rename_note', { docsDir, sourcePath, newName });
  },

  async deleteNote(docsDir: string, notePath: string): Promise<void> {
    return invoke('delete_note', { docsDir, notePath });
  },

  // JSON operations
  async readJsonFile(filePath: string): Promise<any> {
    return invoke('read_json_file', { filePath });
  },

  async writeJsonFile(filePath: string, data: any): Promise<void> {
    return invoke('write_json_file', { filePath, data });
  },

  // External operations
  async openExternal(path: string): Promise<void> {
    return openPath(path);
  },

  // Version
  async getAppVersion(): Promise<string> {
    return invoke('get_app_version');
  },

  // Event listening
  async listen(event: string, handler: (payload: any) => void) {
    const { listen } = await import('@tauri-apps/api/event');
    return listen(event, (event) => handler(event.payload));
  },

  async emit(event: string, payload: any) {
    const { emit } = await import('@tauri-apps/api/event');
    return emit(event, payload);
  },
};

// Legacy HTTP API fallback (for development/testing)
async function httpApiFetch(endpoint: string, options?: RequestInit): Promise<Response> {
  const baseUrl = 'http://localhost:3532';
  return fetch(`${baseUrl}${endpoint}`, options);
}

/**
 * Unified API that uses Tauri when available, falls back to HTTP in development
 */
export const api = {
  async getMetaDataPath(): Promise<string | null> {
    if (isTauri) {
      return tauriApi.getMetaDataPath();
    }
    const response = await httpApiFetch('/api/meta-data-path');
    const data = await response.json();
    return data.path || null;
  },

  async setMetaDataPath(path: string): Promise<void> {
    if (isTauri) {
      return tauriApi.setMetaDataPath(path);
    }
    await httpApiFetch('/api/meta-data-path', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
  },

  async pickFolder(): Promise<string | null> {
    if (isTauri) {
      return tauriApi.pickFolder();
    }
    const response = await httpApiFetch('/api/meta-data-path/pick', {
      method: 'POST',
    });
    const data = await response.json();
    return data.path || null;
  },

  async readNotes(docsDir: string): Promise<any[]> {
    if (isTauri) {
      return tauriApi.readNotes(docsDir);
    }
    const response = await httpApiFetch('/api/notes');
    return response.json();
  },

  async readFileContent(filePath: string): Promise<string> {
    if (isTauri) {
      return tauriApi.readFileContent(filePath);
    }
    const response = await httpApiFetch(`/api/docs/file?path=${encodeURIComponent(filePath)}`);
    return response.text();
  },

  async writeFileContent(filePath: string, content: string): Promise<void> {
    if (isTauri) {
      return tauriApi.writeFileContent(filePath, content);
    }
    await httpApiFetch('/api/docs/file', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath, content }),
    });
  },

  async createNote(docsDir: string, targetPath: string, fileName: string): Promise<string> {
    if (isTauri) {
      return tauriApi.createNote(docsDir, targetPath, fileName);
    }
    const response = await httpApiFetch('/api/docs/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetPath, fileName }),
    });
    const data = await response.json();
    return data.path;
  },

  async createFolder(docsDir: string, targetPath: string, folderName: string): Promise<string> {
    if (isTauri) {
      return tauriApi.createFolder(docsDir, targetPath, folderName);
    }
    const response = await httpApiFetch('/api/docs/create-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetPath, folderName }),
    });
    const data = await response.json();
    return data.path;
  },

  async renameNote(docsDir: string, sourcePath: string, newName: string): Promise<void> {
    if (isTauri) {
      return tauriApi.renameNote(docsDir, sourcePath, newName);
    }
    await httpApiFetch('/api/docs/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourcePath, newName }),
    });
  },

  async deleteNote(docsDir: string, notePath: string): Promise<void> {
    if (isTauri) {
      return tauriApi.deleteNote(docsDir, notePath);
    }
    await httpApiFetch('/api/docs/trash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: notePath }),
    });
  },

  async readJsonFile(filePath: string): Promise<any> {
    if (isTauri) {
      return tauriApi.readJsonFile(filePath);
    }
    const content = await this.readFileContent(filePath);
    return JSON.parse(content);
  },

  async writeJsonFile(filePath: string, data: any): Promise<void> {
    if (isTauri) {
      return tauriApi.writeJsonFile(filePath, data);
    }
    const content = JSON.stringify(data, null, 2);
    return this.writeFileContent(filePath, content);
  },

  async openExternal(path: string): Promise<void> {
    if (isTauri) {
      return tauriApi.openExternal(path);
    }
    await httpApiFetch('/api/open-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
  },

  async getAppVersion(): Promise<string> {
    if (isTauri) {
      return tauriApi.getAppVersion();
    }
    return '0.9.0'; // Fallback version
  },

  // Event system
  async listen(event: string, handler: (payload: any) => void) {
    if (isTauri) {
      return tauriApi.listen(event, handler);
    }
    // For HTTP mode, use EventSource (SSE)
    const eventSource = new EventSource(`http://localhost:3532/api/events`);
    eventSource.addEventListener(event, (e) => {
      handler(JSON.parse(e.data));
    });
    return () => eventSource.close();
  },

  async emit(event: string, payload: any) {
    if (isTauri) {
      return tauriApi.emit(event, payload);
    }
    // No-op in HTTP mode
  },
};

export default api;
