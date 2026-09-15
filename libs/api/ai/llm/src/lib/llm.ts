import { z } from "zod";

export interface ChatModelMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompleteStructuredRequest<T> {
  schema: z.ZodType<T>;
  messages: ChatModelMessage[];
}

export interface StreamTextRequest {
  messages: ChatModelMessage[];
}

export interface ChatModelProvider {
  completeStructured<T>(request: CompleteStructuredRequest<T>): Promise<T>;
  streamText(request: StreamTextRequest): AsyncIterable<string>;
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

  async *streamText(_request: StreamTextRequest): AsyncIterable<string> {
    const index = Math.min(this.callCount, this.outputs.length - 1);
    this.callCount += 1;
    const output = this.outputs[index];
    const chunks =
      output && typeof output === "object" && "stream" in output
        ? (output as { stream: unknown }).stream
        : output;
    if (Array.isArray(chunks)) {
      for (const chunk of chunks) yield String(chunk);
      return;
    }
    yield String(chunks ?? "");
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

  async *streamText(request: StreamTextRequest): AsyncIterable<string> {
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
          stream: true,
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
    if (!response.body) {
      throw new Error("OpenRouter returned an empty stream");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = done ? "" : (lines.pop() ?? "");
      for (const line of lines) {
        const data = line.trim();
        if (!data.startsWith("data:")) continue;
        const payload = data.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        const parsed = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) yield content;
      }
      if (done) break;
    }
  }
}
