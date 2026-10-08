/**
 * Strict per-document AI access for the assistant. Pure functions: every path
 * that hands document or attachment text to the model decides here first, and
 * the decision never depends on the content row (which may not exist yet for
 * data created before ingestion).
 */
export type AccessDecision =
  | { readable: true; contentId: string | null }
  | { readable: false; reason: "AI_ACCESS_OFF" | "ARCHIVED" | "NOT_FOUND" };

export type DocumentAccessSubject = {
  archivedAt: Date | null;
  aiAccess: boolean;
};

export const AI_ACCESS_OFF_MESSAGE = (title: string): string =>
  `Dokument „${title}" nije dostupan asistentu (AI pristup je isključen). Korisnik ga može uključiti u detaljima dokumenta.`;

function decide(
  subject: DocumentAccessSubject,
  contentId: string | null,
): AccessDecision {
  if (subject.archivedAt) return { readable: false, reason: "ARCHIVED" };
  if (!subject.aiAccess) return { readable: false, reason: "AI_ACCESS_OFF" };
  return { readable: true, contentId };
}

/** A workspace document: non-archived and `aiAccess = true`. */
function forDocument(
  doc: DocumentAccessSubject & {
    currentVersion: { contentId: string | null } | null;
  },
): AccessDecision {
  return decide(doc, doc.currentVersion?.contentId ?? null);
}

/**
 * A chat attachment: readable while unfiled; once filed, the document's
 * access applies.
 */
function forAttachment(att: {
  contentId: string | null;
  document: DocumentAccessSubject | null;
}): AccessDecision {
  if (!att.document) return { readable: true, contentId: att.contentId };
  return decide(att.document, att.contentId);
}

export const DocumentAccessPolicy = { forDocument, forAttachment } as const;

/** The refusal text for the user, or null when the source should look absent. */
export function accessRefusalMessage(
  decision: AccessDecision,
  title: string,
): string | null {
  return decision.readable === false && decision.reason === "AI_ACCESS_OFF"
    ? AI_ACCESS_OFF_MESSAGE(title)
    : null;
}
