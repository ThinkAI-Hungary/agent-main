import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initGlobalErrorHandling } from './lib/errorReporter'
import { ErrorBoundary } from './components/common/ErrorBoundary'

// Initialize client-side error reporter
initGlobalErrorHandling()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
