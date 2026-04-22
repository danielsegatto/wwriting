import { supabase } from './supabase.ts'
import { report } from './errors.ts'
import type { Database, BlockTagSource } from '../db/types.ts'

export type Tag = Database['public']['Tables']['tags']['Row']
export type BlockTag = Database['public']['Tables']['block_tags']['Row']
export type AppliedTag = Tag & { sources: BlockTagSource[] }

const pickerTagSource = 'picker' as const
const inlineTagSource = 'inline' as const
const HASHTAG_RE = /(?:^|\s)#([a-zA-Z0-9_]+)/g

function normalizeTagName(name: string): string {
  return name.trim().replace(/^#+/, '').toLowerCase()
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

export async function listTags(userId: string): Promise<Tag[]> {
  const { data, error } = await supabase
    .from('tags')
    .select()
    .eq('user_id', userId)
    .order('name', { ascending: true })

  if (error) {
    report('error', 'Failed to list tags', error)
    throw error
  }

  return data
}

export async function findOrCreateTag(name: string, userId: string): Promise<Tag> {
  const normalized = normalizeTagName(name)

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

export function extractInlineTagNames(body: string): string[] {
  const names = [...body.matchAll(HASHTAG_RE)].map((match) => normalizeTagName(match[1]))
  return unique(names.filter(Boolean))
}

export async function ensureTagsExist(tagNames: string[], userId: string): Promise<Tag[]> {
  const normalizedTagNames = unique(tagNames.map(normalizeTagName).filter(Boolean))
  if (normalizedTagNames.length === 0) return []

  return Promise.all(normalizedTagNames.map((name) => findOrCreateTag(name, userId)))
}

export async function listTagsForBlock(blockId: string): Promise<AppliedTag[]> {
  const byBlockId = await listTagsForBlocks([blockId])
  return byBlockId[blockId] ?? []
}

export async function listTagsForBlocks(blockIds: string[]): Promise<Record<string, AppliedTag[]>> {
  if (blockIds.length === 0) return {}

  const uniqueBlockIds = unique(blockIds)
  const { data: blockTags, error: blockTagsError } = await supabase
    .from('block_tags')
    .select()
    .in('block_id', uniqueBlockIds)

  if (blockTagsError) {
    report('error', 'Failed to list block tags', blockTagsError)
    throw blockTagsError
  }

  const tagIds = unique(blockTags.map((row) => row.tag_id))
  if (tagIds.length === 0) {
    return Object.fromEntries(uniqueBlockIds.map((blockId) => [blockId, []]))
  }

  const { data: tags, error: tagsError } = await supabase
    .from('tags')
    .select()
    .in('id', tagIds)

  if (tagsError) {
    report('error', 'Failed to load tag details', tagsError)
    throw tagsError
  }

  const tagsById = new Map(tags.map((tag) => [tag.id, tag]))
  const appliedTagsByBlock = new Map<string, Map<string, AppliedTag>>()

  for (const row of blockTags) {
    const tag = tagsById.get(row.tag_id)
    if (!tag) continue

    if (!appliedTagsByBlock.has(row.block_id)) {
      appliedTagsByBlock.set(row.block_id, new Map())
    }

    const blockMap = appliedTagsByBlock.get(row.block_id)
    if (!blockMap) continue

    const existing = blockMap.get(row.tag_id)
    if (existing) {
      if (!existing.sources.includes(row.source)) {
        existing.sources.push(row.source)
      }
      continue
    }

    blockMap.set(row.tag_id, {
      ...tag,
      sources: [row.source],
    })
  }

  return Object.fromEntries(
    uniqueBlockIds.map((blockId) => {
      const blockTagsForId = [...(appliedTagsByBlock.get(blockId)?.values() ?? [])]
      blockTagsForId.sort((a, b) => a.name.localeCompare(b.name))
      return [blockId, blockTagsForId]
    }),
  )
}

export async function attachTagsToBlock(
  blockId: string,
  tagIds: string[],
  source: BlockTagSource = inlineTagSource,
): Promise<void> {
  const uniqueTagIds = unique(tagIds)
  if (uniqueTagIds.length === 0) return

  const rows = uniqueTagIds.map((tagId) => ({
    block_id: blockId,
    tag_id: tagId,
    source,
  }))

  const { error } = await supabase
    .from('block_tags')
    .upsert(rows, { onConflict: 'block_id,tag_id,source', ignoreDuplicates: true })

  if (error) {
    report('error', 'Failed to attach tags to block', error)
    throw error
  }
}

export async function attachPickerTagToBlock(blockId: string, tagId: string): Promise<void> {
  await attachTagsToBlock(blockId, [tagId], pickerTagSource)
}

export async function removePickerTagFromBlock(blockId: string, tagId: string): Promise<void> {
  const { error } = await supabase
    .from('block_tags')
    .delete()
    .eq('block_id', blockId)
    .eq('tag_id', tagId)
    .eq('source', pickerTagSource)

  if (error) {
    report('error', 'Failed to remove picker tag from block', error)
    throw error
  }
}

async function listInlineTagIdsForBlock(blockId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('block_tags')
    .select('tag_id')
    .eq('block_id', blockId)
    .eq('source', inlineTagSource)

  if (error) {
    report('error', 'Failed to list inline block tags', error)
    throw error
  }

  return data.map((row) => row.tag_id)
}

async function removeInlineTagsFromBlock(blockId: string, tagIds: string[]): Promise<void> {
  const uniqueTagIds = unique(tagIds)
  if (uniqueTagIds.length === 0) return

  const { error } = await supabase
    .from('block_tags')
    .delete()
    .eq('block_id', blockId)
    .eq('source', inlineTagSource)
    .in('tag_id', uniqueTagIds)

  if (error) {
    report('error', 'Failed to remove inline block tags', error)
    throw error
  }
}

export async function reconcileInlineTagsForBlock(
  blockId: string,
  body: string,
  userId: string,
): Promise<Tag[]> {
  const nextTags = await ensureTagsExist(extractInlineTagNames(body), userId)
  const nextTagIds = nextTags.map((tag) => tag.id)
  const currentTagIds = await listInlineTagIdsForBlock(blockId)

  const currentSet = new Set(currentTagIds)
  const nextSet = new Set(nextTagIds)

  const tagIdsToAdd = nextTagIds.filter((tagId) => !currentSet.has(tagId))
  const tagIdsToRemove = currentTagIds.filter((tagId) => !nextSet.has(tagId))

  await attachTagsToBlock(blockId, tagIdsToAdd, inlineTagSource)
  await removeInlineTagsFromBlock(blockId, tagIdsToRemove)

  return nextTags
}
