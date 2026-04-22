import { supabase } from './supabase.ts'
import { report } from './errors.ts'
import type { Database, BlockType } from '../db/types.ts'

export type Block = Database['public']['Tables']['blocks']['Row']

export function createAppendPosition(): string {
  return Date.now().toString()
}

export async function listBlocks(conversationId: string): Promise<Block[]> {
  const { data, error } = await supabase
    .from('blocks')
    .select()
    .eq('conversation_id', conversationId)
    .order('position', { ascending: true })

  if (error) {
    report('error', 'Failed to list blocks', error)
    throw error
  }

  return data
}

export async function createBlock(params: {
  conversationId: string
  userId: string
  body: string
  position: string
  type?: BlockType
}): Promise<Block> {
  const { data, error } = await supabase
    .from('blocks')
    .insert({
      conversation_id: params.conversationId,
      user_id: params.userId,
      body: params.body,
      position: params.position,
      type: params.type ?? 'text',
    })
    .select()
    .single()

  if (error) {
    report('error', 'Failed to create block', error)
    throw error
  }

  return data
}

export async function updateBlock(params: {
  blockId: string
  body: string
}): Promise<Block> {
  const { data, error } = await supabase
    .from('blocks')
    .update({
      body: params.body,
    })
    .eq('id', params.blockId)
    .select()
    .single()

  if (error) {
    report('error', 'Failed to update block', error)
    throw error
  }

  return data
}

export async function deleteBlock(blockId: string): Promise<void> {
  const { error } = await supabase
    .from('blocks')
    .delete()
    .eq('id', blockId)

  if (error) {
    report('error', 'Failed to delete block', error)
    throw error
  }
}

export async function moveBlockToConversation(params: {
  blockId: string
  conversationId: string
  position: string
}): Promise<Block> {
  const { data, error } = await supabase
    .from('blocks')
    .update({
      conversation_id: params.conversationId,
      position: params.position,
    })
    .eq('id', params.blockId)
    .select()
    .single()

  if (error) {
    report('error', 'Failed to move block', error)
    throw error
  }

  return data
}
