import log from "loglevel";
import { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm";
import { serializeError } from "../utils/error";

class BetterWebWorkerMLCEngineHandler extends WebWorkerMLCEngineHandler {
  async handleTask<T>(uuid: string, task: () => Promise<T>): Promise<void> {
    try {
      const res = await task();
      const msg = { kind: "return" as const, uuid, content: res as any };
      this.postMessage(msg);
    } catch (err: any) {
      console.error("[WebLLM Worker] Task failed:", err);
      const errStr = serializeError(err, "Unknown worker error");
      const msg = { kind: "throw" as const, uuid, content: errStr as any };
      this.postMessage(msg);
    }
  }
}

let handler: BetterWebWorkerMLCEngineHandler;

self.addEventListener("message", (event) => {});

self.onmessage = (msg: MessageEvent) => {
  if (!handler) {
    handler = new BetterWebWorkerMLCEngineHandler();
    log.info("Web Worker: Web-LLM Engine Activated");
  }
  handler.onmessage(msg);
};
