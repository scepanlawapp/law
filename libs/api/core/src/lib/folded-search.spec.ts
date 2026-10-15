import { Prisma } from "@prisma/client";
import {
  containsPattern,
  foldedMatchIds,
  foldedTokens,
} from "./folded-search";

function capture() {
  const queries: Prisma.Sql[] = [];
  const db = {
    $queryRaw: jest.fn((query: Prisma.Sql) => {
      queries.push(query);
      return Promise.resolve([{ id: "client-1" }]);
    }),
  };
  return { db, queries };
}

describe("folded search", () => {
  it("folds search words like normalize()", () => {
    expect(foldedTokens("Ilić")).toEqual(["ilic"]);
    expect(foldedTokens("Đorđe ČIČIĆ")).toEqual(["djordje", "cicic"]);
    expect(foldedTokens("a Borko")).toEqual(["borko"]);
  });

  it("escapes LIKE wildcards", () => {
    expect(containsPattern("50%_off")).toBe("%50\\%\\_off%");
  });

  it("matches every word in any column, folding đ both ways", async () => {
    const { db, queries } = capture();

    const ids = await foldedMatchIds(db, {
      table: "Client",
      columns: ["displayName", "lastName"],
      search: "Borko Ilić",
      workspaceId: "workspace-1",
    });

    expect(ids).toEqual(["client-1"]);
    const query = queries[0];
    expect(query.sql).toContain(`FROM "Client"`);
    expect(query.text).toContain(`"workspaceId" = $1`);
    expect(query.sql).toContain(`replace(lower(coalesce("displayName", '')), 'đ', 'dj')`);
    expect(query.sql.match(/ LIKE /g)).toHaveLength(8);
    expect(query.values).toEqual(
      expect.arrayContaining(["workspace-1", "%borko%", "%ilic%"]),
    );
    // User text never reaches the SQL text.
    expect(query.sql).not.toContain("ilic");
  });

  it("does not scope tables without a workspace column and skips empty searches", async () => {
    const { db, queries } = capture();
    await foldedMatchIds(db, {
      table: "User",
      columns: ["firstName", "lastName"],
      search: "Marko",
      workspaceId: "workspace-1",
    });
    expect(queries[0].sql).not.toContain("workspaceId");

    await expect(
      foldedMatchIds(db, {
        table: "Case",
        columns: ["name"],
        search: " - ",
        workspaceId: "workspace-1",
      }),
    ).resolves.toEqual([]);
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
