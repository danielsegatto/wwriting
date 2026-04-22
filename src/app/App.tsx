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

  // Bootstrap default conversation on first load
  useEffect(() => {
    ensureDefaultConversation(session.user.id)
      .then(setConversationId)
      .catch((err) => report('error', 'Failed to bootstrap conversation', err))
  }, [session.user.id])

  // Reload blocks whenever the selected conversation changes
  useEffect(() => {
    if (!conversationId) return
    setBlocks([])
    listBlocks(conversationId)
      .then(setBlocks)
      .catch((err) => report('error', 'Failed to load blocks', err))
  }, [conversationId])

  const handleBlockCreated = useCallback((block: Block) => {
    setBlocks((prev) => [...prev, block])
  }, [])

  const handleSelectConversation = useCallback((id: string) => {
    setConversationId(id)
  }, [])

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100">
      <Sidebar
        userId={session.user.id}
        selectedConversationId={conversationId}
        onSelectConversation={handleSelectConversation}
      />
      <div className="flex flex-1 flex-col min-w-0">
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
