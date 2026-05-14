# Testing Guide for Tauri App

## Testing Strategy

The Organizer app should be tested on all three target platforms before release.

## 1. Local Testing

### Test Checklist for Each Platform

Before building, test these core features:

- [ ] **App Launch**: App starts without errors
- [ ] **Data Directory**: Can select/create data directory
- [ ] **Notes**:
  - [ ] Browse note tree
  - [ ] Create new note
  - [ ] Edit note (markdown)
  - [ ] Delete note
  - [ ] Search notes
  - [ ] Navigate between notes
- [ ] **Folders**:
  - [ ] Create folder
  - [ ] Rename folder
  - [ ] Delete folder
  - [ ] Import folder
- [ ] **Bookmarks**:
  - [ ] Import bookmarks file
  - [ ] Browse bookmarks
  - [ ] Open bookmark URL
- [ ] **TODO Items**:
  - [ ] Create TODO
  - [ ] Mark complete/incomplete
  - [ ] Edit TODO
  - [ ] Delete TODO
- [ ] **File Operations**:
  - [ ] File watching (changes reflected)
  - [ ] Save conflicts handled
  - [ ] Upload files
- [ ] **Preferences**:
  - [ ] Change settings
  - [ ] Settings persist
- [ ] **Performance**:
  - [ ] Large note trees (1000+ files)
  - [ ] Search speed
  - [ ] Startup time

### Windows Testing

```powershell
# Development mode
npm run dev

# Production build
npm run tauri:build

# Test the installer
cd src-tauri\target\release\bundle\nsis
.\Organizer_0.9.0_x64-setup.exe

# Or MSI
cd src-tauri\target\release\bundle\msi
Start-Process .\Organizer_0.9.0_x64_en-US.msi
```

**Test on:**
- Windows 10 (minimum)
- Windows 11

**Check:**
- ✅ WebView2 is available
- ✅ App installs to Program Files
- ✅ Start menu shortcut works
- ✅ Uninstaller works
- ✅ App doesn't trigger Windows Defender (may need code signing)

### macOS Testing

```bash
# Development mode
npm run dev

# Production build
npm run tauri:build

# Test the DMG
open src-tauri/target/release/bundle/dmg/Organizer_0.9.0_x64.dmg

# Test the .app directly
open src-tauri/target/release/bundle/macos/Organizer.app
```

**Test on:**
- macOS 11 Big Sur (minimum)
- macOS 12 Monterey
- macOS 13 Ventura
- macOS 14 Sonoma
- macOS 15 Sequoia

**Test both architectures:**
- Intel (x86_64)
- Apple Silicon (aarch64)
- Universal binary (both)

**Check:**
- ✅ App opens (may need to right-click → Open first time)
- ✅ File system permissions work
- ✅ App in Applications folder
- ✅ Gatekeeper doesn't block (may need code signing)

### Linux Testing

```bash
# Development mode
npm run dev

# Production build
npm run tauri:build

# Test AppImage
cd src-tauri/target/release/bundle/appimage
chmod +x organizer_0.9.0_amd64.AppImage
./organizer_0.9.0_amd64.AppImage

# Test .deb
cd src-tauri/target/release/bundle/deb
sudo dpkg -i organizer_0.9.0_amd64.deb
```

**Test on:**
- Ubuntu 22.04 LTS
- Ubuntu 24.04 LTS
- Debian 12
- Fedora (latest)
- Arch Linux (optional)

**Check:**
- ✅ Webkit2gtk dependencies available
- ✅ AppImage runs without installation
- ✅ .deb installs correctly
- ✅ Desktop entry created
- ✅ App launcher icon appears

## 2. Virtual Machine Testing

If you don't have access to all platforms physically:

### Windows
- **VMware Workstation** (free for personal use)
- **VirtualBox**
- **Parallels** (macOS host)
- Download Windows VMs: https://developer.microsoft.com/en-us/windows/downloads/virtual-machines/

### macOS
- **Only on Apple hardware** (legally)
- Use **UTM** or **Parallels** on Apple Silicon Macs
- Use **VMware Fusion** on Intel Macs

### Linux
- **VirtualBox** (easiest)
- **VMware Workstation**
- **QEMU/KVM**
- Download ISOs: 
  - Ubuntu: https://ubuntu.com/download
  - Fedora: https://getfedora.org/

## 3. Automated Testing

### Unit Tests

```bash
# Run existing tests
npm test

# Run with coverage
npm test -- --coverage
```

### End-to-End Testing

Create `tests/e2e/tauri.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test('app launches', async () => {
  // Tauri-specific test setup needed
  // See: https://tauri.app/v1/guides/testing/
});
```

### Continuous Integration

The GitHub Actions workflow (`.github/workflows/build-tauri.yml`) already builds for all platforms.

**To test:**
1. Push to GitHub
2. Go to Actions tab
3. Check build results for each platform
4. Download artifacts to test

## 4. Beta Testing

### TestFlight (macOS/iOS)
1. Enroll in Apple Developer Program ($99/year)
2. Upload build to App Store Connect
3. Create TestFlight beta
4. Invite testers

### Microsoft Store (Windows)
1. Enroll in Microsoft Partner Center
2. Upload MSIX bundle
3. Create beta channel
4. Invite testers

### Community Testing
1. Create GitHub Releases with pre-release tag
2. Share installers with trusted users
3. Collect feedback via issues

## 5. Performance Testing

### Memory Usage
```bash
# Monitor while running
# Windows: Task Manager
# macOS: Activity Monitor
# Linux: htop or System Monitor
```

**Target:** < 200 MB idle, < 500 MB with 1000 notes

### Startup Time
**Target:** < 3 seconds on SSD

### File System Operations
Test with:
- 100 notes: Should be instant
- 1,000 notes: Should load in < 2s
- 10,000 notes: Should load in < 5s

### Search Performance
Test full-text search with:
- 100 notes: < 100ms
- 1,000 notes: < 500ms
- 10,000 notes: < 2s

## 6. Security Testing

### Permissions
- ✅ File system scope is correct in `tauri.conf.json`
- ✅ No unnecessary permissions requested
- ✅ User prompted for folder access

### Data Safety
- ✅ Atomic writes (no data corruption)
- ✅ Backup/restore points work
- ✅ Trash functionality works
- ✅ No data leaks to external services

### Code Signing Verification

```bash
# Windows: Check signature
Get-AuthenticodeSignature .\Organizer.exe

# macOS: Check signature
codesign -v -v Organizer.app
spctl -a -v Organizer.app

# Linux: Check AppImage signature (if signed)
gpg --verify organizer.AppImage.asc
```

## 7. Compatibility Testing

### File Format Compatibility
- ✅ Markdown (.md)
- ✅ HTML (.html, .mhtml)
- ✅ Plain text (.txt)

### Large Files
- Test with 1 MB markdown file
- Test with 10 MB markdown file
- Test with 100 MB note tree

### Special Characters
- Test note names with unicode
- Test folder names with spaces
- Test paths with special chars

### External Changes
- Edit note externally while app running
- Delete note externally
- Rename folder externally
- Verify file watcher updates UI

## 8. Regression Testing

Before each release, test all major features again:

```bash
# Run full test suite
npm test
npm run lint
npm run build
npm run tauri:build

# Test on all platforms
# Test upgrade from previous version
# Test fresh install
```

## 9. User Acceptance Testing

### Beta Program
1. Recruit 5-10 beta testers
2. Provide test builds
3. Request feedback on:
   - Installation process
   - Feature usability
   - Performance
   - Bugs/crashes
   - Feature requests

### Feedback Collection
- GitHub Issues
- Discord/Slack channel
- Email
- In-app feedback form (optional)

## 10. Release Checklist

Before releasing:

- [ ] All tests pass on all platforms
- [ ] No critical bugs
- [ ] Performance targets met
- [ ] Documentation updated
- [ ] Changelog written
- [ ] Version numbers updated
- [ ] Code signed (if available)
- [ ] Installers tested
- [ ] Upgrade path tested
- [ ] Rollback plan ready

## Tools & Resources

### Testing Tools
- **Playwright**: E2E testing
- **Tauri Driver**: Tauri-specific testing
- **Virtual Machines**: Cross-platform testing
- **GitHub Actions**: CI/CD

### Monitoring
- **Sentry**: Error tracking
- **LogRocket**: Session replay
- **Analytics**: Usage metrics (optional)

### Resources
- Tauri Testing Guide: https://tauri.app/v1/guides/testing/
- Playwright Docs: https://playwright.dev/
- GitHub Actions: https://docs.github.com/en/actions

## Continuous Testing

Set up nightly builds that:
1. Build for all platforms
2. Run automated tests
3. Upload artifacts
4. Report failures

This ensures the app stays healthy as development continues.
