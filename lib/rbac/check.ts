import { Role, isRole } from './roles';
import { Capability, ROLE_CAPABILITIES } from './capabilities';

export function getRoleFromMetadata(metadata: unknown): Role | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const raw = (metadata as Record<string, unknown>).role;
  if (typeof raw !== 'string') return null;
  const upper = raw.toUpperCase();
  return isRole(upper) ? upper : null;
}

export function getRoleFromUser(user: { user_metadata?: Record<string, unknown> | null } | null | undefined): Role | null {
  if (!user) return null;
  return getRoleFromMetadata(user.user_metadata);
}

export function hasCapability(role: Role | null | undefined, cap: Capability): boolean {
  if (!role) return false;
  const caps = ROLE_CAPABILITIES[role];
  return caps?.has(cap) ?? false;
}

export function getLandingPath(role: Role | null | undefined): string {
  if (role === Role.ADMIN) return '/admin/dashboard';
  if (role === Role.KEY_ACCOUNT_MANAGER) return '/admin/dashboard';
  if (role === Role.FIELD_SALES_REP) return '/admin/market-visits';
  if (role && hasCapability(role, Capability.PORTAL_ACCESS)) return '/portal';
  return '/auth/login';
}
