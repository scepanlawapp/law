import { Agent } from "@mastra/core/agent";
import type { MastraModelConfig } from "@mastra/core/llm";
import type {
  ChatModelMessage,
  ChatModelProvider,
  CompleteStructuredRequest,
  StreamTextRequest,
} from "@law/llm";

type ConversationMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string };

/**
 * `ChatModelProvider` on Mastra's model layer, for the structured calls made
 * outside the agent loop: Portir triage, titles, the drafting workflows'
 * steps, and conversation summaries.
 */
export class MastraChatModelProvider implements ChatModelProvider {
  private readonly agent: Agent;

  constructor(model: MastraModelConfig) {
    this.agent = new Agent({
      id: "law-chat-model-provider",
      name: "Law chat model provider",
      instructions: "",
      model,
    });
  }

  async completeStructured<T>(
    request: CompleteStructuredRequest<T>,
  ): Promise<T> {
    const { instructions, messages } = splitSystemMessages(request.messages);
    const result = await this.agent.generate(messages, {
      instructions,
      structuredOutput: { schema: request.schema },
      modelSettings: { temperature: 0 },
    });
    if (result.error) throw result.error;
    // Re-parse with the caller's schema so defaults and refinements apply exactly as before.
    return request.schema.parse(result.object);
  }

  async *streamText(request: StreamTextRequest): AsyncIterable<string> {
    const { instructions, messages } = splitSystemMessages(request.messages);
    const stream = await this.agent.stream(messages, {
      instructions,
      modelSettings: { temperature: 0 },
    });
    for await (const delta of stream.textStream) {
      if (delta) yield delta;
    }
    if (stream.error) throw stream.error;
  }
}

function splitSystemMessages(messages: readonly ChatModelMessage[]): {
  instructions: string;
  messages: ConversationMessage[];
} {
  const instructions = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const conversation = messages.flatMap((message): ConversationMessage[] =>
    message.role === "system"
      ? []
      : [{ role: message.role, content: message.content }],
  );
  return { instructions, messages: conversation };
}
