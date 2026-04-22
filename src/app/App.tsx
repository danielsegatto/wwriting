import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { AuthGate } from './AuthGate.tsx'
import { Composer } from '../components/composer/Composer.tsx'
import { BlockFeed } from '../components/feed/BlockFeed.tsx'
import { Sidebar } from '../components/sidebar/Sidebar.tsx'
import { highlightDurationMs } from '../lib/constants.ts'
import { ensureDefaultConversation, getConversation } from '../lib/conversations.ts'
import { listBlocks } from '../lib/blocks.ts'
import type { Block } from '../lib/blocks.ts'
import {
  createConversationMarkdownFilename,
  serializeConversationToMarkdown,
} from '../lib/conversationMarkdown.ts'
import { report } from '../lib/errors.ts'
import { loadCitationTargetsForBlocks } from '../lib/references.ts'
import type { CitationTarget } from '../lib/references.ts'

function MenuIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="2" y1="4" x2="14" y2="4" />
      <line x1="2" y1="8" x2="14" y2="8" />
      <line x1="2" y1="12" x2="14" y2="12" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="3" width="8" height="10" rx="1.5" />
      <path d="M3 11V5.5A1.5 1.5 0 0 1 4.5 4H5" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2.5v7" />
      <path d="m5.5 7.5 2.5 2.5 2.5-2.5" />
      <path d="M3 12.5h10" />
    </svg>
  )
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()

  try {
    const copied = document.execCommand('copy')
    if (!copied) {
      throw new Error('document.execCommand("copy") returned false')
    }
  } finally {
    document.body.removeChild(textarea)
  }
}

function downloadTextFile(filename: string, text: string, mimeType: string): void {
  const blob = new Blob([text], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()

  window.setTimeout(() => {
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  }, 100)
}

export function App() {
  return (
    <AuthGate>
      {(session) => <AppShell session={session} />}
    </AuthGate>
  )
}

function AppShell({ session }: { session: Session }) {
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [conversationTitle, setConversationTitle] = useState<string>('—')
  const [blocks, setBlocks] = useState<Block[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [pendingJumpTarget, setPendingJumpTarget] = useState<{
    blockId: string
    conversationId: string
  } | null>(null)
  const [highlightedBlock, setHighlightedBlock] = useState<{
    blockId: string
    version: number
  } | null>(null)
  const [exportFeedback, setExportFeedback] = useState<'copied' | 'downloaded' | null>(null)

  // Bootstrap default conversation on first load
  useEffect(() => {
    ensureDefaultConversation(session.user.id)
      .then(setConversationId)
      .catch((err) => report('error', 'Failed to bootstrap conversation', err))
  }, [session.user.id])

  // Reload blocks whenever the selected conversation changes
  useEffect(() => {
    if (!conversationId) return
    let cancelled = false

    listBlocks(conversationId)
      .then((nextBlocks) => {
        if (!cancelled) {
          setBlocks(nextBlocks)
        }
      })
      .catch((err) => report('error', 'Failed to load blocks', err))

    return () => {
      cancelled = true
    }
  }, [conversationId])

  useEffect(() => {
    if (!conversationId) return

    let cancelled = false

    getConversation(conversationId)
      .then((conversation) => {
        if (!cancelled) {
          setConversationTitle(conversation?.name ?? 'Untitled conversation')
        }
      })
      .catch(() => {
        if (!cancelled) setConversationTitle('Untitled conversation')
      })

    return () => {
      cancelled = true
    }
  }, [conversationId])

  const handleBlockCreated = useCallback((block: Block) => {
    setBlocks((prev) => [...prev, block])
  }, [])

  const handleSelectConversation = useCallback((id: string) => {
    setBlocks([])
    setConversationTitle('—')
    setConversationId(id)
  }, [])

  const handleConversationDeleted = useCallback((nextConversationId: string | null) => {
    setConversationTitle('—')
    setConversationId(nextConversationId)
    setBlocks([])
  }, [])

  const handleJumpToBlock = useCallback((target: CitationTarget) => {
    if (target.deleted || !target.conversationId) return

    setPendingJumpTarget({
      blockId: target.id,
      conversationId: target.conversationId,
    })

    if (conversationId !== target.conversationId) {
      handleSelectConversation(target.conversationId)
      setSidebarOpen(false)
    }
  }, [conversationId, handleSelectConversation])

  useEffect(() => {
    if (!pendingJumpTarget) return
    if (conversationId !== pendingJumpTarget.conversationId) return
    if (!blocks.some((block) => block.id === pendingJumpTarget.blockId)) return

    const frameId = window.requestAnimationFrame(() => {
      setHighlightedBlock((current) => ({
        blockId: pendingJumpTarget.blockId,
        version: (current?.version ?? 0) + 1,
      }))
      setPendingJumpTarget(null)
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [blocks, conversationId, pendingJumpTarget])

  useEffect(() => {
    if (!highlightedBlock) return

    const { version } = highlightedBlock
    const timeoutId = window.setTimeout(() => {
      setHighlightedBlock((current) => (current?.version === version ? null : current))
    }, highlightDurationMs)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [highlightedBlock])

  useEffect(() => {
    if (!exportFeedback) return

    const timeoutId = window.setTimeout(() => {
      setExportFeedback((current) => (current === exportFeedback ? null : current))
    }, 1800)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [exportFeedback])

  const buildConversationMarkdown = useCallback(async () => {
    if (!conversationId) {
      throw new Error('No conversation selected for export')
    }

    const citationTargetsById = await loadCitationTargetsForBlocks(blocks)
    const markdown = serializeConversationToMarkdown({
      conversationName: conversationTitle === '—' ? 'Untitled conversation' : conversationTitle,
      blocks,
      citationTargetsById,
      appBaseUrl: window.location.origin,
    })

    return {
      markdown,
      filename: createConversationMarkdownFilename(
        conversationTitle === '—' ? 'Untitled conversation' : conversationTitle,
      ),
    }
  }, [blocks, conversationId, conversationTitle])

  const handleCopyConversation = useCallback(async () => {
    try {
      const { markdown } = await buildConversationMarkdown()
      await copyTextToClipboard(markdown)
      setExportFeedback('copied')
      report('info', 'Copied conversation as Markdown')
    } catch (err) {
      report('error', 'Failed to copy conversation as Markdown', err)
    }
  }, [buildConversationMarkdown])

  const handleDownloadConversation = useCallback(async () => {
    try {
      const { markdown, filename } = await buildConversationMarkdown()
      downloadTextFile(filename, markdown, 'text/markdown;charset=utf-8')
      setExportFeedback('downloaded')
      report('info', 'Downloaded conversation as Markdown')
    } catch (err) {
      report('error', 'Failed to download conversation as Markdown', err)
    }
  }, [buildConversationMarkdown])

  return (
    <div className="flex h-dvh min-h-0 w-full overflow-hidden bg-zinc-950 text-zinc-100">
      {sidebarOpen && (
        <Sidebar
          userId={session.user.id}
          selectedConversationId={conversationId}
          onSelectConversation={(id) => { handleSelectConversation(id); setSidebarOpen(false) }}
          onConversationDeleted={handleConversationDeleted}
          onClose={() => setSidebarOpen(false)}
        />
      )}
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {sidebarOpen && (
          <button
            type="button"
            aria-label="Close sidebar"
            onClick={() => setSidebarOpen(false)}
            className="absolute inset-0 z-10 cursor-default"
          />
        )}
        <div className="flex shrink-0 items-center border-b border-zinc-800 px-3 py-2">
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            className="relative z-20 rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
          >
            <MenuIcon />
          </button>
          <div className="relative z-20 ml-2 min-w-0 flex-1 truncate text-sm font-medium text-zinc-100">
            {conversationTitle}
          </div>
          <div className="relative z-20 ml-3 flex items-center gap-1">
            <button
              type="button"
              aria-label="Copy conversation as Markdown"
              title="Copy conversation as Markdown"
              disabled={!conversationId}
              onClick={() => { void handleCopyConversation() }}
              className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <CopyIcon />
            </button>
            <button
              type="button"
              aria-label="Download conversation as Markdown"
              title="Download conversation as Markdown"
              disabled={!conversationId}
              onClick={() => { void handleDownloadConversation() }}
              className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <DownloadIcon />
            </button>
            <div className="min-w-[4.5rem] text-right text-[11px] uppercase tracking-[0.18em] text-zinc-500">
              {exportFeedback === 'copied' ? 'Copied' : exportFeedback === 'downloaded' ? 'Saved' : ''}
            </div>
          </div>
        </div>
        {conversationId ? (
          <>
            <BlockFeed
              blocks={blocks}
              userId={session.user.id}
              conversationId={conversationId}
              highlightedBlockId={highlightedBlock?.blockId ?? null}
              highlightedBlockVersion={highlightedBlock?.version ?? 0}
              onBlocksReordered={(nextBlocks) => {
                setBlocks(nextBlocks)
              }}
              onBlockUpdated={(updatedBlock) => {
                setBlocks((prev) =>
                  prev.map((block) => (block.id === updatedBlock.id ? updatedBlock : block)),
                )
              }}
              onBlockRemoved={(blockId) => {
                setBlocks((prev) => prev.filter((block) => block.id !== blockId))
              }}
              onJumpToBlock={handleJumpToBlock}
            />
            <Composer
              conversationId={conversationId}
              userId={session.user.id}
              onBlockCreated={handleBlockCreated}
            />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center" />
        )}
      </div>
    </div>
  )
}
