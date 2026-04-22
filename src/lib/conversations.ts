import { supabase } from './supabase.ts'
import { report } from './errors.ts'

export async function ensureDefaultConversation(userId: string): Promise<string> {
  const { data: existing, error: fetchError } = await supabase
    .from('conversations')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (fetchError) {
    report('error', 'Failed to fetch conversations', fetchError)
    throw fetchError
  }

  if (existing) return existing.id

  // No conversations yet — bootstrap a default folder and conversation
  const position = Date.now().toString()

  const { data: folder, error: folderError } = await supabase
    .from('folders')
    .insert({ user_id: userId, name: 'Journal', position })
    .select('id')
    .single()

  if (folderError) {
    report('error', 'Failed to create default folder', folderError)
    throw folderError
  }

  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .insert({ user_id: userId, folder_id: folder.id, name: 'My Notes', position })
    .select('id')
    .single()

  if (convError) {
    report('error', 'Failed to create default conversation', convError)
    throw convError
  }

  return conversation.id
}
