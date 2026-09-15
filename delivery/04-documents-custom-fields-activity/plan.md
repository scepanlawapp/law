# Phase 04: Documents, Custom Fields, and Activity

## Implemented slice

- Added tenant Document, ClientDocument, MatterDocument, ProceedingDocument, CustomFieldDefinition, CustomFieldOption, CustomFieldValue, and ActivityEvent persistence models.
- Added system enums for document source/visibility, custom-field entity/data types, and activity entity type.
- Added additive migration `20260915150000_documents_custom_fields_activity` and applied it to the local tenant database.
- Added extensibility DDL to new-tenant provisioning.
- Added tenant-safe Document upload, list/filter, download, archive-only removal, Client/Matter linking, and ActivityEvent creation for upload/archive.
- Preserved existing ChatStorageService paths and behavior.

## Deferred slice

- Custom-field definition/value APIs and backend typed JSON validation.
- Proceeding document link endpoints and unlink endpoints.
- Document API-client and full Angular upload/list integration.
- Client/Matter Activity API-client and timeline integration.
- Dynamic custom-field renderer.
- Remote tenant verification and browser e2e coverage.
