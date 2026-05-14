# GitHub Secrets Configuration

To enable code signing in the CI/CD pipeline, add these secrets to your GitHub repository:

**Settings → Secrets and variables → Actions → New repository secret**

## Windows Code Signing (Optional)

Only needed if you have a Windows code signing certificate:

### `WINDOWS_CERTIFICATE_BASE64`
Your .pfx certificate file encoded as base64:

```powershell
# Windows PowerShell
$bytes = [System.IO.File]::ReadAllBytes("path\to\certificate.pfx")
$base64 = [System.Convert]::ToBase64String($bytes)
$base64 | Set-Clipboard
# Now paste into GitHub secret
```

### `WINDOWS_CERTIFICATE_PASSWORD`
The password for your .pfx certificate file.

### `WINDOWS_CERTIFICATE_THUMBPRINT`
The certificate thumbprint (optional, for tauri.conf.json):

```powershell
(Get-ChildItem -Path Cert:\CurrentUser\My -CodeSigningCert | Where-Object {$_.Subject -like "*Your Company*"}).Thumbprint
```

---

## macOS Code Signing (Required for Distribution)

Required for distributing macOS apps:

### `APPLE_CERTIFICATE_BASE64`
Your Developer ID Application certificate encoded as base64:

```bash
# Export certificate from Keychain Access:
# 1. Open Keychain Access
# 2. Find "Developer ID Application: Your Name"
# 3. Right-click → Export → Save as .p12
# 4. Set a password

# Encode to base64:
base64 -i certificate.p12 | pbcopy
# Now paste into GitHub secret
```

### `APPLE_CERTIFICATE_PASSWORD`
The password you set when exporting the .p12 file.

### `APPLE_ID`
Your Apple ID email (e.g., `your@email.com`).

### `APPLE_PASSWORD`
An app-specific password (NOT your regular Apple ID password):

1. Go to https://appleid.apple.com/account/manage
2. Sign in
3. Security → App-Specific Passwords
4. Generate password
5. Copy and save as secret

### `APPLE_TEAM_ID`
Your 10-character Team ID:

```bash
# Find at: https://developer.apple.com/account/#!/membership/
# Or from certificate:
security find-identity -v -p codesigning
# It's the string in parentheses, e.g., (A1B2C3D4E5)
```

---

## Tauri Updater (Optional)

Only needed if you set up auto-updates:

### `TAURI_SIGNING_PRIVATE_KEY`
Generate with:

```bash
npm install -g @tauri-apps/cli
tauri signer generate
```

Copy the private key output.

### `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
The password for the signing key.

---

## Verifying Secrets

After adding secrets, you can verify they work by:

1. Push a commit to trigger the workflow
2. Go to **Actions** tab
3. Check the build logs
4. Look for signing/notarization steps

If secrets are not configured, the workflow will skip those steps and continue with unsigned builds.

---

## Security Notes

- ✅ Never commit certificates or passwords to your repository
- ✅ Use app-specific passwords for Apple ID (not your main password)
- ✅ Rotate certificates before they expire
- ✅ Limit access to GitHub secrets to trusted collaborators
- ✅ Use environment-specific secrets for staging vs production

---

## Testing Without Secrets

The CI/CD workflow works without code signing configured:

```yaml
# These steps are conditional:
if: env.CERTIFICATE_BASE64 != ''  # Skips if secret not set
```

So you can:
1. Set up CI/CD first
2. Test builds without signing
3. Add signing later when certificates are ready

This allows gradual rollout without blocking development.
