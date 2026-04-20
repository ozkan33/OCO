export const Role = {
  ADMIN: 'ADMIN',
  BRAND: 'BRAND',
  KEY_ACCOUNT_MANAGER: 'KEY_ACCOUNT_MANAGER',
  FIELD_SALES_REP: 'FIELD_SALES_REP',
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export const ALL_ROLES: Role[] = Object.values(Role);

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ALL_ROLES as string[]).includes(value);
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Admin',
  BRAND: 'Brand Client',
  KEY_ACCOUNT_MANAGER: 'Key Account Manager',
  FIELD_SALES_REP: 'Field Sales Rep',
};
