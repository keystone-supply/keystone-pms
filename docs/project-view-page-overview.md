# Keystone‑PMS Project View Page — Detailed Summary

The project workspace is the page at `app/projects/[id]/page.tsx`. It is a single
client‑rendered Next.js route that composes several collapsible "panels" around a
shared `ProjectWorkspaceProvider` context, and ties the UI to Supabase (projects,
documents, calc tapes, mirrored files) and to Microsoft OneDrive (project folder
tree + `_DOCS` / `_CAD` uploads + delta sync).

---

## 1. Page shell and top chrome

File: `app/projects/[id]/page.tsx`

```tsx
export default function ProjectDetail() {
  // ...
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <DashboardHeader ... title={headerTitle} subtitle={headerSubtitle} />
      <QuickLinksBar openQuotesCount={...} newProjectHref={...} capabilities={capabilities} />
      <ProjectWorkspaceProvider ...>
        <WorkspaceBody ... />
      </ProjectWorkspaceProvider>
      <StatusAdvanceDialog ... />
    </div>
  );
}
```

- `useParams` extracts the `id`; the page runs only when `useSession()` is
  `authenticated`. Unauthenticated users see a centered "Sign in to view this
  project" card with a blue "Sign in" button. Loading shows a full-screen
  "Loading…" message.
- Role gating is derived from `getSessionCapabilitySet(session)`:
  - `canEditProjects` — enables the overview inputs and the global
    "Save changes" button.
  - `canViewFinancials` — toggles the financials panel vs a "Financial panels
    are hidden for your role" note.
  - `canManageDocuments` — gates New/Edit/Export buttons in the documents
    section.
  - `canAccessSales` — controls the small "Open account in Sales" link in
    overview.
- `DashboardHeader` shows the project title
  (`${project_number} — ${UPPERCASE NAME}`), a "last updated" badge, and the
  sign‑out button.
- `QuickLinksBar` is the same navigation strip used site‑wide (projects list,
  sales, new project, calc, etc.), carrying an `openQuotesCount` badge.
- Under the header, a sticky bar contains:
  - An outline "All projects" `Link` → `/projects`.
  - A primary "Save changes" `<Button>` with a `Save` icon that calls
    `saveProject()` (uses `useProjectDetail`'s unsaved patch). It's disabled
    while `saving` or when the user lacks `canEditProject`.
- Three status banners render below that bar:
  - Amber read‑only banner when `!canEditProject`.
  - Emerald `saveMessage` with dismiss `X`.
  - Red `saveError` with dismiss `X`.
- The whole body is centered in `max-w-[1700px]` with dark zinc styling
  (`bg-zinc-950 text-white`, `rounded-3xl border border-zinc-800 bg-zinc-900`).

### URL state + keyboard shortcuts (`WorkspaceBody`)

`WorkspaceBody` is inside the provider and handles layout state tied to the URL
(`?file=…&kind=…` via `parseProjectWorkspaceLayout` /
`writeProjectWorkspaceLayoutToSearch` in `lib/projectWorkspaceLayout.ts`). It
does a few interesting things:

- Scroll‑to refs (`docsRef`, `calcRef`, `filesRef`) that smoothly scroll when
  `workspace.focusTarget` changes, auto‑expanding the Documents and Files
  collapsibles when they become the focus target.
- Bi‑directional sync between `workspace.selectedFileId` / `focusedDocKind` and
  the `?file=` / `?kind=` query params, with a 2‑second grace window
  (`PendingFileUrlSync`) so a file click doesn't fight a back/forward
  navigation.
- Global keydown listener:
  - `Cmd/Ctrl + S` calls `workspace.savePatch({})`.
  - `g f`, `g c`, `g d` jump focus to Files, Calc, or Docs (with smooth
    scroll).

---

## 2. `ProjectOverviewPanel` — top panel

`components/projects/project-overview-panel.tsx` renders a rounded card titled
"Project info" that includes:

- `ProjectStatusTicker` (from `deriveProjectStatusTicker(project)`) —
  horizontal stage bar rendered `variant="full"`. Stages are clickable when
  `canEditProject`; clicking calls `onAdvanceStage(stage)` which opens
  `StatusAdvanceDialog`.
- Two‑column body:
  - **Left**: `ProjectBasicsFields` in `mode="edit"` — four free‑text fields:
    `customer`, `project_name`, `customer_po`, plus a Supply/Industrial pill
    toggle.
  - **Right** (rounded card inside): three rows —
    - `PROJECT #` — mono emerald display of the immutable `project_number`.
    - Two dropdowns side by side:
      - `STAGE` — `<select>` backed by `SALES_PROJECT_COLUMNS` with labels
        from `PIPELINE_STAGE_LABELS`. Writes `sales_command_stage`.
      - `CRM account (optional)` — `<select>` of `customersList`
        (`legal_name (account_code)`); "None — free‑text customer only" is
        the null option. When set, a small "Open account in Sales" link
        appears if `canAccessSales`.
    - `Payment received` — checkbox writing `payment_received`.
- Collapsible `Milestones (date/time, optional)` accordion with 12
  `datetime-local` inputs bound to fields like `rfq_received_at`,
  `rfq_vendors_sent_at`, `quote_sent_at`, `po_issued_at`, `in_process_at`,
  `materials_ordered_at`, `material_received_at`, `labor_completed_at`,
  `ready_to_ship_at`, `completed_at`, `delivered_at`, `invoiced_at`. Dates
  round‑trip through `isoToDatetimeLocal` / `datetimeLocalToIso`.

All inputs are disabled by the wrapping `<fieldset disabled={!canEditProject}>`,
so read‑only viewers see grayed controls.

### `StatusAdvanceDialog`

Modal that opens when a ticker stage is clicked. It maps `TickerStageId` →
`SalesBoardMoveTarget` via `ADVANCE_TARGET_BY_STAGE` and stamps the matching
milestone `*_at` field plus `sales_command_stage` using `rowAfterMoveToColumn`
from `lib/salesBoard`. Confirming calls `onConfirm(patch)` which is wired to
`saveProjectPatch(patch)` — so stage advancement is a minimal patch save, not a
full-save.

---

## 3. Financials section

A full‑width collapsible card ("Project financials + Actuals (P&L)") that
splits into two subsections when expanded:

- `ProjectQuoteFinancialsPanel` — edits `engineering_quoted`,
  `equipment_quoted`, `logistics_quoted` and per‑bucket `*_markup_pct`, plus
  the materials/labor quoted amounts and markup. Uses helpers from
  `lib/projectFinancials.ts` (`computeQuotedInternalCostTotal`,
  `computeQuoteCustomerTotal`, `markupDollarsFromBasis`,
  `quotedLaborInternalCost`, etc.).
- `ProjectActualsFinancialsPanel` — Mirrors that structure but for realized P&L
  (material/labor/equipment/logistics actuals, invoiced amount, payment). Both
  receive `applyFinancialPatch` (alias of `applyProjectPatch` from
  `useProjectDetail`) which edits the in‑memory project so the global
  "Save changes" can persist the delta.

If the role lacks `canViewFinancials`, the whole section is replaced by a muted
"Financial panels are hidden for your role." message.

---

## 4. `ProjectDocumentsSection` — heart of the document workflow

File: `components/projects/project-documents-section.tsx`. This is the largest
panel and the source of most document logic. Its header is "Project documents —
RFQs, quotes, POs, packing lists, BOLs, and invoices — export to PDF or your
job's OneDrive `_DOCS` folder."

### 4.1 Row list

- Fetched via Supabase:
  - `supabase.from('project_documents').select(PROJECT_DOCUMENT_SELECT).eq('project_id', projectId).order('updated_at')`.
- Each row shows:
  - Sky `FileText` icon + `DOCUMENT_KIND_LABEL[kind]` (e.g., "Quotation",
    "Purchase order").
  - A mono line: `{number} · REV. {current_revision_index} {suffix}` with an
    emerald "· file saved" note when `pdf_path` is set.
- Row action buttons (right side, wrap):
  - **Use as reference** (only on quote/invoice with a stored
    `quoteFinancialsSnapshot`) — restores saved quote financials back into the
    editable project row via `snapshotToProjectPatch` +
    `onApplyQuoteFinancialsSnapshot`. Tooltip says "Restore Project financials
    from values stored when this document was saved. Save the project to
    persist."
  - **Preview** (`Eye` icon) → `quickPreview(row)` which runs
    `generateProjectDocumentPdfBuffer(...)` and opens the PDF blob in a new
    tab.
  - **Print** (`Printer`) → same compose path piped through
    `openPdfPrintWindow`.
- **Edit** (secondary) → opens the row in the Document Workspace editor
  (disabled for read‑only).
  - **Show/Hide history** (`History`) → toggles the expanded revision history
    panel under the row.
  - **Export** (primary, `HardDriveDownload`) → opens the export modal.
- Expanded **Revision history** panel (`expandedHistoryId === r.id`):
  - Loaded from `project_document_revisions` via `loadRevisionHistoryForRow`
    (`PROJECT_DOCUMENT_REVISION_SELECT`), cached in `rowRevisionCache` to avoid
    refetch.
  - Sorts: active revision first, then exported, then drafts, then by
    `revision_index` DESC.
  - Each revision row shows `buildRevisionHistoryLabel` (e.g.,
    `REV. 3 (v3) - 2026-03-14 10:22 MT`), an "Active" / "exported" / "draft"
    badge, and `number_snapshot` / `filename`.
  - Per‑revision actions: Preview, Print, and `Export REV {n}` (reopens the
    export modal for that specific revision).

### 4.2 New / Edit Document Workspace (default path)

Triggered by the "New document" button (`Plus` icon; disabled if
`!canManageDocuments`) or row **Edit**. The editor now opens inline inside the
Documents panel as a full-width workspace (`DocumentWorkspace`) instead of the
legacy modal.

- **Workspace shell** — three-pane layout on wide screens and tabbed pane
  switching on narrow screens:
  - Left: metadata (`workspace-metadata-pane`) for document title/number,
    customer/project naming, and notes.
  - Center: line-items editor (`workspace-line-items-pane`) with hierarchy,
    option groups, rich text descriptions, calc-sync controls, and image
    references.
  - Right: live PDF preview (`workspace-preview-pane`) with zoom and draft
    watermark toggle.
- **Kinds and metadata** — kind selection and numbering still use
  `PROJECT_DOCUMENT_KINDS` and `suggestDocNumber(...)`; vendor metadata remains
  conditional for RFQ/PO.
- **Rich editing model** — `descriptionRich`, option grouping, calc links, and
  image refs are stored in document metadata; plain description remains as
  fallback/search text.
- **Keyboard support** — escape close, Cmd/Ctrl+S save, line navigation via
  arrows, and indent/outdent via Tab/Shift+Tab.
- **Warnings and validation cues** — workspace header surfaces missing lead
  time/shipping/contact and subtotal-over-budget warnings before save/export.

#### Save logic (`saveDraft`)

- If `kind` supports a financial snapshot (quote/invoice), calls
  `buildQuoteFinancialsSnapshot(project)` and attaches it to
  `meta.quoteFinancialsSnapshot`; else deletes it.
- Routes through **Supabase RPCs** (immutable revision model) rather than
  direct inserts:
  - New doc: `supabase.rpc('create_project_document_with_initial_revision', { p_project_id, p_kind, p_number, p_metadata, p_vendor_id })`.
  - Existing doc: `supabase.rpc('append_project_document_revision', { p_document_id, p_number, p_metadata, p_vendor_id })`.
- After save, `projectPatchFromSavedQuoteOrInvoice(kind, meta)` computes any
  roll‑forward project field changes (e.g., material/labor quoted totals); if
  non‑empty it does a direct `update` on `projects` and calls
  `onProjectRefresh`.
- Reloads the document list and closes the editor. Errors surface inline as
  red text under the form.

### 4.3 Import from Calc dialog

Opened from the workspace line-items pane. Workflow:

1. On open, loads `project_calc_tapes` for this project
   (`PROJECT_CALC_TAPE_SELECT`) ordered by newest. Preferred tape can come from
   the workspace context (`workspace.lastSavedTapeId`, auto‑fired when the
   Shop Calc saves a new tape).
2. Loads `project_calc_lines` for the chosen tape, auto‑selecting rows where
   `kind === 'material'`.
3. **Tape** dropdown + **Strategy** dropdown (`oneToOne`, `collapseLumpSum`,
   `costPlusMarkup`). If cost‑plus, a **Markup %** input appears (defaults to
   `project.material_markup_pct ?? 30`).
4. **Calc lines** list of checkboxes (non‑material rows disabled) with
   `{description} ({kind})`.
5. **Preview** area lists the derived document lines
   (`description · qty uom · $unitPrice = $extended`) using
   `buildDocumentLinesFromCalc`.
6. **Import** appends renumbered lines to the current draft; **Cancel**
   closes.

### 4.4 Export modal

Opens via row `Export` or history row `Export REV n`. Centered card
(`max-w-md`):

- Header shows `Job {project_number} — {kindLabel}`.
- **Segmented control** toggling method:
  - `Download` (`HardDriveDownload` icon) — browser download.
  - `OneDrive` (`CloudUpload` icon) — uploads to the project's `_DOCS`
    OneDrive folder. This is the default (`onedrive`).
- **Revision history** subcard: radio list of `exportRevisions` (loaded from
  `project_document_revisions`). Each row uses `buildRevisionHistoryLabel(rev)`;
  selected index defaults to `current_revision_index` (or the index you
  clicked from history).
- **Update job milestones** checkbox (default `true`) with a
  `HelpPopoverButton` explaining: "quote -> quote sent, RFQ -> vendors, vendor
  PO -> materials ordered, invoice -> invoiced, BOL -> delivered."
- Action row: `Preview selected REV`, `Print selected REV`, `Cancel`, and the
  primary `Download`/`Upload` (label flips with method; shows `Working…`
  while `exportBusy`).

#### Export execution (`runExport`)

1. `pickRevisionForExport(row, revisions, selectedIndex)` resolves the exact
   snapshot (number / metadata / vendor) to render.
2. `fetchLogoDataUrl(kind)` pulls the branded logo data URL for that document
   kind.
3. `generateProjectDocumentPdfBuffer({...})` composes the PDF using project +
   customer + vendor + default ship‑to from the CRM.
4. `buildDocumentDownloadFilename(project_number, kind, project_name, revisionIndex, issuedDate)`
   makes the filename.
5. Branch on `exportMethod`:
   - **Download**: creates a `Blob`, fires an anchor click, revokes the URL.
   - **OneDrive**: builds a `multipart/form-data` body with the PDF +
     filename + revisionIndex and `POST`s to
     `/api/projects/{projectId}/documents/export-onedrive`. On success the
     workspace is told to sync files and focus the Files panel
     (`workspace.requestFilesSync(filename)` + `workspace.focus('files')`),
     which will also highlight that filename in green.
6. Records the export by calling
   `supabase.rpc('mark_project_document_revision_exported', { p_document_id, p_revision_index, p_export_channel, p_pdf_path, p_filename, p_issued_at })`.
   For downloads `pdf_path` is `null`; for OneDrive it's the returned OneDrive
   path (so the row later shows "· file saved" and the revision state becomes
   "exported").
7. If `updateMilestones` is on, `milestonePatchForDocumentExport(project, kind)`
   runs and the delta is pushed to `projects` via Supabase (quote → `quote_sent`
   + `quote_sent_at`; rfq → `rfq_vendors` + `rfq_vendors_sent_at`;
   purchase_order → `materials_ordered_at` only; invoice → `invoiced` +
   `invoiced_at`; bol → `delivered` + `delivered_at`).
8. On any error, `exportError` shows inline in red; otherwise the list
   reloads.

---

## 5. `ProjectCalcPanel` — embedded Shop Calc

A collapsible card titled "Shop calc" that renders `UnifiedShopCalc` with
`layout="embedded"` bound to the project (`projectId`, `projectNumber`,
`projectName`, `customer`). Under the calc, a `Pinned tape values` area
(amber `Pin` icon) lists anything the user has pinned via
`workspace.pinCalcValue`, with per‑row **Copy to clipboard** and **Remove**
buttons. The panel auto‑expands whenever `workspace.focusTarget === 'calc'`
(e.g., because `g c` was pressed or "Start calc referencing this file" was
clicked from the Files panel).

Saved tapes publish their ID through `workspace.notifyTapeSaved(tapeId)`; the
documents section listens for that and auto‑opens the calc‑import dialog
pre‑selecting that tape.

---

## 6. `ProjectFilesPanel` — OneDrive mirror + inline previews

File: `components/projects/project-files-panel.tsx`. Title/subtitle:
"Project files — OneDrive folder mirror with inline previews." Top‑right
controls:

- **Refresh from OneDrive** (`RefreshCw`, spins while `refreshing`) —
  `POST /api/projects/{id}/files/sync`, full=false (delta).
- **Upload files** — labeled file `input` (multi), drops/uploads to
  `/api/projects/{id}/files/upload` (one request per file).

Errors render in an amber banner.

### Two‑column layout

- **Left (360px)**: the folder panel — a list of `<details>` accordions in a
  fixed slot order (`cad`, `vendors`, `pics`, `docs`, `gcode`, `root`,
  `other`) with counts. `SLOT_LABEL` maps them to "CAD, Vendors, Pics, Docs,
  G‑Code, Root, Other". Files are grouped via `ProjectFileRow.folder_slot` —
  folders themselves are hidden. Each file button shows name,
  `readableBytes(size)`, and a mirror status badge (`not_mirrored`,
  `mirroring`, `synced`, `stale`, `error`). The currently selected file is
  highlighted blue; a file whose name matches `workspace.highlightedFileName`
  (set right after a OneDrive export) gets an emerald highlight.
- **Right**: preview pane with drag‑and‑drop upload (`onDrop` calls
  `uploadFiles`). Header row shows the file name, mime type, and three action
  buttons:
  - **Start calc referencing this file** —
    `workspace.focus('calc', { seedFileId, seedTapeName })`. The Shop Calc
    panel pulls these seeds to pre‑name a new tape.
  - **Print** — disabled for Office/DXF; fetches
    `/api/projects/{id}/files/{fileId}/print` and uses
    `openPdfPrintWindow`/`openPrintWindow` helpers so PDFs open via an
    embedded iframe and other types open a print‑ready window.
  - **Open in OneDrive** (`ExternalLink`) — calls
    `/api/projects/{id}/files/{fileId}/open`, then
    `window.open(body.webUrl)`.

### Preview rendering logic

On select, `openPreview` calls
`/api/projects/{id}/files/{fileId}/preview`, which returns a short‑lived
Supabase Storage signed URL plus the `mirror_status`. Rendering branches:

- **Office** files (`*.docx`, `*.xlsx`, `*.pptx`, or mime containing
  `officedocument`) → stub: "Office files open in OneDrive."
- **DXF** → custom `DxfPreview` that fetches the signed URL, runs
  `parseDxfToShapes`, and draws the polygons/holes as `<path>` elements inside
  an SVG viewport.
- **Image** → `next/image` preview.
- **PDF** → `react-pdf` `<Document>` renders all pages sized to the viewport;
  `pdfjs.GlobalWorkerOptions.workerSrc` is wired to
  `pdfjs-dist/build/pdf.worker.min.mjs`. Helpers
  `getPdfPreviewRenderConfig`/`getPdfPreviewPageWidth` tune rendering.
- Other types → plain "Download file preview" link.

### Cross‑panel links

`useProjectWorkspaceOptional()` lets this panel react to the shared context:

- `filesSyncVersion` — bumped by `workspace.requestFilesSync(...)` (e.g.,
  after a OneDrive export). The panel reacts by calling
  `refreshFromOneDrive()` so the new PDF shows up.
- `highlightedFileName` — surfaces an emerald row highlight for the file that
  was just uploaded.
- `selectedFileId` — mirrors to `?file=` in the URL so deep‑linking works.

---

## 7. OneDrive folder topology and workflows

The canonical folder path is built in `lib/onedrive.ts` and
`lib/files/oneDriveSync.ts`:

```
OneDrive/Me/Documents/
  0 PROJECT FOLDERS/
    {CUSTOMER_UPPER}/                      # uppercased, stripped of non‑A‑Z0‑9
      {projectNumber} - {PROJECT_NAME}/
        {projectNumber}_CAD/
        {projectNumber}_VENDORS/
        {projectNumber}_PICS/
        {projectNumber}_DOCS/
        {projectNumber}_G-CODE/
```

### 7.1 Creation on new project (`/new-project`)

`app/new-project/page.tsx` wires it together:

1. Fetches all existing `projects.project_number`s via Supabase and runs
   `nextSequentialJobNumber` to suggest a new number (displayed huge in
   `font-mono text-5xl font-bold text-emerald-400`).
2. On submit: inserts the row with `sales_command_stage: 'rfq_customer'`,
   `files_phase1_enabled: true`, nulled cost fields, etc.
3. Reads a fresh token from `/api/auth/session` (`session.accessToken` — the
   Microsoft Graph token issued by NextAuth) and calls
   `createProjectFolders(token, customer, jobNumber, projectName)` which
   `ensureFolder`s the base segments and every
   `_CAD/_VENDORS/_PICS/_DOCS/_G-CODE` subfolder via Graph
   (`POST /me/drive/root:/…:/children` with `folder: {}`; 409 means "already
   exists"; every step is idempotent).
4. Redirects to `/projects/{saved.id}`.

If the session has no access token (e.g., Microsoft Graph scope missing), it
logs and skips folder creation — but the project still saves.

### 7.2 File indexing / delta sync (`lib/files/oneDriveSync.ts`)

- `indexProjectFolder(projectId, accessToken)` hits
  `GET /me/drive/root:/{folderPath}:/delta` and walks all pages, upserting each
  item into `project_files` by `onedrive_item_id`. It records
  `parentReference.path → onedrive_path` and classifies each item into a
  `ProjectFolderSlot` via `classifyFolderSlot` (regex on the normalized path
  matches `_CAD`, `_VENDORS`, `_PICS`, `_DOCS`, `_G-CODE`, or `root`/
  `other`).
- `deltaSyncProject` uses the stored `@odata.deltaLink` from
  `project_folder_sync.delta_token` for incremental updates. If a
  `@removed`/`deleted` item comes in, the row is deleted from
  `project_files`.
- Mirror status is updated through
  `deriveMirrorStatusPatch({ isFolder, etagChanged })`: when `onedrive_etag`
  changes vs what we have, the row's `mirror_status` becomes `stale`.
- `mirrorFile(row, accessToken)` fetches the OneDrive bytes, SHA‑256 hashes
  them, and uploads to the Supabase **`project-files`** storage bucket under
  key `{projectId}/{onedrive_item_id}`, then updates `storage_object_key`,
  `storage_sha256`, `mirrored_at`, `mirror_status = 'synced'`. Files over
  `PROJECT_FILES_MIRROR_MAX_BYTES` (default 100 MB) are marked as `error` with
  an explanatory `mirror_error`.

### 7.3 Upload (`POST /api/projects/{id}/files/upload`)

- Requires `canEditProjects` + a resolved OneDrive access token (via
  `resolveOneDriveAccessToken`, sourced from the NextAuth session or a
  service account).
- Reads the project's `customer / project_number / project_name`, sanitizes
  the file name, calls `createProjectFolders` (idempotent ensure), resolves
  `basePath + /{number}{suffix}` from `SLOT_TO_SUFFIX[folderSlot]` (defaults
  to root), and PUTs the bytes to `…/root:/{encodedPath}:/content`.
- Runs `deltaSyncProject` so the new item is indexed, then fetches the row by
  `onedrive_item_id` and calls `mirrorFile` so the preview is ready
  immediately. Returns the full mirrored `ProjectFileRow`.

### 7.4 PDF export to OneDrive (`POST /api/projects/{id}/documents/export-onedrive`)

- Requires `canManageDocuments`.
- `uploadPdfToDocs(accessToken, customer, projectNumber, projectName, filename, revisionIndex, bytes)`
  ensures the base folders, ensures `{projectNumber}_DOCS`, renames the file
  via `buildVersionedPdfFilename(filename, revisionIndex)` →
  `"{base} (v{N}).pdf"` (strips any trailing `(vN).pdf` first), and PUTs
  bytes to Graph.
- Returns `{ ok: true, path }`. The front‑end then writes the export record
  to `project_document_revisions` via
  `mark_project_document_revision_exported` RPC with
  `export_channel = 'onedrive'` + `pdf_path = path`.

### 7.5 Preview / print / open routes

- `GET /api/projects/{id}/files/{fileId}/preview` — returns a 5‑minute signed
  URL from Supabase Storage. If the row isn't mirrored yet or
  `mirror_status === 'stale'`, it triggers `mirrorFile` first, so stale
  OneDrive edits auto‑refresh.
- `GET …/print` — streams the mirrored content for the print popup.
- `GET …/open` — returns the OneDrive `web_url` so the UI can open the native
  OneDrive view in a new tab.
- `POST /api/projects/{id}/files/sync` — manual refresh (`full=false` delta,
  `full=true` reindex).
- `GET /api/projects/{id}/files` — reads rows for the UI, and if the last
  delta is older than 60 seconds it fires a best‑effort background
  `deltaSyncProject` so panels always trend toward fresh.

---

## 8. Data model touchpoints

| Surface | Tables / RPCs / Storage |
|---|---|
| Project core | `projects` (direct selects/updates via `useProjectDetail` and `applyProjectPatch`/`saveProjectPatch`) |
| Documents | `project_documents` (list), `project_document_revisions` (history) |
| Document writes | RPCs `create_project_document_with_initial_revision`, `append_project_document_revision`, `mark_project_document_revision_exported` |
| Calc import | `project_calc_tapes`, `project_calc_lines` |
| OneDrive mirror | `project_files`, `project_folder_sync`; Supabase Storage bucket `project-files` keyed `{projectId}/{onedrive_item_id}` |
| Vendors / CRM | `vendors` (RFQ/PO dropdown), `customers` (CRM + shipping address for PDF rendering) |

Role gating comes from `lib/auth/roles.ts` (capabilities: `read_projects`,
`canEditProjects`, `canManageDocuments`, `canViewFinancials`,
`canAccessSales`, `canCreateProjects`). API routes use
`requireApiCapability` / `requireApiRole` to enforce them server‑side; the UI
uses the client‑side helpers to disable buttons.

---

## 9. Cross‑panel glue (`ProjectWorkspaceProvider`)

The provider in `lib/projectWorkspaceContext.tsx` exposes one state hub used
by every panel. Key members:

- `project`, `applyPatch`, `savePatch`, `refreshProject` — shared optimistic
  update pipeline.
- `selectedFileId` / `selectFile` — two‑way bound to the URL and to the Files
  panel.
- `focusTarget` / `focus(target, opts)` — drives auto‑scroll and auto‑expand.
  Supported targets: `overview`, `docs`, `calc`, `files`. Options include
  `docKind` (to seed the documents editor), `seedFileId` / `seedTapeName`
  (so the calc can name a new tape after a file).
- `focusedDocKind` — when set, the documents panel jumps to that kind.
- `lastSavedTapeId` / `notifyTapeSaved` — publishes tape saves so the
  documents section can auto‑open calc import.
- `pinnedCalcValues` / `pinCalcValue` / `unpinCalcValue` — backs the
  "Pinned tape values" strip.
- `filesSyncVersion` / `requestFilesSync(highlightFileName)` — triggers a
  OneDrive refresh and highlights the just‑uploaded file in green in the Files
  panel.

The net effect is a choreographed flow that looks like this: you save a quote
PDF → the export modal uploads to OneDrive → the revision row is stamped as
exported with the OneDrive path → the Files panel syncs and highlights the new
PDF → pressing `g d` takes you back to Documents, and the row now shows
"· file saved" with the new revision in its history.
