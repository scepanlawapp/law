# Development Plan — Clients and Cases

## 1. Scope

This development phase focuses on the two most important domains of the application:

- Clients
- Cases

Financial functionality is intentionally excluded for now.

The purpose of this phase is not to implement every feature that the final law-office application will contain.

The purpose is to create a **stable foundation** that can later be extended without major redesign.

The system should initially support:

### Clients

- Create client
- Edit client
- List clients
- Search and filter clients
- View client details
- View client's cases
- View client activities
- Add client activities
- Maintain basic client contacts and addresses

### Cases

- Create case
- Edit case
- List cases
- Search and filter cases
- View case details
- View case documents
- Upload/manage case documents
- View case activities
- Add case activities
- Manage case responsibilities
- Connect case to client

Not included in this phase:

- Billing
- Invoices
- Payments
- Expenses
- Time billing
- Trust/client funds
- Advanced legal workflows
- Court integrations
- Advanced AI legal analysis
- Conflict checking
- Client portal

These can be added later without fundamentally changing the Client and Case models.

---

# 2. Important Architectural Business Principle

Do not create one enormous `Client` object and one enormous `Case` object containing everything.

Instead, treat Client and Case as the primary business objects and connect expandable functionality through related objects.

For example:

Client

- Client basic data
- Addresses
- Contacts
- Cases
- Activities
- Documents in the future
- Relationships in the future
- Financials in the future
- Compliance in the future

Case

- Case basic data
- Client
- Documents
- Activities
- Responsibilities
- Parties in the future
- Tasks in the future
- Deadlines in the future
- Hearings in the future
- Evidence in the future
- Legal issues in the future
- Financials in the future

This separation is extremely important.

Adding case deadlines in the future should mean adding a new Case Deadline resource.

It should **not** require redesigning the Case object.

---

# 3. Common Concepts

Some concepts should be shared between Clients and Cases.

## Common Identification

Every main business object should have:

```text
id
createdAt
createdBy
updatedAt
updatedBy
```

Optionally also support:

```text
version
```

`version` can later help detect situations where two users edit the same object.

---

# 4. Soft Deletion and Archiving

Clients and cases should generally not be physically deleted during normal business usage.

Use statuses such as:

```text
ACTIVE
INACTIVE
ARCHIVED
```

For cases:

```text
DRAFT
ACTIVE
ON_HOLD
CLOSED
ARCHIVED
```

Deleting information should generally mean archiving/deactivating it.

Permanent deletion can later exist as an administrator function if required.

This avoids future problems when other objects start referencing clients and cases.

---

# 5. Extensible Attributes

Both Client and Case should support future extension.

Do not create hundreds of nullable fields now for functionality that does not exist.

Instead use:

```text
customFields
```

for law-office-specific additional information.

Example:

```text
customFields:
{
    "industryCategory": "Construction",
    "internalClassification": "VIP"
}
```

Important business information that becomes part of normal application functionality should eventually become a proper field.

`customFields` should be used primarily for organization-specific extensions, not as a replacement for proper domain modeling.

---

# 6. Tags

Both Clients and Cases should support tags from the beginning.

Example:

```text
VIP
Important
International
Litigation
High Priority
Strategic Client
```

Tags should be handled independently from Client and Case.

This means adding or removing a tag does not require changing the structure of a client or case.

---

# CLIENTS

# 7. Client Domain

A Client represents a person or organization receiving legal services from the law office.

Initial client types:

```text
INDIVIDUAL
ORGANIZATION
```

The model should allow new client types later without redesign.

---

# 8. Client Classes

The following business classes should exist.

## Client

Main client object.

Suggested attributes:

```text
Client

id

clientNumber

type

displayName

firstName
lastName

organizationName

status

email
phone
website

preferredLanguage

notes

primaryAddressId

responsibleUserId

tags

customFields

createdAt
createdBy

updatedAt
updatedBy
```

Not all fields apply to every client type.

For an individual:

```text
firstName
lastName
```

are used.

For an organization:

```text
organizationName
```

is used.

`displayName` should represent the name normally displayed throughout the application.

Examples:

```text
John Smith

ACME Corporation
```

---

# 9. Client Number

Every client should have a human-readable client number.

Example:

```text
CL-000123
```

The exact format should eventually be configurable.

Do not use database IDs as visible client numbers.

The internal ID and business client number serve different purposes.

---

# 10. ClientAddress

Addresses should not be stored directly as one large string in Client.

Create a separate object.

```text
ClientAddress

id
clientId

type

street
streetAdditional

city
postalCode

stateOrRegion
country

isPrimary

createdAt
updatedAt
```

Possible types:

```text
MAIN
BILLING
REGISTERED
MAILING
OTHER
```

This allows the system later to support multiple addresses without changing Client.

---

# 11. ClientContact

Organizations commonly have multiple contact persons.

Therefore contacts should be separate.

```text
ClientContact

id
clientId

firstName
lastName

position

email
phone

isPrimary

notes

status

createdAt
updatedAt
```

Initially this can mainly be used for organization clients.

Later it can support:

- Authorized representatives
- Directors
- Employees
- Legal contacts
- Billing contacts
- Other relationship types

Do not place `contactPerson1`, `contactPerson2`, etc. directly into Client.

---

# 12. ClientActivity

Client activity represents business interaction or information related directly to a client.

```text
ClientActivity

id

clientId

type

title
description

activityDate

createdBy

source

relatedCaseId

createdAt
updatedAt
```

Initial activity types could include:

```text
NOTE
PHONE_CALL
MEETING
EMAIL
OTHER
```

`source` can indicate:

```text
MANUAL
SYSTEM
AI
```

This distinction will become useful later.

Examples:

```text
Called client regarding documentation.

Client visited office.

Internal note regarding future engagement.
```

Activities should be flexible.

Do not create separate database concepts for every possible activity type during the first phase.

---

# 13. Client Activity Feed

The client page should contain an activity timeline.

The timeline can show:

```text
Sep 10
Meeting with client

Sep 8
Case "Smith v ABC" created

Sep 5
Client information updated

Sep 1
Client created
```

The feed can eventually combine:

- Direct ClientActivity records
- System events
- Case activities
- Documents
- Communications
- Payments
- Other modules

Do not duplicate case activities into the client activity table.

Instead, when needed, aggregate them when displaying the client timeline.

---

# 14. Client Frontend Pages

## Page 1 — Clients List

Route conceptually:

```text
/clients
```

Purpose:

Provide an overview of clients and allow users to find clients quickly.

### Page Header

Display:

```text
Clients
[Create Client]
```

Optional future actions:

```text
Import
Export
```

Do not implement these immediately unless required.

### Search

Provide global client search.

Search should initially support:

- Name
- Client number
- Email
- Phone

Eventually it can search contacts and other related information.

### Filters

Initial filters:

```text
Status
Client Type
Responsible Lawyer/User
Tags
```

Do not overload the first version with filters.

### Client Table

Recommended columns:

```text
Client Number
Client Name
Type
Responsible User
Email
Phone
Active Cases
Status
Last Activity
```

Actions:

```text
Open
Edit
Archive
```

Clicking the client name should open Client Details.

### Pagination

The page must support server-side pagination.

Do not design the application assuming all clients will be loaded simultaneously.

---

# 15. Create Client Page

Conceptual route:

```text
/clients/new
```

Initial form sections:

### Basic Information

```text
Client Type

Individual:
First Name
Last Name

Organization:
Organization Name
```

### Contact Information

```text
Email
Phone
Website
```

### Address

```text
Street
City
Postal Code
State/Region
Country
```

### Internal Information

```text
Responsible User
Preferred Language
Tags
Notes
```

Buttons:

```text
Save
Save and Open
Cancel
```

Do not force users to fill information that is not required for creating the client.

The system should allow creating a client with basic information and completing the profile later.

---

# 16. Edit Client Page

Conceptual route:

```text
/clients/{clientId}/edit
```

Use approximately the same structure as Create Client.

Additional functionality may include:

```text
Status
Additional Addresses
Additional Contacts
```

Editing a client should not edit their cases.

Cases are separate resources.

---

# 17. Client Details Page

Conceptual route:

```text
/clients/{clientId}
```

This will become one of the main pages of the application.

Use a stable tab-based layout so additional modules can be added later.

Recommended page structure:

```text
Client Header

Overview
Cases
Activities
Contacts
```

Future tabs can be added:

```text
Documents
Billing
Compliance
Relationships
Communication
```

without redesigning the entire client page.

---

# 18. Client Header

Visible regardless of selected tab.

Display:

```text
Client Name

Client Number

Status

Client Type

Responsible User

Primary Contact Details

Tags
```

Actions:

```text
Edit Client
Create Case
Add Activity
```

Future actions could include:

```text
Create Document
Send Email
Create Invoice
AI Assistant
```

---

# 19. Client Overview Tab

Display summary cards or sections.

### General Information

```text
Client type
Status
Responsible user
Preferred language
Created date
```

### Contact Information

```text
Email
Phone
Website
Primary address
```

### Statistics

```text
Total Cases
Active Cases
Closed Cases
```

### Recent Activity

Show last several activities.

### Recent Cases

Show last several or most important cases.

This page should provide an immediate understanding of the client without requiring navigation through every tab.

---

# 20. Client Cases Tab

Show all cases related to the client.

Columns:

```text
Case Number
Case Name
Type
Responsible Lawyer
Status
Created
Last Activity
```

Actions:

```text
Open Case
Create Case
```

Filters:

```text
Status
Case Type
Responsible User
```

---

# 21. Client Activities Tab

Display chronological client activity.

Filters:

```text
Activity Type
Date
Created By
```

Provide:

```text
[Add Activity]
```

Add Activity form:

```text
Type
Date
Title
Description
Related Case (optional)
```

System-generated activities should be visually distinguishable from manually created activities.

---

# 22. Client Contacts Tab

Show client contacts.

Columns:

```text
Name
Position
Email
Phone
Primary
Status
```

Actions:

```text
Add Contact
Edit Contact
Deactivate Contact
```

Do not hard-delete contacts under normal circumstances.

---

# 23. Client Backend APIs

Use resource-oriented APIs.

Exact HTTP implementation can be chosen later, but business operations should approximately support the following.

## Client List

```text
GET /clients
```

Supports:

```text
page
pageSize
search
status
type
responsibleUserId
tags
sort
```

Return:

```text
items
page
pageSize
totalItems
totalPages
```

---

# 24. Get Client

```text
GET /clients/{clientId}
```

Returns basic client information.

Do not automatically include every case, activity, document, contact, and future resource.

Retrieve large related collections separately.

This keeps the API scalable.

---

# 25. Create Client

```text
POST /clients
```

Creates a client.

Input initially includes:

```text
type
name information
contact information
responsibleUserId
preferredLanguage
notes
tags
customFields
```

Address can either be included as initial address information or created immediately afterward.

---

# 26. Update Client

```text
PATCH /clients/{clientId}
```

Prefer partial updates.

For example changing only phone number should not require sending the entire Client object.

---

# 27. Archive Client

```text
POST /clients/{clientId}/archive
```

Or equivalent status change.

The business operation should be explicit.

The application should verify whether the client has active cases before allowing archival.

Depending on business rules it can:

- Block archival
- Warn the user
- Require confirmation

---

# 28. Reactivate Client

```text
POST /clients/{clientId}/activate
```

---

# 29. Client Addresses APIs

```text
GET    /clients/{clientId}/addresses

POST   /clients/{clientId}/addresses

PATCH  /clients/{clientId}/addresses/{addressId}

DELETE /clients/{clientId}/addresses/{addressId}
```

Delete here can mean remove/deactivate depending on retention rules.

---

# 30. Client Contacts APIs

```text
GET   /clients/{clientId}/contacts

POST  /clients/{clientId}/contacts

GET   /clients/{clientId}/contacts/{contactId}

PATCH /clients/{clientId}/contacts/{contactId}

POST  /clients/{clientId}/contacts/{contactId}/deactivate
```

---

# 31. Client Cases API

```text
GET /clients/{clientId}/cases
```

Supports:

```text
page
pageSize
status
caseType
responsibleUserId
search
```

Case creation itself should belong to the Cases API.

Do not create completely separate ClientCase objects.

---

# 32. Client Activities APIs

```text
GET /clients/{clientId}/activities

POST /clients/{clientId}/activities

GET /clients/{clientId}/activities/{activityId}

PATCH /clients/{clientId}/activities/{activityId}
```

Optional later:

```text
POST /clients/{clientId}/activities/{activityId}/archive
```

The list endpoint can eventually support:

```text
includeCaseActivities=true
```

This allows the frontend to build a complete client timeline without duplicating case information.

---

# CASES

# 33. Case Domain

A Case represents a legal matter handled for a client.

Although the user-facing term may be "Case", internally the business concept should be broad enough to cover:

- Court cases
- Legal advisory
- Contract work
- Corporate transactions
- Regulatory work
- Legal opinions
- Negotiations
- Internal legal projects

Therefore do not design Case exclusively around court litigation.

Court-specific information can later be added as a litigation module.

---

# 34. Case Classes

## Case

Core case object.

Suggested attributes:

```text
Case

id

caseNumber

clientId

name

description

type
practiceArea

status

priority

responsibleUserId

openedDate
closedDate

externalReference

confidentialityLevel

tags

customFields

createdAt
createdBy

updatedAt
updatedBy
```

Suggested initial statuses:

```text
DRAFT
ACTIVE
ON_HOLD
CLOSED
ARCHIVED
```

Suggested initial priorities:

```text
LOW
NORMAL
HIGH
URGENT
```

Do not hard-code case types into the application.

Case types should eventually be configurable.

Example:

```text
Litigation
Contract Review
Legal Advice
Corporate
Real Estate
Employment
Other
```

---

# 35. Case Number

Every case should have a business-friendly case number.

Example:

```text
CASE-2026-00125
```

Or:

```text
2026/00125
```

The format should eventually be configurable.

Do not use internal database identifiers as case numbers.

---

# 36. Case Responsibility

Responsibility should be modeled separately from Case.

Do not create fields such as:

```text
lawyer1
lawyer2
lawyer3
assistant1
```

Create:

```text
CaseResponsibility

id

caseId

userId

role

isPrimary

startDate
endDate

status

notes

createdAt
createdBy
```

Possible responsibility roles:

```text
RESPONSIBLE_LAWYER
PARTNER
LAWYER
ASSOCIATE
PARALEGAL
ASSISTANT
REVIEWER
OTHER
```

Roles should eventually be configurable.

This allows any number of users to participate in a case.

---

# 37. Primary Responsible Lawyer

Case can contain:

```text
responsibleUserId
```

for easy access and filtering.

However, the full team must be represented using `CaseResponsibility`.

The responsible lawyer should also have a corresponding responsibility record.

This structure supports:

```text
1 primary lawyer
3 additional lawyers
1 paralegal
1 assistant
```

without changing the Case model.

---

# 38. CaseActivity

```text
CaseActivity

id

caseId

type

title
description

activityDate

createdBy

source

createdAt
updatedAt
```

Initial types:

```text
NOTE
PHONE_CALL
MEETING
EMAIL
CASE_UPDATE
OTHER
```

Later types could include:

```text
HEARING
COURT_FILING
DEADLINE
TASK
DOCUMENT
PAYMENT
CLIENT_COMMUNICATION
```

Do not redesign CaseActivity every time a new module is introduced.

For system-generated activities, activity records may contain a reference to the resource that caused the activity.

For example:

```text
sourceEntityType = DOCUMENT
sourceEntityId = xxx
```

This allows the activity feed to say:

```text
Document "Claim.pdf" uploaded
```

without storing the entire document inside the activity.

---

# 39. CaseDocument

Documents should be separate from Case.

Suggested business object:

```text
CaseDocument

id

caseId

name

description

documentType

status

originalFileName

fileReference

documentDate

versionNumber

confidentialityLevel

tags

uploadedBy
uploadedAt

updatedAt
```

Initial document statuses:

```text
DRAFT
FINAL
ARCHIVED
```

Later:

```text
IN_REVIEW
APPROVED
SIGNED
FILED
SENT
SUPERSEDED
```

Do not put document binary data into the Case object.

`fileReference` conceptually represents where the actual file is stored.

Storage technology is not part of this business specification.

---

# 40. Document Versions

Do not implement sophisticated document versioning immediately unless required.

However, design documents so versioning can be added.

Possible future model:

```text
CaseDocument

Logical document
    ↓
DocumentVersion 1
DocumentVersion 2
DocumentVersion 3
```

For the first implementation, a simple:

```text
versionNumber
```

may be enough.

Do not build UI assumptions that one document can only ever have one file forever.

---

# 41. Future CaseParty

You do not need full party management in the first release.

However, reserve the concept that Case will eventually have:

```text
CaseParty
```

Example future structure:

```text
caseId
personOrOrganizationId
role
side
notes
```

Examples:

```text
Client
Opponent
Witness
Expert
Court
Prosecutor
Buyer
Seller
Debtor
Creditor
```

Do not add fields like:

```text
opponentName
opponent2Name
judgeName
witness1
```

directly to Case.

That would create significant redesign later.

---

# 42. Case Frontend Pages

## Page 1 — Cases List

Conceptual route:

```text
/cases
```

Page header:

```text
Cases

[Create Case]
```

### Search

Search:

```text
Case name
Case number
Client name
External reference
```

### Filters

Initial filters:

```text
Status
Case Type
Practice Area
Responsible User
Priority
Client
Tags
```

### Table

Recommended columns:

```text
Case Number
Case Name
Client
Type
Responsible Lawyer
Priority
Status
Opened Date
Last Activity
```

Actions:

```text
Open
Edit
Close
Archive
```

Support server-side pagination.

---

# 43. Create Case Page

Conceptual route:

```text
/cases/new
```

Initial fields:

### General

```text
Client

Case Name

Description

Case Type

Practice Area

Priority

Opened Date
```

### Responsibility

```text
Responsible Lawyer

Additional Team Members
```

### Identification

```text
External Reference
```

### Classification

```text
Confidentiality
Tags
```

Buttons:

```text
Save
Save and Open
Cancel
```

The minimum required fields should ideally be:

```text
Client
Case Name
Responsible Lawyer
```

Other information can be completed later.

---

# 44. Creating a Case From Client

From:

```text
/clients/{clientId}
```

the user should be able to click:

```text
Create Case
```

The Create Case page should open with the client already selected.

Do not create a completely different "Create Client Case" workflow.

There should be one case creation process.

---

# 45. Edit Case Page

Conceptual route:

```text
/cases/{caseId}/edit
```

Allow editing:

```text
Name
Description
Type
Practice Area
Priority
Status
External Reference
Confidentiality
Tags
Custom Fields
```

Responsibility management should ideally be handled separately because it has its own business history.

---

# 46. Case Details Page

Conceptual route:

```text
/cases/{caseId}
```

This should become the most important working screen for lawyers.

Use tabs from the beginning.

Initial tabs:

```text
Overview
Documents
Activities
Responsibilities
```

Future tabs:

```text
Tasks
Deadlines
Calendar
Parties
Evidence
Chronology
Legal Issues
Research
Communication
Billing
Time
Expenses
AI
```

Because tabs/modules are separate, these features can be added progressively without redesigning Case Details.

---

# 47. Case Header

Visible across the entire Case Details area.

Display:

```text
Case Name

Case Number

Client

Status

Priority

Responsible Lawyer

Case Type

Tags
```

Primary actions:

```text
Edit Case
Add Activity
Upload Document
```

Possible future actions:

```text
Create Task
Create Deadline
Send Email
Generate Document
Ask AI
Close Case
```

---

# 48. Case Overview Tab

This should give the lawyer immediate context.

### Basic Information

```text
Case number
Client
Case type
Practice area
Status
Priority
Opened date
External reference
```

### Responsibility

```text
Primary responsible lawyer

Case team
```

### Description

Show case description.

### Statistics

Initially:

```text
Documents
Activities
Team Members
```

Eventually:

```text
Open Tasks
Upcoming Deadlines
Unbilled Time
Invoices
Evidence
```

### Recent Activity

Show latest activity.

### Recent Documents

Show latest documents.

---

# 49. Case Documents Tab

Display documents associated with the case.

Columns:

```text
Document Name
Document Type
Status
Document Date
Version
Uploaded By
Uploaded At
```

Actions:

```text
Open / Download
Edit Metadata
Archive
Upload New Document
```

Filters:

```text
Document Type
Status
Uploaded By
Date
Tags
```

The first implementation should prioritize good document organization over advanced editing.

---

# 50. Upload Document

The upload flow should allow:

```text
File

Document Name

Document Type

Document Date

Description

Status

Confidentiality

Tags
```

Only the file and document name need to be required initially.

Other metadata can be added later.

---

# 51. Case Activities Tab

Provide a chronological timeline.

Example:

```text
Sep 10
Meeting with client

Sep 9
Document "Contract Draft" uploaded

Sep 8
John Smith added as responsible lawyer

Sep 7
Case created
```

Allow filtering by:

```text
Type
Date
Created By
```

Allow:

```text
Add Activity
```

Manual activity fields:

```text
Type
Date
Title
Description
```

---

# 52. Case Responsibilities Tab

Display everyone responsible for the case.

Columns:

```text
User
Role
Primary
Start Date
Status
```

Actions:

```text
Add Responsibility
Edit Responsibility
Remove/End Responsibility
Set Primary
```

"Remove" should generally mean:

```text
Set endDate
Set status = INACTIVE
```

rather than deleting historical responsibility information.

This lets the firm later answer:

```text
Who worked on this case in January 2026?
```

---

# 53. Case Backend APIs

## Cases List

```text
GET /cases
```

Supported parameters:

```text
page
pageSize

search

clientId
status
type
practiceArea
priority
responsibleUserId
tags

sort
```

Return pagination metadata.

---

# 54. Get Case

```text
GET /cases/{caseId}
```

Return only the main case information and useful summary information.

Do not embed every document and every activity.

Related collections should have their own endpoints.

---

# 55. Create Case

```text
POST /cases
```

Input:

```text
clientId

name
description

type
practiceArea

priority

responsibleUserId

openedDate

externalReference

confidentialityLevel

tags
customFields
```

Creating a case should also create the primary responsibility record for the responsible lawyer.

---

# 56. Update Case

```text
PATCH /cases/{caseId}
```

Use partial update behavior.

---

# 57. Close Case

Do not simply update status from the frontend.

Expose an explicit business operation:

```text
POST /cases/{caseId}/close
```

Initially it may only require:

```text
closedDate
closingNote
```

Later this endpoint can execute closing validation such as:

```text
Outstanding tasks
Outstanding deadlines
Final invoice
Client funds
Documents
```

without changing the frontend's fundamental operation.

This is a good example of designing for future functionality.

---

# 58. Reopen Case

```text
POST /cases/{caseId}/reopen
```

Records who reopened the case and when.

---

# 59. Archive Case

```text
POST /cases/{caseId}/archive
```

Normally only closed cases should be archived.

---

# 60. Case Documents APIs

```text
GET /cases/{caseId}/documents
```

Supports:

```text
page
pageSize
search
documentType
status
tags
sort
```

Create/upload:

```text
POST /cases/{caseId}/documents
```

Get:

```text
GET /cases/{caseId}/documents/{documentId}
```

Update metadata:

```text
PATCH /cases/{caseId}/documents/{documentId}
```

Archive:

```text
POST /cases/{caseId}/documents/{documentId}/archive
```

Download/read content:

```text
GET /cases/{caseId}/documents/{documentId}/content
```

Exact file-transfer implementation is a technical decision and does not need to be defined in the business model.

---

# 61. Case Activities APIs

```text
GET /cases/{caseId}/activities

POST /cases/{caseId}/activities

GET /cases/{caseId}/activities/{activityId}

PATCH /cases/{caseId}/activities/{activityId}
```

Support filters:

```text
type
dateFrom
dateTo
createdBy
source
```

System-generated activity should generally not be editable like a normal user note.

---

# 62. Case Responsibilities APIs

List:

```text
GET /cases/{caseId}/responsibilities
```

Add:

```text
POST /cases/{caseId}/responsibilities
```

Update:

```text
PATCH /cases/{caseId}/responsibilities/{responsibilityId}
```

End responsibility:

```text
POST /cases/{caseId}/responsibilities/{responsibilityId}/end
```

Set primary:

```text
POST /cases/{caseId}/responsibilities/{responsibilityId}/set-primary
```

Do not expose "setPrimary" by having the frontend manually update five responsibility records.

The backend should enforce:

```text
Only one active primary responsible lawyer
```

where this rule is enabled.

---

# 63. Supporting APIs

Clients and Cases will need some shared reference data.

Examples:

```text
GET /users
```

For selecting responsible lawyers and team members.

```text
GET /case-types
```

```text
GET /practice-areas
```

```text
GET /tags
```

```text
GET /countries
```

Eventually these should be configurable by administrators.

Do not hard-code these values into frontend code.

---

# 64. API Response Philosophy

List APIs should return compact summary objects. We already have abstraction for pagination so use it for list api

For example:

```text
GET /cases
```

does not need every case description, activity, document, responsibility, and client address.

A list result might contain:

```text
id
caseNumber
name

client:
    id
    displayName

status
type
priority

responsibleUser:
    id
    displayName

openedDate
lastActivityAt
```

The details endpoint can return more information.

This prevents the system from becoming unnecessarily slow as data grows.

---

# 65. Referential Information

When displaying related objects, APIs should return enough summary data to avoid unnecessary calls.

For example Case Details should not only return:

```text
clientId
```

It can return:

```text
client:
{
    id
    clientNumber
    displayName
}
```

But it should not return the complete Client object.

Use the same principle for users, tags, and other references.

---

# 66. Validation

## Client Validation

Initially:

### Individual

Require:

```text
First Name
Last Name
```

or a valid display name.

### Organization

Require:

```text
Organization Name
```

General validation:

```text
Valid email format
Valid status
Valid responsible user
```

Avoid excessive mandatory information.

Client records should be creatable quickly.

---

# 67. Case Validation

Require:

```text
Client
Case Name
Responsible Lawyer
```

Recommended:

```text
Case Type
```

Validate that:

- Client exists.
- Client is accessible to the user.
- Responsible lawyer exists.
- Case number is unique.
- Closed case has a closed date.
- Archived case should normally already be closed.

---

# 68. Authorization

Authorization must be considered from the beginning even if first implementation is simple.

Have in mind that every user belong to some organization (workspace in this app)

The backend must never assume that because a user knows a Client ID or Case ID they are allowed to access it.

Every operation should eventually verify:

```text
Can this user see this client?

Can this user edit this client?

Can this user see this case?

Can this user edit this case?

Can this user see this document?
```

Start with basic roles if necessary.

Do not design APIs in a way that makes adding case-level confidentiality difficult later.

---

# 69. Activity Generation

Important actions should automatically create system activities.

Examples:

Client:

```text
Client created
Client updated
Contact added
Case created
Client archived
```

Case:

```text
Case created
Case status changed
Document uploaded
Responsibility added
Responsible lawyer changed
Case closed
Case reopened
```

These activities should be created by backend business logic.

The frontend should not manually create system history entries.

This is important because other integrations and AI functions may eventually perform these actions without using the normal frontend.

---

# 70. Future AI Integration

Do not implement any functionality in this phase.

---

# 71. AI-Friendly Activity Model

Skip this for now since AI isn't in focus in this phase.

---

# 72. Frontend Component Structure

Frontend implementation should also be modular.

Reusable application-level components may include:

```text
ClientSelector

CaseSelector

UserSelector

TagSelector

ActivityTimeline

ActivityForm

DocumentList

DocumentUpload

ResponsibilityList

StatusBadge

PriorityBadge

SearchInput

FilterPanel

Pagination

EntityHeader

EmptyState
```

Do not make these components dependent on one specific page where avoidable.

For example the same `ClientSelector` will later be useful for:

- Case creation
- Invoices
- Client requests
- Documents
- Reports

---

# 73. Recommended Frontend Navigation

Initial application navigation:

```text
Dashboard

Clients

Cases
```

Do not add empty menu options for modules that do not yet exist.

As development progresses this could become:

```text
Dashboard

Clients
Cases

Tasks
Calendar
Documents

Billing
Reports

Knowledge
Administration
```

---

# 74. Recommended First Development Milestone

Build the base Client functionality.

### Backend

Implement:

```text
Client
ClientAddress
ClientContact
ClientActivity
```

And APIs for:

```text
Create
Read
Update
List
Archive
```

### Frontend

Implement:

```text
Clients List
Create Client
Edit Client
Client Details
Overview
Contacts
Activities
```

Do not build Client Cases yet until Case exists.

---

# 75. Recommended Second Development Milestone

Build base Case functionality.

### Backend

Implement:

```text
Case
CaseResponsibility
CaseActivity
```

And APIs for:

```text
Create
Read
Update
List
Close
Reopen
Archive
```

### Frontend

Implement:

```text
Cases List
Create Case
Edit Case
Case Details
Overview
Activities
Responsibilities
```

Connect Client Details → Cases.

---

# 76. Recommended Third Development Milestone

Add Case Documents.

Backend:

```text
CaseDocument
```

Implement:

```text
Upload
List
Read
Update metadata
Download
Archive
```

Frontend:

```text
Case Documents tab
Document upload
Document details
Document metadata editing
```

---

# 77. Recommended Fourth Development Milestone

Improve activity timeline.

Automatically record important events.

Client timeline:

```text
Client changes
Cases created
Important client activities
```

Case timeline:

```text
Case changes
Documents
Responsibilities
Manual activities
```

At this point the application starts giving lawyers a useful history of what is happening.

---

# 78. Important Things NOT to Do

Avoid designs like:

```text
Client
    case1
    case2
    case3
```

Cases are independent resources.

Avoid:

```text
Case
    document1
    document2
    document3
```

Documents are independent resources.

Avoid:

```text
Case
    lawyer1
    lawyer2
    lawyer3
```

Use responsibilities.

Avoid:

```text
Client
    contact1
    contact2
```

Use contacts.

Avoid large objects containing every possible future field.

Avoid hard-coding legal practice areas into business logic.

Avoid hard-coding users and roles into case fields.

Avoid making frontend logic responsible for important business rules.

Avoid permanently deleting business history under normal operations.

---

# 79. Stable Core Model

The first implementation should therefore primarily revolve around these entities:

```text
Client
│
├── ClientAddress
│
├── ClientContact
│
├── ClientActivity
│
└── Case
     │
     ├── CaseActivity
     │
     ├── CaseResponsibility
     │
     └── CaseDocument
```

Later this can naturally become:

```text
Client
│
├── Addresses
├── Contacts
├── Activities
├── Documents
├── Relationships
├── Compliance
├── Financials
│
└── Cases
     │
     ├── Activities
     ├── Responsibilities
     ├── Documents
     ├── Parties
     ├── Tasks
     ├── Deadlines
     ├── Calendar Events
     ├── Hearings
     ├── Evidence
     ├── Chronology
     ├── Legal Issues
     ├── Research
     ├── Communication
     ├── Time
     ├── Expenses
     ├── Billing
     └── AI Context
```

The original `Client` and `Case` concepts remain intact.

New functionality is attached to them rather than forcing a redesign.

---

# 80. Recommended MVP User Flow

A basic application should already allow the following complete workflow.

### 1.

Lawyer opens:

```text
Clients
```

### 2.

Creates:

```text
ACME Corporation
```

### 3.

Adds:

```text
Address
Contact person
Internal note
```

### 4.

From ACME's Client Details page chooses:

```text
Create Case
```

### 5.

Creates:

```text
Contract Dispute 2026
```

### 6.

Assigns:

```text
John Smith — Responsible Lawyer
Jane Doe — Associate
```

### 7.

Uploads:

```text
Contract.pdf
Client correspondence.pdf
```

### 8.

Adds activity:

```text
Initial meeting with client completed.
```

### 9.

Case Overview now shows:

```text
Client: ACME Corporation

Responsible Lawyer: John Smith

2 Documents

2 Team Members

Recent Activities
```

### 10.

Client Details shows:

```text
Active Cases: 1

Contract Dispute 2026
```

and its activity stream can show:

```text
Case Contract Dispute 2026 created.
```

This represents a small but already useful legal case management application.

---

# 81. Main Development Principle

For this stage, the objective should not be:

> "Build everything that a law office will eventually need."

The objective should be:

> "Build the smallest useful Client and Case management system whose core model will still make sense after the application becomes ten times larger."

The stable concepts should remain:

```text
Client
Case
Activity
Document
Responsibility
Contact
Address
```

Future modules should generally extend these concepts rather than replace them.

The most important architectural rule is:

**Client and Case should contain information that describes what they ARE.**

Information describing things that HAPPEN TO them or things that BELONG TO them should normally be separate resources.

For example:

```text
Case.status
```

belongs directly to Case.

But:

```text
Case documents
Case activities
Case responsibilities
Case deadlines
Case tasks
Case invoices
```

should be separate resources.

Following this principle will allow the application to grow significantly without continually rewriting its central Client and Case logic.
