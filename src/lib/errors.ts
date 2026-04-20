export const maxReportEntries = 200;

export type ReportSeverity = 'error' | 'warn' | 'info';

export type ReportEntry = {
  id: string;
  severity: ReportSeverity;
  message: string;
  details?: unknown;
  createdAt: string;
  read: boolean;
};

export type ReportListener = (entries: readonly ReportEntry[]) => void;

type GlobalErrorTarget = {
  addEventListener: (type: string, listener: (event: unknown) => void) => void;
};

type ErrorEventLike = {
  error?: unknown;
  message?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
};

type PromiseRejectionEventLike = {
  reason?: unknown;
};

let nextReportId = 0;
let entries: ReportEntry[] = [];
const listeners = new Set<ReportListener>();
const installedTargets = new WeakSet<object>();

export function report(
  severity: ReportSeverity,
  message: string,
  details?: unknown,
): ReportEntry {
  const entry: ReportEntry = {
    id: createReportId(),
    severity,
    message,
    details,
    createdAt: new Date().toISOString(),
    read: false,
  };

  entries = [...entries, entry].slice(-maxReportEntries);
  writeToConsole(entry);
  notifyListeners();

  return entry;
}

export function getReportEntries(): readonly ReportEntry[] {
  return entries;
}

export function subscribeToReports(listener: ReportListener): () => void {
  listeners.add(listener);
  listener(entries);

  return () => {
    listeners.delete(listener);
  };
}

export function markReportsRead(): void {
  if (entries.every((entry) => entry.read)) {
    return;
  }

  entries = entries.map((entry) => ({ ...entry, read: true }));
  notifyListeners();
}

export function clearReports(): void {
  if (entries.length === 0) {
    return;
  }

  entries = [];
  notifyListeners();
}

export function hasUnreadErrors(): boolean {
  return entries.some((entry) => entry.severity === 'error' && !entry.read);
}

export function installGlobalErrorHandlers(target: GlobalErrorTarget): void {
  if (installedTargets.has(target)) {
    return;
  }

  installedTargets.add(target);

  target.addEventListener('error', (event: unknown) => {
    const errorEvent = toErrorEventLike(event);

    report('error', errorEvent.message ?? 'Unhandled runtime error', {
      error: errorEvent.error,
      filename: errorEvent.filename,
      lineno: errorEvent.lineno,
      colno: errorEvent.colno,
    });
  });

  target.addEventListener('unhandledrejection', (event: unknown) => {
    const rejectionEvent = toPromiseRejectionEventLike(event);

    report('error', 'Unhandled promise rejection', {
      reason: rejectionEvent.reason,
    });
  });
}

function notifyListeners(): void {
  for (const listener of listeners) {
    listener(entries);
  }
}

function createReportId(): string {
  nextReportId += 1;

  const randomUuid = getRandomUuid();
  if (randomUuid !== null) {
    return randomUuid;
  }

  return `${Date.now().toString(36)}-${nextReportId.toString(36)}`;
}

function getRandomUuid(): string | null {
  const cryptoSource = globalThis.crypto;

  if (cryptoSource && typeof cryptoSource.randomUUID === 'function') {
    return cryptoSource.randomUUID();
  }

  return null;
}

function writeToConsole(entry: ReportEntry): void {
  const consoleMethod = getConsoleMethod(entry.severity);

  consoleMethod(`[${entry.severity}] ${entry.message}`, entry.details);
}

function getConsoleMethod(
  severity: ReportSeverity,
): (message: string, details?: unknown) => void {
  if (severity === 'error') {
    return console.error.bind(console);
  }

  if (severity === 'warn') {
    return console.warn.bind(console);
  }

  return console.info.bind(console);
}

function toErrorEventLike(event: unknown): ErrorEventLike {
  if (!isRecord(event)) {
    return {};
  }

  return {
    error: event.error,
    message: typeof event.message === 'string' ? event.message : undefined,
    filename: typeof event.filename === 'string' ? event.filename : undefined,
    lineno: typeof event.lineno === 'number' ? event.lineno : undefined,
    colno: typeof event.colno === 'number' ? event.colno : undefined,
  };
}

function toPromiseRejectionEventLike(event: unknown): PromiseRejectionEventLike {
  if (!isRecord(event)) {
    return {};
  }

  return {
    reason: event.reason,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
