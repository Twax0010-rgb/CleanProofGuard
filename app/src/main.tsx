import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { AdminAuthProvider } from './contexts/AdminAuthContext.tsx'
import { BranchProvider } from './contexts/BranchContext.tsx'
import { StaffAuthProvider } from './contexts/StaffAuthContext.tsx'
import { initTheme } from './components/ui/ThemeToggle.tsx'
import { initOutboxSync } from './staff/outbox.ts'
import { initStaffPwa } from './staff/pwa.ts'
import './index.css'

initTheme()
initStaffPwa()
initOutboxSync()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <StaffAuthProvider>
        <AdminAuthProvider>
          <BranchProvider>
            <App />
          </BranchProvider>
        </AdminAuthProvider>
      </StaffAuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
