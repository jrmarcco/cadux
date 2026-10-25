import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { installDesktopShim } from './desktop-shim'
import { initTheme } from '@shared/ui/theme/theme-store'
import './styles/global.css'

installDesktopShim()
initTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
