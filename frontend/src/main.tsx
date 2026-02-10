import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { QuickStartProvider } from './contexts/QuickStartContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QuickStartProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QuickStartProvider>
  </React.StrictMode>,
)
