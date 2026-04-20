import { AuthGate } from './AuthGate.tsx'

export function App() {
  return (
    <AuthGate>
      <div className="flex h-screen items-center justify-center bg-zinc-950 text-zinc-100">
        <p className="text-sm text-zinc-500">wwriting — authenticated</p>
      </div>
    </AuthGate>
  )
}
