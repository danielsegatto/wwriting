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
