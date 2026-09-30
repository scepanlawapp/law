# Statement Import Warning Plan

- [x] Create the matching implementation branch and delivery track.
- [x] Apply compact semantic warning styling to the existing helper only.
- [x] Run focused formatting, Angular type checking, and template compilation.
- [x] Record verification and mark the track complete.

## Verification

- Focused Prettier formatting passed.
- `git diff --check` passed.
- `npx tsc -p apps/web/tsconfig.app.json --noEmit` passed.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_CLOUD=false npx nx build web --configuration=development --output-style=static --verbose` passed outside the sandbox, including Angular template compilation.
