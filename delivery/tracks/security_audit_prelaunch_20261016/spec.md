# Spec — Pre-launch Security Audit

## Why

The app is about to be deployed live for a law office. It holds privileged client data, case documents and invoices with bank details, and sends content to an LLM provider. A review is needed before real data is onboarded.

## What

- A written audit of `main` covering authentication, authorization, CSRF, uploads and file storage, injection, AI/prompt-injection paths, frontend rendering, configuration, dependencies and infrastructure.
- Each finding has a location, impact, fix and severity; findings are ordered into a remediation sequence.
- Remediation of the code findings, tracked in [plan.md](plan.md) and delivered in follow-up PRs.

## Out of scope

- Live penetration testing.
- Production hosting/proxy configuration (not in the repo); the report lists what it must provide.
- Legal review of provider contracts (DPA, ZZPL); the report flags the need.

## Acceptance

- [report.md](report.md) is reviewed by the team.
- Every "Must fix" finding is fixed or explicitly accepted before go-live.
- Decisions on findings 10, 13 and 14 are recorded.
