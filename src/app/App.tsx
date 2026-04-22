import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { AuthGate } from './AuthGate.tsx'
import { Composer } from '../components/composer/Composer.tsx'
import { ensureDefaultConversation } from '../lib/conversations.ts'
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

  useEffect(() => {
    ensureDefaultConversation(session.user.id)
      .then(setConversationId)
      .catch((err) => report('error', 'Failed to bootstrap conversation', err))
  }, [session.user.id])

  if (!conversationId) {
    return <div className="flex h-screen items-center justify-center bg-zinc-950" />
  }

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      <div className="flex-1" />
      <Composer conversationId={conversationId} userId={session.user.id} />
    </div>
  )
}
