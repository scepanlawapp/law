import { z } from "zod";

export interface ChatModelMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompleteStructuredRequest<T> {
  schema: z.ZodType<T>;
  messages: ChatModelMessage[];
}

export interface ChatModelProvider {
  completeStructured<T>(request: CompleteStructuredRequest<T>): Promise<T>;
}

export class FakeChatModelProvider implements ChatModelProvider {
  private readonly outputs: unknown[];
  private callCount = 0;

  constructor(output: unknown) {
    this.outputs = Array.isArray(output) ? output : [output];
  }

  async completeStructured<T>(
    request: CompleteStructuredRequest<T>,
  ): Promise<T> {
    const index = Math.min(this.callCount, this.outputs.length - 1);
    this.callCount += 1;
    return request.schema.parse(this.outputs[index]);
  }
}

export class OpenRouterChatModelProvider implements ChatModelProvider {
  constructor(
    private readonly options: {
      apiKey: string;
      baseUrl: string;
      model: string;
    },
  ) {}

  async completeStructured<T>(
    request: CompleteStructuredRequest<T>,
  ): Promise<T> {
    const response = await fetch(
      `${this.options.baseUrl.replace(/\/$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.options.model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: request.messages,
        }),
      },
    );

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `OpenRouter request failed (${response.status}): ${detail.slice(0, 300)}`,
      );
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("OpenRouter returned an empty completion");
    }

    return request.schema.parse(JSON.parse(content));
  }
}
