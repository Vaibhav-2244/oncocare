import { createServerClient } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AuthProvider } from '@/lib/auth-context';
import type { AuthUser, Profile, Role } from '@/lib/auth-types';

const ROLE_PRIORITY: Role['name'][] = [
  'super_admin',
  'admin',
  'hospital',
  'doctor',
  'research_partner',
  'medical_advisor',
  'family_caregiver',
  'patient',
  'pharmacy',
];

export async function DashboardAuthBootstrap({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const verifiedUserHeader = (await headers()).get('x-oncocare-auth-user');
  let verifiedUser: { id: string; email: string; phone: string } | null = null;
  try {
    const parsedUser = JSON.parse(verifiedUserHeader || 'null') as {
      id?: unknown;
      email?: unknown;
      phone?: unknown;
    } | null;
    if (parsedUser && typeof parsedUser.id === 'string') {
      verifiedUser = {
        id: parsedUser.id,
        email: typeof parsedUser.email === 'string' ? parsedUser.email : '',
        phone: typeof parsedUser.phone === 'string' ? parsedUser.phone : '',
      };
    }
  } catch {
    verifiedUser = null;
  }
  if (!verifiedUser) redirect('/auth/sign-in');

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Middleware owns cookie refresh during server-component rendering.
          }
        },
      },
    },
  );

  const [profileResult, rolesResult] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', verifiedUser.id).maybeSingle(),
    supabase.from('user_roles').select('role:roles(*)').eq('user_id', verifiedUser.id),
  ]);

  const profile = profileResult.data as Profile | null;
  const roles = ((rolesResult.data || []) as unknown as Array<{ role: Role | Role[] | null }>)
    .flatMap(({ role }) => Array.isArray(role) ? role : role ? [role] : []);
  const initialUser: AuthUser = {
    id: verifiedUser.id,
    email: verifiedUser.email,
    phone: verifiedUser.phone || profile?.phone || '',
    profile,
    roles,
    primaryRole: ROLE_PRIORITY.find((roleName) => roles.some((role) => role.name === roleName))
      || roles[0]?.name
      || null,
  };

  return <AuthProvider initialUser={initialUser}>{children}</AuthProvider>;
}