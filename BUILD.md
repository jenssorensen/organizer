# Build Commands for Tauri

## Quick Start

1. Install Rust: https://rustup.rs/
2. Install dependencies: `npm install`
3. Run dev: `npm run dev`
4. Build: `npm run tauri:build`

## Platform-Specific Builds

### Windows
```powershell
# Install prerequisites
winget install Rustlang.Rustup

# Build
npm run tauri:build
```

Output: `src-tauri/target/release/bundle/msi/` and `src-tauri/target/release/bundle/nsis/`

### macOS
```bash
# Install Xcode Command Line Tools
xcode-select --install

# Build for current architecture
npm run tauri:build

# Build universal binary (Intel + Apple Silicon)
npm run tauri:build -- --target universal-apple-darwin
```

Output: `src-tauri/target/release/bundle/dmg/` and `src-tauri/target/release/bundle/macos/`

### Linux (Ubuntu/Debian)
```bash
# Install prerequisites
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev

# Build
npm run tauri:build
```

Output: `src-tauri/target/release/bundle/deb/` and `src-tauri/target/release/bundle/appimage/`

## Cross-Platform Building

You can't directly cross-compile from one OS to another (e.g., build macOS apps on Windows).
Use:
- GitHub Actions (see `.github/workflows/build-tauri.yml`)
- Virtual machines
- Cloud CI/CD services

## Code Signing

### macOS
```bash
# Add to environment or GitHub Secrets
export APPLE_CERTIFICATE=<base64-encoded-cert>
export APPLE_CERTIFICATE_PASSWORD=<password>
export APPLE_ID=<your-apple-id>
export APPLE_PASSWORD=<app-specific-password>
export APPLE_TEAM_ID=<team-id>
```

### Windows
```powershell
# Code signing certificate required for production
# Add to tauri.conf.json or use signtool
```

## Size Optimization

Release builds are already optimized. Final sizes:
- Windows: ~15-30 MB
- macOS: ~20-40 MB (universal binary)
- Linux: ~10-25 MB

## Debugging Builds

```bash
# Build with debug symbols
npm run tauri:build -- --debug

# Run with verbose logging
RUST_LOG=debug npm run dev
```

## Auto-Updates

To enable auto-updates:
1. Set up a release server
2. Configure updater in `tauri.conf.json`
3. Generate signing keys
4. Add endpoints for update manifests

See: https://tauri.app/v1/guides/distribution/updater
