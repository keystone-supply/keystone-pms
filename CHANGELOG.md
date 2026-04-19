# Changelog

## 2026-04-19

### Fixed
- Made remnant/sheet preview images resilient by adding explicit `img_url` failure logging, a queue-based Supabase repair pipeline, and a backfill path so existing `NULL` `img_url` rows are automatically recovered.
