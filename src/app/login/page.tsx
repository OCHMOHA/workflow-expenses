"use client";

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import {
  Alert,
  Box,
  Button,
  Container,
  Paper,
  TextField,
  Typography,
} from '@mui/material';

const getRedirectPathForRole = (roleRaw: string | null | undefined) => {
  const role = (roleRaw ?? '').toString().trim().toLowerCase();
  if (role === 'administrateur') return '/administration';
  if (role === 'responsable niveau 2') return '/responsable-n2/depenses';
  if (role === 'responsable') return '/responsable/depenses';
  return '/collaborateur/depenses';
};

const toEmailsFromUsername = (username: string) => {
  const u = (username ?? '').trim().toLowerCase();
  if (!u) return [];
  return [`${u}@asa.local`, `${u}@local.app`];
};

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/';

  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session?.user) return;

      if (redirectTo && redirectTo !== '/') {
        router.replace(redirectTo);
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.session.user.id)
        .maybeSingle();

      const next = getRedirectPathForRole((profile as { role?: string | null } | null)?.role);
      router.replace(next);
    });
  }, [router, redirectTo]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const emails = toEmailsFromUsername(username);
    if (!username.trim() || !password) {
      setError('Veuillez saisir un identifiant et un mot de passe.');
      return;
    }

    setIsLoading(true);
    try {
      let lastError: string | null = null;
      for (const email of emails) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (!signInError) {
          if (redirectTo && redirectTo !== '/') {
            router.replace(redirectTo);
            return;
          }

          const {
            data: { session },
          } = await supabase.auth.getSession();

          const userId = session?.user?.id;
          if (!userId) {
            router.replace('/collaborateur/depenses');
            return;
          }

          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', userId)
            .maybeSingle();

          const next = getRedirectPathForRole((profile as { role?: string | null } | null)?.role);
          router.replace(next);
          return;
        }

        lastError = signInError.message;
      }

      setError(lastError ? 'Identifiants invalides.' : 'Identifiants invalides.');
      return;

    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Box
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 1400,
          backgroundColor: 'background.paper',
          boxShadow: 0,
          borderBottom: '2px solid rgba(0,0,0,0.16)',
        }}
      >
        <Container
          maxWidth={false}
          sx={{
            px: { xs: 2, sm: 4, md: 6 },
            py: 2,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
              Additif Solutions
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Algeria
            </Typography>
          </Box>
        </Container>
      </Box>

      <Container maxWidth="sm" sx={{ py: 6, pt: 10 }}>
        <Paper sx={{ p: { xs: 2, sm: 3 } }}>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
            Connexion
          </Typography>
          <Typography variant="body2" sx={{ mb: 3, opacity: 0.8 }}>
            Utilisez votre identifiant et mot de passe.
          </Typography>

          <Box component="form" onSubmit={onSubmit} noValidate>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField
                label="Identifiant"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                fullWidth
              />
              <TextField
                label="Mot de passe"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                fullWidth
              />

              {error && <Alert severity="error">{error}</Alert>}

              <Button type="submit" variant="contained" disabled={isLoading}>
                Se connecter
              </Button>
            </Box>
          </Box>
        </Paper>
      </Container>
    </>
  );
}

export default function LoginPage() {
  return (
    <React.Suspense fallback={null}>
      <LoginPageInner />
    </React.Suspense>
  );
}
