import { Prisma } from "@prisma/client";
import { normalize, tokens as wordsOf } from "./text-match";

/**
 * Name search that ignores case and diacritics on both sides, so "Ilic"
 * finds "Ilić". The SQL fold mirrors `normalize()`; đ is folded both to "dj"
 * and to "d", so "Djordje" and "Dordje" both find "Đorđe". Table and column
 * names come only from this allowlist; user text is always a bound parameter.
 */
const FOLDED_TABLES = {
  Client: {
    columns: ["displayName", "firstName", "lastName", "organizationName"],
    workspaceScoped: true,
  },
  ClientContact: { columns: ["firstName", "lastName"], workspaceScoped: false },
  User: { columns: ["firstName", "lastName", "email"], workspaceScoped: false },
  Case: { columns: ["name"], workspaceScoped: true },
  Event: { columns: ["title"], workspaceScoped: true },
  EventAttendee: { columns: ["displayName"], workspaceScoped: true },
} as const;

export type FoldedTable = keyof typeof FOLDED_TABLES;
export type FoldedColumn<T extends FoldedTable> =
  (typeof FOLDED_TABLES)[T]["columns"][number];

const ACCENTED = "čćšžáàâäãåéèêëíìîïóòôöõúùûüýÿñç";
const PLAIN = "ccszaaaaaaeeeeiiiiooooouuuuyync";
const MAX_IDS = 200;

/** Folded words of a search text, as `normalize()` gives them. */
export function foldedTokens(text: string): string[] {
  return wordsOf(normalize(text)).filter((token) => token.length > 1);
}

/** LIKE pattern for a folded token, with LIKE wildcards escaped. */
export function containsPattern(token: string): string {
  return `%${token.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

function foldedColumn(column: string): Prisma.Sql[] {
  const value = Prisma.raw(`lower(coalesce("${column}", ''))`);
  return [
    Prisma.sql`translate(replace(${value}, 'đ', 'dj'), ${ACCENTED}, ${PLAIN})`,
    Prisma.sql`translate(${value}, ${`${ACCENTED}đ`}, ${`${PLAIN}d`})`,
  ];
}

/**
 * Ids of rows where every word of `search` appears, folded, in at least one
 * of `columns`. Callers still apply their own workspace and access filters;
 * tables without a workspace column are not scoped here.
 */
export async function foldedMatchIds<T extends FoldedTable>(
  db: { $queryRaw(query: Prisma.Sql): Promise<unknown> },
  input: {
    table: T;
    columns: ReadonlyArray<FoldedColumn<T>>;
    search: string;
    workspaceId: string;
  },
): Promise<string[]> {
  const spec = FOLDED_TABLES[input.table];
  const columns = input.columns.filter((column) =>
    (spec.columns as readonly string[]).includes(column),
  );
  const words = foldedTokens(input.search);
  if (!columns.length || !words.length) return [];
  const conditions = words.map((word) => {
    const pattern = containsPattern(word);
    return Prisma.sql`(${Prisma.join(
      columns.flatMap((column) =>
        foldedColumn(column).map((folded) => Prisma.sql`${folded} LIKE ${pattern}`),
      ),
      " OR ",
    )})`;
  });
  const scope = spec.workspaceScoped
    ? [Prisma.sql`"workspaceId" = ${input.workspaceId}`]
    : [];
  const rows = (await db.$queryRaw(
    Prisma.sql`SELECT "id" FROM ${Prisma.raw(`"${input.table}"`)} WHERE ${Prisma.join(
      [...scope, ...conditions],
      " AND ",
    )} LIMIT ${MAX_IDS}`,
  )) as Array<{ id: string }>;
  return rows.map((row) => row.id);
}
