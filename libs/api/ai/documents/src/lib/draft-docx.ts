import {
  AlignmentType,
  Document,
  HeadingLevel,
  HighlightColor,
  LevelFormat,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import { toCyrillic } from "@law/transliteration";

export type DraftExportScript = "latin" | "cyrillic";

export interface RenderDraftDocxOptions {
  text: string;
  script: DraftExportScript;
}

type DraftBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "bullet" | "number"; text: string };

const PLACEHOLDER_PATTERN = /(\[UNOS POTREBAN:[^\]]+\])/g;
const PLACEHOLDER_ONLY_PATTERN = /^\[UNOS POTREBAN:[^\]]+\]$/;
const PAGE_WIDTH = 11906;
const PAGE_HEIGHT = 16838;
const PAGE_MARGIN = 1417;
const LINE_SPACING = 276;

export async function renderDraftDocx(
  options: RenderDraftDocxOptions,
): Promise<Buffer> {
  const sourceText =
    options.script === "cyrillic" ? toCyrillic(options.text) : options.text;
  const blocks = parseDraftBlocks(sourceText);
  const children = blocks.map((block) => toParagraph(block));

  const document = new Document({
    title: "Tužba",
    creator: "Law AI",
    numbering: {
      config: [
        {
          reference: "draft-numbered",
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.LEFT,
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
            margin: {
              top: PAGE_MARGIN,
              right: PAGE_MARGIN,
              bottom: PAGE_MARGIN,
              left: PAGE_MARGIN,
            },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(document);
}

function parseDraftBlocks(text: string): DraftBlock[] {
  const blocks: DraftBlock[] = [];
  const paragraphLines: string[] = [];

  const flushParagraph = (): void => {
    if (paragraphLines.length === 0) return;
    blocks.push({ type: "paragraph", text: paragraphLines.join(" ").trim() });
    paragraphLines.length = 0;
  };

  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      blocks.push({
        type: "heading",
        level: heading[1].length as 1 | 2 | 3,
        text: heading[2].trim(),
      });
      continue;
    }

    const bullet = /^[-*]\s+(.+)$/.exec(trimmed);
    if (bullet) {
      flushParagraph();
      blocks.push({ type: "bullet", text: bullet[1].trim() });
      continue;
    }

    const numbered = /^\d+[.)]\s+(.+)$/.exec(trimmed);
    if (numbered) {
      flushParagraph();
      blocks.push({ type: "number", text: numbered[1].trim() });
      continue;
    }

    paragraphLines.push(trimmed);
  }

  flushParagraph();
  return blocks;
}

function toParagraph(block: DraftBlock): Paragraph {
  const common = {
    children: toRuns(block.text, block.type === "heading"),
    spacing: { line: LINE_SPACING, after: 160 },
  };

  if (block.type === "heading") {
    return new Paragraph({
      ...common,
      heading: headingLevel(block.level),
      alignment: block.level === 1 ? AlignmentType.CENTER : AlignmentType.LEFT,
    });
  }

  if (block.type === "bullet") {
    return new Paragraph({ ...common, bullet: { level: 0 } });
  }

  if (block.type === "number") {
    return new Paragraph({
      ...common,
      numbering: { reference: "draft-numbered", level: 0 },
    });
  }

  return new Paragraph(common);
}

function headingLevel(level: 1 | 2 | 3): (typeof HeadingLevel)[keyof typeof HeadingLevel] {
  if (level === 1) return HeadingLevel.HEADING_1;
  if (level === 2) return HeadingLevel.HEADING_2;
  return HeadingLevel.HEADING_3;
}

function toRuns(text: string, bold: boolean): TextRun[] {
  return text.split(PLACEHOLDER_PATTERN).filter(Boolean).map((part) =>
    new TextRun({
      text: part,
      bold,
      font: "Times New Roman",
      size: 24,
      highlight: PLACEHOLDER_ONLY_PATTERN.test(part)
        ? HighlightColor.YELLOW
        : undefined,
    }),
  );
}
