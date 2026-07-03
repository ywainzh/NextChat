import { useMemo } from "react";
import { useAccessStore, useAppConfig } from "../store";
import {
  collectModelsWithDefaultModel,
  createOpenAICompatibleModels,
} from "./model";
import { ServiceProvider } from "../constant";

export function useAllModels() {
  const accessStore = useAccessStore();
  const configStore = useAppConfig();
  const models = useMemo(() => {
    if (
      accessStore.useCustomConfig &&
      accessStore.provider === ServiceProvider.OpenAI
    ) {
      return createOpenAICompatibleModels(accessStore.openAICompatibleModelIds);
    }

    return collectModelsWithDefaultModel(
      configStore.models,
      [configStore.customModels, accessStore.customModels].join(","),
      accessStore.defaultModel,
    );
  }, [
    accessStore.openAICompatibleModelIds,
    accessStore.customModels,
    accessStore.defaultModel,
    accessStore.provider,
    accessStore.useCustomConfig,
    configStore.customModels,
    configStore.models,
  ]);

  return models;
}
