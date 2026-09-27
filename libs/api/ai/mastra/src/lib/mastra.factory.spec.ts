import { Agent } from "@mastra/core/agent";
import { Observability } from "@mastra/observability";
import { InMemoryStore } from "@mastra/core/storage";
import { PostgresStore } from "@mastra/pg";
import { createScriptedModel } from "./testing/scripted-model";
import { MASTRA_SCHEMA_NAME, createLawMastra } from "./mastra.factory";

// Nothing listens on this port; the factory must not connect eagerly.
const connectionString = "postgresql://law:law@127.0.0.1:1/law_platform";

describe("createLawMastra", () => {
  it("configures Postgres storage without connecting eagerly", () => {
    const mastra = createLawMastra({ connectionString });

    expect(mastra.getStorage()).toBeInstanceOf(PostgresStore);
    expect(MASTRA_SCHEMA_NAME).toBe("mastra");
  });

  it("enables observability only when tracing is requested", async () => {
    // Observability initializes storage eagerly, so use the in-memory store.
    const plain = createLawMastra({
      connectionString,
      storage: new InMemoryStore(),
    });
    const traced = createLawMastra({
      connectionString,
      tracing: true,
      storage: new InMemoryStore(),
    });

    expect(plain.observability).not.toBeInstanceOf(Observability);
    expect(traced.observability).toBeInstanceOf(Observability);
    await traced.shutdown();
  });

  it("registers agents so they can be resolved from the instance", () => {
    const agent = new Agent({
      id: "legal-assistant",
      name: "Legal assistant",
      instructions: "",
      model: createScriptedModel([{ text: "ok" }]).model as never,
    });
    const mastra = createLawMastra({
      connectionString,
      storage: new InMemoryStore(),
      agents: { legalAssistant: agent },
    });

    expect(mastra.getAgent("legalAssistant")).toBe(agent);
  });
});
