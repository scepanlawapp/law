# Decisions

## Document visibility

All active workspace members may upload documents and change visibility, subject to tenant and target-entity authorization.

## Document removal

Document removal is archive-only. Storage bytes and metadata remain available for historical access rules.

## Custom-field storage

CustomFieldValue uses a dedicated JSON value with backend validation against the declared data type and referenced tenant objects. Core entities do not receive arbitrary extra-data fields.

## Chat storage compatibility

Existing ChatStorageService paths and fallback behavior remain unchanged. Legal documents use a separate document-specific tenant path and are never silently converted from ChatAttachments.

## Activity ownership

ActivityEvent writes are backend-owned and occur in the Document service transaction for upload/archive operations. TenantAuditEvent remains a separate platform/security audit concept.
