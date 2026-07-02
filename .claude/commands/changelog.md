Run `git diff HEAD` to see all uncommitted changes, then add a concise entry under the `## Unreleased` section of CHANGELOG.md.

Rules:
- One bullet per logical change. Group under `### Added`, `### Fixed`, or `### Changed` as appropriate.
- Skip internal refactors and test changes unless they affect behaviour.
- Keep each bullet to one sentence. No filler.
- Do not create a new version heading - only write under `## Unreleased`.
