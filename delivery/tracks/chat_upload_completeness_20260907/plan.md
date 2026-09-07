# Chat Upload Completeness Plan

- [x] Allow Excel MIME types (`xlsx`, `xls`) on the existing chat upload allowlist.
- [x] Keep `POST /chat/sessions/:sessionId/messages` as the only persist path; bind `messageId` on create.
- [x] Enable the assistant composer with no `sessionId`; create a session on attach and on first send.
- [x] Hold pending files in the browser until send; show chips with remove.
- [x] Reject unsupported MIME and oversized files in the UI before POST.
- [x] Link transcript attachment names to `GET /api/chat/attachments/:attachmentId`.
- [x] Add `ChatApiClient.downloadUrl()` and restrict the file input accept list.
- [x] Bind the left conversation rail to `listSessions` instead of mock data.
- [x] Cover session-on-attach, Excel accepted, `.exe` rejected, `messageId` bound on send, and foreign-workspace download 404.

## Status convention

`[ ]` not started, `[~]` in progress, `[x] <7-character commit>` completed.
