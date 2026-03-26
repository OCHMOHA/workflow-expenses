"use client";

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

const getRedirectPathForRole = (roleRaw: string | null | undefined) => {
  const role = (roleRaw ?? '').toString().trim().toLowerCase();
  if (role === 'administrateur') return '/administration';
  if (role === 'responsable niveau 2') return '/responsable-n2/depenses';
  if (role === 'responsable') return '/responsable/depenses';
  return '/collaborateur/depenses';
};

export default function Home() {
  const router = useRouter();

  React.useEffect(() => {
    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        const session = data.session;
        if (!session?.user) {
          router.replace('/login');
          return;
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .maybeSingle();

        const next = getRedirectPathForRole((profile as { role?: string | null } | null)?.role);
        router.replace(next);
      })
      .catch(() => {
        router.replace('/login');
      });
  }, [router]);

  return null;
}
