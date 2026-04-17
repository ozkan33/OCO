// Server-side helper for resolving comment author display names.
// Brand users come from `brand_user_profiles.contact_name`; admins come from
// `auth.users.user_metadata.name`. Falls back to a capitalized email prefix
// so legacy rows without a stored name still render something reasonable.
import { supabaseAdmin } from './supabaseAdmin';

export interface AuthorInfo {
  name: string;
  brandName: string | null;
  role: 'BRAND' | 'ADMIN';
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

  for (const p of brandProfiles || []) {
    const fallback = capitalizeEmailPrefix(p.email);
    result.set(p.id, {
      name: (p.contact_name && p.contact_name.trim()) || fallback,
      brandName: p.brand_name || null,
      role: 'BRAND',
    });
  }

  const adminIds = ids.filter(id => !result.has(id));
  if (adminIds.length > 0) {
    const admins = await Promise.all(
      adminIds.map(async id => {
        try {
          const { data } = await supabaseAdmin.auth.admin.getUserById(id);
          return { id, user: data?.user ?? null };
        } catch {
          return { id, user: null };
        }
      }),
    );
    for (const { id, user } of admins) {
      const meta = user?.user_metadata || {};
      const metaName = typeof meta.name === 'string' ? meta.name.trim() : '';
      const email = user?.email || emailByUserId?.get(id) || '';
      result.set(id, {
        name: metaName || capitalizeEmailPrefix(email),
        brandName: null,
        role: 'ADMIN',
      });
    }
  }

  return result;
}
