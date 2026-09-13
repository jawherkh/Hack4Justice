import OpenAI from "openai";
import {
  OpenAIChatCompletionsModel,
  type Model,
  type ModelRequest,
  type ModelResponse,
  type ModelRetryAdvice,
  type ModelRetryAdviceRequest,
  type ResponseStreamEvent,
} from "@openai/agents";

export const DEFAULT_GEMINI_AGENT_MODEL = "gemini-2.5-flash";
export const DEFAULT_GEMINI_AGENT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";

export interface GeminiAgentModelOptions {
  readonly apiKey: string;
  readonly model?: string;
  readonly baseURL?: string;
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function without(value: JsonRecord, keys: readonly string[]): JsonRecord {
  const result = { ...value };
  for (const key of keys) delete result[key];
  return result;
}

/**
 * @openai/agents 0.18's streaming Chat Completions converter rebuilds streamed tool calls
 * from name/arguments/id and drops provider extension fields. Gemini 3 uses one of those
 * fields (`extra_content.google.thought_signature`) to continue a tool-calling turn. Keep
 * the extension data on the SDK function-call item before the runner persists it in session
 * history and converts it back to the next Chat Completions request.
 */
// Agents SDK 0.18 uses the adapter constructor name to select transport-specific sandbox
// tool shapes, so keep Chat Completions in the name to select function-tool fallbacks.
class GeminiChatCompletionsThoughtSignatureModel implements Model {
  constructor(private readonly delegate: OpenAIChatCompletionsModel) {}

  getResponse(request: ModelRequest): Promise<ModelResponse> {
    return this.delegate.getResponse(request);
  }

  getRetryAdvice(args: ModelRetryAdviceRequest): ModelRetryAdvice | undefined {
    return this.delegate.getRetryAdvice(args);
  }

  async *getStreamedResponse(request: ModelRequest): AsyncIterable<ResponseStreamEvent> {
    const providerDataByCallId = new Map<string, JsonRecord>();

    for await (const event of this.delegate.getStreamedResponse(request)) {
      const eventRecord = event as unknown as JsonRecord;
      if (eventRecord.type === "model") {
        const chunk = record(eventRecord.event);
        const choices = chunk?.choices;
        if (Array.isArray(choices)) {
          for (const choice of choices) {
            const delta = record(record(choice)?.delta);
            const toolCalls = delta?.tool_calls;
            if (!Array.isArray(toolCalls)) continue;
            for (const toolCallValue of toolCalls) {
              const toolCall = record(toolCallValue);
              if (!toolCall) continue;
              const functionPart = record(toolCall.function);
              const callId = typeof toolCall.id === "string" ? toolCall.id : undefined;
              const index = typeof toolCall.index === "number" ? String(toolCall.index) : callId;
              if (!index) continue;
              const existing = providerDataByCallId.get(index) ?? {};
              Object.assign(existing, without(toolCall, ["index", "id", "type", "function"]));
              if (functionPart) {
                const functionData = without(functionPart, ["name", "arguments"]);
                if (Object.keys(functionData).length > 0) {
                  existing.function = { ...record(existing.function), ...functionData };
                }
              }
              if (callId) {
                providerDataByCallId.set(index, existing);
                providerDataByCallId.set(callId, existing);
              } else {
                providerDataByCallId.set(index, existing);
              }
            }
          }
        }
      }

      if (eventRecord.type === "response_done") {
        const response = record(eventRecord.response);
        const output = response?.output;
        if (response && Array.isArray(output)) {
          const nextOutput = output.map((itemValue) => {
            const item = record(itemValue);
            if (!item || item.type !== "function_call" || typeof item.callId !== "string") return itemValue;
            const providerData = providerDataByCallId.get(item.callId);
            if (!providerData) return itemValue;
            return {
              ...item,
              providerData: { ...record(item.providerData), ...providerData },
            };
          });
          yield {
            ...eventRecord,
            response: { ...response, output: nextOutput },
          } as unknown as ResponseStreamEvent;
          continue;
        }
      }

      yield event;
    }
  }
}

/**
 * Creates an Agents SDK model backed by Google Gemini.
 *
 * The OpenAI-compatible Chat Completions adapter is only the wire protocol here; requests
 * are sent to Google's Gemini endpoint and authenticated with GEMINI_API_KEY.
 */
export function createGeminiAgentModel(options: GeminiAgentModelOptions): Model {
  const client = new OpenAI({
    apiKey: options.apiKey,
    baseURL: options.baseURL ?? DEFAULT_GEMINI_AGENT_BASE_URL,
    defaultHeaders: {
      "x-goog-api-client": "hack4justice-agents/0.1.0",
    },
  });
  return new GeminiChatCompletionsThoughtSignatureModel(
    new OpenAIChatCompletionsModel(client, options.model ?? DEFAULT_GEMINI_AGENT_MODEL, {
      strictFeatureValidation: true,
    }),
  );
}
