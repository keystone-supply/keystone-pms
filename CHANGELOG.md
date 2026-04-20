# Changelog

## 2026-04-19

### Fixed
- Made remnant/sheet preview images resilient by adding explicit `img_url` failure logging, a queue-based Supabase repair pipeline, and a backfill path so existing `NULL` `img_url` rows are automatically recovered.
- Restored stable project file preview behavior by loading `react-pdf` layer styles at app entry, rendering all PDF pages (including terms-and-conditions page 2), and preventing URL/file-selection feedback loops that could trigger browser `history.replaceState` rate limits.
- Prevented file mirror status regressions by avoiding delta-sync writes that could overwrite already mirrored files back to `not_mirrored`, while still marking changed files as `stale`.
