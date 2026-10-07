# Assistant Contract Review — Specification

## What

Scope decided with the owner on 2026-10-07.

- **Agent tool.** `review_contract { documentRef, contractType, clientSide?, focus? }`.
  - The contract is a chat attachment (`att:`) or a filed document (`doc:`). Text comes from the existing document reads, with lazy extraction.
  - `contractType` selects a built-in checklist: `SERVICES_CONTRACT`, `NDA`, `EMPLOYMENT_CONTRACT`, `COPYRIGHT_LICENCE`, or the generic `OTHER_CONTRACT`.
  - `clientSide` names the party the office represents. The agent asks when it is unclear.
- **Checks:**
  1. **Key-terms summary:** parties, subject, price, term, termination, notice periods, deadlines, governing law and disputes. Each term carries its clause reference.
  2. **Risky clauses** from the client's side, each rated HIGH, MEDIUM or LOW, with:
     - the quoted clause text
     - an explanation
     - suggested wording
  3. **Missing clauses** that the checklist expects for that type.
  4. **Compliance.** Provisions that conflict with mandatory law (for example Zakon o radu minimums, ZASP rules on transferring rights). They cite the pgvector legal corpus with `[n]` markers; only markers actually used are kept.
- **Checklists** live in a new library, `@law/contract-review`. They cover expected clauses, risk points, compliance points and the legal frame. There is no office playbook yet.
- **Mastra workflow `contract-review`:** grounding search on the legal frame and compliance points, then one structured review call.
  - Grounding is best effort.
  - A contract longer than the budget is reviewed up to the budget. The review is marked truncated and says so in its warnings.
- **Persistence.** A new `DocumentAnalysis` table holds `kind = CONTRACT_REVIEW`, the document ref and title, the contract type, the client side, the result as JSON, citation snapshots, the model, and `truncated`.
  - Rows are scoped by workspace and linked to the session and, when it has one, the session's case.
  - The review is read-only: it changes no other records and proposes no tasks or deadlines.
- **API.**
  - The session detail includes `analyses`.
  - The SSE event `analysis.updated` announces a new review.
  - `GET /chat/analyses/:analysisId/export?script=latin|cyrillic` returns a DOCX memo, written to the audit log like a draft export.
- **Web.**
  - The right rail gets an "Analiza" tab next to Draft and Case-work. It opens when a new review arrives.
  - The review panel shows the summary, key terms, issues grouped by risk (with quote, explanation and suggestion), missing clauses, notes and sources.
  - A "Pregledaj ugovor" starter card uses the document picker, with attach as the fallback.

## Why

The office mostly works on contracts. Review is the most frequent contract task after drafting, and a stored, exportable review saves rereading.

## Out of scope

- Redlining the original file.
- Comparing two versions.
- Office playbooks.
- Task or deadline proposals from a review (deadlines are Phase 5).
