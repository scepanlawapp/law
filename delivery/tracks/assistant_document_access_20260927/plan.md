# Assistant Document Access — Plan

- [x] Track files and index link.
- [x] Schema: `DocumentVersion` extraction fields; `ChatAttachment.documentId` (unique, `SetNull`); migration; seed check.
- [x] `DocumentTextService.ensureText` (lazy extraction via `FileService.openDownload` + `extractAttachmentText`, Latin normalisation).
- [x] `DocumentsService.create` accepts `initialText` and an activity `source`.
- [x] `ChatDocumentPromotionService.promoteSession`; called after brief apply, manual link, and upload into a linked session.
- [x] `AssistantDocumentReadsService` + adapter wiring.
- [x] Tools `list_documents`, `read_document`, `search_documents`; registered on the agent; tool-call summaries and web i18n labels.
- [x] Prompt rules and attachment hint in the context builder.
- [x] Tests: document text, promotion, document reads, mastra tools.
- [x] Update `.github/bussiness-logic-done-so-far.md`; mark the track completed.

## Notes

- Migration `20260927230000_assistant_document_text`: `DocumentVersion` extraction columns and `ChatAttachment.documentId` (unique, `SetNull`). The demo seed creates no document versions, so it needs no change.
- Promotion is triggered from `MatterLinkService.linkSession` / `applyBrief`, which also covers approved `link_case` proposals, and from `ChatService.sendMessage` for sessions that are already linked. It runs only inside the request's workspace context because `DocumentsService` relies on it.
- Chat attachments filed on the current case are listed once, as the case document. Refs are `doc:<documentId>` and `att:<attachmentId>`.
- Specs: `assistant-document-reads.service.spec.ts`, `chat-document-promotion.service.spec.ts`, `document-text.service.spec.ts`, and `matter-link.service.spec.ts` (apps/api); agent and summary specs (mastra).
- Live end-to-end check against the running app with an LLM key: done by the user on 2026-09-27.
