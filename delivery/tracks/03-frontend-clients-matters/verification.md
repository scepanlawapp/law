# Verification

## Passed

- `npx nx test web --runInBand`
- `CI=1 npx nx build web --skip-nx-cache --verbose`
- Earlier focused legal API-client and Client/Matter list builds passed as part of the final web build.

## Not run

- No authenticated browser/manual responsive verification was run.
- No `web-e2e` test was run because the project has no configured target.
- No authenticated API e2e journey was run.
- No participant/proceeding mutation verification was run because those backend endpoints remain deferred.
- No document/activity/custom-field verification was run.

## Known limitations

- The current UI's richer repeated collections and inline lookup creation are not yet complete.
- Documents and Activity tabs are intentionally non-persistent placeholders until Phase 04.
