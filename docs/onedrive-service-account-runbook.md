# OneDrive Service Account Runbook

This runbook documents how Keystone uses a dedicated Microsoft account for
OneDrive access while application users can keep email/password login.

## 1) Provision the Microsoft Service Account

1. Create a dedicated account in your Microsoft tenant (example:
   `keystone-files@yourdomain.com`).
2. Assign a license that includes OneDrive.
3. Sign in once as the service account to initialize OneDrive.
4. In that account's OneDrive, create:
   - `Documents/0 PROJECT FOLDERS`
5. Verify your Azure app registration still has delegated Graph permission:
   - `Files.ReadWrite.All`
   - `offline_access`
6. Ensure admin consent is granted for your tenant.

## 2) Capture and Store Service Refresh Token

Keystone now supports server-owned token refresh via environment variables:

- `ONEDRIVE_SERVICE_REFRESH_TOKEN` (required to enable service-account mode)
- `ONEDRIVE_SERVICE_CLIENT_ID` (optional, defaults to `AZURE_AD_CLIENT_ID`)
- `ONEDRIVE_SERVICE_CLIENT_SECRET` (optional, defaults to `AZURE_AD_CLIENT_SECRET`)
- `ONEDRIVE_SERVICE_TENANT_ID` (optional, defaults to `AZURE_AD_TENANT_ID`)

Store these in your secret manager or host environment (encrypted at rest). Do
not place them in client-exposed (`NEXT_PUBLIC_*`) variables.

### One-time helper to capture refresh token

You can capture the refresh token from an existing Azure admin session:

1. Temporarily set `ONEDRIVE_REFRESH_CAPTURE_KEY` to a random one-time value.
2. Sign in to Keystone with Microsoft as an admin user.
3. Call:
   - `POST /api/auth/onedrive-service-refresh-token-once`
   - Header: `x-onedrive-capture-key: <ONEDRIVE_REFRESH_CAPTURE_KEY>`
4. Save `refreshToken` response value as `ONEDRIVE_SERVICE_REFRESH_TOKEN`.
5. Remove `ONEDRIVE_REFRESH_CAPTURE_KEY` and restart app.

Optional CLI helper:

- `npm run onedrive:capture-refresh-token`
- Required env for script:
  - `ONEDRIVE_REFRESH_CAPTURE_KEY`
  - `NEXTAUTH_SESSION_COOKIE` (full NextAuth cookie string)
  - Optional: `ONEDRIVE_REFRESH_CAPTURE_URL`

## 3) Runtime Behavior

For project file APIs (`list`, `sync`, `upload`, `preview`, `print`):

1. Keystone first attempts to refresh and use the dedicated service-account
   Graph token.
2. If service refresh fails or is not configured, Keystone falls back to the
   signed-in user's Azure token.
3. If neither token is available, the API returns 401 with an admin reconnect
   message.

This keeps existing Azure user flow available as a break-glass fallback.

## 4) Shared Directory Guidance

Keep one canonical root in the service account OneDrive:

- `Documents/0 PROJECT FOLDERS`

The current app indexing and folder-slot classification assume this path
structure.

## 5) Rotation and Re-Consent

### Planned rotation

1. Acquire a fresh refresh token for the service account.
2. Update `ONEDRIVE_SERVICE_REFRESH_TOKEN` in secrets.
3. Restart the app deployment.
4. Run a smoke check:
   - open project files list
   - sync files
   - upload a file
   - preview and print

### If refresh token is revoked or expires

1. Re-run consent/login flow for the service account.
2. Replace `ONEDRIVE_SERVICE_REFRESH_TOKEN`.
3. Restart app deployment.
4. Re-run smoke check.

## 6) Failure Handling

Indicators:

- API responses with `OneDrive is not connected...`
- Server logs containing:
  - `Service account token refresh failed with status ...`
  - `Service account token refresh failed: ...`

Response:

1. Confirm service-account env vars are present in server environment.
2. Confirm app registration secret and delegated permissions are valid.
3. Re-consent and replace refresh token if needed.
4. Use Azure user sign-in temporarily while repairing service-account token.
