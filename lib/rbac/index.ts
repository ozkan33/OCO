// Client-safe barrel. Do NOT re-export from ./requireCapability here — that
// transitively pulls in supabaseAdmin (service-role key) via apiAuth. Server
// code should import authorize directly from './requireCapability'.
export { Role, ALL_ROLES, ROLE_LABELS, isRole } from './roles';
export { Capability, ROLE_CAPABILITIES } from './capabilities';
export { getRoleFromMetadata, getRoleFromUser, hasCapability, getLandingPath } from './check';
