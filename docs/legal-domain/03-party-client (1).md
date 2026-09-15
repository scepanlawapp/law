# Party, Client, and Organization Contact Persons

## Party

Recommended conceptual fields:

```text
id
firm_id

type

first_name
last_name

legal_name
trade_name

display_name

notes

created_at
created_by
updated_at
updated_by
archived_at
```

### Required creation data

For a PERSON:

- first name;
- last name.

For an ORGANIZATION:

- legal name.

Email, phone, national ID, tax ID, registration number, and address are not universally required.

### display_name

A display name should be available for every Party.

Examples:

```text
Petar Petrović
ABC DOO
```

Prefer a backend-controlled or consistently persisted/computed value rather than rebuilding names independently in every frontend view.

## Party contact points

A Party may have multiple contact methods.

Conceptual entity:

```text
PartyContactPoint
id
party_id
type
value
label
is_primary
created_at
updated_at
```

System enum for `type`:

```text
EMAIL
PHONE
MOBILE
FAX
WEBSITE
OTHER
```

Do not enforce globally unique email addresses. Shared mailboxes and reused business addresses exist.

## Party identifiers

Conceptual entity:

```text
PartyIdentifier
id
party_id
type
value
country_code
issuer
is_primary
created_at
updated_at
```

System enum:

```text
NATIONAL_ID
TAX_ID
REGISTRATION_ID
PASSPORT
ID_CARD
VAT_ID
OTHER
```

The UI may localize these values. For Serbia, examples include JMBG, PIB, and company registration number.

Avoid database columns whose schema is tied to one country when a generic identifier model is practical.

## Addresses

Conceptual entity:

```text
PartyAddress
id
party_id
type
address_line_1
address_line_2
city
postal_code
region
country_code
is_primary
```

System enum may include:

```text
PRIMARY
REGISTERED
MAILING
BILLING
OTHER
```

V1 UI does not need to expose every possible address type at once.

## Organization contact persons

An organization can have multiple people through whom the law office communicates.

Each contact person is a separate `Party` of type PERSON.

Do not store:

```text
client.contactPersonName
client.contactPersonEmail
client.contactPersonPhone
```

as the primary model.

Use a relationship entity instead.

Conceptual `PartyRelationship`:

```text
id
from_party_id
to_party_id
relationship_type_id
job_title
department
is_primary_contact
is_active
notes
created_at
updated_at
```

Typical direction:

```text
from_party = organization
to_party = person
```

Relationship type should be firm-configurable.

Seed suggestions:

```text
Employee
Director
Owner
Legal representative
Accountant
Authorized person
Billing contact
Other
```

A law office may add its own relationship types.

## Why this matters

Searching for:

```text
jelena@abc.rs
```

should be able to return:

```text
ABC DOO
```

when Jelena is a related contact person for ABC DOO.

This also enables future email matching:

```text
sender email
→ person Party
→ organization relationship
→ Client
→ active Matters
```

## Client

Conceptual entity:

```text
id
firm_id
party_id
client_code
status
responsible_user_id
opened_at
closed_at
notes
created_at
created_by
updated_at
updated_by
archived_at
```

V1 system status:

```text
ACTIVE
INACTIVE
```

If a future intake CRM is intentionally added, Lead/Prospect can be designed as a separate product workflow rather than prematurely expanding this state.

`client_code` should be unique within a firm if the product uses such codes.

## Client create UX

### Party type

Use radio buttons or segmented control:

```text
Person | Organization
```

### Person

Required:

- First name;
- Last name.

Optional grouped sections:

- Contact details;
- Identifiers;
- Addresses;
- Notes.

### Organization

Required:

- Legal name.

Optional:

- Trade name;
- Contact details;
- Identifiers;
- Addresses;
- Contact persons;
- Notes.

### Repeating contact details

Do not render many empty email/phone inputs.

Provide an initial primary email/phone experience and an action:

```text
+ Add contact detail
```

Each extra row can use:

- Type: select;
- Value: input;
- Label: editable select/combobox or input;
- Primary: checkbox/radio according to type semantics.

### Contact persons UI

For organizations:

```text
Contact persons
+ Add contact person
```

Allow:

- link existing person through autocomplete;
- create a new person inline.

Fields:

- person autocomplete or First/Last name;
- email/phone when creating;
- relationship type searchable select;
- job title;
- department;
- primary contact checkbox.

Creating a new contact person creates a PERSON Party plus PartyRelationship.
