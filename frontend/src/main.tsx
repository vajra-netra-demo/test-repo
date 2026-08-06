import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Set the theme attribute before the first paint — ThemeProvider re-affirms
// this on mount, but doing it here too avoids a dark->light (or vice versa)
// flash while React boots. `?theme=light|dark` overrides and persists (a
// shareable-link/QA affordance — ThemeProvider reads the same override).
const themeParam = new URLSearchParams(location.search).get('theme')
if (themeParam === 'light' || themeParam === 'dark') {
  localStorage.setItem('netra-theme', themeParam)
}
const storedTheme = themeParam ?? localStorage.getItem('netra-theme')
document.documentElement.dataset.theme = storedTheme === 'dark' ? 'dark' : 'light'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
