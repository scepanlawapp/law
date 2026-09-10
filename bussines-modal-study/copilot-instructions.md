# Domain Object Relationship Rules

You are working on an AI-powered law-office management application.

The following rules define the domain model. **Do not violate these relationships when creating, modifying, or refactoring code.**

## 1. Workspace boundary

`Workspace` is the primary business/data boundary.

Most business objects belong to a Workspace directly or indirectly.

Users access Workspace data through:

`User → WorkspaceMembership → Workspace`

`WorkspaceRole` defines the user's role within the workspace.

Do not use `WorkspaceRole` as a user's role on a Case.

---

## 2. Workspace membership vs Case membership

These are two different concepts.

### Workspace

```text
User
  ↓
WorkspaceMembership
  ↓
Workspace
```

`WorkspaceRole`:

- OWNER
- ADMIN
- LAWYER
- MEMBER

### Case

```text
User
  ↓
CaseMember
  ↓
Case
```

`CaseMemberRole`:

- RESPONSIBLE_LAWYER
- LAWYER
- ASSISTANT
- PARALEGAL
- OBSERVER

Never merge these two role systems.

---

## 3. Chat is independent from Case

A `ChatSession` belongs to a Workspace.

A ChatSession does NOT require a Case.

Possible contexts are:

```text
GENERAL
PRACTICE
RESEARCH
CLIENT
CASE
DOCUMENT
```

`clientId`, `caseId`, and `documentId` are optional.

Do not make `caseId` mandatory on ChatSession.

A user must be able to use the AI assistant without first creating a Case.

---

## 4. Chat hierarchy

The basic relationship is:

```text
Workspace
   ↓
ChatSession
   ↓
ChatMessage
   ↓
ChatAttachment
```

One ChatSession has many ChatMessages.

One ChatMessage can have many ChatAttachments.

A ChatAttachment represents a file attached to a conversation. It is not automatically a business Document.

---

## 5. AI workflow

The AI workflow conceptually follows:

```text
ChatMessage
    ↓
PORTIR / Triage
    ↓
Brief
    ↓
MatterCandidate
    ↓
Confirmation
    ↓
Business objects
```

PORTIR/Triage determines relevance and intent.

Brief extracts and structures information.

MatterCandidate represents a possible legal matter discovered by AI.

Do not automatically create permanent `Client` or `Case` records merely because the AI extracted a name or legal matter.

---

## 6. AI objects vs business objects

Maintain a strict distinction.

### AI/process objects

Examples:

```text
TriageResult
WorkflowJob
BriefExtractionResult
BriefResult
MatterCandidate
DraftResult
DocumentAnalysis
CaseAISummary
AIRecommendation
```

These represent AI processing, extracted information, suggestions, or generated content.

### Business objects

Examples:

```text
Workspace
Client
Case
CaseParty
CaseMember
Document
Task
Deadline
Hearing
Activity
CaseNote
Court
```

These represent actual law-office data.

Do not use an AI extraction object as a replacement for a business-domain object.

---

## 7. MatterCandidate is the bridge

`MatterCandidate` is the boundary between AI understanding and real business data.

Conceptually:

```text
AI
 │
 ▼
MatterCandidate
 │
 ├── rejected
 ├── remains pending
 └── confirmed
        │
        ├── Client
        └── Case
```

AI may suggest:

```text
"Marko Petrović"
```

The system must not assume that this automatically means an existing Client.

The business layer determines whether:

```text
existing Client
OR
new Client
OR
only CaseParty
```

is appropriate.

---

## 8. Client vs CaseParty

`Client` represents a person/company/organization that has a relationship with the law office.

`CaseParty` represents a participant in a particular Case.

Therefore:

```text
Client
   │
   └── can participate in many Cases
```

A CaseParty may reference a Client, but `clientId` is optional.

Example:

```text
Client:
    Marko Petrović

Case:
    Marko vs Company X

CaseParty:
    Marko Petrović → CLIENT / PLAINTIFF

CaseParty:
    Company X → DEFENDANT
```

The opposing company does not need to be a Client.

---

## 9. Case is the central legal-business object

A Case belongs to a Workspace.

A Case can reference a Client, but `clientId` should remain optional because not every legal matter necessarily has a traditional client relationship.

A Case can have:

```text
Case
 ├── Client
 ├── CaseParty[]
 ├── CaseMember[]
 ├── Document[]
 ├── Task[]
 ├── Deadline[]
 ├── Hearing[]
 ├── Activity[]
 ├── CaseNote[]
 └── CaseAISummary
```

Do not put all these objects physically inside the basic `Case` model. They are related domain objects.

---

## 10. CaseMember

`CaseMember` connects a User to a Case.

```text
User
  ↓
CaseMember
  ↓
Case
```

This determines who works on the Case.

The responsible lawyer should normally be represented by the Case's `responsibleLawyerId`, while additional participants are represented through `CaseMember`.

---

## 11. Documents

Keep these concepts separate:

```text
ChatAttachment
```

means:

> File uploaded to a conversation.

```text
Document
```

means:

> File managed as part of the law-office document domain.

A Document can be associated with a Case through:

```text
CaseDocument
```

A Document may also have:

```text
DocumentAnalysis
```

for AI-extracted text, information, summary, confidence, and model metadata.

---

## 12. Operational objects

The following objects support Case and office operations:

```text
Task
Deadline
Hearing
Activity
CaseNote
```

They should remain separate because they represent different concepts.

For example:

```text
Task      = work that must be performed
Deadline  = time limit/date
Hearing   = scheduled legal/court event
Activity  = something that happened
CaseNote  = information recorded by a user
```

---

## 13. Optional relationships

Use optional relationships when the domain allows an object to exist independently.

Examples:

```text
ChatSession.caseId       → optional
ChatSession.clientId     → optional
ChatSession.documentId   → optional

Activity.caseId         → optional
Activity.clientId       → optional
Activity.documentId     → optional

Task.caseId             → optional
Task.clientId           → optional

Deadline.caseId         → optional
Deadline.clientId       → optional

Case.clientId           → optional
CaseParty.clientId      → optional
```

Do not make relationships mandatory simply because they are common.

---

## 14. Core architectural principle

Always preserve this separation:

```text
USER INPUT
    ↓
AI PROCESSING
    ↓
AI RESULT / CANDIDATE
    ↓
BUSINESS DECISION
    ↓
BUSINESS DOMAIN
```

AI is allowed to **extract, classify, analyze, propose and generate**.

The business layer is responsible for **creating and managing actual Clients, Cases, Documents, Tasks, Deadlines and other permanent business records**.

When adding a new object, first determine whether it belongs to:

1. AI/process domain
2. Chat domain
3. Core business domain
4. Supporting/operational domain

Do not introduce duplicate objects representing the same business concept under different names.
