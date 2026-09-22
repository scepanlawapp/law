-- CreateEnum
CREATE TYPE "public"."UserGender" AS ENUM ('MALE', 'FEMALE');

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN "gender" "public"."UserGender";
