import type { Block } from './blocks.ts'
import { report } from './errors.ts'
import { citationCandidateResultLimit } from './constants.ts'

export const citationTokenSource =
  String.raw`\{\{block:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\}\}`

export type CitationTarget = {
  id: string
  body: string
  conversationId: string | null
  conversationName: string | null
  deleted: boolean
}

export type CitationCandidate = {
  id: string
  body: string
  conversationId: string
  conversationName: string
  createdAt: string
}

type ConversationNameRow = {
  id: string
  name: string
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

function getCitationTokenRegex(): RegExp {
  return new RegExp(citationTokenSource, 'gi')
}

export function extractReferenceTargetIds(body: string): string[] {
  return unique(
    [...body.matchAll(getCitationTokenRegex())].map((match) => match[1].toLowerCase()),
  )
}

export function diffReferenceTargetIds(currentIds: string[], nextIds: string[]): {
  idsToAdd: string[]
  idsToRemove: string[]
} {
  const currentSet = new Set(currentIds)
  const nextSet = new Set(nextIds)

  return {
    idsToAdd: nextIds.filter((id) => !currentSet.has(id)),
    idsToRemove: currentIds.filter((id) => !nextSet.has(id)),
  }
}

async function getSupabase() {
  const { supabase } = await import('./supabase.ts')
  return supabase
}

async function loadConversationNamesById(
  conversationIds: string[],
): Promise<Map<string, string>> {
  const uniqueConversationIds = unique(conversationIds)
  if (uniqueConversationIds.length === 0) {
    return new Map()
  }

  const supabase = await getSupabase()
  const { data, error } = await supabase
    .from('conversations')
    .select('id, name')
    .in('id', uniqueConversationIds)

  if (error) {
    report('error', 'Failed to load conversation names for citations', error)
    throw error
  }

  return new Map((data as ConversationNameRow[]).map((conversation) => [conversation.id, conversation.name]))
}

async function listCurrentReferenceTargetIds(sourceBlockId: string): Promise<string[]> {
  const supabase = await getSupabase()
  const { data, error } = await supabase
    .from('block_references')
    .select('target_block_id')
    .eq('source_block_id', sourceBlockId)

  if (error) {
    report('error', 'Failed to list block references', error)
    throw error
  }

  return unique(data.map((row) => row.target_block_id))
}

export async function reconcileBlockReferences(
  sourceBlockId: string,
  body: string,
): Promise<void> {
  const nextTargetIds = extractReferenceTargetIds(body)
  const currentTargetIds = await listCurrentReferenceTargetIds(sourceBlockId)
  const { idsToAdd, idsToRemove } = diffReferenceTargetIds(currentTargetIds, nextTargetIds)

  if (idsToAdd.length === 0 && idsToRemove.length === 0) {
    return
  }

  const supabase = await getSupabase()

  if (idsToAdd.length > 0) {
    const { error } = await supabase.from('block_references').insert(
      idsToAdd.map((targetBlockId) => ({
        source_block_id: sourceBlockId,
        target_block_id: targetBlockId,
      })),
    )

    if (error) {
      report('error', 'Failed to create block references', error)
      throw error
    }
  }

  if (idsToRemove.length > 0) {
    const { error } = await supabase
      .from('block_references')
      .delete()
      .eq('source_block_id', sourceBlockId)
      .in('target_block_id', idsToRemove)

    if (error) {
      report('error', 'Failed to remove block references', error)
      throw error
    }
  }
}

export async function loadCitationTargetsForBlocks(
  blocks: Pick<Block, 'id' | 'body'>[],
): Promise<Record<string, CitationTarget>> {
  const targetIds = unique(
    blocks.flatMap((block) => extractReferenceTargetIds(block.body ?? '')),
  )

  if (targetIds.length === 0) {
    return {}
  }

  const supabase = await getSupabase()
  const { data, error } = await supabase
    .from('blocks')
    .select('id, body, conversation_id')
    .in('id', targetIds)

  if (error) {
    report('error', 'Failed to load citation targets', error)
    throw error
  }

  const blocksById = new Map(
    data.map((block) => [
      block.id,
      {
        id: block.id,
        body: block.body ?? '',
        conversationId: block.conversation_id,
      },
    ]),
  )
  const conversationNamesById = await loadConversationNamesById(
    data.map((block) => block.conversation_id),
  )

  return Object.fromEntries(
    targetIds.map((targetId) => {
      const block = blocksById.get(targetId)

      if (!block) {
        return [targetId, {
          id: targetId,
          body: '',
          conversationId: null,
          conversationName: null,
          deleted: true,
        } satisfies CitationTarget]
      }

      return [targetId, {
        id: block.id,
        body: block.body,
        conversationId: block.conversationId,
        conversationName: conversationNamesById.get(block.conversationId) ?? 'Untitled conversation',
        deleted: false,
      } satisfies CitationTarget]
    }),
  )
}

export async function searchCitationCandidates(
  userId: string,
  query: string,
): Promise<CitationCandidate[]> {
  const normalizedQuery = query.trim()
  const supabase = await getSupabase()

  let request = supabase
    .from('blocks')
    .select('id, body, conversation_id, created_at')
    .eq('user_id', userId)
    .eq('type', 'text')
    .order('created_at', { ascending: false })
    .limit(citationCandidateResultLimit)

  if (normalizedQuery !== '') {
    request = request.ilike('body', `%${normalizedQuery}%`)
  }

  const { data, error } = await request

  if (error) {
    report('error', 'Failed to search citation candidates', error)
    throw error
  }

  const conversationNamesById = await loadConversationNamesById(
    data.map((block) => block.conversation_id),
  )

  return data.map((block) => ({
    id: block.id,
    body: block.body ?? '',
    conversationId: block.conversation_id,
    conversationName: conversationNamesById.get(block.conversation_id) ?? 'Untitled conversation',
    createdAt: block.created_at,
  }))
}
