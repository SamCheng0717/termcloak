# Changelog

All notable changes to this project are documented in this file.

## [0.2.0-alpha.1] - 2026-08-19

### Added

- Neutral Termcloak product identity and `termcloak` command.
- Central terminal session with idempotent raw-mode, cursor and alternate-screen cleanup.
- Signal and fatal-error cleanup paths for interactive sessions.
- Grapheme-aware terminal width handling for CJK, emoji and combining characters.
- ANSI, OSC and control-sequence sanitization for local book content.
- Stable progress anchors based on content identity, chapter ID and character offset.
- Locked, atomic progress writes with restrictive file permissions.
- Shared command registry and a working `/btw <note>` command.
- Reduced-motion and `NO_COLOR` support.
- UTF-8, GBK and GB18030 automatic decoding with an explicit encoding override.
- Full-text search, chapter jumping, bookmarks, command history and Tab completion.
- Local bookshelf listing and privacy-safe `doctor` diagnostics.
- PTY integration coverage for normal exit, signal cleanup and animated viewport bounds.

### Changed

- Progress data now lives under `~/.termcloak`.
- UI branding uses a generic Agent Session theme.
- Package contents are controlled with an explicit `files` allowlist.

## [0.1.0] - 2026-08-18

- Initial local TXT reader prototype.
