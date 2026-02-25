/**
 * OpenSPC - Event-Driven Statistical Process Control System
 * Copyright (c) 2026 OpenSPC Contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n/config'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
