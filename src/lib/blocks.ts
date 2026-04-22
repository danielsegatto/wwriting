import { supabase } from './supabase.ts'
import { report } from './errors.ts'
import type { Database, BlockType } from '../db/types.ts'

export type Block = Database['public']['Tables']['blocks']['Row']

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
