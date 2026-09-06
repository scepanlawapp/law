-- Replace the invalid seed default workspace id with an RFC 4122 v4 UUID.
-- class-validator @IsUUID() rejects 00000000-0000-0000-0000-000000000001
-- (version/variant bits are 0). Related FKs use ON UPDATE CASCADE.
UPDATE "Workspace"
SET id = '11111111-1111-4111-a111-111111111111'
WHERE id = '00000000-0000-0000-0000-000000000001';
