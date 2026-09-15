# Changes

## API clients

- Added legal Client API methods for list, search, detail, create, update, archive, and activate.
- Added Matter API methods for list, detail, create, update, open, close, and archive.
- Preserved the existing legacy Client/Case API clients for compatibility.

## Angular routes and screens

- Replaced the Client placeholder with a searchable, paginated Client list.
- Replaced the Case placeholder with a searchable, paginated Matter list.
- Added Client create and detail routes/components.
- Added Matter create and detail routes/components.
- Added typed core forms and backend-driven Save Draft/Open Matter flow.
- Added overview/tab shells and honest Documents/Activity unavailable states.

## Compatibility

- No Prisma or migration changes were made.
- No fake Client, Matter, Document, or Activity data was added.
- Existing application-wide routes and unrelated settings/assistant screens remain unchanged.
