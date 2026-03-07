/**
 * Extension Registry — central registry for open-core plugin architecture.
 *
 * The commercial package (@saturnis/cassini-enterprise) calls registerExtension()
 * to add routes, sidebar items, and settings tabs. Core components call getRegistry()
 * to read them.
 */

import type { ComponentType, LazyExoticComponent, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { Role } from '@/lib/roles'

export interface ExtensionRoute {
  path: string
  component: LazyExoticComponent<ComponentType>
  label: string
  requiredRole?: Role
}

export interface ExtensionSidebarItem {
  path: string
  labelKey: string
  icon: ReactNode
  requiredRole?: Role
  section: 'studies' | 'system'
  order?: number
}

export interface ExtensionSettingsTab {
  to: string
  labelKey: string
  icon: LucideIcon
  component: LazyExoticComponent<ComponentType>
  group: string
  minRole?: Role
}

interface ExtensionRegistry {
  routes: ExtensionRoute[]
  sidebarItems: ExtensionSidebarItem[]
  settingsTabs: ExtensionSettingsTab[]
}

const registry: ExtensionRegistry = {
  routes: [],
  sidebarItems: [],
  settingsTabs: [],
}

/** Push extension items into the registry. Called by enterprise package at startup. */
export function registerExtension(ext: Partial<ExtensionRegistry>): void {
  if (ext.routes) {
    registry.routes.push(...ext.routes)
  }
  if (ext.sidebarItems) {
    registry.sidebarItems.push(...ext.sidebarItems)
  }
  if (ext.settingsTabs) {
    registry.settingsTabs.push(...ext.settingsTabs)
  }
}

/** Read-only access to the current registry state. */
export function getRegistry(): Readonly<ExtensionRegistry> {
  return registry
}
