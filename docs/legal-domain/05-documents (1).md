# Document Model

## Principle

Store a physical/logical document once and link it to business entities.

Do not create duplicate file records merely because a document appears on both a Client and a Matter page.

## Document

Conceptual fields:

```text
id
firm_id
original_filename
storage_key
mime_type
size_bytes
checksum
title
category_id
document_date
direction
source
visibility
description
uploaded_by
created_at
updated_at
archived_at
```

Adapt storage-specific fields to the repository's existing storage implementation.

## Source

System enum:

```text
UPLOAD
EMAIL
API
GENERATED
SCAN
```

Only add values required by actual product behavior.

## Visibility

Initial system enum:

```text
INTERNAL
CLIENT_SHARED
```

If the repository already has a stronger permission model, integrate with it rather than replacing it.

## Category

DocumentCategory is firm-configurable.

Seed suggestions:

- Pleading;
- Decision;
- Contract;
- Power of attorney;
- Evidence;
- Correspondence;
- Invoice;
- Expense/receipt;
- Identification document;
- Other.

The office may create additional categories without a deployment.

## Links

Use join/link entities such as:

```text
ClientDocument
client_id
document_id
```

```text
MatterDocument
matter_id
document_id
```

```text
ProceedingDocument
proceeding_id
document_id
```

The exact primary-key pattern follows repository conventions.

A document may therefore appear in several relevant views without duplicating stored bytes.

## Upload UI

Suggested fields:

- file — required;
- title — optional;
- category — searchable configurable select;
- document date — optional date picker;
- description — optional textarea;
- visibility — controlled select/radio based on current product permissions.

## Matter documents UI

Support:

- upload;
- list;
- search;
- category filter;
- document date;
- uploaded by;
- actions consistent with permissions.

## Client documents UI

By default show documents directly linked to the Client.

Provide an option similar to:

```text
[ ] Include documents from this client's matters
```

When aggregating documents, do not render duplicate rows for the same Document merely because multiple links match.
