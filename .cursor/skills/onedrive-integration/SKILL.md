---
name: onedrive-integration
description: Implements Microsoft Graph OneDrive workflows for folder creation, file uploads, and authentication token refresh handling. Use when the user asks about project folder automation, Graph Drive API calls, upload reliability, or Azure AD token lifecycle issues.
---

# OneDrive Integration

_Last updated: 2026-03-31_

## Core Focus

Handle Microsoft Graph folder creation, file uploads, and auth token refresh workflows with secure, production-safe defaults.

## When To Apply

Apply this skill when work includes:
- Creating OneDrive/SharePoint project folder structures
- Uploading exports, attachments, or generated files
- Handling Azure AD access token expiration and refresh
- Debugging Graph API permission/scope/auth failures

## Workflow

1. Confirm prerequisites:
   - Tenant and user/app context
   - Required scopes (minimum needed, e.g. `Files.ReadWrite.All` when applicable)
   - Correct drive/site/folder identifiers
2. Validate auth path:
   - Check token presence and expiry handling
   - Use refresh flow before token expiry or on 401 retry path
   - Never log raw access/refresh tokens
3. Folder creation:
   - Resolve parent path/ID first
   - Create idempotently (avoid duplicate folder trees)
   - Handle conflict behavior explicitly (`rename`, `replace`, or fail-fast per policy)
4. File upload:
   - Choose upload mode by size (simple upload vs upload session)
   - Preserve deterministic file names and project mapping
   - Verify completion response and stored item metadata
5. Error handling:
   - Parse Graph error codes/messages
   - Distinguish auth, permission, quota/throttling, and path errors
   - Implement retry with backoff for transient failures
6. Return clear outcome:
   - Created folder IDs/paths
   - Uploaded file IDs/paths
   - Any assumptions, retries, and unresolved warnings

## Output Requirements

- Include endpoint intent and payload shape in plain language.
- State scope assumptions explicitly.
- Document retry/refresh behavior used.
- Redact all sensitive token values in logs/output.
- End with a short verification checklist.

## Quick Verification Checklist

- [ ] Required Graph scopes are confirmed
- [ ] Folder creation is idempotent for reruns
- [ ] Upload method matches file size profile
- [ ] Token refresh path is handled safely
- [ ] No sensitive tokens are logged

## Additional Resources

- Endpoint patterns and token guidance: [reference.md](reference.md)
- Tape / quote file destinations often pair with [quoting-and-weight](../quoting-and-weight/SKILL.md); use `.cursor/agents/onedrive-wrangler.md` for deep Graph passes.
