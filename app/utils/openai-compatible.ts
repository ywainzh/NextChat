import { LLMModel } from "../client/api";
import { ServiceProvider } from "../constant";
import { useAccessStore, useAppConfig, useChatStore } from "../store";
import { createOpenAICompatibleModels } from "./model";

export type OpenAICompatibleSyncResult =
  | { status: "skipped" | "empty-endpoint" | "empty-result" | "success"; models: LLMModel[] }
  | { status: "error"; models: LLMModel[]; error: string };

export function isUsingCustomOpenAIConfig() {
  return useAccessStore.getState().isUsingCustomOpenAI();
}

function reconcileOpenAICompatibleModelSelection(models: LLMModel[]) {
  const validModels = new Set(models.map((model) => model.name));

  const configStore = useAppConfig.getState();
  configStore.update((config) => {
    if (isUsingCustomOpenAIConfig()) {
      config.modelConfig.providerName = ServiceProvider.OpenAI;
    }

    if (
      config.modelConfig.providerName === ServiceProvider.OpenAI &&
      !validModels.has(config.modelConfig.model)
    ) {
      config.modelConfig.model = "";
    }
  });

  const chatStore = useChatStore.getState();
  let hasChanged = false;
  const sessions = chatStore.sessions.map((session) => {
    if (session.modelConfig.providerName !== ServiceProvider.OpenAI) {
      return session;
    }

    if (validModels.has(session.modelConfig.model)) {
      return session;
    }

    hasChanged = true;

    return {
      ...session,
      modelConfig: {
        ...session.modelConfig,
        model: "",
      },
    };
  });

  if (hasChanged) {
    useChatStore.setState({
      sessions,
    });
  }
}

export async function syncOpenAICompatibleModels(): Promise<OpenAICompatibleSyncResult> {
  const accessStore = useAccessStore.getState();

  if (!accessStore.isUsingCustomOpenAI()) {
    accessStore.clearOpenAICompatibleModels();
    return { status: "skipped", models: [] };
  }

  if (accessStore.openaiUrl.trim().length === 0) {
    accessStore.clearOpenAICompatibleModels();
    reconcileOpenAICompatibleModelSelection([]);
    return { status: "empty-endpoint", models: [] };
  }

  try {
    const modelIds = await accessStore.fetchOpenAICompatibleModels();
    const models = createOpenAICompatibleModels(modelIds);

    if (models.length === 0 && modelIds.length === 0) {
      reconcileOpenAICompatibleModelSelection([]);
      return { status: "empty-result", models: [] };
    }

    reconcileOpenAICompatibleModelSelection(models);

    return {
      status: models.length === 0 ? "empty-result" : "success",
      models,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to sync models";
    reconcileOpenAICompatibleModelSelection([]);

    return {
      status: "error",
      models: [],
      error: message,
    };
  }
}
