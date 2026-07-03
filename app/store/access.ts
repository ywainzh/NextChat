import {
  ACCESS_CODE_PREFIX,
  GoogleSafetySettingsThreshold,
  ServiceProvider,
  StoreKey,
  ApiPath,
  OpenaiPath,
  ANTHROPIC_BASE_URL,
  GEMINI_BASE_URL,
  BAIDU_BASE_URL,
  BYTEDANCE_BASE_URL,
  ALIBABA_BASE_URL,
  TENCENT_BASE_URL,
  MOONSHOT_BASE_URL,
  STABILITY_BASE_URL,
  IFLYTEK_BASE_URL,
  DEEPSEEK_BASE_URL,
  XAI_BASE_URL,
  CHATGLM_BASE_URL,
  SILICONFLOW_BASE_URL,
  AI302_BASE_URL,
} from "../constant";
import { getHeaders } from "../client/api";
import { getClientConfig } from "../config/client";
import { createPersistStore } from "../utils/store";
import { ensure } from "../utils/clone";

let fetchState = 0; // 0 not fetch, 1 fetching, 2 done

const isApp = getClientConfig()?.buildMode === "export";

const DEFAULT_OPENAI_URL = "";

const DEFAULT_GOOGLE_URL = isApp ? GEMINI_BASE_URL : ApiPath.Google;

const DEFAULT_ANTHROPIC_URL = isApp ? ANTHROPIC_BASE_URL : ApiPath.Anthropic;

const DEFAULT_BAIDU_URL = isApp ? BAIDU_BASE_URL : ApiPath.Baidu;

const DEFAULT_BYTEDANCE_URL = isApp ? BYTEDANCE_BASE_URL : ApiPath.ByteDance;

const DEFAULT_ALIBABA_URL = isApp ? ALIBABA_BASE_URL : ApiPath.Alibaba;

const DEFAULT_TENCENT_URL = isApp ? TENCENT_BASE_URL : ApiPath.Tencent;

const DEFAULT_MOONSHOT_URL = isApp ? MOONSHOT_BASE_URL : ApiPath.Moonshot;

const DEFAULT_STABILITY_URL = isApp ? STABILITY_BASE_URL : ApiPath.Stability;

const DEFAULT_IFLYTEK_URL = isApp ? IFLYTEK_BASE_URL : ApiPath.Iflytek;

const DEFAULT_DEEPSEEK_URL = isApp ? DEEPSEEK_BASE_URL : ApiPath.DeepSeek;

const DEFAULT_XAI_URL = isApp ? XAI_BASE_URL : ApiPath.XAI;

const DEFAULT_CHATGLM_URL = isApp ? CHATGLM_BASE_URL : ApiPath.ChatGLM;

const DEFAULT_SILICONFLOW_URL = isApp
  ? SILICONFLOW_BASE_URL
  : ApiPath.SiliconFlow;

const DEFAULT_AI302_URL = isApp ? AI302_BASE_URL : ApiPath["302.AI"];

const DEFAULT_ACCESS_STATE = {
  accessCode: "",
  useCustomConfig: true,

  provider: ServiceProvider.OpenAI,

  // openai
  openaiUrl: DEFAULT_OPENAI_URL,
  openaiApiKey: "",

  // azure
  azureUrl: "",
  azureApiKey: "",
  azureApiVersion: "2023-08-01-preview",

  // google ai studio
  googleUrl: DEFAULT_GOOGLE_URL,
  googleApiKey: "",
  googleApiVersion: "v1",
  googleSafetySettings: GoogleSafetySettingsThreshold.BLOCK_ONLY_HIGH,

  // anthropic
  anthropicUrl: DEFAULT_ANTHROPIC_URL,
  anthropicApiKey: "",
  anthropicApiVersion: "2023-06-01",

  // baidu
  baiduUrl: DEFAULT_BAIDU_URL,
  baiduApiKey: "",
  baiduSecretKey: "",

  // bytedance
  bytedanceUrl: DEFAULT_BYTEDANCE_URL,
  bytedanceApiKey: "",

  // alibaba
  alibabaUrl: DEFAULT_ALIBABA_URL,
  alibabaApiKey: "",

  // moonshot
  moonshotUrl: DEFAULT_MOONSHOT_URL,
  moonshotApiKey: "",

  //stability
  stabilityUrl: DEFAULT_STABILITY_URL,
  stabilityApiKey: "",

  // tencent
  tencentUrl: DEFAULT_TENCENT_URL,
  tencentSecretKey: "",
  tencentSecretId: "",

  // iflytek
  iflytekUrl: DEFAULT_IFLYTEK_URL,
  iflytekApiKey: "",
  iflytekApiSecret: "",

  // deepseek
  deepseekUrl: DEFAULT_DEEPSEEK_URL,
  deepseekApiKey: "",

  // xai
  xaiUrl: DEFAULT_XAI_URL,
  xaiApiKey: "",

  // chatglm
  chatglmUrl: DEFAULT_CHATGLM_URL,
  chatglmApiKey: "",

  // siliconflow
  siliconflowUrl: DEFAULT_SILICONFLOW_URL,
  siliconflowApiKey: "",

  // 302.AI
  ai302Url: DEFAULT_AI302_URL,
  ai302ApiKey: "",

  // server config
  needCode: true,
  hideUserApiKey: false,
  hideBalanceQuery: false,
  disableGPT4: false,
  disableFastLink: false,
  customModels: "",
  defaultModel: "",
  visionModels: "",
  openAICompatibleModelIds: [] as string[],
  openAICompatibleModelsState: "idle" as "idle" | "loading" | "ready" | "error",
  openAICompatibleModelsError: "",
  tavilyApiKey: "",

  // tts config
  edgeTTSVoiceName: "zh-CN-YunxiNeural",
};

function buildOpenAICompatibleEndpoint(baseUrl: string) {
  const trimmedBaseUrl = baseUrl.trim();

  if (trimmedBaseUrl.length === 0) {
    return "";
  }

  let normalizedBaseUrl = trimmedBaseUrl.endsWith("/")
    ? trimmedBaseUrl.slice(0, trimmedBaseUrl.length - 1)
    : trimmedBaseUrl;

  if (
    !normalizedBaseUrl.startsWith("http") &&
    !normalizedBaseUrl.startsWith(ApiPath.OpenAI)
  ) {
    normalizedBaseUrl = "https://" + normalizedBaseUrl;
  }

  return `${normalizedBaseUrl}/${OpenaiPath.ListModelPath}`;
}

function buildOpenAICompatibleHeaders(
  openaiUrl: string,
  apiKey: string,
  accessCode: string,
) {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  const trimmedApiKey = apiKey.trim();
  const trimmedAccessCode = accessCode.trim();

  if (trimmedApiKey.length > 0) {
    headers.Authorization = `Bearer ${trimmedApiKey}`;
  } else if (
    trimmedAccessCode.length > 0 &&
    openaiUrl.trim().includes(ApiPath.OpenAI)
  ) {
    headers.Authorization = `Bearer ${ACCESS_CODE_PREFIX}${trimmedAccessCode}`;
  }

  return headers;
}

export const useAccessStore = createPersistStore(
  { ...DEFAULT_ACCESS_STATE },

  (set, get) => ({
    enabledAccessControl() {
      this.fetch();

      return get().needCode;
    },
    getVisionModels() {
      this.fetch();
      return get().visionModels;
    },
    edgeVoiceName() {
      this.fetch();

      return get().edgeTTSVoiceName;
    },

    isUsingCustomOpenAI() {
      return get().useCustomConfig && get().provider === ServiceProvider.OpenAI;
    },

    setOpenAICompatibleModels(modelIds: string[]) {
      set(() => ({
        openAICompatibleModelIds: modelIds,
        openAICompatibleModelsState: "ready",
        openAICompatibleModelsError: "",
      }));
    },

    setOpenAICompatibleModelsState(
      status: "idle" | "loading" | "ready" | "error",
      error = "",
    ) {
      set(() => ({
        openAICompatibleModelsState: status,
        openAICompatibleModelsError: error,
      }));
    },

    clearOpenAICompatibleModels(
      status: "idle" | "loading" | "ready" | "error" = "idle",
      error = "",
    ) {
      set(() => ({
        openAICompatibleModelIds: [],
        openAICompatibleModelsState: status,
        openAICompatibleModelsError: error,
      }));
    },

    async fetchOpenAICompatibleModels() {
      if (!this.isUsingCustomOpenAI()) {
        this.clearOpenAICompatibleModels();
        return [];
      }

      const endpoint = buildOpenAICompatibleEndpoint(get().openaiUrl);

      if (endpoint.length === 0) {
        this.clearOpenAICompatibleModels();
        return [];
      }

      this.setOpenAICompatibleModelsState("loading");

      try {
        const response = await fetch(endpoint, {
          method: "GET",
          headers: buildOpenAICompatibleHeaders(
            get().openaiUrl,
            get().openaiApiKey,
            get().accessCode,
          ),
        });

        if (!response.ok) {
          let errorMessage = `${response.status} ${response.statusText}`;
          try {
            const errorJson = await response.json();
            errorMessage =
              errorJson?.error?.message ?? errorJson?.message ?? errorMessage;
          } catch {
            // ignore parse error and use fallback message
          }

          throw new Error(errorMessage);
        }

        const responseJson = await response.json();
        const modelIds: string[] = Array.isArray(responseJson?.data)
          ? Array.from(
              new Set(
                responseJson.data
                  .map((model: { id?: string }) => model?.id?.trim?.())
                  .filter(
                    (modelId: string | undefined): modelId is string =>
                      !!modelId,
                  ),
              ),
            )
          : [];

        this.setOpenAICompatibleModels(modelIds);

        return modelIds;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to sync models";
        this.clearOpenAICompatibleModels("error", message);
        throw error;
      }
    },

    isValidOpenAI() {
      return ensure(get(), ["openaiApiKey"]);
    },

    isValidAzure() {
      return ensure(get(), ["azureUrl", "azureApiKey", "azureApiVersion"]);
    },

    isValidGoogle() {
      return ensure(get(), ["googleApiKey"]);
    },

    isValidAnthropic() {
      return ensure(get(), ["anthropicApiKey"]);
    },

    isValidBaidu() {
      return ensure(get(), ["baiduApiKey", "baiduSecretKey"]);
    },

    isValidByteDance() {
      return ensure(get(), ["bytedanceApiKey"]);
    },

    isValidAlibaba() {
      return ensure(get(), ["alibabaApiKey"]);
    },

    isValidTencent() {
      return ensure(get(), ["tencentSecretKey", "tencentSecretId"]);
    },

    isValidMoonshot() {
      return ensure(get(), ["moonshotApiKey"]);
    },
    isValidIflytek() {
      return ensure(get(), ["iflytekApiKey"]);
    },
    isValidDeepSeek() {
      return ensure(get(), ["deepseekApiKey"]);
    },

    isValidXAI() {
      return ensure(get(), ["xaiApiKey"]);
    },

    isValidChatGLM() {
      return ensure(get(), ["chatglmApiKey"]);
    },

    isValidSiliconFlow() {
      return ensure(get(), ["siliconflowApiKey"]);
    },

    isAuthorized() {
      this.fetch();

      // has token or has code or disabled access control
      return (
        this.isValidOpenAI() ||
        this.isValidAzure() ||
        this.isValidGoogle() ||
        this.isValidAnthropic() ||
        this.isValidBaidu() ||
        this.isValidByteDance() ||
        this.isValidAlibaba() ||
        this.isValidTencent() ||
        this.isValidMoonshot() ||
        this.isValidIflytek() ||
        this.isValidDeepSeek() ||
        this.isValidXAI() ||
        this.isValidChatGLM() ||
        this.isValidSiliconFlow() ||
        !this.enabledAccessControl() ||
        (this.enabledAccessControl() && ensure(get(), ["accessCode"]))
      );
    },
    fetch() {
      if (fetchState > 0 || getClientConfig()?.buildMode === "export") return;
      fetchState = 1;
      fetch("/api/config", {
        method: "post",
        body: null,
        headers: {
          ...getHeaders(),
        },
      })
        .then((res) => res.json())
        .then((res: DangerConfig) => {
          console.log("[Config] got config from server", res);
          set(() => ({ ...res }));
        })
        .catch(() => {
          console.error("[Config] failed to fetch config");
        })
        .finally(() => {
          fetchState = 2;
        });
    },
  }),
  {
    name: StoreKey.Access,
    version: 4,
    migrate(persistedState, version) {
      if (version < 2) {
        const state = persistedState as {
          token: string;
          openaiApiKey: string;
          azureApiVersion: string;
          googleApiKey: string;
        };
        state.openaiApiKey = state.token;
        state.azureApiVersion = "2023-08-01-preview";
      }

      if (version < 3) {
        const state = persistedState as typeof DEFAULT_ACCESS_STATE;
        state.useCustomConfig = true;
        state.openaiUrl = state.openaiUrl ?? DEFAULT_OPENAI_URL;
        state.openAICompatibleModelIds = state.openAICompatibleModelIds ?? [];
        state.openAICompatibleModelsState =
          state.openAICompatibleModelsState ?? "idle";
        state.openAICompatibleModelsError =
          state.openAICompatibleModelsError ?? "";
      }

      if (version < 4) {
        const state = persistedState as typeof DEFAULT_ACCESS_STATE;
        state.tavilyApiKey = state.tavilyApiKey ?? "";
      }

      return persistedState as any;
    },
  },
);
