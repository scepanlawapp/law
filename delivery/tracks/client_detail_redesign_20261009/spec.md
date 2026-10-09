# Client Detail Redesign

## Scope

Breadcrumb above a 24px client title, with type, status and residency badges below it and a primary accent edit action at top right. A full-width bordered bg-card summary strip has four icon-led cells with muted labels above values and desktop vertical dividers. Compact tabs lead immediately into a desktop 2:1 overview, with a 16px column gutter and 12px vertical gaps.

Use flat bordered data sections, no floating shadows: icon-led headers with right-aligned edit actions and header-bottom dividers. Basic information uses two side-by-side vertical label-left/value-right lists: identity and organization/person fields on the left; type, residency and communication fields on the right. Retain status, tags, public-sector and JBKJS fields. Addresses and contacts use softly framed repeated records with type/primary badges, icons and functional menus. Notes have a slightly tinted multiline inset. Identification documents remain at the bottom of the main column with an inline empty-state icon and add action. Retainer uses a compact icon/title/state row with month and primary agreement action, preserving agreement details, rate actions and permissions. All colors use semantic theme tokens, visible text is at least 14px, corners are at most 8px and mobile retains every action without page overflow.

Section edit actions open the existing client dialog on the corresponding tab. Contacts use Uredi, and identification addition opens the document form tab. Each address and contact has a visible menu for supported persisted operations, including set-primary and confirmed deletion. Primary deletion is prevented in the UI and API with accessible explanation. No invented fields or unnecessary schema changes.

## Acceptance

Both client types retain all fields. Operations expose pending/error states and refresh persisted data. Focused tests cover dialog routing, mutations and primary-delete guards; Angular validation and desktop/mobile browser checks provide verification evidence where available.

## Registration Number Follow-Up

Add one organization-only registration-number cell after tax number in the header summary, using the existing translated label, stored field and icon. Organizations use five desktop tracks; individuals retain four. Preserve the current CSS, two-column small-screen layout and mobile stack without overflow. No backend or contract changes.
