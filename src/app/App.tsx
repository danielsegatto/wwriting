import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { AuthGate } from './AuthGate.tsx'
import { Composer } from '../components/composer/Composer.tsx'
import { BlockFeed } from '../components/feed/BlockFeed.tsx'
import { Sidebar } from '../components/sidebar/Sidebar.tsx'
import { ErrorConsole } from '../components/system/ErrorConsole.tsx'
import { highlightDurationMs } from '../lib/constants.ts'
import { ensureDefaultConversation, getConversation } from '../lib/conversations.ts'
import { createAppendPosition, createBlock, listBlocks } from '../lib/blocks.ts'
import type { Block, ClientBlock } from '../lib/blocks.ts'
import type { BlockType } from '../db/types.ts'
import {
  createConversationMarkdownFilename,
  serializeConversationToMarkdown,
} from '../lib/conversationMarkdown.ts'
import { report } from '../lib/errors.ts'
import { loadCitationTargetsForBlocks, reconcileBlockReferences } from '../lib/references.ts'
import type { CitationTarget } from '../lib/references.ts'
import { supabase } from '../lib/supabase.ts'
import { reconcileInlineTagsForBlock } from '../lib/tags.ts'

const sendRetryDelaysMs = [400, 1200, 3000]

function toClientBlock(block: Block): ClientBlock {
  return {
    ...block,
    syncStatus: 'synced',
    syncErrorMessage: null,
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

async function createBlockWithRetry(params: {
  conversationId: string
  userId: string
  body: string
  position: string
  type: BlockType
}): Promise<Block> {
  let lastError: unknown

  for (let attempt = 0; attempt <= sendRetryDelaysMs.length; attempt += 1) {
    try {
      return await createBlock(params)
    } catch (error) {
      lastError = error

      if (attempt === sendRetryDelaysMs.length) break
      await wait(sendRetryDelaysMs[attempt])
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to create block')
}

async function reconcileBlockMetadataWithRetry(blockId: string, body: string, userId: string): Promise<void> {
  let lastError: unknown

  for (let attempt = 0; attempt <= sendRetryDelaysMs.length; attempt += 1) {
    try {
      await Promise.all([
        reconcileInlineTagsForBlock(blockId, body, userId),
        reconcileBlockReferences(blockId, body),
      ])
      return
    } catch (error) {
      lastError = error

      if (attempt === sendRetryDelaysMs.length) break
      await wait(sendRetryDelaysMs[attempt])
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to reconcile block metadata')
}

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
  const [blocks, setBlocks] = useState<ClientBlock[]>([])
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
          setBlocks(nextBlocks.map(toClientBlock))
        }
      })
      .catch((err) => report('error', 'Failed to load blocks', err))

    return () => {
      cancelled = true
    }
  }, [conversationId])

  // Realtime sync for blocks in the current conversation
  useEffect(() => {
    if (!conversationId) return

    const channel = supabase
      .channel(`blocks:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'blocks',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const block = toClientBlock(payload.new as Block)
            setBlocks((prev) => {
              const existingIndex = prev.findIndex((b) => b.id === block.id)
              if (existingIndex >= 0) {
                const next = [...prev]
                next[existingIndex] = {
                  ...prev[existingIndex],
                  ...block,
                }
                return next
              }

              const next = [...prev, block]
              next.sort((a, b) => (a.position > b.position ? 1 : a.position < b.position ? -1 : 0))
              return next
            })
          } else if (payload.eventType === 'UPDATE') {
            const block = toClientBlock(payload.new as Block)
            if (block.conversation_id !== conversationId) {
              // Block was moved to another conversation — remove it
              setBlocks((prev) => prev.filter((b) => b.id !== block.id))
            } else {
              setBlocks((prev) =>
                prev.map((b) =>
                  b.id === block.id
                    ? {
                        ...b,
                        ...block,
                      }
                    : b,
                ),
              )
            }
          } else if (payload.eventType === 'DELETE') {
            const blockId = (payload.old as { id: string }).id
            setBlocks((prev) => prev.filter((b) => b.id !== blockId))
          }
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          report('warn', 'Block realtime subscription error — changes from other devices will not appear live')
        }
      })

    return () => {
      supabase.removeChannel(channel)
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

  const persistOptimisticBlock = useCallback(async (optimisticBlock: ClientBlock) => {
    try {
      const persistedBlock = await createBlockWithRetry({
        conversationId: optimisticBlock.conversation_id,
        userId: optimisticBlock.user_id,
        body: optimisticBlock.body ?? '',
        position: optimisticBlock.position,
        type: optimisticBlock.type,
      })

      setBlocks((prev) => {
        const tempIndex = prev.findIndex((block) => block.id === optimisticBlock.id)
        const nextBlock = toClientBlock(persistedBlock)

        if (tempIndex === -1) {
          if (prev.some((block) => block.id === persistedBlock.id)) {
            return prev
          }

          return prev
        }

        const next = [...prev]
        const existingRealIndex = next.findIndex((block) => block.id === persistedBlock.id)
        if (existingRealIndex >= 0) {
          next.splice(tempIndex, 1)
          next[existingRealIndex > tempIndex ? existingRealIndex - 1 : existingRealIndex] = {
            ...next[existingRealIndex > tempIndex ? existingRealIndex - 1 : existingRealIndex],
            ...nextBlock,
          }
          return next
        }

        next[tempIndex] = nextBlock
        return next
      })

      try {
        await reconcileBlockMetadataWithRetry(
          persistedBlock.id,
          persistedBlock.body ?? '',
          persistedBlock.user_id,
        )
      } catch (error) {
        report('warn', 'Block saved but tag/reference sync is still pending', error)
      }
    } catch (error) {
      setBlocks((prev) =>
        prev.map((block) =>
          block.id === optimisticBlock.id
            ? {
                ...block,
                syncStatus: 'failed',
                syncErrorMessage:
                  error instanceof Error ? error.message : 'Send failed after retrying',
              }
            : block,
        ),
      )
      report('error', 'Failed to send block', error)
    }
  }, [])

  const handleSendBlock = useCallback((body: string) => {
    if (!conversationId) return

    const type: BlockType = /^---+$/.test(body) ? 'divider' : 'text'
    const optimisticBlock: ClientBlock = {
      id: `local:${crypto.randomUUID()}`,
      user_id: session.user.id,
      conversation_id: conversationId,
      type,
      body,
      position: createAppendPosition(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      syncStatus: 'syncing',
      syncErrorMessage: null,
    }

    setBlocks((prev) => [...prev, optimisticBlock])
    void persistOptimisticBlock(optimisticBlock)
  }, [conversationId, persistOptimisticBlock, session.user.id])

  const handleRetryBlock = useCallback((blockId: string) => {
    setBlocks((prev) => {
      const target = prev.find((block) => block.id === blockId)
      if (!target || target.syncStatus !== 'failed') return prev

      void persistOptimisticBlock({
        ...target,
        syncStatus: 'syncing',
        syncErrorMessage: null,
      })

      return prev.map((block) =>
        block.id === blockId
          ? {
              ...block,
              syncStatus: 'syncing',
              syncErrorMessage: null,
            }
          : block,
      )
    })
  }, [persistOptimisticBlock])

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
              onRetryBlock={handleRetryBlock}
              onJumpToBlock={handleJumpToBlock}
            />
            <Composer
              userId={session.user.id}
              onSendBlock={handleSendBlock}
            />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center" />
        )}
        <ErrorConsole />
      </div>
    </div>
  )
}
