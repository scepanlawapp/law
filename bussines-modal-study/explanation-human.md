# Object Relationships

The application is organized around **Workspace, User, Chat, AI Workflow, Client, Case, and Documents**.

### User & Workspace

A **User** can belong to one or more **Workspaces**.
`WorkspaceMembership` connects the user with a workspace and defines the user's `WorkspaceRole`.

A workspace is the main boundary for office data.

### Chat

A **ChatSession** belongs to a Workspace and is created by a User.

A ChatSession contains multiple **ChatMessages**.
A ChatMessage can contain multiple **ChatAttachments**.

A chat does not have to belong to a Case. It can be:

- general conversation
- legal practice discussion
- research
- client-related
- case-related
- document-related

Therefore, `clientId`, `caseId`, and `documentId` are optional.

### AI Workflow

When a user sends a message, it can enter the AI workflow:

`Chat → PORTIR → Triage → Brief → MatterCandidate`

**PORTIR/Triage** determines whether the request is relevant and what the user is trying to accomplish.

The **Brief** extracts structured information from the user's request and documents.

A **MatterCandidate** represents the AI's understanding of a possible real legal matter. It is not yet a real Case or Client.

After confirmation, the candidate can become real business data:

`MatterCandidate → Client + Case`

### Client

A **Client** represents a real person, company, or organization that the law office works with.

A Client can have multiple Cases.

A Client can also exist without a Case.

### Case

A **Case** represents an actual legal matter handled by the office.

A Case belongs to a Workspace and can be connected to:

- Client
- CaseParty
- CaseMember
- Documents
- Tasks
- Deadlines
- Hearings
- Activities
- Notes
- AI summaries

The Case is the central object of the legal-business domain.

### CaseParty

A **CaseParty** represents a participant in a Case.

A party can be the client, plaintiff, defendant, witness, expert, authority, etc.

A CaseParty may reference an existing Client, but it does not have to. For example, an opposing party may not be a client of the office.

### CaseMember

A **CaseMember** connects Users with Cases.

It defines what the user does on that particular Case, such as responsible lawyer, lawyer, assistant, paralegal, or observer.

This is different from `WorkspaceRole`.

### Documents

`ChatAttachment` and `Document` are intentionally different.

A ChatAttachment is a file uploaded to a conversation.

A Document is an actual document managed by the law office.

A Document can be connected to a Case through `CaseDocument` and can have its own AI analysis.

### Tasks, Deadlines and Hearings

These are operational objects related to running the office and managing Cases.

A Task represents work that someone needs to perform.

A Deadline represents an important date or time limit.

A Hearing represents a scheduled court/legal event and always belongs to a Case.

### AI and Business Domain

AI objects describe what the AI **understands, extracts, recommends, or generates**.

Business objects represent what the law office **actually stores and manages**.

Therefore:

`BriefResult ≠ Case`

`BriefParty ≠ Client`

`MatterCandidate ≠ Case`

AI should propose or prepare business data, but should not automatically turn uncertain AI output into permanent business records without the appropriate business process.
