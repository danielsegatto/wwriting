import { supabase } from './supabase.ts'
import { report } from './errors.ts'

const resultLimit = 8

export type FolderSearchResult = {
  id: string
  name: string
  conversationCount: number
  firstConversationId: string | null
}

export type ConversationSearchResult = {
  id: string
  name: string
  folderId: string
  folderName: string | null
}

export type BlockSearchResult = {
  id: string
  body: string
  conversationId: string
  conversationName: string | null
  createdAt: string
}

export type WorkspaceSearchResults = {
  folders: FolderSearchResult[]
  conversations: ConversationSearchResult[]
  blocks: BlockSearchResult[]
}

type FolderRow = {
  id: string
  name: string
}

type ConversationRow = {
  id: string
  name: string
  folder_id: string
  position: string
}

type BlockRow = {
  id: string
  body: string | null
  conversation_id: string
  created_at: string
}

function mapRowsById<T extends { id: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((row) => [row.id, row]))
}

async function loadFoldersById(folderIds: string[]): Promise<Map<string, FolderRow>> {
  if (folderIds.length === 0) return new Map()

  const { data, error } = await supabase
    .from('folders')
    .select('id, name')
    .in('id', [...new Set(folderIds)])

  if (error) {
    report('error', 'Failed to load folders for search', error)
    throw error
  }

  return mapRowsById(data as FolderRow[])
}

async function loadConversationsById(conversationIds: string[]): Promise<Map<string, ConversationRow>> {
  if (conversationIds.length === 0) return new Map()

  const { data, error } = await supabase
    .from('conversations')
    .select('id, name, folder_id, position')
    .in('id', [...new Set(conversationIds)])

  if (error) {
    report('error', 'Failed to load conversations for search', error)
    throw error
  }

  return mapRowsById(data as ConversationRow[])
}

async function searchFolders(userId: string, query: string): Promise<FolderSearchResult[]> {
  const { data, error } = await supabase
    .from('folders')
    .select('id, name')
    .eq('user_id', userId)
    .ilike('name', `%${query}%`)
    .order('position', { ascending: true })
    .limit(resultLimit)

  if (error) {
    report('error', 'Failed to search folders', error)
    throw error
  }

  const folders = data as FolderRow[]
  if (folders.length === 0) return []

  const folderIds = folders.map((folder) => folder.id)
  const { data: conversationData, error: conversationError } = await supabase
    .from('conversations')
    .select('id, folder_id, position')
    .eq('user_id', userId)
    .in('folder_id', folderIds)
    .order('position', { ascending: true })

  if (conversationError) {
    report('error', 'Failed to load folder conversations for search', conversationError)
    throw conversationError
  }

  const conversationsByFolderId = new Map<string, { count: number; firstConversationId: string | null }>()
  for (const folderId of folderIds) {
    conversationsByFolderId.set(folderId, { count: 0, firstConversationId: null })
  }

  for (const conversation of conversationData as Array<{ id: string; folder_id: string }>) {
    const entry = conversationsByFolderId.get(conversation.folder_id)
    if (!entry) continue

    entry.count += 1
    if (!entry.firstConversationId) {
      entry.firstConversationId = conversation.id
    }
  }

  return folders.map((folder) => {
    const conversations = conversationsByFolderId.get(folder.id)
    return {
      id: folder.id,
      name: folder.name,
      conversationCount: conversations?.count ?? 0,
      firstConversationId: conversations?.firstConversationId ?? null,
    }
  })
}

async function searchConversations(userId: string, query: string): Promise<ConversationSearchResult[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, name, folder_id')
    .eq('user_id', userId)
    .ilike('name', `%${query}%`)
    .order('position', { ascending: true })
    .limit(resultLimit)

  if (error) {
    report('error', 'Failed to search conversations', error)
    throw error
  }

  const conversations = data as Array<{ id: string; name: string; folder_id: string }>
  const foldersById = await loadFoldersById(conversations.map((conversation) => conversation.folder_id))

  return conversations.map((conversation) => ({
    id: conversation.id,
    name: conversation.name,
    folderId: conversation.folder_id,
    folderName: foldersById.get(conversation.folder_id)?.name ?? null,
  }))
}

async function searchBlocks(userId: string, query: string): Promise<BlockSearchResult[]> {
  const { data, error } = await supabase
    .from('blocks')
    .select('id, body, conversation_id, created_at')
    .eq('user_id', userId)
    .eq('type', 'text')
    .ilike('body', `%${query}%`)
    .order('created_at', { ascending: false })
    .limit(resultLimit)

  if (error) {
    report('error', 'Failed to search blocks', error)
    throw error
  }

  const blocks = data as BlockRow[]
  const conversationsById = await loadConversationsById(
    blocks.map((block) => block.conversation_id),
  )

  return blocks.map((block) => ({
    id: block.id,
    body: block.body ?? '',
    conversationId: block.conversation_id,
    conversationName: conversationsById.get(block.conversation_id)?.name ?? null,
    createdAt: block.created_at,
  }))
}

export async function searchWorkspace(
  userId: string,
  rawQuery: string,
): Promise<WorkspaceSearchResults> {
  const query = rawQuery.trim()
  if (query === '') {
    return {
      folders: [],
      conversations: [],
      blocks: [],
    }
  }

  const [folders, conversations, blocks] = await Promise.all([
    searchFolders(userId, query),
    searchConversations(userId, query),
    searchBlocks(userId, query),
  ])

  return {
    folders,
    conversations,
    blocks,
  }
}
