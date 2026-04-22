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
import { ServiceWorkerMLCEngine } from "@mlc-ai/web-llm";

import MlcIcon from "../icons/mlc.svg";
import LoadingIcon from "../icons/three-dots.svg";

import Locale from "../locales";
import { getCSSVar, useMobileScreen } from "../utils";
import { DEFAULT_MODELS, Path, SlotID } from "../constant";
import { ErrorBoundary } from "./error";
import { getISOLang, getLang } from "../locales";
import { SideBar } from "./sidebar";
import { useAppConfig } from "../store/config";
import { WebLLMApi, WebLLMPreloadProgress } from "../client/webllm";
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

type InitialModelLoadState = {
  phase: "idle" | "loading" | "ready" | "error";
  modelName: string;
  progress: number;
  text: string;
  cached: boolean | null;
  error?: string;
};

function getModelDisplayName(modelId: string) {
  return DEFAULT_MODELS.find((model) => model.name === modelId)?.display_name;
}

function normalizeProgress(progress: number) {
  if (!Number.isFinite(progress)) {
    return 0;
  }

  const normalized = progress > 1 ? progress / 100 : progress;
  return Math.min(1, Math.max(0, normalized));
}

function InitialModelLoadOverlay(props: {
  state: InitialModelLoadState;
  onRetry: () => void;
  onContinue: () => void;
}) {
  const progressPercent = Math.round(props.state.progress * 100);
  const isError = props.state.phase === "error";

  return (
    <div className={styles["bootstrap-overlay"] + " no-dark"}>
      <div className={styles["bootstrap-card"]}>
        <div className={styles["bootstrap-logo"] + " mlc-icon"}>
          <MlcIcon />
        </div>

        <div className={styles["bootstrap-title"]}>
          {Locale.Home.ModelLoad.Title(props.state.modelName)}
        </div>
        <div className={styles["bootstrap-subtitle"]}>
          {isError
            ? Locale.Home.ModelLoad.Failed
            : props.state.cached
              ? Locale.Home.ModelLoad.Cached
              : Locale.Home.ModelLoad.Downloading}
        </div>

        {!isError && (
          <div className={styles["bootstrap-spinner"]}>
            <LoadingIcon />
          </div>
        )}

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
  const config = useAppConfig();
  const [webllm, setWebLLM] = useState<WebLLMApi | undefined>(undefined);
  const [isWebllmActive, setWebllmAlive] = useState(false);
  const isWebllmInitialized = useRef(false);

  // Initialize WebLLM engine
  useEffect(() => {
    let isCancelled = false;
    let timeoutId: number | undefined;
    let sendEventIntervalId: number | undefined;
    let webGPUCheckCallback: ((event: MessageEvent) => void) | undefined;

    const cleanupWebGPUCheck = () => {
      if (sendEventIntervalId !== undefined) {
        window.clearInterval(sendEventIntervalId);
        sendEventIntervalId = undefined;
      }

      if (webGPUCheckCallback && "serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener(
          "message",
          webGPUCheckCallback,
        );
        webGPUCheckCallback = undefined;
      }
    };

    const activateWebLLM = (type: "serviceWorker" | "webWorker") => {
      if (isCancelled || isWebllmInitialized.current) {
        return;
      }

      isWebllmInitialized.current = true;
      cleanupWebGPUCheck();

      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
        timeoutId = undefined;
      }

      setWebLLM(new WebLLMApi(type, config.logLevel));
      setWebllmAlive(true);
    };

    // If service worker registration times out, fall back to the web worker.
    timeoutId = window.setTimeout(() => {
      if (isWebllmInitialized.current) {
        return;
      }

      log.info(
        "Service Worker activation is timed out. Falling back to use web worker.",
      );
      activateWebLLM("webWorker");
    }, 2_000);

    if ("serviceWorker" in navigator) {
      log.info("Service Worker API is available and in use.");
      navigator.serviceWorker.ready
        .then(() => {
          if (isCancelled || isWebllmInitialized.current) {
            return;
          }

          log.info("Service Worker is activated.");
          // Check whether WebGPU is available in Service Worker.
          const request = {
            kind: "checkWebGPUAvilability",
            uuid: crypto.randomUUID(),
            content: "",
          };

          sendEventIntervalId = window.setInterval(() => {
            navigator.serviceWorker.controller?.postMessage(request);
          }, 200);

          webGPUCheckCallback = (event: MessageEvent) => {
            const message = event.data;
            if (message.kind === "return" && message.uuid === request.uuid) {
              const isWebGPUAvailable = message.content;
              log.info(
                isWebGPUAvailable
                  ? "Service Worker has WebGPU Available."
                  : "Service Worker does not have available WebGPU.",
              );
              activateWebLLM(isWebGPUAvailable ? "serviceWorker" : "webWorker");
            }
          };

          navigator.serviceWorker.addEventListener(
            "message",
            webGPUCheckCallback,
          );
        })
        .catch((err) => {
          log.warn(
            "Service Worker readiness check failed. Falling back to use web worker.",
            err,
          );
          activateWebLLM("webWorker");
        });
    } else {
      log.info(
        "Service Worker API is unavailable. Falling back to use web worker.",
      );
      activateWebLLM("webWorker");
    }

    return () => {
      isCancelled = true;
      cleanupWebGPUCheck();
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  useEffect(() => {
    if (webllm?.webllm.type !== "serviceWorker") {
      return;
    }

    const intervalId = window.setInterval(() => {
      // 10s per heartbeat, dead after 30 seconds of inactivity.
      setWebllmAlive(
        !!webllm.webllm.engine &&
          (webllm.webllm.engine as ServiceWorkerMLCEngine).missedHeartbeat < 3,
      );
    }, 10_000);

    return () => window.clearInterval(intervalId);
  }, [webllm]);

  return { webllm, isWebllmActive };
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
    let modelConfig: any = {
      model: params.get("model"),
      temperature: params.has("temperature")
        ? parseFloat(params.get("temperature")!)
        : null,
      top_p: params.has("top_p") ? parseFloat(params.get("top_p")!) : null,
      max_tokens: params.has("max_tokens")
        ? parseInt(params.get("max_tokens")!)
        : null,
      presence_penalty: params.has("presence_penalty")
        ? parseFloat(params.get("presence_penalty")!)
        : null,
      frequency_penalty: params.has("frequency_penalty")
        ? parseFloat(params.get("frequency_penalty")!)
        : null,
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
    if (webllm?.webllm?.engine) {
      webllm.webllm.engine.setLogLevel(config.logLevel);
    }
  }, [config.logLevel, webllm?.webllm?.engine]);
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
          modelName: getModelDisplayName(report.model) ?? report.model,
          progress: normalizeProgress(report.progress),
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
