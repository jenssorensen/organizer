# Tauri Setup for Organizer

## Prerequisites

Before building the Tauri app, you need to install:

### 1. Rust
```powershell
# Windows: Download and run rustup-init.exe from https://rustup.rs/
# Or use winget:
winget install Rustlang.Rustup
```

### 2. System Dependencies

**Windows:**
- Microsoft Visual Studio C++ Build Tools
- WebView2 (usually pre-installed on Windows 10/11)

**macOS:**
```bash
xcode-select --install
```

**Linux (Debian/Ubuntu):**
```bash
sudo apt install libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

## Installation

1. Install Node.js dependencies:
```bash
npm install
```

2. Install Tauri CLI:
```bash
npm install --save-dev @tauri-apps/cli
```

## Development

Run in development mode (hot reload enabled):
```bash
npm run dev
```

This will:
- Start the Vite dev server
- Build the Rust backend
- Launch the Tauri window

## Building

### Build for your current platform:
```bash
npm run tauri:build
```

The bundled app will be in `src-tauri/target/release/bundle/`:
- **Windows**: `.msi` and `.exe` installers
- **macOS**: `.dmg` and `.app` bundle
- **Linux**: `.deb`, `.AppImage`, depending on your system

### Build for specific platforms:

**Windows:**
```bash
npm run tauri:build
```

**macOS:**
```bash
npm run tauri:build -- --target universal-apple-darwin
```

**Linux:**
```bash
npm run tauri:build
```

## Icons

Place your app icons in `src-tauri/icons/`:
- `icon.icns` - macOS
- `icon.ico` - Windows
- `icon.png` - Linux (various sizes: 32x32, 128x128, 256x256, etc.)

You can generate icons from a single PNG using:
```bash
npm install -g @tauri-apps/cli
cargo tauri icon path/to/your-icon.png
```

## Configuration

Edit `src-tauri/tauri.conf.json` to customize:
- App name and version
- Window size and properties
- File system permissions
- Bundle identifier

## Troubleshooting

### "Rust not found" error
Make sure Rust is installed and in your PATH:
```bash
rustc --version
cargo --version
```

### WebView2 error on Windows
Install WebView2 Runtime: https://developer.microsoft.com/microsoft-edge/webview2/

### Build fails on Linux
Make sure all system dependencies are installed (see Prerequisites).

## Migration from HTTP Server

The app now runs natively without needing a Node.js server. The previous HTTP API has been replaced with Tauri commands. Both modes are supported:

- **Tauri mode** (production): Uses native commands
- **HTTP mode** (legacy): Falls back to HTTP server for development

To check which mode is active:
```javascript
import { isTauri } from './tauriApi';
console.log('Running in Tauri:', isTauri);
```

## File Structure

```
src-tauri/
├── src/
│   └── main.rs           # Rust backend with Tauri commands
├── Cargo.toml            # Rust dependencies
├── tauri.conf.json       # Tauri configuration
├── build.rs              # Build script
└── icons/                # App icons
```

## Security

Tauri apps are more secure than Electron:
- Smaller attack surface
- Native OS dialogs
- File system scoping
- No Node.js runtime exposed to frontend

File system access is scoped in `tauri.conf.json`. Update the `fs.scope` if you need access to additional directories.
