# Domain Map

## Conceptual model

```text
Firm
├── Users
├── Parties
│   ├── PartyContactPoints
│   ├── PartyIdentifiers
│   ├── PartyAddresses
│   └── PartyRelationships
│
├── Clients ────── Party
│
├── Matters
│   ├── MatterClients ───── Clients
│   ├── MatterParticipants ───── Parties
│   │   └── MatterParticipantRoles
│   ├── Proceedings
│   ├── Documents (through links)
│   └── ActivityEvents
│
├── Documents
│   ├── ClientDocument links
│   ├── MatterDocument links
│   └── ProceedingDocument links
│
├── PracticeAreas
├── MatterStages
├── ParticipantRoles
├── ProceedingTypes
├── DocumentCategories
└── CustomFieldDefinitions
```

## Primary entities

### Party

A real-world person or organization.

`PartyType` is a system enum:

```text
PERSON
ORGANIZATION
```

### Client

The law firm's client relationship with a Party.

A Client is not a duplicate identity record.

### Matter

The law firm's internal case/matter/workspace.

A Matter can include multiple Clients and multiple Proceedings.

### Proceeding

One formal proceeding associated with a Matter.

Examples:

- first-instance court case;
- appeal;
- enforcement;
- administrative proceeding;
- arbitration.

### Document

Metadata and storage reference for one physical/logical file.

A Document can be linked to multiple domain entities without copying file bytes.

## Supporting entities

### PartyRelationship

Connects an organization and its contact persons or other related Parties.

### MatterParticipant

Connects a Party to a Matter.

### MatterParticipantRole

Allows one MatterParticipant to have one or more roles.

### Lookup entities

Database-backed customizable values such as PracticeArea and DocumentCategory.

### Custom fields

Firm-defined typed fields for Client, Party, Matter, Proceeding, and Document.

### ActivityEvent

A chronological record of meaningful business actions.

## Future entities

The model should later accept:

```text
Task
Deadline
CalendarEvent
TimeEntry
Expense
Invoice
EmailMessage
Note
AIConversation
```

without altering the meaning of the core entities.
