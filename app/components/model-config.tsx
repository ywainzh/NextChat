import { ServiceProvider } from "@/app/constant";
import { ModalConfigValidator, ModelConfig } from "../store";

import Locale from "../locales";
import { InputRange } from "./input-range";
import { ListItem, Select } from "./ui-lib";
import { useAllModels } from "../utils/hooks";
import { groupBy } from "lodash-es";
import styles from "./model-config.module.scss";
import { getModelProvider } from "../utils/model";

export function ModelConfigList(props: {
  modelConfig: ModelConfig;
  updateConfig: (updater: (config: ModelConfig) => void) => void;
  hideModelSelector?: boolean;
}) {
  const allModels = useAllModels();
  const availableModels = allModels.filter((v) => v.available);
  const groupModels = groupBy(availableModels, "provider.providerName");
  const hasSelectedModel = availableModels.some(
    (model) =>
      model.name === props.modelConfig.model &&
      model.provider?.providerName === props.modelConfig?.providerName,
  );
  const value = hasSelectedModel
    ? `${props.modelConfig.model}@${props.modelConfig?.providerName}`
    : "";
  const compressModelValue = `${props.modelConfig.compressModel}@${props.modelConfig?.compressProviderName}`;

  return (
    <>
      {!props.hideModelSelector && (
      <ModelSelectorItem
          modelConfig={props.modelConfig}
          updateConfig={props.updateConfig}
        />
      )}
      {props.modelConfig?.providerName == ServiceProvider.Google ? null : (
        <>
          <ListItem
            title={Locale.Settings.InjectSystemPrompts.Title}
            subTitle={Locale.Settings.InjectSystemPrompts.SubTitle}
          >
            <input
              aria-label={Locale.Settings.InjectSystemPrompts.Title}
              type="checkbox"
              checked={props.modelConfig.enableInjectSystemPrompts}
              onChange={(e) =>
                props.updateConfig(
                  (config) =>
                    (config.enableInjectSystemPrompts =
                      e.currentTarget.checked),
                )
              }
            ></input>
          </ListItem>

          <ListItem
            title={Locale.Settings.InputTemplate.Title}
            subTitle={Locale.Settings.InputTemplate.SubTitle}
          >
            <input
              aria-label={Locale.Settings.InputTemplate.Title}
              type="text"
              value={props.modelConfig.template}
              onChange={(e) =>
                props.updateConfig(
                  (config) => (config.template = e.currentTarget.value),
                )
              }
            ></input>
          </ListItem>
        </>
      )}
      <ListItem
        title={Locale.Settings.HistoryCount.Title}
        subTitle={Locale.Settings.HistoryCount.SubTitle}
      >
        <InputRange
          aria={Locale.Settings.HistoryCount.Title}
          title={props.modelConfig.historyMessageCount.toString()}
          value={props.modelConfig.historyMessageCount}
          min="0"
          max="64"
          step="1"
          onChange={(e) =>
            props.updateConfig(
              (config) => (config.historyMessageCount = e.target.valueAsNumber),
            )
          }
        ></InputRange>
      </ListItem>

      <ListItem
        title={Locale.Settings.CompressThreshold.Title}
        subTitle={Locale.Settings.CompressThreshold.SubTitle}
      >
        <input
          aria-label={Locale.Settings.CompressThreshold.Title}
          type="number"
          min={500}
          max={4000}
          value={props.modelConfig.compressMessageLengthThreshold}
          onChange={(e) =>
            props.updateConfig(
              (config) =>
                (config.compressMessageLengthThreshold =
                  e.currentTarget.valueAsNumber),
            )
          }
        ></input>
      </ListItem>
      <ListItem title={Locale.Memory.Title} subTitle={Locale.Memory.Send}>
        <input
          aria-label={Locale.Memory.Title}
          type="checkbox"
          checked={props.modelConfig.sendMemory}
          onChange={(e) =>
            props.updateConfig(
              (config) => (config.sendMemory = e.currentTarget.checked),
            )
          }
        ></input>
      </ListItem>
      <ListItem
        title={Locale.Settings.CompressModel.Title}
        subTitle={Locale.Settings.CompressModel.SubTitle}
      >
        <Select
          className={styles["select-compress-model"]}
          aria-label={Locale.Settings.CompressModel.Title}
          value={compressModelValue}
          onChange={(e) => {
            const [model, providerName] = getModelProvider(
              e.currentTarget.value,
            );
            props.updateConfig((config) => {
              config.compressModel = ModalConfigValidator.model(model);
              config.compressProviderName = providerName as ServiceProvider;
            });
          }}
        >
          {allModels
            .filter((v) => v.available)
            .map((v, i) => (
              <option value={`${v.name}@${v.provider?.providerName}`} key={i}>
                {v.displayName}({v.provider?.providerName})
              </option>
            ))}
        </Select>
      </ListItem>
    </>
  );
}

export function ModelSelectorItem(props: {
  modelConfig: ModelConfig;
  updateConfig: (updater: (config: ModelConfig) => void) => void;
}) {
  const allModels = useAllModels();
  const availableModels = allModels.filter((v) => v.available);
  const groupModels = groupBy(availableModels, "provider.providerName");
  const hasSelectedModel = availableModels.some(
    (model) =>
      model.name === props.modelConfig.model &&
      model.provider?.providerName === props.modelConfig?.providerName,
  );
  const value = hasSelectedModel
    ? `${props.modelConfig.model}@${props.modelConfig?.providerName}`
    : "";

  return (
    <ListItem title={Locale.Settings.Model}>
      <Select
        aria-label={Locale.Settings.Model}
        value={value}
        align="left"
        disabled={availableModels.length === 0}
        onChange={(e) => {
          if (!e.currentTarget.value) {
            return;
          }
          const [model, providerName] = getModelProvider(e.currentTarget.value);
          props.updateConfig((config) => {
            config.model = ModalConfigValidator.model(model);
            config.providerName = providerName as ServiceProvider;
          });
        }}
      >
        <option value="" disabled>
          {availableModels.length === 0
            ? Locale.Settings.EmptyModel
            : Locale.Settings.SelectModel}
        </option>
        {Object.keys(groupModels).map((providerName, index) => (
          <optgroup label={providerName} key={index}>
            {groupModels[providerName].map((v, i) => (
              <option value={`${v.name}@${v.provider?.providerName}`} key={i}>
                {v.displayName}
              </option>
            ))}
          </optgroup>
        ))}
      </Select>
    </ListItem>
  );
}
