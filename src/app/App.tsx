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
import { report } from '../lib/errors.ts'
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

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100">
      {sidebarOpen && (
        <Sidebar
          userId={session.user.id}
          selectedConversationId={conversationId}
          onSelectConversation={(id) => { handleSelectConversation(id); setSidebarOpen(false) }}
          onConversationDeleted={handleConversationDeleted}
          onClose={() => setSidebarOpen(false)}
        />
      )}
      <div className="relative flex min-w-0 flex-1 flex-col">
        {sidebarOpen && (
          <button
            type="button"
            aria-label="Close sidebar"
            onClick={() => setSidebarOpen(false)}
            className="absolute inset-0 z-10 cursor-default"
          />
        )}
        <div className="flex items-center px-3 py-2 border-b border-zinc-800">
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
