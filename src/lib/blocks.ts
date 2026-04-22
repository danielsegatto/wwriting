import { supabase } from './supabase.ts'
import { report } from './errors.ts'
import type { Database, BlockType } from '../db/types.ts'

export type Block = Database['public']['Tables']['blocks']['Row']

export function createAppendPosition(): string {
  return Date.now().toString()
}

export function createSequentialPositions(count: number, startAt = Date.now()): string[] {
  return Array.from({ length: count }, (_, index) => (startAt + index).toString())
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

export async function reorderBlocks(blocks: Block[]): Promise<Block[]> {
  if (blocks.length <= 1) return blocks

  const positions = createSequentialPositions(blocks.length)
  const updates = blocks.map((block, index) => ({
    id: block.id,
    user_id: block.user_id,
    conversation_id: block.conversation_id,
    type: block.type,
    body: block.body,
    position: positions[index],
  }))

  const { data, error } = await supabase
    .from('blocks')
    .upsert(updates, { onConflict: 'id' })
    .select()

  if (error) {
    report('error', 'Failed to reorder blocks', error)
    throw error
  }

  const rowsById = new Map(data.map((row) => [row.id, row]))

  return updates.map((update) => rowsById.get(update.id) ?? {
    ...blocks.find((block) => block.id === update.id)!,
    position: update.position,
  })
}
