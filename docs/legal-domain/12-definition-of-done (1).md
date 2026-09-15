# Definition of Done

## Client

Client functionality is not complete until the intended V1 can:

1. Create a person Client.
2. Create an organization Client.
3. Store multiple email addresses/contact points.
4. Store multiple phone numbers/contact points.
5. Store multiple identifiers.
6. Store multiple addresses at the model level.
7. Add multiple contact persons to an organization.
8. Mark a primary contact person.
9. Find an organization Client through a contact person's email/name/phone as specified.
10. View the Client's Matters.
11. View Client Documents.
12. View Client Activity.
13. Edit without losing unrelated/historical data.
14. Archive/deactivate according to product rules rather than destructive deletion.

## Matter

Matter functionality is not complete until the intended V1 can:

1. Create a Draft Matter.
2. Open a Matter.
3. Receive a backend-generated internal number.
4. Link multiple Clients.
5. Select a primary Client if the product uses that concept.
6. Add multiple participants.
7. Assign one or more participant roles.
8. Select PracticeArea.
9. Create a PracticeArea without deploying code.
10. Select Stage.
11. Create a Stage.
12. Create multiple Proceedings.
13. Set Priority.
14. Assign responsible User.
15. Link/upload Documents.
16. View Activity.
17. Close a Matter.
18. Archive a Matter.

## Architecture resilience

The core Client/Matter schema should not require redesign merely because the product later needs:

- a new PracticeArea;
- a new Stage;
- a new participant role;
- a new document category;
- a new typed custom field;
- a second Proceeding;
- a second Client on the same Matter;
- another organization contact person;
- tasks;
- deadlines;
- invoices;
- AI features.

## Security

Completion also requires:

- tenant-scoped reads/writes;
- cross-tenant assignment prevention;
- authorization for documents;
- secure autocomplete/search;
- backend validation of foreign references.

## Delivery evidence

A phase is not considered complete until its `delivery/<phase>/verification.md` accurately records what was checked and any remaining failures.
