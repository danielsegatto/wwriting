import { supabase } from './supabase.ts'
import { report } from './errors.ts'
import type { Database } from '../db/types.ts'

export type Tag = Database['public']['Tables']['tags']['Row']

export async function findOrCreateTag(name: string, userId: string): Promise<Tag> {
  const normalized = name.toLowerCase()

  const { data: existing, error: findError } = await supabase
    .from('tags')
    .select()
    .eq('user_id', userId)
    .eq('name', normalized)
    .maybeSingle()

  if (findError) {
    report('error', 'Failed to look up tag', findError)
    throw findError
  }

  if (existing) return existing

  const { data, error: insertError } = await supabase
    .from('tags')
    .insert({ user_id: userId, name: normalized })
    .select()
    .single()

  if (insertError) {
    report('error', 'Failed to create tag', insertError)
    throw insertError
  }

  return data
}

export async function attachTagsToBlock(blockId: string, tagIds: string[]): Promise<void> {
  if (tagIds.length === 0) return

  const rows = tagIds.map((tagId) => ({
    block_id: blockId,
    tag_id: tagId,
    source: 'inline' as const,
  }))

  const { error } = await supabase.from('block_tags').insert(rows)

  if (error) {
    report('error', 'Failed to attach tags to block', error)
    throw error
  }
}
