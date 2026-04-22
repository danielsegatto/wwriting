import { createClient } from '@supabase/supabase-js'
import type { Database } from '../db/types.ts'
import { report } from './errors.ts'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const missingSupabaseEnvMessage =
  'Missing Supabase environment variables. Provide VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the Vite build environment.'

if (!supabaseUrl || !supabaseAnonKey) {
  report('error', missingSupabaseEnvMessage)
  throw new Error(missingSupabaseEnvMessage)
}

export const supabase = createClient<Database>(
  supabaseUrl,
  supabaseAnonKey,
)
