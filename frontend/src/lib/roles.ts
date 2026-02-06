/**
 * Role-Based Access Control Definitions
 *
 * Defines user roles, their hierarchy, and view permissions for the OpenSPC application.
 * Used throughout the app for navigation filtering and route protection.
 */

/**
 * User roles in order of increasing privilege
 * - operator: Basic data entry and dashboard viewing
 * - supervisor: Can acknowledge violations, view reports
 * - engineer: Can configure characteristics and settings
 * - admin: Full access including system settings
 */
export type Role = 'operator' | 'supervisor' | 'engineer' | 'admin'

/**
 * Numeric hierarchy for role comparison
 * Higher number = more privilege
 */
export const ROLE_HIERARCHY: Record<Role, number> = {
  operator: 1,
  supervisor: 2,
  engineer: 3,
  admin: 4,
}

/**
 * Display names for roles
 */
export const ROLE_LABELS: Record<Role, string> = {
  operator: 'Operator',
  supervisor: 'Supervisor',
  engineer: 'Engineer',
  admin: 'Administrator',
}

/**
 * Minimum role required to access each view/route
 * Routes not listed here are accessible to all roles
 */
export const VIEW_PERMISSIONS: Record<string, Role> = {
  // Operator level (all users)
  '/dashboard': 'operator',
  '/data-entry': 'operator',
  '/violations': 'operator',

  // Supervisor level
  '/reports': 'supervisor',

  // Engineer level
  '/configuration': 'engineer',

  // Admin level
  '/settings': 'admin',
  '/admin/users': 'admin',

  // Display modes (operator accessible)
  '/kiosk': 'operator',
  '/wall-dashboard': 'operator',
}

/**
 * Special permissions for specific actions (not just view access)
 */
export const ACTION_PERMISSIONS: Record<string, Role> = {
  'violations:acknowledge': 'supervisor',
  'violations:resolve': 'supervisor',
  'characteristics:create': 'engineer',
  'characteristics:edit': 'engineer',
  'characteristics:delete': 'engineer',
  'settings:theme': 'admin',
  'settings:api-keys': 'engineer',
  'settings:database': 'engineer',
  'users:create': 'admin',
  'users:edit': 'admin',
  'users:deactivate': 'admin',
  'users:assign-roles': 'admin',
}

/**
 * Check if a user role has sufficient privilege for a required role
 *
 * @param userRole - The user's current role
 * @param requiredRole - The minimum role required for access
 * @returns true if user has equal or higher privilege
 *
 * @example
 * hasAccess('engineer', 'operator') // true
 * hasAccess('operator', 'admin') // false
 */
export function hasAccess(userRole: Role, requiredRole: Role): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole]
}

/**
 * Check if a user can access a specific view/route
 *
 * @param userRole - The user's current role
 * @param viewPath - The route path (e.g., '/dashboard', '/settings')
 * @returns true if user has permission to access the view
 *
 * @example
 * canAccessView('operator', '/dashboard') // true
 * canAccessView('operator', '/settings') // false
 */
export function canAccessView(userRole: Role, viewPath: string): boolean {
  const requiredRole = VIEW_PERMISSIONS[viewPath]
  // If no permission defined, allow all
  if (!requiredRole) return true
  return hasAccess(userRole, requiredRole)
}

/**
 * Check if a user can perform a specific action
 *
 * @param userRole - The user's current role
 * @param action - The action key (e.g., 'violations:acknowledge')
 * @returns true if user has permission to perform the action
 *
 * @example
 * canPerformAction('supervisor', 'violations:acknowledge') // true
 * canPerformAction('operator', 'violations:acknowledge') // false
 */
export function canPerformAction(userRole: Role, action: string): boolean {
  const requiredRole = ACTION_PERMISSIONS[action]
  // If no permission defined, deny by default for safety
  if (!requiredRole) return false
  return hasAccess(userRole, requiredRole)
}

/**
 * Get all roles that the user has access to (current and lower)
 *
 * @param userRole - The user's current role
 * @returns Array of accessible roles
 *
 * @example
 * getAccessibleRoles('supervisor') // ['operator', 'supervisor']
 */
export function getAccessibleRoles(userRole: Role): Role[] {
  const userLevel = ROLE_HIERARCHY[userRole]
  return (Object.keys(ROLE_HIERARCHY) as Role[]).filter(
    (role) => ROLE_HIERARCHY[role] <= userLevel
  )
}
