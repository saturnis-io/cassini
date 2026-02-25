/**
 * Cassini - Event-Driven Statistical Process Control System
 * Copyright (c) 2026 Cassini Contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n/config'
import './index.css'
import App from './App.tsx'

// One-time localStorage migration: OpenSPC → Cassini
;(() => {
  const migrations: [string, string][] = [
    ['openspc-theme', 'cassini-theme'],
    ['openspc-brand', 'cassini-brand'],
    ['openspc-ui', 'cassini-ui'],
    ['openspc-dashboard', 'cassini-dashboard'],
    ['openspc-chart-colors', 'cassini-chart-colors'],
    ['openspc-chart-preset', 'cassini-chart-preset'],
    ['openspc-wall-dashboard-presets', 'cassini-wall-dashboard-presets'],
    ['openspc-display-key-format', 'cassini-display-key-format'],
    ['openspc-language', 'cassini-language'],
  ]
  for (const [oldKey, newKey] of migrations) {
    const val = localStorage.getItem(oldKey)
    if (val !== null && localStorage.getItem(newKey) === null) {
      localStorage.setItem(newKey, val)
      localStorage.removeItem(oldKey)
    }
  }
  // sessionStorage migration
  const oidcVal = sessionStorage.getItem('openspc_oidc_provider_id')
  if (oidcVal !== null) {
    sessionStorage.setItem('cassini_oidc_provider_id', oidcVal)
    sessionStorage.removeItem('openspc_oidc_provider_id')
  }
})()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
