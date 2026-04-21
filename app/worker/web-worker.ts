import log from "loglevel";
import { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm";

class BetterWebWorkerMLCEngineHandler extends WebWorkerMLCEngineHandler {
  async handleTask<T>(uuid: string, task: () => Promise<T>): Promise<void> {
    try {
      const res = await task();
      const msg = { kind: "return" as const, uuid, content: res as any };
      this.postMessage(msg);
    } catch (err: any) {
      console.error("[WebLLM Worker] Task failed:", err);
      let errStr: string;
      if (typeof err === "string") {
        errStr = err;
      } else if (err?.message) {
        errStr = err.message;
      } else if (err?.toString) {
        errStr = err.toString();
      } else {
        errStr = JSON.stringify(err) || "Unknown worker error";
      }
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
