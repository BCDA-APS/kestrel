# Change History

User-visible changes by release. Version history starts with v0.1.0.

<!--
Subsections (use in this order; omit if no content):
- Breaking Changes
- New Features
- Enhancements
- Fixes
- Maintenance
- Deprecations
- Known Problems
-->

## Unreleased

### Breaking Changes

### New Features

- Multi-axis plot support: independent Y1/Y2 columns with auto-scaling
- Y1/Y2 field persistence when adding second run to plot
- User-configurable cursor persistence across run switches
- Adopt EffVer release versioning system with CHANGELOG tracking

### Enhancements

- Y1/Y2 column redesign replaces +L/+R button UI for clarity
- ISO8601 date/time display with local timezone
- Cursor control button visibility and prominence improvements
- Display app version in Settings panel ABOUT section
- Release script automates CHANGELOG promotion and git tagging
- Build-time version injection for exact deployment tracking

### Fixes

- Dichro stream selection: prefer monitor when adding runs, handle unavailable

### Maintenance

- Document feature branch requirements in CLAUDE.md
- Add project handoff checklist and orientation guide
- Enhance QServer setup documentation for API key auth

### Deprecations

### Known Problems


## Release v0.1.0

Released 2026-10-29

First tagged release. Includes update for POLAR dichro scan support.

### Features

- Browse and visualize Tiled datasets in a web browser
- Plot support for 1D, 2D (heatmap), and 3D (scatter) data
- POLAR-specific dichro mode: auto-select and split dichro_monitor and dichro_xmcd across axes
- QServer integration: view and control running scans
- Settings panel: configure detector defaults, trace limits, QServer URL, Tiled server selection
- Responsive design with Tailwind CSS

### Known Limitations

- Tests cover utility functions only (`src/utils/`), not UI components
- About dialog not yet implemented
