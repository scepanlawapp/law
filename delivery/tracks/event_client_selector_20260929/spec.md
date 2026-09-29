# Event Client Selector Specification

## Problem

Events already support `clientIds` in the API and expose `clients` in `EventDetail`, but the Angular event dialog cannot select or edit a client.

## Included

- Add an optional single-client selector to the existing event dialog.
- Initialize edit forms from the first existing event client.
- Load clients through the existing `ClientsApiClient` list pattern.
- Keep the selected client and case consistent: selecting a case selects that case's client, while choosing an incompatible client clears the case.
- Map the selected client to the existing `EventRequest.clientIds` field.
- Add focused form-mapping verification and update implemented-business documentation.

## Excluded

- Multi-client selection UI, attendee/contact editing, API or schema changes, and unrelated event-form redesign.
