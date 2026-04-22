import { useRef, useState } from 'react'
import { createBlock } from '../../lib/blocks.ts'
import { findOrCreateTag, attachTagsToBlock } from '../../lib/tags.ts'
import { report } from '../../lib/errors.ts'

type Props = {
  conversationId: string
  userId: string
}

const HASHTAG_RE = /(?:^|\s)#([a-zA-Z0-9_]+)/g
const DIVIDER_RE = /^---+$/

export function Composer({ conversationId, userId }: Props) {
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function handleInput() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  async function handleSend() {
    const trimmed = body.trim()
    if (!trimmed || sending) return

    setSending(true)
    try {
      const type = DIVIDER_RE.test(trimmed) ? 'divider' : 'text'
      const position = Date.now().toString()

      const block = await createBlock({ conversationId, userId, body: trimmed, position, type })

      const tagNames = [...trimmed.matchAll(HASHTAG_RE)].map((m) => m[1])
      if (tagNames.length > 0) {
        const tags = await Promise.all(tagNames.map((name) => findOrCreateTag(name, userId)))
        await attachTagsToBlock(block.id, tags.map((t) => t.id))
      }

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
    }
  }

  const isEmpty = body.trim() === ''

  return (
    <div className="flex items-end gap-2 p-4">
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onInput={handleInput}
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
