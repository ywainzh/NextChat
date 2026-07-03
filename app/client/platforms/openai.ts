"use client";
// azure and openai, using same models. so using same LLMApi.
import {
  ACCESS_CODE_PREFIX,
  ApiPath,
  OPENAI_BASE_URL,
  DEFAULT_MODELS,
  OpenaiPath,
  Azure,
  REQUEST_TIMEOUT_MS,
  ServiceProvider,
} from "@/app/constant";
import {
  ChatMessageTool,
  useAccessStore,
  useAppConfig,
  useChatStore,
} from "@/app/store";
import { collectModelsWithDefaultModel } from "@/app/utils/model";
import {
  preProcessImageContent,
  uploadImage,
  base64Image2Blob,
  streamWithThink,
} from "@/app/utils/chat";
import { cloudflareAIGatewayUrl } from "@/app/utils/cloudflare";
import { ModelSize, DalleQuality, DalleStyle } from "@/app/typing";
import type {
  WebSearchDecision,
  WebSearchResponse,
  WebSearchTrace,
} from "@/app/typing/web-search";

import {
  ChatOptions,
  getHeaders,
  LLMApi,
  LLMModel,
  LLMUsage,
  MultimodalContent,
  SpeechOptions,
} from "../api";
import Locale from "../../locales";
import { getClientConfig } from "@/app/config/client";
import { prettyObject } from "@/app/utils/format";
import {
  getMessageTextContent,
  isVisionModel,
  isDalle3 as _isDalle3,
  getTimeoutMSByModel,
} from "@/app/utils";
import { fetch } from "@/app/utils/stream";

export interface OpenAIListModelResponse {
  object: string;
  data: Array<{
    id: string;
    object: string;
    root: string;
  }>;
}

export interface RequestPayload {
  messages: {
    role: "developer" | "system" | "user" | "assistant";
    content: string | MultimodalContent[];
  }[];
  stream?: boolean;
  model: string;
  temperature: number;
  presence_penalty: number;
  frequency_penalty: number;
  top_p: number;
  max_tokens?: number;
  max_completion_tokens?: number;
}

export interface DalleRequestPayload {
  model: string;
  prompt: string;
  response_format: "url" | "b64_json";
  n: number;
  size: ModelSize;
  quality: DalleQuality;
  style: DalleStyle;
}

const openAICompatibleToolSupport = new Map<string, boolean>();
const WEB_SEARCH_TOOL_NAME = "web_search";

function buildOpenAICompatibleToolSupportKey(endpoint: string, model: string) {
  const normalizedEndpoint = endpoint.trim().toLowerCase();
  const normalizedModel = model.trim().toLowerCase();

  if (!normalizedEndpoint || !normalizedModel) {
    return "";
  }

  return `${normalizedEndpoint}::${normalizedModel}`;
}

function getOpenAICompatibleToolSupport(endpoint: string, model: string) {
  const key = buildOpenAICompatibleToolSupportKey(endpoint, model);
  return key ? openAICompatibleToolSupport.get(key) : undefined;
}

function markOpenAICompatibleToolSupport(
  endpoint: string,
  model: string,
  supported: boolean,
) {
  const key = buildOpenAICompatibleToolSupportKey(endpoint, model);
  if (!key) {
    return;
  }

  openAICompatibleToolSupport.set(key, supported);
}

function shouldEnableBuiltinWebSearch(
  modelConfig: {
    model: string;
    providerName?: string;
    enableWebSearch?: boolean;
  },
  latestUserText: string,
) {
  if (modelConfig.providerName !== ServiceProvider.OpenAI) {
    return false;
  }

  if (modelConfig.enableWebSearch === false) {
    return false;
  }

  return latestUserText.trim().length > 0;
}

function shouldRetryWithoutTools(errorText: string) {
  const normalizedError = errorText.toLowerCase();

  return (
    normalizedError.includes("tool_calls") ||
    normalizedError.includes("tools") ||
    normalizedError.includes("tool choice") ||
    normalizedError.includes("function calling") ||
    normalizedError.includes("tool calling") ||
    normalizedError.includes("unsupported parameter") ||
    normalizedError.includes("unknown parameter") ||
    normalizedError.includes("extra fields not permitted") ||
    (normalizedError.includes("does not support") &&
      (normalizedError.includes("tool") ||
        normalizedError.includes("function")))
  );
}

function getWebSearchInstructionRole(isO1OrO3: boolean) {
  return isO1OrO3 ? "developer" : "system";
}

function createWebSearchInstruction(isO1OrO3: boolean) {
  return {
    role: getWebSearchInstructionRole(isO1OrO3),
    content:
      "You may use the web_search tool only when the user's request depends on up-to-date, changing, or externally verifiable information. Do not search for stable general knowledge. When you search, use a short precise query and base your answer on the returned results.",
  } as const;
}

function createDecisionInstruction(isO1OrO3: boolean) {
  return {
    role: getWebSearchInstructionRole(isO1OrO3),
    content:
      'Decide whether the latest user request needs web search. Reply with JSON only using this exact shape: {"needWebSearch": boolean, "query": string}. If web search is not needed, return an empty query string.',
  } as const;
}

function getLatestUserText(messages: ChatOptions["messages"]) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "user") {
      return getMessageTextContent(messages[i] as any).trim();
    }
  }

  return "";
}

function truncateText(text: string, maxLength: number) {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return normalized.slice(0, maxLength - 1) + "…";
}

function parseWebSearchDecision(rawContent: string): WebSearchDecision {
  const content = rawContent.trim();

  try {
    const parsed = JSON.parse(content) as WebSearchDecision;
    return {
      needWebSearch: !!parsed?.needWebSearch,
      query: parsed?.query?.trim?.() ?? "",
    };
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      return { needWebSearch: false, query: "" };
    }

    try {
      const parsed = JSON.parse(match[0]) as WebSearchDecision;
      return {
        needWebSearch: !!parsed?.needWebSearch,
        query: parsed?.query?.trim?.() ?? "",
      };
    } catch {
      return { needWebSearch: false, query: "" };
    }
  }
}

function formatWebSearchResponseForModel(search: WebSearchResponse) {
  return JSON.stringify({
    query: search.query,
    results: search.results.map((result) => ({
      title: result.title,
      url: result.url,
      content: truncateText(result.content, 400),
      score: result.score,
    })),
    error: search.error,
  });
}

function createWebSearchContextMessage(
  trace: WebSearchTrace,
  isO1OrO3: boolean,
) {
  const header =
    "Below are fresh web search results gathered just now. Use them when helpful, prefer them over stale memory, and cite concrete facts from them instead of inventing details.";
  const sources =
    trace.results.length > 0
      ? trace.results
          .map(
            (result, index) =>
              `${index + 1}. ${result.title}\nURL: ${
                result.url
              }\nSnippet: ${truncateText(result.content, 500)}`,
          )
          .join("\n\n")
      : "No relevant results were returned.";

  return {
    role: getWebSearchInstructionRole(isO1OrO3),
    content: `${header}\n\nSearch query: ${trace.query}\n\n${sources}`,
  } as const;
}

export class ChatGPTApi implements LLMApi {
  private disableListModels = true;

  path(path: string): string {
    const accessStore = useAccessStore.getState();

    let baseUrl = "";

    const isAzure = path.includes("deployments");
    if (accessStore.useCustomConfig) {
      if (isAzure && !accessStore.isValidAzure()) {
        throw Error(
          "incomplete azure config, please check it in your settings page",
        );
      }

      baseUrl = isAzure ? accessStore.azureUrl : accessStore.openaiUrl;
    }

    if (baseUrl.length === 0) {
      const isApp = !!getClientConfig()?.isApp;
      const apiPath = isAzure ? ApiPath.Azure : ApiPath.OpenAI;
      baseUrl = isApp ? OPENAI_BASE_URL : apiPath;
    }

    if (baseUrl.endsWith("/")) {
      baseUrl = baseUrl.slice(0, baseUrl.length - 1);
    }
    if (
      !baseUrl.startsWith("http") &&
      !isAzure &&
      !baseUrl.startsWith(ApiPath.OpenAI)
    ) {
      baseUrl = "https://" + baseUrl;
    }

    console.log("[Proxy Endpoint] ", baseUrl, path);

    // try rebuild url, when using cloudflare ai gateway in client
    return cloudflareAIGatewayUrl([baseUrl, path].join("/"));
  }

  async extractMessage(res: any) {
    if (res.error) {
      return "```\n" + JSON.stringify(res, null, 4) + "\n```";
    }
    // dalle3 model return url, using url create image message
    if (res.data) {
      let url = res.data?.at(0)?.url ?? "";
      const b64_json = res.data?.at(0)?.b64_json ?? "";
      if (!url && b64_json) {
        // uploadImage
        url = await uploadImage(base64Image2Blob(b64_json, "image/png"));
      }
      return [
        {
          type: "image_url",
          image_url: {
            url,
          },
        },
      ];
    }
    return res.choices?.at(0)?.message?.content ?? res;
  }

  async speech(options: SpeechOptions): Promise<ArrayBuffer> {
    const requestPayload = {
      model: options.model,
      input: options.input,
      voice: options.voice,
      response_format: options.response_format,
      speed: options.speed,
    };

    console.log("[Request] openai speech payload: ", requestPayload);

    const controller = new AbortController();
    options.onController?.(controller);

    try {
      const speechPath = this.path(OpenaiPath.SpeechPath);
      const speechPayload = {
        method: "POST",
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
        headers: getHeaders(),
      };

      // make a fetch request
      const requestTimeoutId = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT_MS,
      );

      const res = await fetch(speechPath, speechPayload);
      clearTimeout(requestTimeoutId);
      return await res.arrayBuffer();
    } catch (e) {
      console.log("[Request] failed to make a speech request", e);
      throw e;
    }
  }

  private async extractErrorMessage(res: Response) {
    let errorMessage = `${res.status} ${res.statusText}`;

    try {
      const resJson = await res.clone().json();
      errorMessage =
        resJson?.error?.message ??
        resJson?.error ??
        resJson?.message ??
        prettyObject(resJson) ??
        errorMessage;
    } catch {
      const text = await res.clone().text();
      errorMessage = text || errorMessage;
    }

    return errorMessage;
  }

  private async sendChatRequest(
    chatPath: string,
    payload: any,
    controller: AbortController,
    model: string,
    tools?: any[],
    timeoutMS?: number,
  ) {
    const requestTimeoutId = setTimeout(
      () => controller.abort(),
      timeoutMS ?? getTimeoutMSByModel(model),
    );

    try {
      const res = await fetch(chatPath, {
        method: "POST",
        body: JSON.stringify({
          ...payload,
          tools: tools?.length ? tools : undefined,
        }),
        signal: controller.signal,
        headers: getHeaders(),
      });

      if (!res.ok) {
        throw new Error(await this.extractErrorMessage(res));
      }

      return res;
    } finally {
      clearTimeout(requestTimeoutId);
    }
  }

  private buildWebSearchTools() {
    return [
      {
        type: "function",
        function: {
          name: WEB_SEARCH_TOOL_NAME,
          description:
            "Search the web for up-to-date factual information when needed.",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "A short and precise search query",
              },
            },
            required: ["query"],
          },
        },
      },
    ];
  }

  private async requestWebSearch(query: string) {
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          tavilyApiKey: useAccessStore.getState().tavilyApiKey,
        }),
      });

      const json = (await response.json()) as WebSearchResponse;
      if (!response.ok && !json?.error) {
        json.error = `${response.status} ${response.statusText}`;
      }

      return json;
    } catch (error) {
      return {
        ok: false,
        provider: "tavily",
        query,
        results: [],
        error: error instanceof Error ? error.message : "Web search failed",
      } satisfies WebSearchResponse;
    }
  }

  private async resolveToolSupport(args: {
    chatPath: string;
    model: string;
    controller: AbortController;
    tools: any[];
    isO1OrO3: boolean;
    isGpt5: boolean;
  }) {
    const cached = getOpenAICompatibleToolSupport(args.chatPath, args.model);
    if (cached !== undefined) {
      return cached;
    }

    const probePayload: Record<string, unknown> = {
      messages: [
        {
          role: "user",
          content: "Reply with OK.",
        },
      ],
      stream: false,
      model: args.model,
      temperature: 0,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 1,
    };

    if (args.isGpt5 || args.isO1OrO3) {
      probePayload.max_completion_tokens = 32;
    } else {
      probePayload.max_tokens = 32;
    }

    try {
      await this.sendChatRequest(
        args.chatPath,
        probePayload,
        args.controller,
        args.model,
        args.tools,
        15000,
      );
      markOpenAICompatibleToolSupport(args.chatPath, args.model, true);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (shouldRetryWithoutTools(message)) {
        markOpenAICompatibleToolSupport(args.chatPath, args.model, false);
        return false;
      }

      console.warn("[Web Search] tool support probe failed", message);
      return undefined;
    }
  }

  private async buildDecisionSearchPayload(args: {
    chatPath: string;
    controller: AbortController;
    model: string;
    requestPayload: RequestPayload;
    options: ChatOptions;
    isO1OrO3: boolean;
    isGpt5: boolean;
  }) {
    const decisionPayload: Record<string, unknown> = {
      ...args.requestPayload,
      stream: false,
      messages: [
        createDecisionInstruction(args.isO1OrO3),
        ...args.requestPayload.messages,
      ],
      temperature: 0,
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 1,
    };

    delete decisionPayload.max_tokens;
    delete decisionPayload.max_completion_tokens;

    if (args.isGpt5 || args.isO1OrO3) {
      decisionPayload.max_completion_tokens = 128;
    } else {
      decisionPayload.max_tokens = 128;
    }

    try {
      const response = await this.sendChatRequest(
        args.chatPath,
        decisionPayload,
        args.controller,
        args.model,
      );
      const responseJson = await response.json();
      const decisionMessage = await this.extractMessage(responseJson);
      const decision = parseWebSearchDecision(
        typeof decisionMessage === "string"
          ? decisionMessage
          : JSON.stringify(decisionMessage),
      );

      if (!decision.needWebSearch || !decision.query) {
        return args.requestPayload;
      }

      const search = await this.requestWebSearch(decision.query);
      const trace: WebSearchTrace = {
        query: search.query || decision.query,
        searchedAt: new Date().toISOString(),
        mode: "decision",
        results: search.results ?? [],
        error: search.ok ? undefined : search.error || "Web search failed",
      };

      args.options.onWebSearchTrace?.(trace);

      if (!search.ok) {
        return args.requestPayload;
      }

      return {
        ...args.requestPayload,
        messages: [
          createWebSearchContextMessage(trace, args.isO1OrO3),
          ...args.requestPayload.messages,
        ],
      } satisfies RequestPayload;
    } catch (error) {
      console.warn(
        "[Web Search] decision flow failed",
        error instanceof Error ? error.message : error,
      );
      return args.requestPayload;
    }
  }

  private createWebSearchToolFuncs(args: { options: ChatOptions }) {
    const api = this;

    return {
      async [WEB_SEARCH_TOOL_NAME](toolArgs: { query?: string }) {
        const query = toolArgs?.query?.trim?.() ?? "";
        const search = await api.requestWebSearch(query);
        const trace: WebSearchTrace = {
          query: search.query || query,
          searchedAt: new Date().toISOString(),
          mode: "tool",
          results: search.results ?? [],
          error: search.ok ? undefined : search.error || "Web search failed",
        };

        args.options.onWebSearchTrace?.(trace);

        return {
          status: search.ok ? 200 : 502,
          statusText: search.ok ? "OK" : search.error || "Web search failed",
          data: search.ok
            ? JSON.parse(formatWebSearchResponseForModel(search))
            : { error: trace.error },
        };
      },
    };
  }

  async chat(options: ChatOptions) {
    const modelConfig = {
      ...useAppConfig.getState().modelConfig,
      ...useChatStore.getState().currentSession().modelConfig,
      ...options.config,
      model: options.config.model,
      providerName: options.config.providerName,
    };

    let requestPayload: RequestPayload | DalleRequestPayload;

    const isDalle3 = _isDalle3(options.config.model);
    const isO1OrO3 =
      options.config.model.startsWith("o1") ||
      options.config.model.startsWith("o3") ||
      options.config.model.startsWith("o4-mini");
    const isGpt5 = options.config.model.startsWith("gpt-5");
    if (isDalle3) {
      const prompt = getMessageTextContent(
        options.messages.slice(-1)?.pop() as any,
      );
      requestPayload = {
        model: options.config.model,
        prompt,
        // URLs are only valid for 60 minutes after the image has been generated.
        response_format: "b64_json", // using b64_json, and save image in CacheStorage
        n: 1,
        size: options.config?.size ?? "1024x1024",
        quality: options.config?.quality ?? "standard",
        style: options.config?.style ?? "vivid",
      };
    } else {
      const visionModel = isVisionModel(options.config.model);
      const messages: ChatOptions["messages"] = [];
      for (const v of options.messages) {
        const content = visionModel
          ? await preProcessImageContent(v.content)
          : getMessageTextContent(v);
        if (!(isO1OrO3 && v.role === "system"))
          messages.push({ role: v.role, content });
      }

      // O1 not support image, tools (plugin in ChatGPTNextWeb) and system, stream, logprobs, temperature, top_p, n, presence_penalty, frequency_penalty yet.
      requestPayload = {
        messages,
        stream: options.config.stream,
        model: modelConfig.model,
        temperature: !isO1OrO3 && !isGpt5 ? modelConfig.temperature : 1,
        presence_penalty: !isO1OrO3 ? modelConfig.presence_penalty : 0,
        frequency_penalty: !isO1OrO3 ? modelConfig.frequency_penalty : 0,
        top_p: !isO1OrO3 ? modelConfig.top_p : 1,
        // max_tokens: Math.max(modelConfig.max_tokens, 1024),
        // Please do not ask me why not send max_tokens, no reason, this param is just shit, I dont want to explain anymore.
      };

      if (isGpt5) {
        // Remove max_tokens if present
        delete requestPayload.max_tokens;
        // Add max_completion_tokens (or max_completion_tokens if that's what you meant)
        requestPayload["max_completion_tokens"] = modelConfig.max_tokens;
      } else if (isO1OrO3) {
        // by default the o1/o3 models will not attempt to produce output that includes markdown formatting
        // manually add "Formatting re-enabled" developer message to encourage markdown inclusion in model responses
        // (https://learn.microsoft.com/en-us/azure/ai-services/openai/how-to/reasoning?tabs=python-secure#markdown-output)
        requestPayload["messages"].unshift({
          role: "developer",
          content: "Formatting re-enabled",
        });

        // o1/o3 uses max_completion_tokens to control the number of tokens (https://platform.openai.com/docs/guides/reasoning#controlling-costs)
        requestPayload["max_completion_tokens"] = modelConfig.max_tokens;
      }

      // add max_tokens to vision model
      if (visionModel && !isO1OrO3 && !isGpt5) {
        requestPayload["max_tokens"] = Math.max(modelConfig.max_tokens, 4000);
      }
    }

    const latestUserText = !isDalle3 ? getLatestUserText(options.messages) : "";
    const webSearchEnabled =
      !isDalle3 && shouldEnableBuiltinWebSearch(modelConfig, latestUserText);

    const shouldStream = !isDalle3 && !!options.config.stream;
    const controller = new AbortController();
    options.onController?.(controller);

    try {
      let chatPath = "";
      if (modelConfig.providerName === ServiceProvider.Azure) {
        // find model, and get displayName as deployName
        const { models: configModels, customModels: configCustomModels } =
          useAppConfig.getState();
        const {
          defaultModel,
          customModels: accessCustomModels,
          useCustomConfig,
        } = useAccessStore.getState();
        const models = collectModelsWithDefaultModel(
          configModels,
          [configCustomModels, accessCustomModels].join(","),
          defaultModel,
        );
        const model = models.find(
          (model) =>
            model.name === modelConfig.model &&
            model?.provider?.providerName === ServiceProvider.Azure,
        );
        chatPath = this.path(
          (isDalle3 ? Azure.ImagePath : Azure.ChatPath)(
            (model?.displayName ?? model?.name) as string,
            useCustomConfig ? useAccessStore.getState().azureApiVersion : "",
          ),
        );
      } else {
        chatPath = this.path(
          isDalle3 ? OpenaiPath.ImagePath : OpenaiPath.ChatPath,
        );
      }

      let effectiveRequestPayload = requestPayload;
      let webSearchTools: any[] = [];
      let webSearchToolFuncs: Record<string, Function> = {};

      if (webSearchEnabled) {
        const baseRequestPayload = requestPayload as RequestPayload;

        if (shouldStream) {
          const tools = this.buildWebSearchTools();
          const toolSupport = await this.resolveToolSupport({
            chatPath,
            model: modelConfig.model,
            controller,
            tools,
            isO1OrO3,
            isGpt5,
          });

          if (toolSupport) {
            effectiveRequestPayload = {
              ...baseRequestPayload,
              messages: [
                createWebSearchInstruction(isO1OrO3),
                ...baseRequestPayload.messages,
              ],
            } satisfies RequestPayload;
            webSearchTools = tools;
            webSearchToolFuncs = this.createWebSearchToolFuncs({ options });
          } else {
            effectiveRequestPayload = await this.buildDecisionSearchPayload({
              chatPath,
              controller,
              model: modelConfig.model,
              requestPayload: baseRequestPayload,
              options,
              isO1OrO3,
              isGpt5,
            });
          }
        } else {
          effectiveRequestPayload = await this.buildDecisionSearchPayload({
            chatPath,
            controller,
            model: modelConfig.model,
            requestPayload: baseRequestPayload,
            options,
            isO1OrO3,
            isGpt5,
          });
        }
      }

      console.log("[Request] openai payload: ", effectiveRequestPayload);

      if (shouldStream) {
        let index = -1;
        streamWithThink(
          chatPath,
          effectiveRequestPayload,
          getHeaders(),
          webSearchTools,
          webSearchToolFuncs,
          controller,
          // parseSSE
          (text: string, runTools: ChatMessageTool[]) => {
            // console.log("parseSSE", text, runTools);
            const json = JSON.parse(text);
            const choices = json.choices as Array<{
              delta: {
                content: string;
                tool_calls: ChatMessageTool[];
                reasoning_content: string | null;
              };
            }>;

            if (!choices?.length) return { isThinking: false, content: "" };

            const tool_calls = choices[0]?.delta?.tool_calls;
            if (tool_calls?.length > 0) {
              const id = tool_calls[0]?.id;
              const args = tool_calls[0]?.function?.arguments;
              if (id) {
                index += 1;
                runTools.push({
                  id,
                  type: tool_calls[0]?.type,
                  function: {
                    name: tool_calls[0]?.function?.name as string,
                    arguments: args,
                  },
                });
              } else {
                // @ts-ignore
                runTools[index]["function"]["arguments"] += args;
              }
            }

            const reasoning = choices[0]?.delta?.reasoning_content;
            const content = choices[0]?.delta?.content;

            // Skip if both content and reasoning_content are empty or null
            if (
              (!reasoning || reasoning.length === 0) &&
              (!content || content.length === 0)
            ) {
              return {
                isThinking: false,
                content: "",
              };
            }

            if (reasoning && reasoning.length > 0) {
              return {
                isThinking: true,
                content: reasoning,
              };
            } else if (content && content.length > 0) {
              return {
                isThinking: false,
                content: content,
              };
            }

            return {
              isThinking: false,
              content: "",
            };
          },
          // processToolMessage, include tool_calls message and tool call results
          (
            requestPayload: RequestPayload,
            toolCallMessage: any,
            toolCallResult: any[],
          ) => {
            // reset index value
            index = -1;
            // @ts-ignore
            requestPayload?.messages?.splice(
              // @ts-ignore
              requestPayload?.messages?.length,
              0,
              toolCallMessage,
              ...toolCallResult,
            );
          },
          options,
        );
      } else {
        const res = await this.sendChatRequest(
          chatPath,
          effectiveRequestPayload,
          controller,
          options.config.model,
        );

        const resJson = await res.json();
        const message = await this.extractMessage(resJson);
        options.onFinish(message, res);
      }
    } catch (e) {
      console.log("[Request] failed to make a chat request", e);
      options.onError?.(e as Error);
    }
  }
  async usage() {
    const formatDate = (d: Date) =>
      `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d
        .getDate()
        .toString()
        .padStart(2, "0")}`;
    const ONE_DAY = 1 * 24 * 60 * 60 * 1000;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startDate = formatDate(startOfMonth);
    const endDate = formatDate(new Date(Date.now() + ONE_DAY));

    const [used, subs] = await Promise.all([
      fetch(
        this.path(
          `${OpenaiPath.UsagePath}?start_date=${startDate}&end_date=${endDate}`,
        ),
        {
          method: "GET",
          headers: getHeaders(),
        },
      ),
      fetch(this.path(OpenaiPath.SubsPath), {
        method: "GET",
        headers: getHeaders(),
      }),
    ]);

    if (used.status === 401) {
      throw new Error(Locale.Error.Unauthorized);
    }

    if (!used.ok || !subs.ok) {
      throw new Error("Failed to query usage from openai");
    }

    const response = (await used.json()) as {
      total_usage?: number;
      error?: {
        type: string;
        message: string;
      };
    };

    const total = (await subs.json()) as {
      hard_limit_usd?: number;
    };

    if (response.error && response.error.type) {
      throw Error(response.error.message);
    }

    if (response.total_usage) {
      response.total_usage = Math.round(response.total_usage) / 100;
    }

    if (total.hard_limit_usd) {
      total.hard_limit_usd = Math.round(total.hard_limit_usd * 100) / 100;
    }

    return {
      used: response.total_usage,
      total: total.hard_limit_usd,
    } as LLMUsage;
  }

  async models(): Promise<LLMModel[]> {
    const accessStore = useAccessStore.getState();
    const isCustomOpenAICompatible =
      accessStore.useCustomConfig &&
      accessStore.provider === ServiceProvider.OpenAI;

    if (isCustomOpenAICompatible) {
      if (accessStore.openaiUrl.trim().length === 0) {
        return [];
      }

      const res = await fetch(this.path(OpenaiPath.ListModelPath), {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...(accessStore.openaiApiKey.trim().length > 0
            ? {
                Authorization: `Bearer ${accessStore.openaiApiKey.trim()}`,
              }
            : accessStore.accessCode.trim().length > 0 &&
              accessStore.openaiUrl.trim().includes(ApiPath.OpenAI)
            ? {
                Authorization: `Bearer ${ACCESS_CODE_PREFIX}${accessStore.accessCode.trim()}`,
              }
            : {}),
        },
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch models: ${res.status}`);
      }

      const resJson = (await res.json()) as OpenAIListModelResponse;
      const seenModels = new Set<string>();

      return (resJson.data ?? [])
        .map((model, index) => ({
          name: model.id,
          displayName: model.id,
          available: true,
          sorted: index,
          provider: {
            id: "openai",
            providerName: ServiceProvider.OpenAI,
            providerType: "openai",
            sorted: 1,
          },
        }))
        .filter((model) => {
          if (!model.name || seenModels.has(model.name)) {
            return false;
          }

          seenModels.add(model.name);
          return true;
        });
    }

    if (this.disableListModels) {
      return DEFAULT_MODELS.slice();
    }

    const res = await fetch(this.path(OpenaiPath.ListModelPath), {
      method: "GET",
      headers: {
        ...getHeaders(),
      },
    });

    const resJson = (await res.json()) as OpenAIListModelResponse;
    const chatModels = resJson.data?.filter(
      (m) => m.id.startsWith("gpt-") || m.id.startsWith("chatgpt-"),
    );
    console.log("[Models]", chatModels);

    if (!chatModels) {
      return [];
    }

    //由于目前 OpenAI 的 disableListModels 默认为 true，所以当前实际不会运行到这场
    let seq = 1000; //同 Constant.ts 中的排序保持一致
    return chatModels.map((m) => ({
      name: m.id,
      available: true,
      sorted: seq++,
      provider: {
        id: "openai",
        providerName: "OpenAI",
        providerType: "openai",
        sorted: 1,
      },
    }));
  }
}
export { OpenaiPath };
