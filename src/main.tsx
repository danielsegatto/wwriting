import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import { App } from './app/App.tsx'
import { installGlobalErrorHandlers } from './lib/errors.ts'

installGlobalErrorHandlers(window)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
