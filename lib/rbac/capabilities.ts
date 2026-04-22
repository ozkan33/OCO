import { Role } from './roles';

export const Capability = {
  ADMIN_ACCESS: 'admin:access',
  PORTAL_ACCESS: 'portal:access',
  // Full-admin capability gates admin pages that internal employees (KAM/FSR)
  // must not reach — Clients, Stores, Logos, Visitors, Activity, Settings.
  ADMIN_FULL: 'admin:full',
  SCORECARD_READ: 'scorecard:read',
  SCORECARD_WRITE: 'scorecard:write',
  SCORECARD_DELETE: 'scorecard:delete',
  MASTER_SCORECARD_READ: 'master_scorecard:read',
  MARKET_VISITS_READ: 'market_visits:read',
  MARKET_VISITS_CREATE: 'market_visits:create',
  // Edit / delete ANY market visit (not just own). Ownership-based edits are
  // enforced at the route layer by comparing visit.user_id to the caller.
  MARKET_VISITS_MANAGE_ANY: 'market_visits:manage_any',
} as const;

export type Capability = (typeof Capability)[keyof typeof Capability];

export const ROLE_CAPABILITIES: Record<Role, ReadonlySet<Capability>> = {
  ADMIN: new Set<Capability>([
    Capability.ADMIN_ACCESS,
    Capability.ADMIN_FULL,
    Capability.PORTAL_ACCESS,
    Capability.SCORECARD_READ,
    Capability.SCORECARD_WRITE,
    Capability.SCORECARD_DELETE,
    Capability.MASTER_SCORECARD_READ,
    Capability.MARKET_VISITS_READ,
    Capability.MARKET_VISITS_CREATE,
    Capability.MARKET_VISITS_MANAGE_ANY,
  ]),
  BRAND: new Set<Capability>([
    Capability.PORTAL_ACCESS,
    Capability.SCORECARD_READ,
    Capability.MASTER_SCORECARD_READ,
    Capability.MARKET_VISITS_READ,
  ]),
  // KAM: same as admin except cannot delete scorecards and cannot reach
  // admin-only management pages (Clients / Stores / Logos / Visitors / …).
  KEY_ACCOUNT_MANAGER: new Set<Capability>([
    Capability.ADMIN_ACCESS,
    Capability.SCORECARD_READ,
    Capability.SCORECARD_WRITE,
    Capability.MASTER_SCORECARD_READ,
    Capability.MARKET_VISITS_READ,
    Capability.MARKET_VISITS_CREATE,
    Capability.MARKET_VISITS_MANAGE_ANY,
  ]),
  // FSR: only Market Visits; may manage (add/remove/edit) visits they own.
  FIELD_SALES_REP: new Set<Capability>([
    Capability.ADMIN_ACCESS,
    Capability.MARKET_VISITS_READ,
    Capability.MARKET_VISITS_CREATE,
  ]),
};
