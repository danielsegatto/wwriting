import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'
import { supabase } from '../lib/supabase.ts'

type Props = { children: ReactNode }

export function AuthGate({ children }: Props) {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => subscription.unsubscribe()
  }, [])

  // undefined = loading; null = no session; Session = authenticated
  if (session === undefined) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950" />
    )
  }

  if (session === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950">
        <div className="w-full max-w-sm px-4">
          <p className="mb-6 text-center text-xs tracking-widest text-zinc-500 uppercase">
            wwriting
          </p>
          <Auth
            supabaseClient={supabase}
            appearance={{ theme: ThemeSupa, variables: { default: {
              colors: {
                brand: '#71717a',
                brandAccent: '#a1a1aa',
                inputBackground: '#18181b',
                inputBorder: '#3f3f46',
                inputText: '#f4f4f5',
                inputPlaceholder: '#52525b',
                messageText: '#f4f4f5',
                anchorTextColor: '#a1a1aa',
                dividerBackground: '#3f3f46',
              },
              radii: { borderRadiusButton: '6px', inputBorderRadius: '6px' },
            }}}}
            providers={[]}
            view="sign_in"
            showLinks
          />
        </div>
      </div>
    )
  }

  return <>{children}</>
}
