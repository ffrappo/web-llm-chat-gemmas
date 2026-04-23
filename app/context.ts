import { createContext } from "react";
import { BrowserLLM } from "./client/browser-llm";
import { MlcLLMApi } from "./client/mlcllm";

export const BrowserLLMContext = createContext<BrowserLLM | undefined>(
  undefined,
);
export const MLCLLMContext = createContext<MlcLLMApi | undefined>(undefined);
