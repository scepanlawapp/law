# n8n workflows

Exported workflow definitions belong in `infra/n8n/workflows` and are versioned with the application code.

The NestJS API is the authenticated ingress for browser requests. n8n must receive only scoped internal workflow requests and must not be called directly by the browser.

Each workflow should have:

- a stable workflow name matching `libs/api/ai/contracts`
- a correlation ID passed through every node
- explicit input and output schemas
- failure and retry behavior documented with the export
- no credentials or production URLs committed to the repository
