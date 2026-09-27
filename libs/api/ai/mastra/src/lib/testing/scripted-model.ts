import { MastraLanguageModelV2Mock } from "@mastra/core/test-utils/llm-mock";

export type ScriptedModelStep =
  | { text: string | string[] }
  | { toolCalls: Array<{ toolName: string; input: Record<string, unknown> }> };

export interface ScriptedModel {
  model: MastraLanguageModelV2Mock;
  /** Prompts received by each model call, for assertions. */
  prompts: unknown[];
}

const usage = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };

/**
 * Test double for Mastra agents: each model call plays the next scripted step
 * (text deltas or tool calls); the last step repeats if the agent calls again.
 */
export function createScriptedModel(steps: ScriptedModelStep[]): ScriptedModel {
  const prompts: unknown[] = [];
  let call = 0;
  const model = new MastraLanguageModelV2Mock({
    doStream: async (options) => {
      prompts.push(options.prompt);
      const step = steps[Math.min(call, steps.length - 1)];
      call += 1;
      const parts: unknown[] = [{ type: "stream-start", warnings: [] }];
      if ("text" in step) {
        const deltas = Array.isArray(step.text) ? step.text : [step.text];
        parts.push({ type: "text-start", id: `text-${call}` });
        for (const delta of deltas) {
          parts.push({ type: "text-delta", id: `text-${call}`, delta });
        }
        parts.push({ type: "text-end", id: `text-${call}` });
        parts.push({ type: "finish", finishReason: "stop", usage });
      } else {
        step.toolCalls.forEach((toolCall, index) =>
          parts.push({
            type: "tool-call",
            toolCallId: `call-${call}-${index}`,
            toolName: toolCall.toolName,
            input: JSON.stringify(toolCall.input),
          }),
        );
        parts.push({ type: "finish", finishReason: "tool-calls", usage });
      }
      return {
        stream: new ReadableStream({
          start(controller) {
            for (const part of parts) controller.enqueue(part as never);
            controller.close();
          },
        }),
      };
    },
  });
  return { model, prompts };
}
