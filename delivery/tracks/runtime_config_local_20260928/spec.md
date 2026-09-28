# Runtime Config Local Override — Specification

## Why

The README says to use `apps/web/public/config.local.json` for local browser overrides, and the file is gitignored. But `loadRuntimeConfig` only ever fetched `/config.json`, so the local file was ignored.

## What

- At startup, try `/config.local.json` first (not cached). If it is a JSON object, use it over the defaults.
- Otherwise fall back to `/config.json`, as before. The local file counts as missing when:
  - the request fails;
  - it returns a non-OK status;
  - the body is not JSON (the Angular dev server answers a missing file with `index.html`);
  - the JSON is not an object.
- The files are not merged: the local file replaces `config.json` rather than layering over it. Missing keys still fall back to the built-in defaults.
- If `config.json` fails, bootstrap still fails.

## Non-goals

- Changing the default values or the config shape.
