import { useEffect, useState, useCallback } from 'react'
import type { Session } from '@supabase/supabase-js'
import { AuthGate } from './AuthGate.tsx'
import { Composer } from '../components/composer/Composer.tsx'
import { BlockFeed } from '../components/feed/BlockFeed.tsx'
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

  useEffect(() => {
    ensureDefaultConversation(session.user.id)
      .then((id) => {
        setConversationId(id)
        return listBlocks(id)
      })
      .then(setBlocks)
      .catch((err) => report('error', 'Failed to load conversation', err))
  }, [session.user.id])

  const handleBlockCreated = useCallback((block: Block) => {
    setBlocks((prev) => [...prev, block])
  }, [])

  if (!conversationId) {
    return <div className="flex h-screen items-center justify-center bg-zinc-950" />
  }

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      <BlockFeed blocks={blocks} />
      <Composer
        conversationId={conversationId}
        userId={session.user.id}
        onBlockCreated={handleBlockCreated}
      />
    </div>
  )
}