# App Icons

This directory should contain your app icons in various formats:

## Required Icons

- `icon.png` - Master icon (1024x1024 recommended)
- `icon.icns` - macOS icon bundle
- `icon.ico` - Windows icon
- `32x32.png` - Small icon
- `128x128.png` - Medium icon
- `128x128@2x.png` - Retina medium icon
- `icon.png` - Linux icon

## Generating Icons

The easiest way to generate all required icons from a single source PNG:

```bash
# Install Tauri CLI if not already installed
npm install -g @tauri-apps/cli

# Generate icons from your source image (1024x1024 PNG recommended)
npx @tauri-apps/cli icon path/to/your-icon.png
```

This will generate all required formats automatically.

## Manual Creation

If you want to create icons manually:

### macOS (.icns)
Use Icon Composer (Xcode) or online tools like:
- https://cloudconvert.com/png-to-icns

### Windows (.ico)
Use tools like:
- https://icoconvert.com/
- GIMP with ICO plugin
- ImageMagick

### Requirements
- Use transparent PNG backgrounds
- Ensure icons look good at small sizes (16x16, 32x32)
- Test on all target platforms

## Current Status

⚠️ **TODO**: Add your custom app icons to this directory.

For now, Tauri will use default placeholder icons. Replace these before distributing your app.
