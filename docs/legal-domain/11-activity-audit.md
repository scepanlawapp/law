# Activity Timeline and Audit

## ActivityEvent

Use a backend-created activity timeline for meaningful business actions.

Conceptual fields:

```text
id
firm_id
matter_id nullable
client_id nullable
actor_user_id nullable
event_type
entity_type
entity_id
payload
created_at
```

The exact payload representation should follow repository conventions.

## Initial events

Suggested minimum:

```text
CLIENT_CREATED
CLIENT_UPDATED

MATTER_CREATED
MATTER_UPDATED
MATTER_STATE_CHANGED

MATTER_CLIENT_ADDED
MATTER_CLIENT_REMOVED

PARTICIPANT_ADDED
PARTICIPANT_REMOVED

PROCEEDING_CREATED
PROCEEDING_UPDATED

DOCUMENT_UPLOADED
DOCUMENT_LINKED
```

## Server ownership

The frontend does not create authoritative activity events directly.

The backend/service handling the business action records the corresponding event, ideally within the same transaction or a reliable event mechanism already present in the repository.

## Payload

Store enough structured information for a human-readable timeline, but avoid unnecessary full-object snapshots.

Example state change payload:

```json
{
  "from": "DRAFT",
  "to": "OPEN"
}
```

Example link payload might include the target ID and a display snapshot if needed for historical readability.

Do not store sensitive identifiers unless required.

## Timeline UX

Show newest/relevant ordering consistent with product conventions.

Example:

```text
Today

10:42  Jovana added document "Claim.pdf"
10:21  Matter state changed from Draft to Open
09:54  ABC DOO added as a client
09:51  Matter created
```

## Audit fields

Important mutable entities should also use the repository's audit fields, typically:

```text
created_at
created_by
updated_at
updated_by
```

Activity timeline and row-level audit metadata serve related but different purposes.
