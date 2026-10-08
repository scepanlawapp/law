import { Prisma } from "@prisma/client";
import { DocumentContentSearch } from "@law/document-ingestion";

const WORKSPACE = "ws-1";

function setup(
  options: {
    vectors?: number[][];
    rows?: unknown[];
    facts?: unknown[];
    embedError?: Error;
  } = {},
) {
  const prisma = {
    $queryRaw: jest.fn(async () => options.rows ?? []),
    documentFact: { findMany: jest.fn(async () => options.facts ?? []) },
  };
  const embeddings = {
    model: "BAAI/bge-m3",
    dimensions: 3,
    embed: jest.fn(async () => {
      if (options.embedError) throw options.embedError;
      return options.vectors ?? [[0.1, 0.2, 0.3]];
    }),
  };
  return {
    prisma,
    embeddings,
    search: new DocumentContentSearch(prisma as never, embeddings as never),
  };
}

function lastSql(prisma: { $queryRaw: jest.Mock }): Prisma.Sql {
  const call = prisma.$queryRaw.mock.calls.at(-1);
  return call?.[0] as Prisma.Sql;
}

describe("DocumentContentSearch", () => {
  it("returns nothing and queries nothing without content ids", async () => {
    const { search, prisma, embeddings } = setup();

    expect(await search.searchChunks(WORKSPACE, [], "zakup", 5)).toEqual([]);
    expect(await search.factsFor(WORKSPACE, [])).toEqual([]);

    expect(embeddings.embed).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.documentFact.findMany).not.toHaveBeenCalled();
  });

  it("embeds the Latin query and scopes the cosine query by workspace, content ids and model", async () => {
    const rows = [
      {
        contentId: "c-1",
        ordinal: 2,
        text: "Zakupnina iznosi 500 evra.",
        charStart: 10,
        charEnd: 40,
        score: 0.82,
      },
    ];
    const { search, prisma, embeddings } = setup({ rows });

    const hits = await search.searchChunks(
      WORKSPACE,
      ["c-1", "c-2"],
      "  ЗАКУПНИНА  ",
      5,
    );

    expect(hits).toEqual(rows);
    expect(embeddings.embed).toHaveBeenCalledWith(["ZAKUPNINA"]);
    const sql = lastSql(prisma);
    expect(sql.values).toEqual(
      expect.arrayContaining([WORKSPACE, ["c-1", "c-2"], "BAAI/bge-m3", 5]),
    );
    expect(sql.sql).toContain('"workspaceId" =');
    expect(sql.sql).toContain('"contentId" = ANY(');
    expect(sql.sql).toContain('"embeddingModel" =');
    expect(sql.sql).toContain("<=>");
  });

  it("caps the limit at 12", async () => {
    const { search, prisma } = setup();

    await search.searchChunks(WORKSPACE, ["c-1"], "zakup", 50);

    expect(lastSql(prisma).values).toContain(12);
    expect(lastSql(prisma).values).not.toContain(50);
  });

  it("returns nothing when the provider gives no vector", async () => {
    const { search, prisma } = setup({ vectors: [] });

    expect(await search.searchChunks(WORKSPACE, ["c-1"], "zakup", 5)).toEqual(
      [],
    );
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("loads facts only for the given workspace and content ids", async () => {
    const facts = [{ contentId: "c-1", field: "jmbg" }];
    const { search, prisma } = setup({ facts });

    expect(await search.factsFor(WORKSPACE, ["c-1"])).toEqual(facts);

    expect(prisma.documentFact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: WORKSPACE, contentId: { in: ["c-1"] } },
      }),
    );
  });
});
