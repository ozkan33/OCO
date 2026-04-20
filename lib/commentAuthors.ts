// Server-side helper for resolving comment author display names.
// Brand users come from `brand_user_profiles.contact_name`; admins and internal
// roles (KAM / FSR) come from `auth.users.user_metadata.name`. Falls back to a
// capitalized email prefix so legacy rows without a stored name still render.
import { supabaseAdmin } from './supabaseAdmin';
import { Role, ROLE_LABELS, getRoleFromUser } from './rbac';

export interface AuthorInfo {
  name: string;
  brandName: string | null;
  role: Role | null;
  roleLabel: string | null;
}

function capitalizeEmailPrefix(email: string | null | undefined): string {
  const prefix = (email || '').split('@')[0];
  if (!prefix) return 'Unknown';
  return prefix.charAt(0).toUpperCase() + prefix.slice(1);
}

export async function resolveAuthorInfo(
  userIds: (string | null | undefined)[],
  emailByUserId?: Map<string, string | null | undefined>,
): Promise<Map<string, AuthorInfo>> {
  const result = new Map<string, AuthorInfo>();
  const ids = Array.from(new Set(userIds.filter((x): x is string => !!x)));
  if (ids.length === 0) return result;

  const { data: brandProfiles } = await supabaseAdmin
    .from('brand_user_profiles')
    .select('id, brand_name, contact_name, email')
    .in('id', ids);

  // Everyone is first looked up via auth.users so the role on the JWT wins
  // over the (optional) brand profile row — an internal employee (KAM / FSR)
  // may have a brand_user_profiles row with brand_name '' but they are NOT
  // a BRAND user.
  const authUsers = await Promise.all(
    ids.map(async id => {
      try {
        const { data } = await supabaseAdmin.auth.admin.getUserById(id);
        return { id, user: data?.user ?? null };
      } catch {
        return { id, user: null };
      }
    }),
  );
  const userById = new Map(authUsers.map(({ id, user }) => [id, user] as const));

  const brandProfileById = new Map(
    (brandProfiles || []).map((p: { id: string; brand_name: string | null; contact_name: string | null; email: string | null }) => [p.id, p] as const),
  );

  for (const id of ids) {
    const user = userById.get(id) ?? null;
    const role = getRoleFromUser(user);
    const profile = brandProfileById.get(id);
    const metaName = typeof user?.user_metadata?.name === 'string' ? (user.user_metadata.name as string).trim() : '';
    const email = user?.email || profile?.email || emailByUserId?.get(id) || '';
    const fallback = capitalizeEmailPrefix(email);
    const isBrand = role === Role.BRAND;
    result.set(id, {
      name: isBrand
        ? ((profile?.contact_name && profile.contact_name.trim()) || metaName || fallback)
        : (metaName || fallback),
      brandName: isBrand ? (profile?.brand_name || null) : null,
      role,
      roleLabel: role ? ROLE_LABELS[role] : null,
    });
  }

  return result;
}
