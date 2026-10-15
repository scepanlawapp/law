# Plan: Assistant chat choices and accent-insensitive names

## Track
- [x] Branch `assistant_chat_choices_20261015`
- [x] Track files and `delivery/index.md` link

## Accent-insensitive names
- [x] Core `foldedMatchIds` helper with allowlisted tables and columns
- [x] Clients and cases list search
- [x] Assistant participant, case, event, and billing client resolution

## Clickable choices
- [x] `AssistantChoice` on tool results; producers in actions, office reads, billing reads
- [x] Runner stores `metadata.choices`; `ChatMessageResponse.choices`
- [x] Chat buttons under the latest assistant message; prompt line

## Verification
- [x] Specs (core, actions, billing, choices helper, web)
- [x] Lint and typecheck
- [x] Manual end-to-end in chat and clients list
- [x] Docs: `.github/bussiness-logic-done-so-far.md`
