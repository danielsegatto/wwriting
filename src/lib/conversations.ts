import { supabase } from './supabase.ts'
import { report } from './errors.ts'
import { createSequentialPositions } from './blocks.ts'
import type { Database } from '../db/types.ts'

export type Conversation = Database['public']['Tables']['conversations']['Row']

export async function listConversations(userId: string): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select()
    .eq('user_id', userId)
    .order('position', { ascending: true })

  if (error) {
    report('error', 'Failed to list conversations', error)
    throw error
  }

  return data
}

export async function getConversation(conversationId: string): Promise<Conversation | null> {
  const { data, error } = await supabase
    .from('conversations')
    .select()
    .eq('id', conversationId)
    .maybeSingle()

  if (error) {
    report('error', 'Failed to fetch conversation', error)
    throw error
  }

  return data
}

export async function createConversation(
  userId: string,
  folderId: string,
  name: string,
): Promise<Conversation> {
  const { data, error } = await supabase
    .from('conversations')
    .insert({ user_id: userId, folder_id: folderId, name, position: Date.now().toString() })
    .select()
    .single()

  if (error) {
    report('error', 'Failed to create conversation', error)
    throw error
  }

  return data
}

export async function reorderConversations(conversations: Conversation[]): Promise<void> {
  if (conversations.length <= 1) return

  const positions = createSequentialPositions(conversations.length)
  const updates = conversations.map((conv, index) => ({
    id: conv.id,
    user_id: conv.user_id,
    folder_id: conv.folder_id,
    name: conv.name,
    position: positions[index],
  }))

  const { error } = await supabase
    .from('conversations')
    .upsert(updates, { onConflict: 'id' })

  if (error) {
    report('error', 'Failed to reorder conversations', error)
    throw error
  }
}

export async function deleteConversation(conversationId: string): Promise<void> {
  const { error } = await supabase
    .from('conversations')
    .delete()
    .eq('id', conversationId)

  if (error) {
    report('error', 'Failed to delete conversation', error)
    throw error
  }
}

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
