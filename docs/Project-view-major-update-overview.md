**Keystone-PMS Project Documents & UI Upgrade Plan**  
**Focused Scope: Project View Page – Documents Section & Supporting Workflow**  
**Version: 1.0 | Date: April 22, 2026**

> Implementation status (Apr 22, 2026): This spec has been substantially delivered and the Document Workspace is now the default editor path for all users in `project-documents-section`. Keep this file as the original product intent reference; see `docs/document_workspace_upgrade_f1fdea2d.plan.md` and `docs/document-workspace-launch-checklist.md` for current execution/launch state.

### Release History (Short)
- **2026-04-22 — Document Workspace launch (`4b74b06`)**
  - Project view now uses a centralized Document Workspace for authoring, preview, sync, and export.
  - Added richer content tooling (snippets, template chips, rich-text controls, inline image flows).
  - Added calc import/sync support plus job packet and PDF pipeline enhancements for more consistent outputs.

### Executive Summary
This plan upgrades the document creation experience inside the existing **Project View page** (`app/projects/[id]/page.tsx` and its child panels) to replace the current simple modal + flat line grid with a modern, visual, low-friction **Document Workspace**.  



All changes stay strictly inside the project view/edit scope. No new top-level pages, no changes to sales board, dashboard, or external modules. Shop Calc integration is enhanced only where it touches documents.

**Primary Outcomes**  
- Users see a live, faithful preview of the final PDF while editing (no more “type blind”).  
- Rich, hierarchical content (sub-items, options, inline images, colored/highlighted text) matches real shop quoting style.  
- Two-way sync between Shop Calc tapes and document lines.  
- Same powerful editor applies to every document type (RFQ, Quote, PO, Packing List, BOL, Invoice).  
- Faster daily workflow: fewer clicks, less context switching, better reuse of existing project data/files/calc.



### Phased Implementation Plan (3 Phases, All Inside Project View)

#### Phase 1 – Foundation & Quick Wins (High Impact, 2–3 weeks)
**Goal**: Deliver live preview + rich text basics so users immediately feel the improvement.

**Key Deliverables**  
1. **New Document Workspace Layout** (replaces current modal)  
   - Resizable three-pane view inside the existing Documents section or as a full-width expandable panel triggered from the current “New/Edit” buttons.  
   - Left pane: Document metadata + notes (keeps current fields + adds rich-text notes area with template chips).  
   - Center pane: Line items editor (drag-drop, basic rich text).  
   - Right pane: Live Preview (faithful render of current PDF generator).  

2. **Rich Text Description Field** (first version)  
   - Toolbar with: Bold, Italic, Color (red/orange presets + picker), Highlight, Bullets, Indent.  
   - Applied to Description column for all document types.  
   - Maps cleanly to existing PDF renderer so output fidelity is unchanged.

3. **Live Preview Pane**  
   - Uses the exact same `generateProjectDocumentPdfBuffer` path (server call with debounce).  
   - Shows “DRAFT” watermark toggle and page zoom.  
   - Click-to-jump from preview element → editor line (basic version).  

4. **Sub-Component Rows (Hierarchical Lines)**  
   - “Add Sub-Item” button on any line creates indented child row.  
   - Visual nesting in editor + correct indentation in PDF preview/output.  
   - Matches Starter Bar Assembly example perfectly.

5. **Quick Template Chips** in notes area (for common phrases: “**THIS QUOTE DOES NOT INCLUDE PAINT**”, “Materials: A36”, “Drawing #Cxxxx Rev X”, NET 30, etc.).

**Integration Notes (High-Level)**  
- Reuses existing `PROJECT_DOCUMENT_KINDS`, revision RPCs, and `buildDocumentLinesFromCalc`.  
- Preview calls the same PDF function already used for Export/Print — zero duplication of layout logic.

#### Phase 2 – Quote Power Features & Calc Two-Way Sync (Core Value, 3–4 weeks)
**Goal**: Handle real quoting complexity (options, images, attention text, calc sync).

**Key Deliverables**  
1. **Quote Options / Alternates**  
   - “Add Quote Option” button creates a new collapsible section with its own header, line items, and subtotal.  
   - Global toggle: “Present as multiple options (no single grand total)” — preview and PDF render separate boxes or “Customer to select” language.  
   - Works for both customer quotes and vendor RFQs/POs.

2. **Inline Image / Figure Support**  
   - “Insert Reference Pic” button in rich text toolbar opens project Files browser (filtered to images).  
   - Small inline images (reference pics of parts) embed in description or dedicated “Figures” section at bottom of document.  
   - PDF renderer updated to embed images (base64 or signed Supabase URL) at small size to keep layout clean.  
   - Only small reference pics — no full drawings or large files.

3. **Two-Way Shop Calc ↔ Document Sync**  
   - In Document Workspace: collapsible “Calc Tools” drawer or tab.  
   - “Import from Tape” improved with live mapping preview (shows exactly how lines will appear).  
   - New “Push Changes to Calc” action: when user edits unit price or qty in document, offer to update the source tape (or create new revision of tape).  
   - Reverse: editing a tape that is linked to an open document offers “Refresh document lines”.  
   - Uses existing `project_calc_tapes` / `project_calc_lines` tables + new lightweight link table or metadata field on document lines.

4. **Attention Formatting & Snippets**  
   - Full color/highlight support in rich text (red text or yellow background for attention items).  
   - User-saved snippet library (searchable) for repeated descriptions (e.g., “STARTER BAR LINK #1 – Drawing #C1532B – Materials: A36”).

5. **Apply Same Rich Editor to All Document Types**  
   - RFQ, Purchase Order, Packing List, BOL, and Invoice all receive the identical center-pane editor + preview treatment.  
   - Vendor dropdown and PO-specific fields remain; only the content area becomes rich.

**Integration Notes (High-Level)**  
- Two-way sync uses the existing `useProjectWorkspaceOptional` context and `notifyTapeSaved` pattern.  
- Image handling reuses the existing project-files Supabase storage + OneDrive mirror (no new buckets).  
- PDF generator enhancements are additive — current layout remains the default; new rich-text nodes and images are optional extensions.

#### Phase 3 – Polish, Workflow Glue & Edge Cases (2 weeks)
**Goal**: Make the experience feel complete and production-ready.

**Key Deliverables**  
1. **Bi-Directional Click Navigation** (preview ↔ editor) – full implementation.  
2. **Improved Totals & Option Rendering** in preview/PDF (exact match to current Nucor quote style, including grouped lead times and separate subtotals).  
3. **Job Packet Quick Action** (inside Documents section) – one button that collects current quote + PO + packing list + key CAD files into a single printable packet with cover page and table of contents (replaces physical packet creation).  
4. **Keyboard Shortcuts & Undo** inside the editor (Cmd/Ctrl+Z, arrow navigation between lines, etc.).  
5. **Validation & Smart Defaults** – warn on missing lead time, auto-suggest shipping method/contact from project record, highlight when total exceeds any stored budgetary number.  
6. **Mobile-Responsive Fallback** – stacked single-column view when viewport is narrow (shop office tablets).

**Integration Notes (High-Level)**  
- Job Packet uses existing `generateProjectDocumentPdfBuffer` + new aggregator that pulls from `project_documents` and `project_files`.  
- All changes remain behind the existing `canManageDocuments` capability gate.

### Detailed Feature Breakdown (Ready for Coding Plan Extraction)

**A. Document Workspace UI Container**  
- Replaces current centered modal with a persistent, resizable panel full-width view inside the Documents section and full width view capable on wide screen monitors.  
- State managed via existing `ProjectWorkspaceProvider` (add `activeDocumentId`, `showPreview`, `previewZoom`).

**B. Rich Text Editor Component** (shared across all doc types)  
- Reusable component that accepts current plain-text description and outputs structured content (JSON or HTML subset) stored in `meta.lineItems[].descriptionRich`.  


**C. Live Preview System**  
- Debounced call to existing PDF generation function.  
- Returns blob or data URL for instant render (no full page reload).  
- Maintains 100% visual fidelity to current production PDFs.

**D. Hierarchical Line Items + Options**  
- Data model extension: each line item gains optional `parentId` and `optionGroupId`.  
- UI renders nested rows; PDF renderer respects hierarchy and option grouping.

**E. Image Insertion**  
- File picker reuses existing Files panel logic.  
- Stores reference (file ID or path) in line item meta.  
- PDF renderer resolves and embeds at render time.

**F. Two-Way Calc Sync**  
- New lightweight metadata on document lines: `calcTapeId`, `calcLineId`.  
- Sync logic lives in a new small service/helper (called from both document save and calc tape save).  
- Conflict resolution: last edit wins + clear visual indicator.

**G. Vendor Document Parity**  
- Same editor component used for RFQ and PO kinds; only metadata fields differ (vendor select, etc.).

### Risks & Mitigations
- **PDF layout regression** — Mitigation: Phase 1 preview uses the exact current generator; all new features are additive. Full regression test
- **Rich text performance on long documents** — Mitigation: Limit rich text to description field only; keep pricing math in plain numbers.  
- **Two-way sync conflicts** — Mitigation: Simple “last writer wins” with toast notification and revision history (already exists).  
- **Scope creep** — Mitigation: Strict “project view only” rule; any request outside documents/UI is parked for later.



This plan is tightly scoped, leverages everything already built (PDF generator, revisions, OneDrive files, Shop Calc, context provider, capability gates), and directly solves the “segmented, blind typing, missing edge cases” problems while keeping the beautiful current quote layout intact.

