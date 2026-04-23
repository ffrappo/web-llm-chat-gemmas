"use client";

require("../polyfill");

import styles from "./home.module.scss";

import log from "loglevel";
import dynamic from "next/dynamic";
import { useState, useEffect, useRef } from "react";
import {
  HashRouter as Router,
  Routes,
  Route,
  useLocation,
} from "react-router-dom";

import MlcIcon from "../icons/mlc.svg";
import LoadingIcon from "../icons/three-dots.svg";

import Locale from "../locales";
import { getCSSVar, useMobileScreen } from "../utils";
import { DEFAULT_MODELS, Path, SlotID } from "../constant";
import { ErrorBoundary } from "./error";
import { getISOLang, getLang } from "../locales";
import { SideBar } from "./sidebar";
import { useAppConfig } from "../store/config";
import {
  WebLLMApi,
  type WebLLMPreloadPhase,
  type WebLLMPreloadProgress,
} from "../client/webllm";
import { ModelClient, useChatStore } from "../store";
import { MLCLLMContext, WebLLMContext } from "../context";
import { MlcLLMApi } from "../client/mlcllm";
import { formatErrorMessage } from "../utils/error";
import { IconButton } from "./button";

export function Loading(props: { noLogo?: boolean }) {
  return (
    <div className={styles["loading-content"] + " no-dark"}>
      {!props.noLogo && (
        <div className={styles["loading-content-logo"] + " no-dark"}>
          <MlcIcon />
        </div>
      )}
      <LoadingIcon />
    </div>
  );
}

export function ErrorScreen(props: { message: string }) {
  return (
    <div className={styles["error-screen"] + " no-dark"}>
      <p>{props.message}</p>
    </div>
  );
}

const Settings = dynamic(async () => (await import("./settings")).Settings, {
  loading: () => <Loading noLogo />,
});

const Chat = dynamic(async () => (await import("./chat")).Chat, {
  loading: () => <Loading noLogo />,
});

const TemplatePage = dynamic(
  async () => (await import("./template")).TemplatePage,
  {
    loading: () => <Loading noLogo />,
  },
);

export function useSwitchTheme() {
  const config = useAppConfig();

  useEffect(() => {
    document.body.classList.remove("light");
    document.body.classList.remove("dark");

    if (config.theme === "dark") {
      document.body.classList.add("dark");
    } else if (config.theme === "light") {
      document.body.classList.add("light");
    }

    const metaDescriptionDark = document.querySelector(
      'meta[name="theme-color"][media*="dark"]',
    );
    const metaDescriptionLight = document.querySelector(
      'meta[name="theme-color"][media*="light"]',
    );

    if (config.theme === "auto") {
      metaDescriptionDark?.setAttribute("content", "#151515");
      metaDescriptionLight?.setAttribute("content", "#fafafa");
    } else {
      const themeColor = getCSSVar("--theme-color");
      metaDescriptionDark?.setAttribute("content", themeColor);
      metaDescriptionLight?.setAttribute("content", themeColor);
    }
  }, [config.theme]);
}

function useHtmlLang() {
  useEffect(() => {
    const lang = getISOLang();
    const htmlLang = document.documentElement.lang;

    if (lang !== htmlLang) {
      document.documentElement.lang = lang;
    }
  }, []);
}

const useHasHydrated = () => {
  const [hasHydrated, setHasHydrated] = useState<boolean>(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  return hasHydrated;
};

const loadAsyncFonts = () => {
  const linkEl = document.createElement("link");
  linkEl.rel = "stylesheet";
  linkEl.href = "/fonts/font.css";
  document.head.appendChild(linkEl);
};

const BOOTSTRAP_PHASES: Exclude<WebLLMPreloadPhase, "ready">[] = [
  "checkingCache",
  "preparingRuntime",
  "requestingGpu",
  "fetchingModelFiles",
  "loadingModel",
  "warmingUp",
  "finalizing",
];

type InitialModelLoadState = {
  phase: "idle" | "loading" | "ready" | "error";
  stage: WebLLMPreloadPhase;
  modelName: string;
  progress: number;
  text: string;
  cached: boolean | null;
  error?: string;
};

function getModelDisplayName(modelId: string) {
  return DEFAULT_MODELS.find((model) => model.name === modelId)?.display_name;
}

function getBootstrapPhaseState(
  phase: (typeof BOOTSTRAP_PHASES)[number],
  currentPhase: WebLLMPreloadPhase,
  isError: boolean,
) {
  const currentIndex = BOOTSTRAP_PHASES.indexOf(
    currentPhase as (typeof BOOTSTRAP_PHASES)[number],
  );
  const phaseIndex = BOOTSTRAP_PHASES.indexOf(phase);

  if (currentIndex === -1) {
    return "pending";
  }

  if (phaseIndex < currentIndex) {
    return "done";
  }

  if (phaseIndex > currentIndex) {
    return "pending";
  }

  return isError ? "error" : "current";
}

function getBootstrapPhaseLabel(phase: WebLLMPreloadPhase) {
  return Locale.Home.ModelLoad.Phases[phase];
}

function getBootstrapPhaseDescription(phase: WebLLMPreloadPhase) {
  return Locale.Home.ModelLoad.PhaseDescription[phase];
}

function InitialModelLoadOverlay(props: {
  state: InitialModelLoadState;
  onRetry: () => void;
  onContinue: () => void;
}) {
  const progressPercent = Math.round(props.state.progress * 100);
  const isError = props.state.phase === "error";
  const phaseDescription = isError
    ? Locale.Home.ModelLoad.Failed
    : getBootstrapPhaseDescription(props.state.stage);

  return (
    <div className={styles["bootstrap-overlay"] + " no-dark"}>
      <div className={styles["bootstrap-card"]}>
        <div className={styles["bootstrap-logo"] + " mlc-icon"}>
          <MlcIcon />
        </div>

        <div className={styles["bootstrap-title"]}>
          {Locale.Home.ModelLoad.Title(props.state.modelName)}
        </div>
        <div className={styles["bootstrap-subtitle"]}>{phaseDescription}</div>

        {!isError && (
          <div className={styles["bootstrap-spinner"]}>
            <LoadingIcon />
          </div>
        )}

        <div className={styles["bootstrap-phase-list"]}>
          <div className={styles["bootstrap-phase-title"]}>
            {Locale.Home.ModelLoad.PhaseTitle}
          </div>

          <div className={styles["bootstrap-phase-items"]}>
            {BOOTSTRAP_PHASES.map((phase, index) => {
              const phaseState = getBootstrapPhaseState(
                phase,
                props.state.stage,
                isError,
              );

              return (
                <div
                  key={phase}
                  className={`${styles["bootstrap-phase-item"]} ${
                    styles[`bootstrap-phase-item-${phaseState}`]
                  }`}
                >
                  <div className={styles["bootstrap-phase-marker"]}>
                    {index + 1}
                  </div>
                  <div className={styles["bootstrap-phase-label"]}>
                    {getBootstrapPhaseLabel(phase)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className={styles["bootstrap-progress-track"]}>
          <div
            className={styles["bootstrap-progress-bar"]}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className={styles["bootstrap-progress-label"]}>
          {Locale.Home.ModelLoad.Progress(progressPercent)}
        </div>

        <div className={styles["bootstrap-status"]}>
          {props.state.error ?? props.state.text}
        </div>

        {isError && (
          <div className={styles["bootstrap-actions"]}>
            <IconButton
              type="primary"
              text={Locale.Home.ModelLoad.Retry}
              onClick={props.onRetry}
            />
            <IconButton
              bordered
              text={Locale.Home.ModelLoad.Continue}
              onClick={props.onContinue}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Screen() {
  const config = useAppConfig();
  const location = useLocation();
  const isHome = location.pathname === Path.Home;
  const isMobileScreen = useMobileScreen();
  const shouldTightBorder = config.tightBorder && !isMobileScreen;

  useEffect(() => {
    loadAsyncFonts();
  }, []);

  return (
    <div
      className={
        styles.container +
        ` ${shouldTightBorder ? styles["tight-container"] : styles.container} ${
          getLang() === "ar" ? styles["rtl-screen"] : ""
        }`
      }
    >
      <>
        <SideBar className={isHome ? styles["sidebar-show"] : ""} />

        <div className={styles["window-content"]} id={SlotID.AppBody}>
          <Routes>
            <Route path={Path.Home} element={<Chat />} />
            <Route path={Path.Templates} element={<TemplatePage />} />
            <Route path={Path.Chat} element={<Chat />} />
            <Route path={Path.Settings} element={<Settings />} />
          </Routes>
        </div>
      </>
    </div>
  );
}

const useWebLLM = () => {
  const [webllm, setWebLLM] = useState<WebLLMApi | undefined>(undefined);
  useEffect(() => {
    log.info("Starting browser LLM worker.");
    const api = new WebLLMApi("webWorker");
    setWebLLM(api);

    return () => {
      api.abort().catch(() => undefined);
    };
  }, []);

  return { webllm, isWebllmActive: true };
};

const useMlcLLM = () => {
  const config = useAppConfig();
  const [mlcllm, setMlcLlm] = useState<MlcLLMApi | undefined>(undefined);

  useEffect(() => {
    setMlcLlm(new MlcLLMApi(config.modelConfig.mlc_endpoint));
  }, [config.modelConfig.mlc_endpoint, setMlcLlm]);

  return mlcllm;
};

const useLoadUrlParam = () => {
  const config = useAppConfig();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const thinkingParam = params.get("enable_thinking");
    let modelConfig: any = {
      model: params.get("model"),
      temperature: params.has("temperature")
        ? parseFloat(params.get("temperature")!)
        : null,
      context_window_size: params.has("context_window_size")
        ? parseInt(params.get("context_window_size")!)
        : null,
      top_p: params.has("top_p") ? parseFloat(params.get("top_p")!) : null,
      top_k: params.has("top_k") ? parseInt(params.get("top_k")!) : null,
      max_tokens: params.has("max_tokens")
        ? parseInt(params.get("max_tokens")!)
        : null,
      stream: params.has("stream") ? params.get("stream") !== "false" : null,
      do_sample: params.has("do_sample")
        ? params.get("do_sample") !== "false"
        : null,
      presence_penalty: params.has("presence_penalty")
        ? parseFloat(params.get("presence_penalty")!)
        : null,
      frequency_penalty: params.has("frequency_penalty")
        ? parseFloat(params.get("frequency_penalty")!)
        : null,
      repetition_penalty: params.has("repetition_penalty")
        ? parseFloat(params.get("repetition_penalty")!)
        : null,
      ignore_eos: params.has("ignore_eos")
        ? params.get("ignore_eos") === "true"
        : null,
      seed: params.has("seed") ? parseInt(params.get("seed")!) : null,
    };
    Object.keys(modelConfig).forEach((key) => {
      // If the value of the key is null, delete the key
      if (modelConfig[key] === null) {
        delete modelConfig[key];
      }
    });
    if (Object.keys(modelConfig).length > 0) {
      log.info("Loaded model config from URL params", modelConfig);
      config.updateModelConfig(modelConfig);
    }
    if (thinkingParam !== null) {
      config.update(
        (config) => (config.enableThinking = thinkingParam === "true"),
      );
    }
  }, []);
};

const useStopStreamingMessages = () => {
  const chatStore = useChatStore();

  // Clean up bad chat messages due to refresh during generating
  useEffect(() => {
    chatStore.stopStreaming();
  }, []);
};

const useLogLevel = (webllm?: WebLLMApi) => {
  const config = useAppConfig();

  // Update log level once app config loads
  useEffect(() => {
    log.setLevel(config.logLevel);
    if (webllm) {
      webllm.setLogLevel(config.logLevel).catch(() => undefined);
    }
  }, [config.logLevel, webllm]);
};

const useModels = (mlcllm: MlcLLMApi | undefined) => {
  const config = useAppConfig();

  useEffect(() => {
    if (config.modelClientType == ModelClient.WEBLLM) {
      config.setModels(DEFAULT_MODELS);
    } else if (config.modelClientType == ModelClient.MLCLLM_API) {
      if (mlcllm) {
        mlcllm.models().then((models) => {
          config.setModels(models);
        });
      }
    }
  }, [config.modelClientType, mlcllm]);
};

export function Home() {
  const hasHydrated = useHasHydrated();
  const config = useAppConfig();
  const { webllm, isWebllmActive } = useWebLLM();
  const mlcllm = useMlcLLM();
  const hasTriggeredAutoPreload = useRef(false);
  const lastHandledPreloadRetryKey = useRef<number | null>(null);
  const [preloadRetryKey, setPreloadRetryKey] = useState(0);
  const [allowContinueWithoutPreload, setAllowContinueWithoutPreload] =
    useState(false);
  const [initialModelLoad, setInitialModelLoad] =
    useState<InitialModelLoadState>({
      phase: "idle",
      stage: "checkingCache",
      modelName: "",
      progress: 0,
      text: "",
      cached: null,
    });

  useSwitchTheme();
  useHtmlLang();
  useLoadUrlParam();
  useStopStreamingMessages();
  useModels(mlcllm);
  useLogLevel(webllm);

  useEffect(() => {
    if (!hasHydrated || !webllm || !isWebllmActive) {
      return;
    }

    if (config.modelClientType !== ModelClient.WEBLLM) {
      setInitialModelLoad((state) =>
        state.phase === "ready"
          ? state
          : {
              ...state,
              phase: "ready",
              stage: "ready",
              progress: 1,
            },
      );
      return;
    }

    const shouldAutoPreload = !hasTriggeredAutoPreload.current;
    const shouldRetry =
      preloadRetryKey > 0 &&
      lastHandledPreloadRetryKey.current !== preloadRetryKey;

    if (!shouldAutoPreload && !shouldRetry) {
      return;
    }

    hasTriggeredAutoPreload.current = true;
    lastHandledPreloadRetryKey.current = preloadRetryKey;
    setAllowContinueWithoutPreload(false);

    let isCancelled = false;
    const modelName =
      getModelDisplayName(config.modelConfig.model) ?? config.modelConfig.model;
    const preloadConfig = {
      ...config.modelConfig,
      cache: config.cacheType,
      enable_thinking: config.enableThinking,
    };

    setInitialModelLoad({
      phase: "loading",
      stage: "checkingCache",
      modelName,
      progress: 0,
      text: Locale.Home.ModelLoad.Preparing(modelName),
      cached: null,
    });

    webllm
      .preload(preloadConfig, (report: WebLLMPreloadProgress) => {
        if (isCancelled) {
          return;
        }

        setInitialModelLoad({
          phase: "loading",
          stage: report.phase,
          modelName: getModelDisplayName(report.model) ?? report.model,
          progress: report.progress,
          text: report.text,
          cached: report.cached,
        });
      })
      .then(() => {
        if (isCancelled) {
          return;
        }

        setInitialModelLoad((state) => ({
          ...state,
          phase: "ready",
          stage: "ready",
          progress: 1,
          text: Locale.Home.ModelLoad.Ready(state.modelName || modelName),
          error: undefined,
        }));
      })
      .catch((error) => {
        if (isCancelled) {
          return;
        }

        setInitialModelLoad((state) => ({
          ...state,
          phase: "error",
          error: formatErrorMessage(error, Locale.Home.ModelLoad.ErrorFallback),
        }));
      });

    return () => {
      isCancelled = true;
    };
  }, [
    config.cacheType,
    config.enableThinking,
    config.modelClientType,
    config.modelConfig,
    hasHydrated,
    isWebllmActive,
    preloadRetryKey,
    webllm,
  ]);

  if (!hasHydrated || !webllm) {
    return <Loading />;
  }

  if (!isWebllmActive) {
    return <ErrorScreen message={Locale.ServiceWorker.Error} />;
  }

  const showInitialModelOverlay =
    config.modelClientType === ModelClient.WEBLLM &&
    !allowContinueWithoutPreload &&
    (initialModelLoad.phase === "loading" ||
      initialModelLoad.phase === "error");

  return (
    <ErrorBoundary>
      <Router>
        <WebLLMContext.Provider value={webllm}>
          <MLCLLMContext.Provider value={mlcllm}>
            <Screen />
          </MLCLLMContext.Provider>
        </WebLLMContext.Provider>
      </Router>
      {showInitialModelOverlay && (
        <InitialModelLoadOverlay
          state={initialModelLoad}
          onRetry={() => setPreloadRetryKey((retryKey) => retryKey + 1)}
          onContinue={() => setAllowContinueWithoutPreload(true)}
        />
      )}
    </ErrorBoundary>
  );
}
