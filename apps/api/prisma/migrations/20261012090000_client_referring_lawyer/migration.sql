ALTER TABLE "Client" ADD COLUMN "referringLawyerId" TEXT;

ALTER TABLE "Client" ADD CONSTRAINT "Client_referringLawyerId_fkey" FOREIGN KEY ("referringLawyerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
