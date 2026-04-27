type Level = "error" | "warn" | "info" | "debug";

function emit(level: Level, message: string, meta?: Record<string, unknown>) {
  if (level === "debug" && process.env.NODE_ENV === "production") return;
  const payload = meta ? { message, ...meta } : { message };
  const line = JSON.stringify(payload);
  switch (level) {
    case "error":
      console.error(line);
      return;
    case "warn":
      console.warn(line);
      return;
    default:
      console.log(line);
  }
}

export const logger = {
  error: (message: string, meta?: Record<string, unknown>) => emit("error", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => emit("warn", message, meta),
  info: (message: string, meta?: Record<string, unknown>) => emit("info", message, meta),
  debug: (message: string, meta?: Record<string, unknown>) => emit("debug", message, meta),
};
