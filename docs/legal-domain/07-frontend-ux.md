# Frontend UX Specification

## General rules

- Reuse the existing design system.
- Use the existing form and validation library.
- Keep backend validation authoritative.
- Prefer progressive disclosure over very large forms.
- Keep list screens performant by using server-side search/pagination where appropriate.
- Do not load all Clients, Parties, or Users merely to populate an autocomplete.

## Control selection guide

### Text input

Use for:

- names;
- titles;
- job titles;
- external reference numbers;
- short labels.

### Textarea

Use for:

- descriptions;
- notes;
- long free-text content.

### Radio / segmented control

Use for very small mutually exclusive choices where all choices should be visible.

Primary example:

```text
Person | Organization
```

### Checkbox

Use for independent boolean choices.

Examples:

- primary contact;
- include matter documents;
- active flag in admin screens when appropriate.

Do not use multiple independent checkboxes when only one row may be primary; use a dedicated primary selection pattern or enforce exclusivity.

### Select

Use for small finite system enums.

Examples:

- priority;
- simple lifecycle transitions where appropriate.

### Searchable select

Use for firm-configurable lookups:

- practice area;
- stage;
- participant role;
- proceeding type;
- document category;
- organization relationship type.

Where specified, include inline creation.

### Autocomplete

Use for large entity sets:

- Client;
- Party;
- User.

### Multi autocomplete

Use for Matter Clients.

### Date picker / datetime picker

Use for date semantics rather than free-text date input.

## Client create/edit

### Header choice

`Person | Organization` via segmented control/radio.

### Person

Required:

```text
First name
Last name
```

Sections:

```text
Contact details
Identifiers
Addresses
Notes
```

### Organization

Required:

```text
Legal name
```

Optional:

```text
Trade name
Contact details
Identifiers
Addresses
Contact persons
Notes
```

Contact persons section supports:

```text
+ Add contact person
```

Then choose:

```text
Link existing person
Create new person
```

## Matter create/edit

Fields:

```text
Title *
Clients *
Practice area
Stage
Priority
Responsible lawyer
Opened date
Description
```

Secondary sections:

```text
Participants
Proceedings
Custom fields
```

Actions:

```text
Save draft
Open matter
```

Draft requires only the minimum allowed by backend business rules.

Open requires at least title and one Client in V1.

## Client detail

Header:

- display name;
- client code;
- Party type;
- status;
- edit action;
- primary contact person for organizations where available.

Tabs:

```text
Overview
Contact persons
Matters
Documents
Activity
```

Overview:

- core information;
- contact details;
- identifiers;
- addresses;
- primary contact;
- active Matters;
- recent activity;
- notes.

Contact persons table:

```text
Name
Relationship
Job title
Email
Phone
Primary
```

Matter list filters:

```text
Active
Closed
All
```

## Matter detail

Tabs:

```text
Overview
Documents
Participants
Proceedings
Activity
```

Overview sections:

- information;
- Clients;
- participants;
- active/recent Proceedings;
- recent Documents;
- recent Activity.

It should answer "What is important about this Matter right now?" rather than show every database field.

## Empty/loading/error states

Every async section must have:

- loading state;
- meaningful empty state;
- API error state;
- retry behavior where the current UI architecture supports it.

## Accessibility

Use the existing application's accessibility conventions.

At minimum:

- labels associated with controls;
- keyboard-accessible autocomplete/select;
- focus management for modal/drawer inline create;
- validation errors associated with fields.
