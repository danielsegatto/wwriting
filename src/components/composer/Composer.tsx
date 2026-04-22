import { useCallback, useEffect, useRef, useState } from 'react'
import { createAppendPosition, createBlock } from '../../lib/blocks.ts'
import {
  blockPreviewCollapseThreshold,
  citationPickerPreviewLength,
} from '../../lib/constants.ts'
import { report } from '../../lib/errors.ts'
import {
  reconcileBlockReferences,
  searchCitationCandidates,
} from '../../lib/references.ts'
import type { CitationCandidate } from '../../lib/references.ts'
import { reconcileInlineTagsForBlock } from '../../lib/tags.ts'

type Props = {
  conversationId: string
  userId: string
  onBlockCreated?: (block: import('../../lib/blocks.ts').Block) => void
}

type CitationPickerState = {
  insertionIndex: number
}

const DIVIDER_RE = /^---+$/

function normalizePreviewBody(body: string): string {
  return body.replace(/\s+/g, ' ').trim()
}

function CitationCandidateRow({
  candidate,
  onSelect,
}: {
  candidate: CitationCandidate
  onSelect: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const normalizedBody = normalizePreviewBody(candidate.body)
  const isLongBody = normalizedBody.length > blockPreviewCollapseThreshold
  const visibleBody =
    isLongBody && !expanded
      ? `${normalizedBody.slice(0, citationPickerPreviewLength).trimEnd()}…`
      : normalizedBody || '[empty]'

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 px-3 py-3 hover:border-zinc-700 hover:bg-zinc-950">
      <button type="button" onClick={onSelect} className="w-full text-left">
        <p className="text-sm leading-6 text-zinc-100">{visibleBody}</p>
        <p className="mt-2 text-xs uppercase tracking-[0.2em] text-zinc-500">
          {candidate.conversationName}
        </p>
      </button>
      {isLongBody && (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            setExpanded((current) => !current)
          }}
          className="mt-2 text-xs font-medium text-blue-300 hover:text-blue-200"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}

export function Composer({ conversationId, userId, onBlockCreated }: Props) {
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [citationPicker, setCitationPicker] = useState<CitationPickerState | null>(null)
  const [citationQuery, setCitationQuery] = useState('')
  const [citationCandidates, setCitationCandidates] = useState<CitationCandidate[]>([])
  const [citationPickerBusy, setCitationPickerBusy] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

  function resizeTextarea() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  useEffect(() => {
    resizeTextarea()
  }, [body])

  const focusTextarea = useCallback((cursorPosition?: number) => {
    window.requestAnimationFrame(() => {
      const textarea = textareaRef.current
      if (!textarea) return
      textarea.focus()
      if (cursorPosition !== undefined) {
        textarea.setSelectionRange(cursorPosition, cursorPosition)
      }
      resizeTextarea()
    })
  }, [])

  const closeCitationPicker = useCallback((cursorPosition?: number) => {
    setCitationPicker(null)
    setCitationQuery('')
    setCitationCandidates([])
    setCitationPickerBusy(false)
    focusTextarea(cursorPosition)
  }, [focusTextarea])

  useEffect(() => {
    if (!citationPicker) return

    let cancelled = false

    searchCitationCandidates(userId, citationQuery)
      .then((nextCandidates) => {
        if (!cancelled) {
          setCitationCandidates(nextCandidates)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          report('error', 'Failed to load citation candidates', error)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCitationPickerBusy(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [citationPicker, citationQuery, userId])

  useEffect(() => {
    if (!citationPicker) return

    function closeIfOutside(event: MouseEvent) {
      const target = event.target
      if (!(target instanceof Node)) return
      if (pickerRef.current?.contains(target)) return
      if (textareaRef.current?.contains(target)) return
      closeCitationPicker()
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeCitationPicker()
      }
    }

    document.addEventListener('mousedown', closeIfOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', closeIfOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [citationPicker, closeCitationPicker])

  function openCitationPicker(insertionIndex: number) {
    setCitationPickerBusy(true)
    setCitationQuery('')
    setCitationCandidates([])
    setCitationPicker({ insertionIndex })
  }

  function insertCitationToken(candidate: CitationCandidate) {
    if (!citationPicker) return

    const token = `{{block:${candidate.id}}}`
    const nextBody =
      body.slice(0, citationPicker.insertionIndex) +
      token +
      body.slice(citationPicker.insertionIndex)
    const nextCursorPosition = citationPicker.insertionIndex + token.length

    setBody(nextBody)
    closeCitationPicker(nextCursorPosition)
  }

  async function handleSend() {
    const trimmed = body.trim()
    if (!trimmed || sending) return

    setSending(true)
    try {
      const type = DIVIDER_RE.test(trimmed) ? 'divider' : 'text'
      const position = createAppendPosition()

      const block = await createBlock({ conversationId, userId, body: trimmed, position, type })
      onBlockCreated?.(block)

      await Promise.all([
        reconcileInlineTagsForBlock(block.id, trimmed, userId),
        reconcileBlockReferences(block.id, trimmed),
      ])

      setBody('')
      const el = textareaRef.current
      if (el) {
        el.style.height = 'auto'
        el.focus()
      }
    } catch (err) {
      report('error', 'Failed to send block', err)
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
      return
    }

    if (
      e.key === '@' &&
      !e.altKey &&
      !e.ctrlKey &&
      !e.metaKey &&
      textareaRef.current
    ) {
      const cursorPosition = textareaRef.current.selectionStart
      const previousCharacter = cursorPosition > 0 ? body[cursorPosition - 1] : ''

      if (cursorPosition === 0 || /\s/.test(previousCharacter)) {
        e.preventDefault()
        openCitationPicker(cursorPosition)
      }
    }
  }

  const isEmpty = body.trim() === ''

  return (
    <div className="relative flex items-end gap-2 p-4">
      {citationPicker && (
        <div
          ref={pickerRef}
          className="absolute bottom-[calc(100%+0.75rem)] left-4 right-4 z-20 rounded-3xl border border-zinc-700 bg-zinc-900 p-3 shadow-2xl shadow-black/40"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-zinc-100">Cite a Block</p>
            <button
              type="button"
              onClick={() => closeCitationPicker()}
              className="rounded-full p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
              aria-label="Close citation picker"
            >
              <CloseIcon />
            </button>
          </div>
          <input
            autoFocus
            value={citationQuery}
            onChange={(event) => {
              setCitationPickerBusy(true)
              setCitationQuery(event.target.value)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                closeCitationPicker()
                return
              }

              if (event.key === 'Enter' && citationCandidates.length > 0) {
                event.preventDefault()
                insertCitationToken(citationCandidates[0])
              }
            }}
            placeholder="Search blocks by text"
            className="mt-3 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-blue-500"
          />
          <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
            {citationCandidates.map((candidate) => (
              <CitationCandidateRow
                key={candidate.id}
                candidate={candidate}
                onSelect={() => insertCitationToken(candidate)}
              />
            ))}
            {!citationPickerBusy && citationCandidates.length === 0 && (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 px-3 py-4 text-sm text-zinc-500">
                No text Blocks found.
              </div>
            )}
          </div>
          {citationPickerBusy && (
            <p className="mt-3 text-xs uppercase tracking-[0.2em] text-zinc-500">
              Loading Blocks…
            </p>
          )}
        </div>
      )}
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onInput={resizeTextarea}
        onKeyDown={handleKeyDown}
        placeholder="Write something..."
        rows={1}
        className="flex-1 resize-none overflow-y-auto rounded-[18px] border border-zinc-700 bg-zinc-800 px-3.5 py-2 text-[15px] text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-blue-500 focus:bg-zinc-900"
        style={{ minHeight: '38px', maxHeight: '180px' }}
      />
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => void handleSend()}
        disabled={isEmpty || sending}
        className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-blue-600 text-white transition hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500"
        aria-label="Send"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M8 13V3M8 3L4 7M8 3L12 7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  )
}

function CloseIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="2" y1="2" x2="10" y2="10" />
      <line x1="10" y1="2" x2="2" y2="10" />
    </svg>
  )
}
