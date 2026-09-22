# User Profile Gender Specification

## Goal

Allow a user to optionally store and edit gender in their profile without inferring it from names or other identity data.

## Requirements

- Persist gender on the user as nullable `MALE` or `FEMALE`.
- Existing users remain valid with no gender value.
- Return gender in the authenticated user-settings profile response.
- Accept `MALE`, `FEMALE`, or `null` when updating the profile; reject unsupported values.
- Show a translated Profile Settings select with Not specified, Male, and Female options.
- Allow users to clear a previously saved value by choosing Not specified.
- Keep shared frontend/backend contracts typed.

## Excluded

- Dashboard greeting changes.
- Honorific selection or display.
- Serbian vocative generation.
- Inferring gender from first name, last name, username, email, or job title.
