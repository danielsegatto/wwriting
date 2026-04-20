import { supabase } from './supabase.ts'
import { report } from './errors.ts'

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (error) {
    report('error', 'Sign-out failed', error)
  }
}
