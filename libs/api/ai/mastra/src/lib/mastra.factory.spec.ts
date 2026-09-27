import { PostgresStore } from "@mastra/pg";
import { MASTRA_SCHEMA_NAME, createLawMastra } from "./mastra.factory";

describe("createLawMastra", () => {
  it("configures Postgres storage without connecting eagerly", () => {
    const mastra = createLawMastra({
      connectionString: "postgresql://law:law@127.0.0.1:1/law_platform",
    });

    expect(mastra.getStorage()).toBeInstanceOf(PostgresStore);
    expect(MASTRA_SCHEMA_NAME).toBe("mastra");
  });
});
