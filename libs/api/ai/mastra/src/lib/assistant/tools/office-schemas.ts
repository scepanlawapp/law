import { z } from "zod";

/** Shared input fields of the read-only office tools. */
export const personInput = z
  .string()
  .trim()
  .min(2)
  .max(120)
  .describe(
    "'me' for the current user, a colleague's name, or 'office' for everyone",
  );

export const caseReferenceInput = z
  .string()
  .trim()
  .min(2)
  .max(120)
  .describe("Case number or part of the case name");

export const clientReferenceInput = z
  .string()
  .trim()
  .min(2)
  .max(120)
  .describe("Client name or client number");

export const dayInput = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("YYYY-MM-DD, resolved against today's date");

export const CASE_STATUSES = [
  "DRAFT",
  "ACTIVE",
  "ON_HOLD",
  "CLOSED",
  "ARCHIVED",
] as const;
export const CASE_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export const CLIENT_STATUSES = [
  "ACTIVE",
  "INACTIVE",
  "ARCHIVED",
  "PROSPECT",
] as const;
