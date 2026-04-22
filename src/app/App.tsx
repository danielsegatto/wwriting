import { useEffect, useState, useCallback } from 'react'
import type { Session } from '@supabase/supabase-js'
import { AuthGate } from './AuthGate.tsx'
import { Composer } from '../components/composer/Composer.tsx'
import { BlockFeed } from '../components/feed/BlockFeed.tsx'
import { Sidebar } from '../components/sidebar/Sidebar.tsx'
import { ensureDefaultConversation } from '../lib/conversations.ts'
import { listBlocks } from '../lib/blocks.ts'
import type { Block } from '../lib/blocks.ts'
import { report } from '../lib/errors.ts'

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
  const [blocks, setBlocks] = useState<Block[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // Bootstrap default conversation on first load
  useEffect(() => {
    ensureDefaultConversation(session.user.id)
      .then(setConversationId)
      .catch((err) => report('error', 'Failed to bootstrap conversation', err))
  }, [session.user.id])

  // Reload blocks whenever the selected conversation changes
  useEffect(() => {
    if (!conversationId) return
    listBlocks(conversationId)
      .then(setBlocks)
      .catch((err) => report('error', 'Failed to load blocks', err))
  }, [conversationId])

  const handleBlockCreated = useCallback((block: Block) => {
    setBlocks((prev) => [...prev, block])
  }, [])

  const handleSelectConversation = useCallback((id: string) => {
    setBlocks([])
    setConversationId(id)
  }, [])

  const handleConversationDeleted = useCallback((nextConversationId: string | null) => {
    setConversationId(nextConversationId)
    setBlocks([])
  }, [])

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
      <div className="flex flex-1 flex-col min-w-0">
        <div className="flex items-center px-3 py-2 border-b border-zinc-800">
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
          >
            <MenuIcon />
          </button>
        </div>
        {conversationId ? (
          <>
            <BlockFeed blocks={blocks} />
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
