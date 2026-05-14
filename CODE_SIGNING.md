# Code Signing Guide

Code signing ensures users can trust your app and prevents security warnings. This guide covers all three platforms.

## Why Code Sign?

**Without code signing:**
- ❌ Windows: "Windows protected your PC" warning
- ❌ macOS: "App is damaged and can't be opened"
- ❌ Linux: No major issues, but users can't verify authenticity

**With code signing:**
- ✅ Users trust the app is from you
- ✅ Operating systems don't block installation
- ✅ Enable auto-updates securely
- ✅ App Store distribution (optional)

## Cost Overview

| Platform | Free Option | Paid Option | Cost/Year |
|----------|-------------|-------------|-----------|
| Windows | Self-signed (limited) | EV Certificate | $200-500 |
| macOS | ❌ No | Apple Developer | $99 |
| Linux | GPG (free) | ✅ Free | $0 |

---

## Windows Code Signing

### Option 1: Self-Signed Certificate (Development Only)

⚠️ **Warning:** Self-signed certificates still show warnings to users. Good for testing only.

```powershell
# Create self-signed certificate
$cert = New-SelfSignedCertificate `
  -Type CodeSigning `
  -Subject "CN=Your Company Name" `
  -CertStoreLocation "Cert:\CurrentUser\My" `
  -KeyExportPolicy Exportable `
  -KeySpec Signature `
  -KeyLength 2048 `
  -KeyAlgorithm RSA `
  -HashAlgorithm SHA256

# Export certificate
$pwd = ConvertTo-SecureString -String "YourPassword" -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath "cert.pfx" -Password $pwd

# Sign the app
signtool sign /f cert.pfx /p YourPassword /tr http://timestamp.digicert.com /td sha256 /fd sha256 "src-tauri\target\release\Organizer.exe"
```

### Option 2: EV Code Signing Certificate (Production)

**Providers:**
- **DigiCert** ($200-500/year)
- **Sectigo** ($200-400/year)
- **GlobalSign** ($300-500/year)

**Requirements:**
1. Legal business entity (LLC, Corporation, etc.)
2. Business verification documents
3. USB token or cloud-based HSM

**Steps:**

1. **Purchase Certificate**
   - Choose provider above
   - Complete business verification (2-7 days)
   - Receive USB token or cloud credentials

2. **Configure Tauri**

Edit `src-tauri/tauri.conf.json`:

```json
{
  "bundle": {
    "windows": {
      "certificateThumbprint": "YOUR_CERT_THUMBPRINT",
      "digestAlgorithm": "sha256",
      "timestampUrl": "http://timestamp.digicert.com"
    }
  }
}
```

3. **Find Certificate Thumbprint**

```powershell
# List certificates
Get-ChildItem -Path Cert:\CurrentUser\My -CodeSigningCert

# Get thumbprint
(Get-ChildItem -Path Cert:\CurrentUser\My -CodeSigningCert | Where-Object {$_.Subject -like "*Your Company*"}).Thumbprint
```

4. **Build with Signing**

```powershell
npm run tauri:build
```

Tauri will automatically sign if certificate is configured.

### Option 3: Azure Key Vault (Enterprise)

For teams, store certificates in Azure Key Vault:

```powershell
# Install Azure SignTool
dotnet tool install --global AzureSignTool

# Sign with Azure Key Vault
AzureSignTool sign `
  -kvu "https://your-vault.vault.azure.net/" `
  -kvi "YOUR_CLIENT_ID" `
  -kvs "YOUR_CLIENT_SECRET" `
  -kvc "YOUR_CERT_NAME" `
  -tr http://timestamp.digicert.com `
  -td sha256 `
  "src-tauri\target\release\Organizer.exe"
```

### GitHub Actions (Windows)

Add to `.github/workflows/build-tauri.yml`:

```yaml
- name: Sign Windows executable
  if: matrix.platform == 'windows-latest'
  env:
    CERTIFICATE_BASE64: ${{ secrets.WINDOWS_CERTIFICATE_BASE64 }}
    CERTIFICATE_PASSWORD: ${{ secrets.WINDOWS_CERTIFICATE_PASSWORD }}
  run: |
    # Decode certificate
    $cert = [Convert]::FromBase64String($env:CERTIFICATE_BASE64)
    [IO.File]::WriteAllBytes("cert.pfx", $cert)
    
    # Sign
    & "C:\Program Files (x86)\Windows Kits\10\bin\10.0.19041.0\x64\signtool.exe" sign `
      /f cert.pfx `
      /p $env:CERTIFICATE_PASSWORD `
      /tr http://timestamp.digicert.com `
      /td sha256 `
      /fd sha256 `
      "src-tauri\target\release\Organizer.exe"
    
    # Clean up
    Remove-Item cert.pfx
```

**Secrets to add:**
- `WINDOWS_CERTIFICATE_BASE64`: Base64-encoded .pfx file
- `WINDOWS_CERTIFICATE_PASSWORD`: Certificate password

---

## macOS Code Signing

### Requirements

**Mandatory:**
- Apple Developer Program membership ($99/year)
- Apple Developer account
- macOS machine (for signing)

### Setup

1. **Enroll in Apple Developer Program**
   - Visit: https://developer.apple.com/programs/
   - Pay $99/year
   - Wait for approval (1-2 days)

2. **Create Certificates**

```bash
# Install Xcode Command Line Tools
xcode-select --install

# Create certificate signing request
# Open Keychain Access > Certificate Assistant > Request a Certificate
# Save to disk

# Go to Apple Developer Portal
# Certificates, Identifiers & Profiles
# Create "Developer ID Application" certificate
# Download and double-click to install
```

3. **Get Team ID**

```bash
# Find your Team ID at:
# https://developer.apple.com/account/#!/membership/

# Or list certificates
security find-identity -v -p codesigning
```

4. **Configure Tauri**

Edit `src-tauri/tauri.conf.json`:

```json
{
  "bundle": {
    "macOS": {
      "signingIdentity": "Developer ID Application: Your Name (TEAM_ID)",
      "providerShortName": "YOUR_TEAM_ID",
      "entitlements": null,
      "exceptionDomain": null
    }
  }
}
```

5. **Build and Sign**

```bash
# Build (automatically signs if identity is configured)
npm run tauri:build

# Verify signature
codesign -v -v src-tauri/target/release/bundle/macos/Organizer.app
spctl -a -v src-tauri/target/release/bundle/macos/Organizer.app
```

### Notarization (Required for macOS 10.15+)

Apps must be notarized by Apple to run without warnings:

```bash
# Create app-specific password
# Go to: https://appleid.apple.com/account/manage
# App-Specific Passwords > Generate

# Store credentials
xcrun notarytool store-credentials "notary-profile" \
  --apple-id "your@email.com" \
  --team-id "TEAM_ID" \
  --password "app-specific-password"

# Notarize
xcrun notarytool submit \
  "src-tauri/target/release/bundle/dmg/Organizer_0.9.0_x64.dmg" \
  --keychain-profile "notary-profile" \
  --wait

# Staple notarization ticket
xcrun stapler staple "src-tauri/target/release/bundle/dmg/Organizer_0.9.0_x64.dmg"
```

### Automated Notarization

Add to `tauri.conf.json`:

```json
{
  "bundle": {
    "macOS": {
      "signingIdentity": "Developer ID Application: Your Name (TEAM_ID)",
      "providerShortName": "TEAM_ID",
      "notarize": {
        "appleId": "your@email.com",
        "password": "@keychain:AC_PASSWORD",
        "teamId": "TEAM_ID"
      }
    }
  }
}
```

Store password in keychain:

```bash
# Add password to keychain
security add-generic-password -a "your@email.com" -w "app-specific-password" -s "AC_PASSWORD"
```

### GitHub Actions (macOS)

Add to `.github/workflows/build-tauri.yml`:

```yaml
- name: Import Code Signing Certificates
  if: matrix.platform == 'macos-latest'
  env:
    APPLE_CERTIFICATE_BASE64: ${{ secrets.APPLE_CERTIFICATE_BASE64 }}
    APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
  run: |
    # Create keychain
    security create-keychain -p actions temp.keychain
    security default-keychain -s temp.keychain
    security unlock-keychain -p actions temp.keychain
    
    # Import certificate
    echo $APPLE_CERTIFICATE_BASE64 | base64 --decode > certificate.p12
    security import certificate.p12 -k temp.keychain -P $APPLE_CERTIFICATE_PASSWORD -T /usr/bin/codesign
    security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k actions temp.keychain
    
    # Build (signing happens automatically)

- name: Notarize macOS app
  if: matrix.platform == 'macos-latest'
  env:
    APPLE_ID: ${{ secrets.APPLE_ID }}
    APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
    APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
  run: |
    xcrun notarytool submit \
      "src-tauri/target/universal-apple-darwin/release/bundle/dmg/*.dmg" \
      --apple-id "$APPLE_ID" \
      --password "$APPLE_PASSWORD" \
      --team-id "$APPLE_TEAM_ID" \
      --wait
    xcrun stapler staple "src-tauri/target/universal-apple-darwin/release/bundle/dmg/*.dmg"
```

**Secrets to add:**
- `APPLE_CERTIFICATE_BASE64`: Base64-encoded .p12 file
- `APPLE_CERTIFICATE_PASSWORD`: Certificate password
- `APPLE_ID`: Apple ID email
- `APPLE_PASSWORD`: App-specific password
- `APPLE_TEAM_ID`: 10-character Team ID

---

## Linux Code Signing

Linux doesn't require code signing, but you can sign for verification:

### GPG Signing (Optional)

```bash
# Generate GPG key
gpg --full-generate-key
# Choose: RSA and RSA, 4096 bits, no expiration

# List keys
gpg --list-secret-keys --keyid-format LONG

# Export public key
gpg --armor --export YOUR_KEY_ID > public-key.asc

# Sign AppImage
gpg --detach-sign --armor organizer_0.9.0_amd64.AppImage

# Users verify with:
gpg --import public-key.asc
gpg --verify organizer_0.9.0_amd64.AppImage.asc organizer_0.9.0_amd64.AppImage
```

### Publish Public Key

```bash
# Upload to key server
gpg --send-keys YOUR_KEY_ID

# Or include in repository
echo "YOUR_PUBLIC_KEY" > PUBLIC_KEY.asc
```

---

## Testing Signed Apps

### Windows

```powershell
# Check signature
Get-AuthenticodeSignature .\Organizer.exe

# Should show:
# Status        : Valid
# SignerCertificate : CN=Your Company
```

### macOS

```bash
# Verify code signature
codesign -v -v Organizer.app
# Output: Organizer.app: valid on disk

# Check Gatekeeper
spctl -a -v Organizer.app
# Output: Organizer.app: accepted
```

### Linux

```bash
# Verify GPG signature
gpg --verify organizer.AppImage.asc organizer.AppImage
# Output: Good signature from "Your Name <email>"
```

---

## Cost-Effective Strategy

**Starting Out (No Budget):**
1. ✅ Skip Windows signing initially (users click "More info" → "Run anyway")
2. ❌ Can't skip macOS signing (required for distribution)
3. ✅ Linux doesn't need signing

**Small Budget ($99/year):**
1. ❌ Skip Windows EV cert
2. ✅ Get Apple Developer ($99) - required for macOS
3. ✅ Linux GPG signing (free)

**Full Distribution ($200-600/year):**
1. ✅ Windows EV certificate ($200-500)
2. ✅ Apple Developer ($99)
3. ✅ Linux GPG signing (free)

---

## Troubleshooting

### "Certificate not found" (Windows)
- Check certificate is installed: `Get-ChildItem Cert:\CurrentUser\My`
- Verify thumbprint matches config
- Ensure certificate is valid (not expired)

### "No identity found" (macOS)
- Check certificate installed: `security find-identity -v -p codesigning`
- Verify Team ID correct
- Ensure certificate not expired
- Try: `security delete-identity` and re-import

### "Notarization failed" (macOS)
- Check errors: `xcrun notarytool log <submission-id>`
- Common issues:
  - Hardened runtime not enabled
  - Entitlements missing
  - Code signature invalid
  - App contains unsigned binaries

### "SmartScreen blocks app" (Windows)
- EV certificates bypass SmartScreen immediately
- Standard certificates need "reputation" (downloads over time)
- Submit to Microsoft for SmartScreen allowlist

---

## Summary

| Platform | Cost | Complexity | Required? |
|----------|------|------------|-----------|
| **Windows** | $200-500/yr | Medium | Optional (recommended) |
| **macOS** | $99/yr | High | **Mandatory** |
| **Linux** | Free | Low | Optional |

**Recommended Path:**
1. Start with macOS signing only (mandatory anyway)
2. Add Windows signing when you have budget
3. Add GPG signing for Linux if desired

**Resources:**
- Windows: https://learn.microsoft.com/en-us/windows/win32/seccrypto/cryptography-tools
- macOS: https://developer.apple.com/support/code-signing/
- Tauri: https://tauri.app/v1/guides/distribution/sign-windows
