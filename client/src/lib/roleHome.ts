import type { AuthUser } from '@shared/schema';

/**
 * Resolves the tailored default home dashboard route for each dingzi persona on sign-in.
 */
export function defaultStaffHomePath(user?: AuthUser | null): string {
  if (!user) return '/login';
  if (user.role === 'super_admin' && !user.cafeContext) {
    return '/super-admin';
  }
  if (user.staffRole === 'tenant_owner' && (user.accessibleBranches?.length || 0) > 1) {
    return '/admin/portfolio';
  }
  if (user.staffRole === 'host_cashier') {
    return '/admin/front-desk';
  }
  if (user.staffRole === 'prep_barista') {
    return '/admin/station';
  }
  return '/admin';
}
