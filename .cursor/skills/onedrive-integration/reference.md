# OneDrive Integration Reference

## Core Graph Operations

Use Microsoft Graph Drive APIs with explicit error handling and clear retries.

### Create Folder

- Resolve parent location (`driveId` + parent item path/ID).
- Create folder with explicit conflict policy.
- Treat creation as idempotent for repeat runs.

### Upload File

- **Small files**: simple upload endpoint.
- **Large files**: upload session with chunked transfer.
- Confirm final item metadata (`id`, `name`, `parentReference`, `webUrl`).

## Token Lifecycle Handling

### Access Token Use

- Check expiry before calls.
- Refresh proactively when near expiry if your auth stack supports it.
- On 401, refresh once and retry safely.

### Security Rules

- Never print raw access or refresh tokens.
- Log only non-sensitive diagnostics (request IDs, status codes, endpoint class).
- Keep least-privilege scopes where possible.

## Reliability Patterns

- Retry transient failures (`429`, selected `5xx`) with exponential backoff.
- Respect throttling hints such as `Retry-After`.
- Avoid duplicate uploads by deterministic naming and existence checks.
- For reruns, reuse known folder IDs/paths when available.

## Troubleshooting Guide

- **401/403**: scope mismatch, expired token, or consent issue
- **404**: incorrect drive/site/item path
- **409**: naming conflict; align conflict behavior
- **429**: throttled; back off and retry
- **507**: storage quota issue

## Output Expectations

When reporting results, include:

1. Requested action (create folder/upload file/token refresh)
2. Outcome (success/failure)
3. Graph item identifiers or normalized paths
4. Retries performed and remaining risks
