import { Role } from './roles';

export const Capability = {
  ADMIN_ACCESS: 'admin:access',
  PORTAL_ACCESS: 'portal:access',
  SCORECARD_READ: 'scorecard:read',
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
    Capability.PORTAL_ACCESS,
    Capability.SCORECARD_READ,
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
  KEY_ACCOUNT_MANAGER: new Set<Capability>([
    Capability.PORTAL_ACCESS,
    Capability.SCORECARD_READ,
    Capability.MASTER_SCORECARD_READ,
    Capability.MARKET_VISITS_READ,
    Capability.MARKET_VISITS_CREATE,
  ]),
  FIELD_SALES_REP: new Set<Capability>([
    Capability.PORTAL_ACCESS,
    Capability.MARKET_VISITS_READ,
    Capability.MARKET_VISITS_CREATE,
  ]),
};
