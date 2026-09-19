import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import { detectScript } from "@law/transliteration";
import type { LegalSourceMetadata } from "./embeddings";

export const PARAGRAF_LABOR_LAW_URL =
  "https://www.paragraf.rs/propisi/zakon_o_radu.html";
export const LEGAL_SOURCE_PARSER_VERSION = "paragraf-html-v1";

export interface ParsedLegalSource {
  metadata: Omit<
    LegalSourceMetadata,
    "retrievedAt" | "contentHash" | "sourceScript"
  >;
  rawText: string;
  sourceScript: LegalSourceMetadata["sourceScript"];
  contentHash: string;
}

export function parseLegalHtml(
  html: string,
  options: {
    sourceUrl: string;
    retrievedAt?: string;
    title?: string;
    publisher?: string;
  },
): ParsedLegalSource {
  const $ = cheerio.load(html);
  $("script, style, nav, footer, noscript, form").remove();

  const title =
    options.title?.trim() ||
    $("h1").first().text().replace(/\s+/g, " ").trim() ||
    $("title").first().text().replace(/\s+/g, " ").trim();
  const root = $("main").first().length
    ? $("main").first()
    : $("article").first().length
      ? $("article").first()
      : $("body");
  const blocks = root
    .find("h1, h2, h3, h4, p, li")
    .map((_, element) => $(element).text().replace(/\s+/g, " ").trim())
    .get()
    .filter(Boolean);
  const rawText = (blocks.length ? blocks.join("\n") : root.text())
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!title || !rawText)
    throw new Error("Legal source page has no usable text");
  if (
    $(".clan").length === 0 &&
    !/(?:^|\s)Član\s+\d+(?:[.\s]|$)/i.test(rawText)
  ) {
    throw new Error("Legal source page does not contain article markers");
  }

  const canonicalUrl = new URL(options.sourceUrl).toString();
  const contentHash = createHash("sha256")
    .update(rawText, "utf8")
    .digest("hex");
  return {
    metadata: {
      sourceUrl: canonicalUrl,
      canonicalUrl,
      title,
      publisher: options.publisher ?? "Paragraf Lex",
      jurisdiction: "RS",
      language: "sr",
    },
    rawText,
    sourceScript: detectScript(rawText),
    contentHash,
  };
}

export async function fetchLegalHtml(
  sourceUrl: string,
  options: { timeoutMs?: number; userAgent?: string } = {},
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 20_000,
  );
  try {
    const response = await fetch(sourceUrl, {
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent":
          options.userAgent ?? "LawOfficeLegalKnowledgeBot/1.0 (+internal)",
      },
    });
    if (!response.ok) {
      throw new Error(`Legal source fetch failed (${response.status})`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}
