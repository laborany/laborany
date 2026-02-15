import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { QuickStartProvider } from './contexts/QuickStartContext'
import { AuthProvider } from './hooks/useAuth'
import { initClientLogger, logClientError } from './lib/client-logger'
import './index.css'

initClientLogger()

window.addEventListener('error', (event) => {
  logClientError(
    'window_error',
    event.message || 'Unknown window error',
    event.error,
    {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    },
  )
})

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason instanceof Error ? event.reason.message : String(event.reason || 'Unknown rejection')
  logClientError('window_unhandled_rejection', reason, event.reason)
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <QuickStartProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QuickStartProvider>
    </AuthProvider>
  </React.StrictMode>,
)
