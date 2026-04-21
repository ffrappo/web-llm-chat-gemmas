function isMeaningfulMessage(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const message = value.trim();
  return (
    message.length > 0 &&
    message !== "[object Object]" &&
    message !== "Unknown error"
  );
}

function safeJsonStringify(value: unknown): string | undefined {
  try {
    const serialized = JSON.stringify(value);
    return serialized && serialized !== "{}" ? serialized : undefined;
  } catch {
    return undefined;
  }
}

function getErrorName(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.name;
  }
  if (error && typeof error === "object" && "name" in error) {
    const name = (error as { name?: unknown }).name;
    if (typeof name === "string" && name.trim().length > 0) {
      return name.trim();
    }
  }
  return undefined;
}

function getErrorMessage(error: unknown): string | undefined {
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }
  return undefined;
}

function getErrorStack(error: unknown): string | undefined {
  if (error instanceof Error && typeof error.stack === "string") {
    return error.stack;
  }
  if (error && typeof error === "object" && "stack" in error) {
    const stack = (error as { stack?: unknown }).stack;
    if (typeof stack === "string" && stack.trim().length > 0) {
      return stack;
    }
  }
  return undefined;
}

function summarizeError(error: unknown): string | undefined {
  const message = getErrorMessage(error);
  const name = getErrorName(error);

  if (isMeaningfulMessage(message)) {
    if (name && name !== "Error" && !message.startsWith(`${name}:`)) {
      return `${name}: ${message}`;
    }
    return message;
  }

  const serialized = safeJsonStringify(error);
  if (isMeaningfulMessage(serialized)) {
    return serialized;
  }

  return undefined;
}

export function formatErrorMessage(error: unknown, fallback: string): string {
  return summarizeError(error) ?? fallback;
}

export function serializeError(
  error: unknown,
  fallback = "Unknown error",
): string {
  const summary = summarizeError(error) ?? fallback;
  const stack = getErrorStack(error);

  if (stack && stack.trim().length > 0 && !stack.includes(summary)) {
    return `${summary}\n${stack}`;
  }

  return summary;
}
