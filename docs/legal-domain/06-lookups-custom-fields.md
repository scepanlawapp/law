# Configurable Lookups and Custom Fields

## Firm-configurable lookups

Use database-backed lookup entities for values a law office may add or deactivate.

Required initial lookup concepts:

```text
PracticeArea
MatterStage
ParticipantRole
ProceedingType
DocumentCategory
OrganizationRelationshipType
```

A typical lookup contains:

```text
id
firm_id
code
name/label
is_active
sort_order
created_at
updated_at
```

Some lookups need additional relationships.

### PracticeArea

May support:

```text
parent_id
is_system_seed
```

Suggested seed values:

- Civil law;
- Criminal law;
- Commercial law;
- Family law;
- Employment law;
- Administrative law;
- Enforcement;
- Insolvency;
- Tax law;
- Real estate;
- Other.

### MatterStage

May include:

```text
practice_area_id nullable
```

A null PracticeArea means a stage is globally available if the product chooses that behavior.

### Lookup deactivation

When a lookup value has historical references:

- allow deactivation;
- keep existing references readable;
- do not hard-delete it.

## Inline create UX

Searchable selects for configurable lookups should support an action such as:

```text
+ Add "Banking disputes"
```

The create UI should use the project's modal/popover/drawer convention.

After successful creation:

1. close the create UI;
2. refresh/invalidate lookup query cache;
3. select the newly created value.

Avoid separate duplicate implementations for every lookup if a small reusable pattern fits the existing UI architecture.

## Custom-field definitions

Conceptual entity:

```text
CustomFieldDefinition
id
firm_id
entity_type
code
label
data_type
practice_area_id nullable
is_required
is_active
sort_order
created_at
updated_at
```

System enum for `entity_type`:

```text
CLIENT
PARTY
MATTER
PROCEEDING
DOCUMENT
```

System enum for `data_type`:

```text
TEXT
TEXTAREA
INTEGER
DECIMAL
MONEY
DATE
DATETIME
BOOLEAN
SINGLE_SELECT
MULTI_SELECT
PARTY_REFERENCE
CLIENT_REFERENCE
USER_REFERENCE
```

## Options

For select fields:

```text
CustomFieldOption
id
custom_field_definition_id
code
label
is_active
sort_order
```

Inactive options must remain renderable for historical values.

## Values

A generic conceptual model:

```text
CustomFieldValue
id
custom_field_definition_id
entity_type
entity_id
value
created_at
updated_at
```

The concrete database representation may use JSON or typed value columns depending on the existing stack.

Important distinction:

Using a validated value representation inside the dedicated custom-field subsystem is acceptable.

Using `matter.extraData` or `client.extraData` as an untyped catch-all replacement for domain modeling is not.

Backend validation must enforce that the stored value matches the field's declared data type and tenant.

## Dynamic frontend controls

Render based on `data_type`:

- TEXT → text input;
- TEXTAREA → textarea;
- INTEGER → integer number input;
- DECIMAL → decimal input;
- MONEY → monetary input using the app's money conventions;
- DATE → date picker;
- DATETIME → datetime picker;
- BOOLEAN → checkbox/switch;
- SINGLE_SELECT → searchable select;
- MULTI_SELECT → multi-select;
- PARTY_REFERENCE → Party autocomplete;
- CLIENT_REFERENCE → Client autocomplete;
- USER_REFERENCE → User autocomplete.

`is_required` drives frontend assistance and backend validation.

## Examples

Practice area: Damages

```text
Accident date        DATE
Policy number        TEXT
Claim value          MONEY
Insurance company    PARTY_REFERENCE
```

Practice area: Real estate

```text
Parcel number
Cadastral municipality
Property sheet number
```

These do not belong as universal Matter columns.
