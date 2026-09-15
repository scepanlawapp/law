# API, Search, Filtering, and Pagination

## API style

Follow the repository's established API conventions.

Conceptually required resources include:

```text
Clients
Parties
Matters
Proceedings
Documents
Lookups
Custom fields
Activity
```

Do not force a new REST style if the repository uses a consistent equivalent architecture, but preserve the domain boundaries.

## Conceptual endpoints

Examples only; adapt route naming/versioning to the repository.

```text
POST   /api/v1/clients
GET    /api/v1/clients
GET    /api/v1/clients/{id}
PATCH  /api/v1/clients/{id}

GET    /api/v1/parties/search

POST   /api/v1/matters
GET    /api/v1/matters
GET    /api/v1/matters/{id}
PATCH  /api/v1/matters/{id}

POST   /api/v1/matters/{id}/clients
DELETE /api/v1/matters/{id}/clients/{relationId}

POST   /api/v1/matters/{id}/participants
PATCH  /api/v1/matters/{id}/participants/{participantId}
DELETE /api/v1/matters/{id}/participants/{participantId}

POST   /api/v1/matters/{id}/proceedings
PATCH  /api/v1/proceedings/{id}

POST   /api/v1/documents
POST   /api/v1/matters/{matterId}/documents/{documentId}
POST   /api/v1/clients/{clientId}/documents/{documentId}
POST   /api/v1/proceedings/{proceedingId}/documents/{documentId}
```

## Lookup API concepts

For each configurable lookup:

- list;
- create;
- update;
- deactivate.

Examples:

```text
PracticeArea
MatterStage
ParticipantRole
ProceedingType
DocumentCategory
OrganizationRelationshipType
```

All lookup operations are tenant scoped.

## Autocomplete endpoints

Potentially large entity sets need server-side search.

Examples:

```text
GET /clients/search?q=abc
GET /parties/search?q=jelena
GET /users/search?q=jovan
```

Return a small autocomplete DTO.

Example:

```json
{
  "id": "...",
  "displayName": "ABC DOO",
  "type": "ORGANIZATION",
  "secondaryText": "Tax ID 123456789"
}
```

Do not return full domain graphs for autocomplete.

## Client search behavior

Client search should eventually match:

- Client/Party display name;
- client code;
- direct contact point values;
- identifiers;
- related organization contact-person name;
- related organization contact-person email;
- related organization contact-person phone.

Important example:

```text
Search: jelena@abc.rs
Result: ABC DOO
```

when that email belongs to a person related to ABC DOO.

Use the existing database/search capabilities first. Do not introduce Elasticsearch or another search service merely for this phase unless the repository already relies on it.

## Matter search

At minimum search:

- internal number;
- title;
- Client display name.

Suggested filters:

```text
state
practiceArea
stage
responsibleUser
client
priority
```

## Pagination

Use the repository's existing pagination style.

All potentially large list endpoints must be paginated.

Do not introduce a competing pagination convention.

## Validation

Backend validates:

- lifecycle transitions;
- required relations;
- lookup ownership;
- cross-tenant IDs;
- custom-field types;
- document link ownership.

Frontend validation is for user experience, not security or data integrity.
