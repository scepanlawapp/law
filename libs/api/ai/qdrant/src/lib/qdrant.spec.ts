import type { TemplateSearchClient } from "./qdrant";

describe("TemplateSearchClient", () => {
  it("can represent a scoped template search client", () => {
    const client: TemplateSearchClient = {
      search: async () => [],
    };

    expect(client).toBeDefined();
  });
});
