# Document Workspace Launch Checklist

Date: 2026-04-22  
Scope: `Project Documents` workspace rollout in project view  
Data target: Real project records in `projects/[id]` (manual in-app verification)

## Automated baseline run (this session)

- `npm run build` -> PASS
- `npm run lint` -> PASS
- `node --import tsx --test lib/documents/richTextSerializer.test.ts lib/documents/calcDocumentSync.test.ts lib/documents/buildJobPacket.test.ts lib/documents/workspaceFeatureFlag.test.ts` -> PASS
- `npm run test:document-pdf` -> PASS

## Manual launch checklist (real project data)

### 1) Create / edit / preview / save / export (download + OneDrive)

- Create new document from project view and edit metadata + line items: **NOT RUN (manual UI required)**
- Live preview updates while editing rich text and line quantities: **NOT RUN (manual UI required)**
- Save draft and reopen document with edits persisted: **NOT RUN (manual UI required)**
- Export as download and verify generated PDF opens: **NOT RUN (manual UI required)**
- Export to OneDrive and verify file in job `_DOCS` folder: **NOT RUN (manual UI + org auth required)**

### 2) Revision history + Use as reference

- Open revision history from list and preview older revision: **NOT RUN (manual UI required)**
- Apply "Use as reference" and verify quote financial snapshot patching: **NOT RUN (manual UI required)**

### 3) Calc push / pull and conflict handling

- Import lines from calc with mapping preview: **NOT RUN (manual UI required)**
- Push changed linked document lines back to calc tape: **NOT RUN (manual UI required)**
- Refresh linked calc lines into document draft: **NOT RUN (manual UI required)**
- Introduce divergence and validate conflict indicators + resolution actions: **NOT RUN (manual UI required)**

### 4) Mobile / tabbed pane usability

- Open workspace on narrow viewport and switch Metadata / Lines / Preview tabs: **NOT RUN (manual UI required)**
- Confirm line editing and preview controls remain usable in stacked mobile fallback: **NOT RUN (manual UI required)**

## Go-live disposition

- Current code quality gates pass in local automation.
- Global rollout is enabled: the workspace editor path is now the default for all users.
- Manual real-project verification items above are still open and should be completed as post-launch validation.
