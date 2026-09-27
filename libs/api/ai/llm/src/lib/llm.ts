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
