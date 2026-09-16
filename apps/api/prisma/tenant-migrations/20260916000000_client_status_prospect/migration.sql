-- Apply with DATABASE_URL configured for the target tenant schema.
-- Adds PROSPECT to the ClientStatus enum so offices can record potential
-- clients before accepting representation.

ALTER TYPE "ClientStatus" ADD VALUE IF NOT EXISTS 'PROSPECT';