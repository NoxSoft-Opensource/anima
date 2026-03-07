import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { Logger as TsLogger } from "tslog";
import type { AnimaConfig } from "../config/types.js";
import type { ConsoleStyle } from "./console.js";
import { resolvePreferredAnimaTmpDir } from "../infra/tmp-anima-dir.js";
import { readLoggingConfig } from "./config.js";
import { type LogLevel, levelToMinLevel, normalizeLogLevel } from "./levels.js";
import { loggingState } from "./state.js";

export const DEFAULT_LOG_DIR = resolvePreferredAnimaTmpDir();
export const DEFAULT_LOG_FILE = path.join(DEFAULT_LOG_DIR, "anima.log"); // legacy single-file path

const LOG_PREFIX = "anima";
const LOG_SUFFIX = ".log";
const MAX_LOG_AGE_MS = 24 * 60 * 60 * 1000; // 24h
const MAX_LOG_SIZE_BYTES = 50 * 1024 * 1024; // 50MB per file
const MAX_LOG_SEGMENTS = 5; // Keep up to 5 segments per day

const requireConfig = createRequire(import.meta.url);

export type LoggerSettings = {
  level?: LogLevel;
  file?: string;
  consoleLevel?: LogLevel;
  consoleStyle?: ConsoleStyle;
};

type LogObj = { date?: Date } & Record<string, unknown>;

type ResolvedSettings = {
  level: LogLevel;
  file: string;
};
export type LoggerResolvedSettings = ResolvedSettings;
export type LogTransportRecord = Record<string, unknown>;
export type LogTransport = (logObj: LogTransportRecord) => void;

const externalTransports = new Set<LogTransport>();

function attachExternalTransport(logger: TsLogger<LogObj>, transport: LogTransport): void {
  logger.attachTransport((logObj: LogObj) => {
    if (!externalTransports.has(transport)) {
      return;
    }
    try {
      transport(logObj as LogTransportRecord);
    } catch {
      // never block on logging failures
    }
  });
}

function resolveSettings(): ResolvedSettings {
  let cfg: AnimaConfig["logging"] | undefined =
    (loggingState.overrideSettings as LoggerSettings | null) ?? readLoggingConfig();
  if (!cfg) {
    try {
      const loaded = requireConfig("../config/config.js") as {
        loadConfig?: () => AnimaConfig;
      };
      cfg = loaded.loadConfig?.().logging;
    } catch {
      cfg = undefined;
    }
  }
  const defaultLevel =
    process.env.VITEST === "true" && process.env.ANIMA_TEST_FILE_LOG !== "1" ? "silent" : "info";
  const level = normalizeLogLevel(cfg?.level, defaultLevel);
  const file = cfg?.file ?? defaultRollingPathForToday();
  return { level, file };
}

function settingsChanged(a: ResolvedSettings | null, b: ResolvedSettings) {
  if (!a) {
    return true;
  }
  return a.level !== b.level || a.file !== b.file;
}

export function isFileLogLevelEnabled(level: LogLevel): boolean {
  const settings = (loggingState.cachedSettings as ResolvedSettings | null) ?? resolveSettings();
  if (!loggingState.cachedSettings) {
    loggingState.cachedSettings = settings;
  }
  if (settings.level === "silent") {
    return false;
  }
  return levelToMinLevel(level) <= levelToMinLevel(settings.level);
}

function buildLogger(settings: ResolvedSettings): TsLogger<LogObj> {
  fs.mkdirSync(path.dirname(settings.file), { recursive: true });
  // Clean up stale rolling logs when using a dated log filename.
  if (isRollingPath(settings.file)) {
    pruneOldRollingLogs(path.dirname(settings.file));
  }
  const logger = new TsLogger<LogObj>({
    name: "anima",
    minLevel: levelToMinLevel(settings.level),
    type: "hidden", // no ansi formatting
  });

  // Track current file path for size-based rotation
  let currentFile = settings.file;
  let currentSize = getFileSize(currentFile);

  logger.attachTransport((logObj: LogObj) => {
    try {
      const time = logObj.date?.toISOString?.() ?? new Date().toISOString();
      const line = JSON.stringify({ ...logObj, time });
      const lineBytes = Buffer.byteLength(line, "utf8") + 1; // +1 for newline

      // Check if we need to rotate due to size
      if (currentSize + lineBytes > MAX_LOG_SIZE_BYTES) {
        const rotated = rotateLogFile(currentFile);
        if (rotated) {
          currentFile = rotated;
          currentSize = 0;
        }
      }

      fs.appendFileSync(currentFile, `${line}\n`, { encoding: "utf8" });
      currentSize += lineBytes;
    } catch {
      // never block on logging failures
    }
  });
  for (const transport of externalTransports) {
    attachExternalTransport(logger, transport);
  }

  return logger;
}

export function getLogger(): TsLogger<LogObj> {
  const settings = resolveSettings();
  const cachedLogger = loggingState.cachedLogger as TsLogger<LogObj> | null;
  const cachedSettings = loggingState.cachedSettings as ResolvedSettings | null;
  if (!cachedLogger || settingsChanged(cachedSettings, settings)) {
    loggingState.cachedLogger = buildLogger(settings);
    loggingState.cachedSettings = settings;
  }
  return loggingState.cachedLogger as TsLogger<LogObj>;
}

export function getChildLogger(
  bindings?: Record<string, unknown>,
  opts?: { level?: LogLevel },
): TsLogger<LogObj> {
  const base = getLogger();
  const minLevel = opts?.level ? levelToMinLevel(opts.level) : undefined;
  const name = bindings ? JSON.stringify(bindings) : undefined;
  return base.getSubLogger({
    name,
    minLevel,
    prefix: bindings ? [name ?? ""] : [],
  });
}

// Baileys expects a pino-like logger shape. Provide a lightweight adapter.
export function toPinoLikeLogger(logger: TsLogger<LogObj>, level: LogLevel): PinoLikeLogger {
  const buildChild = (bindings?: Record<string, unknown>) =>
    toPinoLikeLogger(
      logger.getSubLogger({
        name: bindings ? JSON.stringify(bindings) : undefined,
      }),
      level,
    );

  return {
    level,
    child: buildChild,
    trace: (...args: unknown[]) => logger.trace(...args),
    debug: (...args: unknown[]) => logger.debug(...args),
    info: (...args: unknown[]) => logger.info(...args),
    warn: (...args: unknown[]) => logger.warn(...args),
    error: (...args: unknown[]) => logger.error(...args),
    fatal: (...args: unknown[]) => logger.fatal(...args),
  };
}

export type PinoLikeLogger = {
  level: string;
  child: (bindings?: Record<string, unknown>) => PinoLikeLogger;
  trace: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  fatal: (...args: unknown[]) => void;
};

export function getResolvedLoggerSettings(): LoggerResolvedSettings {
  return resolveSettings();
}

// Test helpers
export function setLoggerOverride(settings: LoggerSettings | null) {
  loggingState.overrideSettings = settings;
  loggingState.cachedLogger = null;
  loggingState.cachedSettings = null;
  loggingState.cachedConsoleSettings = null;
}

export function resetLogger() {
  loggingState.cachedLogger = null;
  loggingState.cachedSettings = null;
  loggingState.cachedConsoleSettings = null;
  loggingState.overrideSettings = null;
}

export function registerLogTransport(transport: LogTransport): () => void {
  externalTransports.add(transport);
  const logger = loggingState.cachedLogger as TsLogger<LogObj> | null;
  if (logger) {
    attachExternalTransport(logger, transport);
  }
  return () => {
    externalTransports.delete(transport);
  };
}

function getFileSize(filePath: string): number {
  try {
    const stat = fs.statSync(filePath);
    return stat.size;
  } catch {
    return 0;
  }
}

function rotateLogFile(filePath: string): string | null {
  try {
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);

    // Find next available segment number
    let segment = 1;
    while (segment <= MAX_LOG_SEGMENTS) {
      const segmentPath = path.join(dir, `${base}.${segment}${ext}`);
      if (!fs.existsSync(segmentPath)) {
        // Rotate current file to segment
        fs.renameSync(filePath, segmentPath);
        // Prune old segments if we exceed the limit
        pruneExcessSegments(dir, base, ext);
        return filePath; // Return original path for new writes
      }
      segment++;
    }

    // All segments full - rotate them (delete oldest, shift others)
    const oldestPath = path.join(dir, `${base}.${MAX_LOG_SEGMENTS}${ext}`);
    fs.rmSync(oldestPath, { force: true });
    for (let i = MAX_LOG_SEGMENTS - 1; i >= 1; i--) {
      const from = path.join(dir, `${base}.${i}${ext}`);
      const to = path.join(dir, `${base}.${i + 1}${ext}`);
      if (fs.existsSync(from)) {
        fs.renameSync(from, to);
      }
    }
    fs.renameSync(filePath, path.join(dir, `${base}.1${ext}`));
    return filePath;
  } catch {
    return null;
  }
}

function pruneExcessSegments(dir: string, base: string, ext: string): void {
  try {
    for (let i = MAX_LOG_SEGMENTS + 1; i <= MAX_LOG_SEGMENTS + 10; i++) {
      const segmentPath = path.join(dir, `${base}.${i}${ext}`);
      if (fs.existsSync(segmentPath)) {
        fs.rmSync(segmentPath, { force: true });
      } else {
        break;
      }
    }
  } catch {
    // ignore errors during pruning
  }
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultRollingPathForToday(): string {
  const today = formatLocalDate(new Date());
  return path.join(DEFAULT_LOG_DIR, `${LOG_PREFIX}-${today}${LOG_SUFFIX}`);
}

function isRollingPath(file: string): boolean {
  const base = path.basename(file);
  return (
    base.startsWith(`${LOG_PREFIX}-`) &&
    base.endsWith(LOG_SUFFIX) &&
    base.length === `${LOG_PREFIX}-YYYY-MM-DD${LOG_SUFFIX}`.length
  );
}

function pruneOldRollingLogs(dir: string): void {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const cutoff = Date.now() - MAX_LOG_AGE_MS;
    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }
      if (!entry.name.startsWith(`${LOG_PREFIX}-`) || !entry.name.endsWith(LOG_SUFFIX)) {
        continue;
      }
      const fullPath = path.join(dir, entry.name);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.mtimeMs < cutoff) {
          fs.rmSync(fullPath, { force: true });
        }
      } catch {
        // ignore errors during pruning
      }
    }
  } catch {
    // ignore missing dir or read errors
  }
}
