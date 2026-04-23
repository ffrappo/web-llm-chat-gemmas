import {
  ModalConfigValidator,
  ModelConfig,
  useAppConfig,
  ModelClient,
  Model,
} from "../store";
import {
  GEMMA4_BENCH_PRESET,
  GEMMA4_PEAK_PRESET,
  GEMMA4_STABLE_PRESET,
} from "../constant";

import CancelIcon from "../icons/cancel.svg";
import ConfirmIcon from "../icons/confirm.svg";
import ConnectIcon from "../icons/connection.svg";

import Locale from "../locales";
import { InputRange } from "./input-range";
import { List, ListItem, Modal, Select, showToast } from "./ui-lib";
import React, { useState } from "react";
import { IconButton } from "./button";
import ModelSelect from "./model-select";

export function ModelConfigList() {
  const config = useAppConfig();
  const models = config.models;
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [showApiConnectModel, setShowApiConnectModel] = useState(false);

  const [endpointInput, setEndpointInput] = useState<string>(
    config.modelConfig.mlc_endpoint,
  );

  const updateModelConfig = (updater: (config: ModelConfig) => void) => {
    const modelConfig = { ...config.modelConfig } as ModelConfig;
    updater(modelConfig);
    config.update((config) => (config.modelConfig = modelConfig));
  };

  const isGemma4Model = config.modelConfig.model
    .toLowerCase()
    .startsWith("gemma-4");
  const supportsThinking =
    config.modelConfig.model.toLowerCase().startsWith("qwen3") || isGemma4Model;

  const applyGemma4Preset = (name: string, preset: Partial<ModelConfig>) => {
    config.update((config) => {
      config.enableThinking = false;
      config.modelConfig = {
        ...config.modelConfig,
        ...preset,
        seed: null,
      };
    });
    showToast(Locale.Settings.Gemma4Presets.Applied(name));
  };

  return (
    <>
      <ListItem title={Locale.Settings.ModelClientType.Title}>
        <Select
          value={config.modelClientType}
          onChange={(e) => {
            if (e.target.value === ModelClient.BROWSER) {
              config.update((config) => {
                config.modelClientType = e.target.value as ModelClient;
              });
            } else if (e.target.value === ModelClient.MLCLLM_API) {
              setShowApiConnectModel(true);
            }
          }}
        >
          <option value={ModelClient.BROWSER} key={ModelClient.BROWSER}>
            {Locale.Settings.ModelClientType.Browser}
          </option>
          <option value={ModelClient.MLCLLM_API} key={ModelClient.MLCLLM_API}>
            {Locale.Settings.ModelClientType.MlcLlm}
          </option>
        </Select>
      </ListItem>

      {config.modelClientType === ModelClient.BROWSER && (
        <>
          <ListItem title={Locale.Settings.Model}>
            <Select
              value={config.modelConfig.model}
              onClick={(e) => {
                e.preventDefault();
                setShowModelSelector(true);
              }}
              onMouseDown={(e) => {
                // Prevent the dropdown list from opening
                e.preventDefault();
              }}
            >
              {models.map((v, i) => (
                <React.Fragment key={i}>
                  {i > 0 && v.family !== models[i - 1].family && <hr />}
                  <option value={v.name}>
                    {v.name}
                    {v.provider ? ` (${v.provider})` : ""}
                  </option>
                </React.Fragment>
              ))}
            </Select>
          </ListItem>

          {isGemma4Model && (
            <ListItem
              title={Locale.Settings.Gemma4Presets.Title}
              subTitle={Locale.Settings.Gemma4Presets.SubTitle}
            >
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  marginTop: 12,
                }}
              >
                <IconButton
                  bordered
                  text={Locale.Settings.Gemma4Presets.Peak}
                  onClick={() =>
                    applyGemma4Preset(
                      Locale.Settings.Gemma4Presets.Peak,
                      GEMMA4_PEAK_PRESET,
                    )
                  }
                />
                <IconButton
                  bordered
                  type="primary"
                  text={Locale.Settings.Gemma4Presets.Stable}
                  onClick={() =>
                    applyGemma4Preset(
                      Locale.Settings.Gemma4Presets.Stable,
                      GEMMA4_STABLE_PRESET,
                    )
                  }
                />
                <IconButton
                  bordered
                  text={Locale.Settings.Gemma4Presets.Bench}
                  onClick={() =>
                    applyGemma4Preset(
                      Locale.Settings.Gemma4Presets.Bench,
                      GEMMA4_BENCH_PRESET,
                    )
                  }
                />
              </div>
            </ListItem>
          )}

          {supportsThinking && (
            <ListItem
              title={Locale.Settings.EnableThinking.Title}
              subTitle={Locale.Settings.EnableThinking.SubTitle}
            >
              <input
                type="checkbox"
                checked={config.enableThinking}
                onChange={(e) =>
                  config.update(
                    (config) =>
                      (config.enableThinking = e.currentTarget.checked),
                  )
                }
              ></input>
            </ListItem>
          )}

          {/* New setting item for LLM model context window length */}
          <ListItem
            title={Locale.Settings.ContextWindowLength.Title}
            subTitle={Locale.Settings.ContextWindowLength.SubTitle}
          >
            <Select
              value={config.modelConfig.context_window_size}
              onChange={(e) => {
                updateModelConfig(
                  (config) =>
                    (config.context_window_size =
                      ModalConfigValidator.context_window_size(
                        parseInt(e.currentTarget.value),
                      )),
                );
              }}
            >
              <option value="1024">1K</option>
              <option value="2048">2K</option>
              <option value="4096">4K</option>
              <option value="8192">8K</option>
              <option value="16384">16K</option>
              <option value="32768">32K</option>
              <option value="65536">64K</option>
              <option value="100000">100K</option>
              <option value="131072">128K</option>
            </Select>
          </ListItem>

          <ListItem
            title={Locale.Settings.Temperature.Title}
            subTitle={Locale.Settings.Temperature.SubTitle}
          >
            <InputRange
              value={config.modelConfig.temperature?.toFixed(2)}
              min="0"
              max="2"
              step="0.05"
              onChange={(e) => {
                updateModelConfig(
                  (config) =>
                    (config.temperature = ModalConfigValidator.temperature(
                      e.currentTarget.valueAsNumber,
                    )),
                );
              }}
            ></InputRange>
          </ListItem>
          <ListItem
            title={Locale.Settings.TopP.Title}
            subTitle={Locale.Settings.TopP.SubTitle}
          >
            <InputRange
              value={(config.modelConfig.top_p ?? 1).toFixed(2)}
              min="0"
              max="1"
              step="0.05"
              onChange={(e) => {
                updateModelConfig(
                  (config) =>
                    (config.top_p = ModalConfigValidator.top_p(
                      e.currentTarget.valueAsNumber,
                    )),
                );
              }}
            ></InputRange>
          </ListItem>
          <ListItem
            title={Locale.Settings.TopK.Title}
            subTitle={Locale.Settings.TopK.SubTitle}
          >
            <input
              type="number"
              min={0}
              max={512}
              step={1}
              value={config.modelConfig.top_k ?? 64}
              onChange={(e) => {
                updateModelConfig(
                  (config) =>
                    (config.top_k = ModalConfigValidator.top_k(
                      e.currentTarget.valueAsNumber,
                    )),
                );
              }}
            ></input>
          </ListItem>
          <ListItem
            title={Locale.Settings.MaxTokens.Title}
            subTitle={Locale.Settings.MaxTokens.SubTitle}
          >
            <input
              type="number"
              min={1024}
              max={512000}
              value={config.modelConfig.max_tokens}
              onChange={(e) =>
                updateModelConfig(
                  (config) =>
                    (config.max_tokens = ModalConfigValidator.max_tokens(
                      e.currentTarget.valueAsNumber,
                    )),
                )
              }
            ></input>
          </ListItem>

          <ListItem
            title={Locale.Settings.RepetitionPenalty.Title}
            subTitle={Locale.Settings.RepetitionPenalty.SubTitle}
          >
            <InputRange
              value={config.modelConfig.repetition_penalty?.toFixed(2)}
              min="0.5"
              max="1.5"
              step="0.01"
              onChange={(e) => {
                updateModelConfig(
                  (config) =>
                    (config.repetition_penalty =
                      ModalConfigValidator.repetition_penalty(
                        e.currentTarget.valueAsNumber,
                      )),
                );
              }}
            ></InputRange>
          </ListItem>

          <ListItem
            title={Locale.Settings.Seed.Title}
            subTitle={Locale.Settings.Seed.SubTitle}
          >
            <input
              type="number"
              step={1}
              value={config.modelConfig.seed ?? ""}
              placeholder={Locale.Settings.Seed.Title}
              onChange={(e) => {
                const nextValue = e.currentTarget.value;
                updateModelConfig(
                  (config) =>
                    (config.seed =
                      nextValue.trim().length === 0
                        ? null
                        : ModalConfigValidator.seed(
                            e.currentTarget.valueAsNumber,
                          )),
                );
              }}
            ></input>
          </ListItem>

          <ListItem
            title={Locale.Settings.DoSample.Title}
            subTitle={Locale.Settings.DoSample.SubTitle}
          >
            <input
              type="checkbox"
              checked={config.modelConfig.do_sample}
              onChange={(e) => {
                updateModelConfig(
                  (config) => (config.do_sample = e.currentTarget.checked),
                );
              }}
            ></input>
          </ListItem>

          <ListItem
            title={Locale.Settings.IgnoreEos.Title}
            subTitle={Locale.Settings.IgnoreEos.SubTitle}
          >
            <input
              type="checkbox"
              checked={config.modelConfig.ignore_eos}
              onChange={(e) => {
                updateModelConfig(
                  (config) => (config.ignore_eos = e.currentTarget.checked),
                );
              }}
            ></input>
          </ListItem>

          <ListItem
            title={Locale.Settings.Stream.Title}
            subTitle={Locale.Settings.Stream.SubTitle}
          >
            <input
              type="checkbox"
              checked={config.modelConfig.stream}
              onChange={(e) => {
                updateModelConfig(
                  (config) => (config.stream = e.currentTarget.checked),
                );
              }}
            ></input>
          </ListItem>
        </>
      )}

      {config.modelClientType === ModelClient.MLCLLM_API && (
        <>
          <ListItem
            title={Locale.Settings.MlcLlmApi.Connect.Title}
            subTitle={Locale.Settings.MlcLlmApi.Connect.SubTitle}
          >
            <IconButton
              icon={<ConnectIcon />}
              text={Locale.Settings.MlcLlmApi.Connect.Title}
              onClick={() => setShowApiConnectModel(true)}
              type="primary"
            />
          </ListItem>{" "}
          <ListItem title={Locale.Settings.Model}>
            <Select
              value={config.modelConfig.model}
              onChange={(e) => {
                config.selectModel(e.target.value);
              }}
            >
              {models.map((v, i) => (
                <React.Fragment key={i}>
                  {i > 0 && v.family !== models[i - 1].family && <hr />}
                  <option value={v.name}>
                    {v.name}
                    {v.provider ? ` (${v.provider})` : ""}
                  </option>
                </React.Fragment>
              ))}
            </Select>
          </ListItem>
        </>
      )}
      {showModelSelector && (
        <ModelSelect
          onClose={() => {
            setShowModelSelector(false);
          }}
          availableModels={models.map((m) => m.name)}
          onSelectModel={(modelName) => {
            config.selectModel(modelName as Model);
          }}
        />
      )}
      {showApiConnectModel && (
        <div className="screen-model-container">
          <Modal
            title={Locale.MlcLLMConnect.Title}
            onClose={() => setShowApiConnectModel(false)}
            actions={[
              <IconButton
                key="cancel"
                text={Locale.UI.Cancel}
                onClick={() => {
                  setShowApiConnectModel(false);
                }}
                icon={<CancelIcon />}
                bordered
                shadow
                tabIndex={0}
              ></IconButton>,
              <IconButton
                key="confirm"
                text={Locale.UI.Confirm}
                type="primary"
                onClick={() => {
                  if (!/^(http:\/\/|https:\/\/).*/i.test(endpointInput)) {
                    config.update(
                      (config) =>
                        (config.modelConfig.mlc_endpoint =
                          "http://" + endpointInput),
                    );
                  } else {
                    config.update(
                      (config) =>
                        (config.modelConfig.mlc_endpoint = endpointInput),
                    );
                  }
                  setShowApiConnectModel(false);
                  config.update((config) => {
                    config.modelClientType = ModelClient.MLCLLM_API;
                  });
                }}
                icon={<ConfirmIcon />}
                bordered
                shadow
                tabIndex={0}
              ></IconButton>,
            ]}
          >
            <List>
              <ListItem
                title={Locale.Settings.MlcLlmApi.Title}
                subTitle={Locale.Settings.MlcLlmApi.SubTitle}
              >
                <input
                  type="text"
                  value={endpointInput}
                  onChange={(e) => setEndpointInput(e.currentTarget.value)}
                ></input>
              </ListItem>
            </List>
          </Modal>
        </div>
      )}
    </>
  );
}
