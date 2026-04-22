# Changelog

## 2026-04-19

### Fixed
- Made remnant/sheet preview images resilient by adding explicit `img_url` failure logging, a queue-based Supabase repair pipeline, and a backfill path so existing `NULL` `img_url` rows are automatically recovered.
- Restored stable project file preview behavior by loading `react-pdf` layer styles at app entry, rendering all PDF pages (including terms-and-conditions page 2), and preventing URL/file-selection feedback loops that could trigger browser `history.replaceState` rate limits.
- Prevented file mirror status regressions by avoiding delta-sync writes that could overwrite already mirrored files back to `not_mirrored`, while still marking changed files as `stale`.

## 2026-04-22

### Added
- Launched a new project-view Document Workspace that centralizes document authoring, editing, preview, and export.
- Added richer authoring tooling including snippet library support, template chips, editor/toolbar upgrades, and image insertion flows.
- Introduced calc import/sync workflows and supporting APIs/hooks so project documents can stay aligned with estimating data.
- Added job packet assembly utilities and expanded document serialization/build pipelines for structured packet outputs.

### Changed
- Reworked project documents surfaces and underlying document types/defaults to support the new workspace model.
- Strengthened PDF composition/export behavior and preview handling for more consistent document output.
- Expanded rollout and operational documentation for the document workspace launch and project-view updates.
