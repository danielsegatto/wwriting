import { useEffect, useMemo, useState } from 'react'
import {
  clearReports,
  getReportEntries,
  markReportsRead,
  subscribeToReports,
  type ReportEntry,
} from '../../lib/errors.ts'

function formatTimestamp(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    month: 'short',
    day: '2-digit',
  }).format(date)
}

function formatDetails(details: unknown): string | null {
  if (details === undefined) return null

  if (details instanceof Error) {
    return details.stack ?? details.message
  }

  if (typeof details === 'string') {
    return details
  }

  try {
    return JSON.stringify(
      details,
      (_, value) => {
        if (value instanceof Error) {
          return {
            name: value.name,
            message: value.message,
            stack: value.stack,
          }
        }

        return value
      },
      2,
    )
  } catch {
    return String(details)
  }
}

function severityClasses(severity: ReportEntry['severity']): string {
  if (severity === 'error') {
    return 'border-red-500/30 bg-red-500/10 text-red-200'
  }

  if (severity === 'warn') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-200'
  }

  return 'border-blue-500/30 bg-blue-500/10 text-blue-200'
}

export function ErrorConsole() {
  const [entries, setEntries] = useState<readonly ReportEntry[]>(() => getReportEntries())
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => subscribeToReports(setEntries), [])

  useEffect(() => {
    if (!isOpen) return

    markReportsRead()
  }, [isOpen, entries])

  const unreadErrors = useMemo(
    () => entries.filter((entry) => entry.severity === 'error' && !entry.read).length,
    [entries],
  )
  const unreadCount = useMemo(
    () => entries.filter((entry) => !entry.read).length,
    [entries],
  )
  const latestUnreadError = useMemo(
    () => [...entries].reverse().find((entry) => entry.severity === 'error' && !entry.read) ?? null,
    [entries],
  )
  const latestEntries = useMemo(() => [...entries].reverse(), [entries])
  const latestError = useMemo(
    () => [...entries].reverse().find((entry) => entry.severity === 'error') ?? null,
    [entries],
  )
  const statusToneClasses = unreadErrors > 0
    ? 'border-red-500/30 bg-red-500/10 text-red-200'
    : unreadCount > 0
      ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
      : 'border-zinc-800 bg-zinc-950/95 text-zinc-400'

  return (
    <>
      {latestUnreadError && (
        <div className="shrink-0 border-b border-red-500/30 bg-red-950/60 px-3 py-2">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-[0.18em] text-red-300">Runtime error</p>
              <p className="mt-1 text-sm text-red-50">{latestUnreadError.message}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setIsOpen(true)}
                className="rounded border border-red-400/30 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-red-100 hover:bg-red-400/10"
              >
                Open log
              </button>
              <button
                type="button"
                onClick={() => markReportsRead()}
                className="rounded border border-red-400/20 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-red-200/80 hover:bg-red-400/10 hover:text-red-100"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="shrink-0 border-t border-zinc-800 bg-zinc-950/95">
        <div className="flex items-center gap-2 px-3 py-2">
          <button
            type="button"
            onClick={() => setIsOpen((current) => !current)}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] transition hover:border-zinc-600 hover:text-zinc-100 ${statusToneClasses}`}
          >
            <span className="inline-block h-2 w-2 rounded-full bg-current" />
            {isOpen ? 'Hide log' : 'Show log'}
          </button>
          <div className="min-w-0 flex-1 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
            {entries.length === 0
              ? 'No events'
              : unreadErrors > 0
                ? `${unreadErrors} unread error${unreadErrors === 1 ? '' : 's'}`
                : unreadCount > 0
                  ? `${unreadCount} unread event${unreadCount === 1 ? '' : 's'}`
                  : `${entries.length} event${entries.length === 1 ? '' : 's'} logged`}
          </div>
          {latestError && (
            <div className="hidden min-w-0 max-w-[24rem] truncate text-right text-xs text-zinc-500 md:block">
              {latestError.message}
            </div>
          )}
          <button
            type="button"
            onClick={() => clearReports()}
            disabled={entries.length === 0}
            className="rounded border border-zinc-800 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500 hover:border-zinc-700 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Clear
          </button>
        </div>
        {isOpen && (
          <div className="max-h-64 overflow-y-auto border-t border-zinc-800 bg-zinc-950/90">
            {latestEntries.length === 0 ? (
              <div className="px-3 py-4 text-sm text-zinc-500">No events yet.</div>
            ) : (
              <div className="space-y-2 p-3">
                {latestEntries.map((entry) => {
                  const details = formatDetails(entry.details)

                  return (
                    <article
                      key={entry.id}
                      className={`rounded-2xl border px-3 py-3 ${severityClasses(entry.severity)}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-medium uppercase tracking-[0.18em]">
                            {entry.severity}
                            {!entry.read ? '  new' : ''}
                          </p>
                          <p className="mt-1 break-words text-sm text-zinc-50">{entry.message}</p>
                        </div>
                        <time className="shrink-0 text-[11px] text-zinc-400">
                          {formatTimestamp(entry.createdAt)}
                        </time>
                      </div>
                      {details && (
                        <pre className="mt-3 overflow-x-auto rounded-xl border border-black/20 bg-black/20 p-3 text-xs leading-5 whitespace-pre-wrap text-zinc-100">
                          {details}
                        </pre>
                      )}
                    </article>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
