-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "public"."AuthTokenPurpose" ADD VALUE 'MFA_CHALLENGE';
ALTER TYPE "public"."AuthTokenPurpose" ADD VALUE 'MFA_EMAIL_CODE';

-- AlterTable
ALTER TABLE "public"."AuthToken" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "scope" TEXT;

-- AlterTable
ALTER TABLE "public"."OrganizationSettings" ADD COLUMN     "mfaRequired" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "public"."UserMfa" (
    "userId" TEXT NOT NULL,
    "totpSecretCiphertext" TEXT NOT NULL,
    "totpSecretIv" TEXT NOT NULL,
    "totpSecretAuthTag" TEXT NOT NULL,
    "enabledAt" TIMESTAMPTZ(3),
    "lastUsedStep" BIGINT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "UserMfa_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "public"."MfaRecoveryCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MfaRecoveryCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TrustedDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "lastUsedAt" TIMESTAMPTZ(3),
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrustedDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MfaRecoveryCode_userId_idx" ON "public"."MfaRecoveryCode"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TrustedDevice_tokenHash_key" ON "public"."TrustedDevice"("tokenHash");

-- CreateIndex
CREATE INDEX "TrustedDevice_userId_revokedAt_idx" ON "public"."TrustedDevice"("userId", "revokedAt");

-- AddForeignKey
ALTER TABLE "public"."UserMfa" ADD CONSTRAINT "UserMfa_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MfaRecoveryCode" ADD CONSTRAINT "MfaRecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TrustedDevice" ADD CONSTRAINT "TrustedDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
