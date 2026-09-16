// The application currently operates against a single fixed workspace; there is no
// workspace-switching UI or API. Kept in sync with the seed script via the same env var.
export const HARDCODED_WORKSPACE_ID =
  process.env["AUTH_BOOTSTRAP_WORKSPACE_ID"] ??
  "11111111-1111-4111-a111-111111111111";
