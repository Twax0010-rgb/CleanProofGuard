import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { AdminAuthProvider } from './contexts/AdminAuthContext.tsx'
import { BranchProvider } from './contexts/BranchContext.tsx'
import { StaffAuthProvider } from './contexts/StaffAuthContext.tsx'
import { initTheme } from './components/ui/ThemeToggle.tsx'
import './index.css'

initTheme()

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
