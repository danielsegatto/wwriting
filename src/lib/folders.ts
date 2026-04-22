import { supabase } from './supabase.ts'
import { report } from './errors.ts'
import type { Database } from '../db/types.ts'

export type Folder = Database['public']['Tables']['folders']['Row']

export async function listFolders(userId: string): Promise<Folder[]> {
  const { data, error } = await supabase
    .from('folders')
    .select()
    .eq('user_id', userId)
    .order('position', { ascending: true })

  if (error) {
    report('error', 'Failed to list folders', error)
    throw error
  }

  return data
}

export async function createFolder(
  userId: string,
  name: string,
  parentId?: string | null,
): Promise<Folder> {
  const { data, error } = await supabase
    .from('folders')
    .insert({ user_id: userId, name, position: Date.now().toString(), parent_id: parentId ?? null })
    .select()
    .single()

  if (error) {
    report('error', 'Failed to create folder', error)
    throw error
  }

  return data
}

export async function deleteFolder(folderId: string): Promise<void> {
  const { error } = await supabase
    .from('folders')
    .delete()
    .eq('id', folderId)

  if (error) {
    report('error', 'Failed to delete folder', error)
    throw error
  }
}
