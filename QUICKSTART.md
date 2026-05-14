# Tauri Quick Start Guide

Get your Organizer desktop app running in 5 minutes!

## Step 1: Install Rust

### Windows
```powershell
# Option 1: Download from https://rustup.rs/
# Option 2: Use winget
winget install Rustlang.Rustup
```

### macOS
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### Linux
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

After installation, restart your terminal or run:
```bash
source $HOME/.cargo/env
```

Verify installation:
```bash
rustc --version
cargo --version
```

## Step 2: Install System Dependencies

### Windows
✅ Usually nothing extra needed! WebView2 is pre-installed on Windows 10/11.

If you get WebView2 errors:
- Download from: https://developer.microsoft.com/microsoft-edge/webview2/

### macOS
```bash
xcode-select --install
```

### Linux (Ubuntu/Debian)
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

### Linux (Fedora)
```bash
sudo dnf install webkit2gtk4.1-devel \
  openssl-devel \
  curl \
  wget \
  file \
  libappindicator-gtk3-devel \
  librsvg2-devel
```

### Linux (Arch)
```bash
sudo pacman -S webkit2gtk-4.1 \
  base-devel \
  curl \
  wget \
  file \
  openssl \
  appmenu-gtk-module \
  gtk3 \
  libappindicator-gtk3 \
  librsvg
```

## Step 3: Install Node Dependencies

```bash
cd organizer
npm install
```

## Step 4: Run Development Mode

```bash
npm run dev
```

This will:
1. Compile the Rust backend (first time takes 2-5 minutes)
2. Start the Vite dev server
3. Launch the app window

The Rust compilation is cached, so subsequent runs are much faster!

## Step 5: Build for Production

```bash
npm run tauri:build
```

Build time: 5-10 minutes (first time)

Find your installer:
- **Windows**: `src-tauri\target\release\bundle\nsis\Organizer_0.9.0_x64-setup.exe`
- **macOS**: `src-tauri/target/release/bundle/dmg/Organizer_0.9.0_x64.dmg`
- **Linux**: `src-tauri/target/release/bundle/deb/organizer_0.9.0_amd64.deb` or `.../appimage/organizer_0.9.0_amd64.AppImage`

## Common Issues

### ❌ "rustc not found"
**Fix:** Add Rust to PATH and restart terminal
```bash
source $HOME/.cargo/env  # macOS/Linux
# or restart PowerShell on Windows
```

### ❌ "failed to run custom build command for..."
**Fix:** Install system dependencies (see Step 2)

### ❌ "WebView2 not found" (Windows)
**Fix:** Install WebView2 Runtime: https://go.microsoft.com/fwlink/p/?LinkId=2124703

### ❌ "Port 5173 already in use"
**Fix:** Kill the process or change port in `tauri.conf.json`

### ❌ Slow first build
**Normal!** Rust compiles dependencies once, then caches them. Subsequent builds are much faster.

## Development Tips

### Hot Reload
In dev mode (`npm run dev`), changes to:
- **Frontend** (TypeScript/React): Hot reload automatically
- **Backend** (Rust): Requires app restart

### Debug Rust Code
```bash
# Enable Rust logging
RUST_LOG=debug npm run dev
```

### Clean Build
```bash
cd src-tauri
cargo clean
cd ..
npm run tauri:build
```

### Check Bundle Size
```bash
# Windows
dir src-tauri\target\release\bundle\nsis\

# macOS/Linux
ls -lh src-tauri/target/release/bundle/dmg/
```

## Next Steps

1. ✅ App running? Great!
2. 📖 Read [MIGRATION.md](./MIGRATION.md) to update code
3. 🎨 Generate app icons: `npx @tauri-apps/cli icon your-icon.png`
4. 🚀 Set up GitHub Actions for multi-platform builds
5. ✍️ Configure code signing for distribution

## Resources

- **Tauri Docs**: https://tauri.app/v2/guides/
- **Troubleshooting**: https://tauri.app/v2/guides/debug/
- **Discord**: https://discord.com/invite/tauri

---

**Need help?** Open an issue or check existing issues in the repository.
