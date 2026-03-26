"use client";

import * as React from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { NotificationsBell } from '@/components/NotificationsBell';
import {
  Alert,
  Box,
  Button,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { cacheGet, cacheSet } from '@/lib/queryCache';

const formatDzd = (value: number | null | undefined) => {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
};

const prettyText = (value: string | null | undefined) => {
  const raw = (value ?? '').toString().trim();
  if (!raw) return '-';
  const cleaned = raw.replaceAll('_', ' ').replace(/\s+/g, ' ').trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
};

type DepenseRow = {
  id: string;
  date_depense: string | null;
  categorie: string;
  montant_ttc: number;
  montant_ht?: number | null;
  tva?: number | null;
  montant_tva?: number | null;
  statut: string;
  saisisseur_id?: string | null;
  ligne?: string | null;
  sous_ligne?: string | null;
  libelle?: string | null;
  saisisseur_nom?: string | null;
  piece_justificative_url?: string | null;
  motif_rejet?: string | null;
  fournisseur?: string | null;
  nom_beneficiaire?: string | null;
  mois?: string | null;
  nom_vehicule?: string | null;
  nom_commercial?: string | null;
  provenance?: string | null;
  nom_produit?: string | null;
  quantite_kg?: number | null;
  dossier_importation?: string | null;
  valideur_id?: string | null;
  mode_reglement?: string | null;
  nom_beneficiaire_reglement?: string | null;
  piece_reglement_url?: string | null;
  reglee_at?: string | null;
  reglee_par?: string | null;
};

type ProfileRow = {
  id: string;
  matricule: string | null;
  nom_complet: string | null;
  role?: string | null;
};

type StatusFilter = '' | 'a_valider_n2' | 'validee' | 'rejetee';

type TicketRegleeFilter = 'tous' | 'non_reglees' | 'reglees';

const normalizeStatut = (statut: string) => {
  const s = (statut ?? '').trim().toLowerCase();
  if (s === 'validée' || s === 'validee') return 'validee';
  if (s === 'rejetée' || s === 'rejetee') return 'rejetee';
  if (s === 'a_valider_n2' || s === 'a valider n2') return 'a_valider_n2';
  return s;
};

const toDbStatut = (s: StatusFilter) => {
  if (s === 'validee') return 'VALIDEE';
  if (s === 'rejetee') return 'REJETEE';
  if (s === 'a_valider_n2') return 'A_VALIDER_N2';
  return null;
};

const statutLabel = (raw: string | null | undefined) => {
  const s = normalizeStatut((raw ?? '').toString());
  if (s === 'a_valider_n2') return 'A VALIDER';
  if (s === 'validee') return 'VALIDEE';
  if (s === 'rejetee') return 'REJETEE';
  return (raw ?? '-').toString();
};

export default function ResponsableN2DepensesPage() {
  const router = useRouter();
  const [depenses, setDepenses] = React.useState<DepenseRow[]>([]);
  const [filter, setFilter] = React.useState<StatusFilter>('a_valider_n2');
  const [selected, setSelected] = React.useState<DepenseRow | null>(null);
  const [selectedTicket, setSelectedTicket] = React.useState<DepenseRow | null>(null);
  const [ticketRegleeFilter, setTicketRegleeFilter] = React.useState<TicketRegleeFilter>('tous');
  const [currentUserId, setCurrentUserId] = React.useState<string | null>(null);
  const [matriculeValideur, setMatriculeValideur] = React.useState('');
  const [nomValideur, setNomValideur] = React.useState('');
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [pjError, setPjError] = React.useState<string | null>(null);
  const [pjPreviewOpen, setPjPreviewOpen] = React.useState(false);
  const [pjSignedUrl, setPjSignedUrl] = React.useState<string | null>(null);
  const [pjContentType, setPjContentType] = React.useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectReason, setRejectReason] = React.useState('');
  const [rejectError, setRejectError] = React.useState<string | null>(null);
  const [isActionSubmitting, setIsActionSubmitting] = React.useState(false);
  const [actionSuccess, setActionSuccess] = React.useState<string | null>(null);
  const [fetchError, setFetchError] = React.useState<string | null>(null);
  const [reglementError, setReglementError] = React.useState<string | null>(null);

  const CACHE_TTL_MS = 1000 * 30;

  const refresh = React.useCallback(async () => {
    setFetchError(null);
    try {
      const cached = cacheGet<DepenseRow[]>('depenses:responsable-n2', CACHE_TTL_MS);
      if (cached && Array.isArray(cached) && cached.length > 0) {
        setDepenses(cached);
      }

      const { data, error } = await supabase
        .from('depenses')
        .select(
          'id, date_depense, categorie, montant_ttc, montant_ht, tva, montant_tva, statut, saisisseur_id, ligne, sous_ligne, libelle, piece_justificative_url, motif_rejet, fournisseur, nom_beneficiaire, mois, nom_vehicule, nom_commercial, provenance, nom_produit, quantite_kg, dossier_importation, valideur_id, mode_reglement, nom_beneficiaire_reglement, piece_reglement_url, reglee_at, reglee_par'
        )
        .order('date_depense', { ascending: false });

      if (error) {
        setFetchError(error.message);
        setDepenses([]);
        return;
      }

      const rows = (data ?? []) as DepenseRow[];

      const saisisseurIds = Array.from(
        new Set(rows.map((r) => r.saisisseur_id).filter((x): x is string => !!x))
      );

      if (saisisseurIds.length === 0) {
        setDepenses(rows);
        return;
      }

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, nom_complet')
        .in('id', saisisseurIds);

      if (profilesError) {
        setDepenses(rows);
        return;
      }

      const nameById = new Map(
        ((profiles ?? []) as Array<{ id: string; nom_complet: string | null }>).map((p) => [
          p.id,
          p.nom_complet,
        ])
      );

      setDepenses(
        rows.map((r) => ({
          ...r,
          saisisseur_nom: r.saisisseur_id ? nameById.get(r.saisisseur_id) ?? null : null,
        }))
      );

      cacheSet(
        'depenses:responsable-n2',
        rows.map((r) => ({
          ...r,
          saisisseur_nom: r.saisisseur_id ? nameById.get(r.saisisseur_id) ?? null : null,
        }))
      );
    } catch (e: unknown) {
      setFetchError(e instanceof Error ? e.message : String(e));
      setDepenses([]);
    }
  }, []);

  React.useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!data.session) {
          router.replace('/login?redirect=/responsable-n2/depenses');
          return;
        }

        const userId = data.session.user.id;
        setCurrentUserId(userId);
        (async () => {
          try {
            const { data: profile } = await supabase
              .from('profiles')
              .select('id, matricule, nom_complet, role')
              .eq('id', userId)
              .maybeSingle();

            const p = profile as ProfileRow | null;
            const role = (p?.role ?? '').toString().trim().toLowerCase();
            if (role && role !== 'responsable niveau 2') {
              await supabase.auth.signOut();
              router.replace('/login?redirect=/responsable-n2/depenses');
              return;
            }
            if (p?.matricule) setMatriculeValideur(p.matricule);
            if (p?.nom_complet) setNomValideur(p.nom_complet);
          } catch {
            // ignore
          }
        })();

        refresh();
      })
      .catch(() => {
        router.replace('/login?redirect=/responsable-n2/depenses');
      });
  }, [refresh, router]);

  const filteredDepenses = React.useMemo(() => {
    if (!filter) return depenses;
    return depenses.filter((d) => normalizeStatut(d.statut) === filter);
  }, [depenses, filter]);

  const depensesTicketsReglement = React.useMemo(() => {
    const base = depenses.filter(
      (d) => (d.statut ?? '').toString().trim().toUpperCase() === 'TICKET_REGLEMENT_GENERE'
    );
    if (ticketRegleeFilter === 'reglees') return base.filter((d) => !!d.reglee_at);
    if (ticketRegleeFilter === 'non_reglees') return base.filter((d) => !d.reglee_at);
    return base;
  }, [depenses, ticketRegleeFilter]);

  const isImagePreview = React.useMemo(() => {
    const t = (pjContentType ?? '').toLowerCase();
    return t.startsWith('image/');
  }, [pjContentType]);

  const isPdfPreview = React.useMemo(() => {
    const t = (pjContentType ?? '').toLowerCase();
    return t === 'application/pdf';
  }, [pjContentType]);

  const openReglementProof = async (d: DepenseRow) => {
    setReglementError(null);
    const raw = (d.piece_reglement_url ?? '').toString().trim();
    if (!raw) return;

    const storagePath = raw
      .replace(/^\/+/, '')
      .replace(/^pieces-reglement\//i, '')
      .replace(/^public\//i, '');

    const { data, error } = await supabase
      .storage
      .from('pieces-reglement')
      .createSignedUrl(storagePath, 60 * 5);

    if (error || !data?.signedUrl) {
      const msg = (error?.message ?? '').toLowerCase();
      const isNotFound = msg.includes('not found') || msg.includes('object not found');

      if (isNotFound) {
        const parts = storagePath.split('/').filter(Boolean);
        if (parts.length >= 2) {
          const prefix = `${parts[0]}/${parts[1]}`;
          const { data: files, error: listError } = await supabase
            .storage
            .from('pieces-reglement')
            .list(prefix, { limit: 100, offset: 0, sortBy: { column: 'updated_at', order: 'desc' } });

          if (!listError && files && files.length > 0) {
            const file =
              files.find((f) => !!f.name && (f as { id?: string }).id !== null) ?? files[0];
            const repairedPath = `${prefix}/${file.name}`;
            const { data: repairedSigned, error: repairedErr } = await supabase
              .storage
              .from('pieces-reglement')
              .createSignedUrl(repairedPath, 60 * 5);

            if (!repairedErr && repairedSigned?.signedUrl) {
              const lower = repairedPath.toLowerCase();
              const ext = lower.includes('.') ? lower.split('.').pop() ?? '' : '';
              const contentTypeByExt: Record<string, string> = {
                pdf: 'application/pdf',
                png: 'image/png',
                jpg: 'image/jpeg',
                jpeg: 'image/jpeg',
                webp: 'image/webp',
              };

              setPjSignedUrl(repairedSigned.signedUrl);
              setPjContentType(contentTypeByExt[ext] ?? null);
              setPjPreviewOpen(true);

              await supabase
                .from('depenses')
                .update({ piece_reglement_url: repairedPath })
                .eq('id', d.id);

              setDepenses((prev) =>
                prev.map((x) => (x.id === d.id ? { ...x, piece_reglement_url: repairedPath } : x))
              );
              return;
            }
          }
        }
      }

      setReglementError(
        (error?.message ?? "Impossible d'ouvrir la pièce de règlement.") +
          ` (bucket=pieces-reglement, path=${storagePath})`
      );
      return;
    }

    const lower = storagePath.toLowerCase();
    const ext = lower.includes('.') ? lower.split('.').pop() ?? '' : '';
    const contentTypeByExt: Record<string, string> = {
      pdf: 'application/pdf',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
    };

    setPjSignedUrl(data.signedUrl);
    setPjContentType(contentTypeByExt[ext] ?? null);
    setPjPreviewOpen(true);
  };

  const downloadTicketPdf = (d: DepenseRow) => {
    const ticketNo = `n°${d.id.slice(0, 4).toUpperCase()}`;
    const w = window.open('about:blank', '_blank');
    if (!w) {
      setReglementError("Impossible d'ouvrir la fenêtre d'impression (popup bloquée).");
      return;
    }

    w.document.title = `Ticket de règlement ${ticketNo}`;
    w.focus();

    const escapeHtml = (input: unknown) =>
      String(input ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');

    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Ticket de règlement ${escapeHtml(ticketNo)}</title>
    <style>
      @page { margin: 18mm; }
      body { font-family: Arial, Helvetica, sans-serif; color: #111; }
      .header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 16px; }
      .brand { font-size: 16px; font-weight: 700; }
      .title { font-size: 18px; font-weight: 700; }
      .meta { font-size: 12px; color: #444; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th, td { border: 1px solid #ddd; padding: 10px; font-size: 12px; }
      th { background: #f5f5f5; text-align: left; }
      .footer { margin-top: 18px; font-size: 11px; color: #666; }
    </style>
  </head>
  <body>
    <div class="header">
      <div class="brand">Additif Solutions</div>
      <div class="meta">${escapeHtml(new Date().toLocaleString())}</div>
    </div>
    <div class="title">Ticket de règlement ${escapeHtml(ticketNo)}</div>

    <table>
      <tbody>
        <tr>
          <th>Mode de règlement</th>
          <td>${escapeHtml(d.mode_reglement ?? '—')}</td>
        </tr>
        <tr>
          <th>Nom du bénéficiaire</th>
          <td>${escapeHtml(d.nom_beneficiaire_reglement ?? '—')}</td>
        </tr>
        <tr>
          <th>Montant TTC</th>
          <td>${escapeHtml(formatDzd(d.montant_ttc))} DZD</td>
        </tr>
      </tbody>
    </table>

    <div class="footer">Document généré depuis l'application.</div>
  </body>
</html>`;

    w.document.open();
    w.document.write(html);
    w.document.close();

    w.onload = () => {
      try {
        w.focus();
        w.print();
      } catch {
        // ignore
      }
    };
  };

  const markTicketAsSigned = async (d: DepenseRow) => {
    setReglementError(null);
    if (!currentUserId) {
      setReglementError('Utilisateur non identifié.');
      return;
    }
    if (isActionSubmitting) return;
    setIsActionSubmitting(true);
    try {
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from('depenses')
        .update({ reglee_at: nowIso, reglee_par: currentUserId })
        .eq('id', d.id);
      if (error) {
        setReglementError(error.message);
        return;
      }
      setDepenses((prev) =>
        prev.map((x) => (x.id === d.id ? { ...x, reglee_at: nowIso, reglee_par: currentUserId } : x))
      );
      setActionSuccess('Ticket signé.');
      setSelectedTicket(null);
      await refresh();
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const markTicketAsReglee = async (d: DepenseRow) => {
    setReglementError(null);
    if (!currentUserId) {
      setReglementError('Utilisateur non identifié.');
      return;
    }
    if (isActionSubmitting) return;
    setIsActionSubmitting(true);
    try {
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from('depenses')
        .update({ reglee_at: nowIso, reglee_par: currentUserId })
        .eq('id', d.id);
      if (error) {
        setReglementError(error.message);
        return;
      }
      setDepenses((prev) =>
        prev.map((x) => (x.id === d.id ? { ...x, reglee_at: nowIso, reglee_par: currentUserId } : x))
      );

      if (d.saisisseur_id) {
        try {
          await createNotification({
            userId: d.saisisseur_id,
            depenseId: d.id,
            type: 'DEPENSE_VALIDEE',
            title: 'Ticket réglé',
            body: `Votre ticket de règlement n°${d.id.slice(0, 4).toUpperCase()} a été marqué comme réglé.`,
          });
        } catch {
          // ignore notification failures
        }
      }
      setActionSuccess('Ticket marqué comme réglé.');
      setSelectedTicket(null);
      await refresh();
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const createNotification = React.useCallback(
    async (args: {
      userId: string;
      depenseId: string;
      title: string;
      body: string;
      type: 'DEPENSE_VALIDEE' | 'DEPENSE_REJETEE';
    }) => {
      const { error } = await supabase.from('notifications').insert({
        user_id: args.userId,
        depense_id: args.depenseId,
        type: args.type,
        title: args.title,
        body: args.body,
      });
      if (error) {
        throw new Error(`Notification: ${error.message}`);
      }
    },
    []
  );

  const updateStatutLocal = (next: string) => {
    if (!selected) return;
    const updated = { ...selected, statut: next };
    setSelected(updated);
    setDepenses((prev) => prev.map((d) => (d.id === selected.id ? updated : d)));
  };

  const openPieceJustificative = async (d: DepenseRow) => {
    setPjError(null);
    if (!d.piece_justificative_url) return;
    const { data, error } = await supabase
      .storage
      .from('pieces-justificatives')
      .createSignedUrl(d.piece_justificative_url, 60 * 5);

    if (error || !data?.signedUrl) {
      setPjError(error?.message ?? "Impossible d'ouvrir la pièce justificative.");
      return;
    }

    const lower = (d.piece_justificative_url ?? '').toString().toLowerCase();
    const ext = lower.includes('.') ? lower.split('.').pop() ?? '' : '';
    const contentTypeByExt: Record<string, string> = {
      pdf: 'application/pdf',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
    };

    setPjSignedUrl(data.signedUrl);
    setPjContentType(contentTypeByExt[ext] ?? null);
    setPjPreviewOpen(true);
  };

  const validateSelected = async () => {
    if (!selected) return;
    const current = normalizeStatut(selected.statut);
    if (current === 'validee') return;
    if (isActionSubmitting) return;

    setIsActionSubmitting(true);
    setActionSuccess(null);

    const { error } = await supabase
      .from('depenses')
      .update({ statut: toDbStatut('validee'), valideur_id: currentUserId })
      .eq('id', selected.id);

    if (!error) {
      updateStatutLocal('VALIDEE');
      setActionSuccess('Dépense validée.');

      const saisisseurId = selected.saisisseur_id ?? null;
      if (saisisseurId) {
        try {
          await createNotification({
            userId: saisisseurId,
            depenseId: selected.id,
            type: 'DEPENSE_VALIDEE',
            title: 'Dépense validée',
            body: `Message de validation : « votre dépense n°${selected.id
              .slice(0, 4)
              .toUpperCase()} dont le libellé est \"${(selected.libelle ?? '').toString()}\" a été validée. »`,
          });
        } catch (e: unknown) {
          setFetchError(e instanceof Error ? e.message : String(e));
        }
      }

      refresh();
    } else {
      setFetchError(error.message);
    }

    setIsActionSubmitting(false);
  };

  const confirmReject = async () => {
    if (!selected) return;
    const current = normalizeStatut(selected.statut);
    if (current === 'validee') {
      setRejectError("Impossible de rejeter une dépense déjà validée.");
      return;
    }
    if (current === 'rejetee') {
      setRejectOpen(false);
      setRejectReason('');
      setRejectError(null);
      return;
    }

    const reason = rejectReason.trim();
    if (!reason) {
      setRejectError('Veuillez saisir le motif du rejet.');
      return;
    }

    if (isActionSubmitting) return;
    setIsActionSubmitting(true);
    setActionSuccess(null);
    setRejectError(null);

    const { error } = await supabase
      .from('depenses')
      .update({ statut: toDbStatut('rejetee'), motif_rejet: reason, valideur_id: currentUserId })
      .eq('id', selected.id);

    if (!error) {
      updateStatutLocal('REJETEE');
      setActionSuccess('Dépense rejetée.');

      const saisisseurId = selected.saisisseur_id ?? null;
      if (saisisseurId) {
        try {
          const libelle = (selected.libelle ?? '').toString().trim();
          const libellePart = libelle ? ` dont le libellé est "${libelle}"` : '';
          await createNotification({
            userId: saisisseurId,
            depenseId: selected.id,
            type: 'DEPENSE_REJETEE',
            title: 'Dépense rejetée',
            body: `Message de rejet : « votre dépense n°${selected.id
              .slice(0, 4)
              .toUpperCase()} dont le libellé est \"${libelle}\" a été rejetée pour le motif suivant : ${reason} »`,
          });
        } catch (e: unknown) {
          setFetchError(e instanceof Error ? e.message : String(e));
        }
      }

      setRejectOpen(false);
      setRejectReason('');
      refresh();
    } else {
      setRejectError(error.message);
      setFetchError(error.message);
    }

    setIsActionSubmitting(false);
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
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <NotificationsBell variant="inline" />
            <Button
              variant="outlined"
              color="primary"
              onClick={async () => {
                await supabase.auth.signOut();
                router.replace('/login');
              }}
              size="medium"
              sx={{
                textTransform: 'none',
                fontWeight: 500,
                px: 2,
                py: 1,
              }}
            >
              Se déconnecter
            </Button>
          </Box>
        </Container>
      </Box>

      <Container maxWidth={false} sx={{ px: { xs: 2, sm: 4, md: 6 }, py: 4, pt: 8 }}>
        <Paper sx={{ p: { xs: 2, sm: 3 } }}>
          <Snackbar
            open={!!fetchError}
            autoHideDuration={8000}
            onClose={() => setFetchError(null)}
            anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
          >
            <Alert severity="error" variant="filled" onClose={() => setFetchError(null)}>
              {fetchError}
            </Alert>
          </Snackbar>

          <Snackbar
            open={!!reglementError}
            autoHideDuration={8000}
            onClose={() => setReglementError(null)}
            anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
          >
            <Alert severity="error" variant="filled" onClose={() => setReglementError(null)}>
              {reglementError}
            </Alert>
          </Snackbar>

          <Snackbar
            open={!!actionSuccess}
            autoHideDuration={4000}
            onClose={() => setActionSuccess(null)}
            anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
          >
            <Alert severity="success" variant="filled" onClose={() => setActionSuccess(null)}>
              {actionSuccess}
            </Alert>
          </Snackbar>

          <Typography variant="h5" sx={{ mb: 2 }}>
            Validation niveau 2
          </Typography>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
              gap: 2,
              mb: 3,
              maxWidth: 520,
            }}
          >
            <TextField
              label="Matricule du Valideur"
              value={matriculeValideur}
              size="small"
              InputProps={{ readOnly: true }}
            />
            <TextField
              label="Nom du Valideur"
              value={nomValideur}
              size="small"
              InputProps={{ readOnly: true }}
            />
          </Box>

          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              gap: 2,
              mb: 2,
              alignItems: { xs: 'stretch', sm: 'center' },
            }}
          >
            <TextField
              select
              label="Statut"
              size="small"
              value={filter}
              onChange={(e) => setFilter(e.target.value as StatusFilter)}
              sx={{ minWidth: 220 }}
            >
              <MenuItem value="">Tous</MenuItem>
              <MenuItem value="a_valider_n2">A valider</MenuItem>
              <MenuItem value="validee">Validée</MenuItem>
              <MenuItem value="rejetee">Rejetée</MenuItem>
            </TextField>

            <Button variant="outlined" onClick={refresh}>
              Actualiser
            </Button>

            <Button
              variant="contained"
              disabled={!selected}
              onClick={() => setDetailsOpen(true)}
              sx={{ minWidth: 140 }}
            >
              Détails
            </Button>
          </Box>

          <Box sx={{ width: '100%', overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 900 }}>
              <TableHead>
                <TableRow
                  sx={{
                    '& th': {
                      backgroundColor: '#217346',
                      color: '#fff',
                      fontWeight: 700,
                    },
                  }}
                >
                  <TableCell>Num dépense</TableCell>
                  <TableCell>Ligne</TableCell>
                  <TableCell>Sous ligne</TableCell>
                  <TableCell>libellé</TableCell>
                  <TableCell align="right">Montant TTC</TableCell>
                  <TableCell>saisisseur</TableCell>
                  <TableCell>Statut</TableCell>
                  <TableCell>PJ</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredDepenses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} sx={{ whiteSpace: 'nowrap' }}>
                      Aucune saisie trouvée.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredDepenses.map((d) => (
                    <TableRow
                      key={d.id}
                      hover
                      onClick={() => setSelected(d)}
                      selected={selected?.id === d.id}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{`n°${d.id.slice(0, 4).toUpperCase()}`}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{prettyText(d.ligne)}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{prettyText(d.sous_ligne)}</TableCell>
                      <TableCell sx={{ minWidth: 220, whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
                        {d.libelle ?? '-'}
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{`${formatDzd(d.montant_ttc)} DZD`}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{d.saisisseur_nom ?? (d.saisisseur_id ? 'Saisisseur inconnu' : '-')}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{statutLabel(d.statut)}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {d.piece_justificative_url ? (
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={(e) => {
                              e.stopPropagation();
                              void openPieceJustificative(d);
                            }}
                          >
                            Voir
                          </Button>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Box>

          <Paper sx={{ p: { xs: 2, sm: 3 }, mt: 3 }}>
            <Typography variant="h6" gutterBottom sx={{ fontSize: { xs: '1.05rem', sm: '1.15rem' } }}>
              Ticket de règlement
            </Typography>

            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
              <TextField
                select
                label="Filtre"
                size="small"
                value={ticketRegleeFilter}
                onChange={(e) => setTicketRegleeFilter(e.target.value as TicketRegleeFilter)}
                sx={{ minWidth: 220 }}
              >
                <MenuItem value="tous">Tous</MenuItem>
                <MenuItem value="non_reglees">Non réglées</MenuItem>
                <MenuItem value="reglees">Réglées</MenuItem>
              </TextField>
            </Box>

            <Box sx={{ width: '100%', overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: 980 }}>
                <TableHead>
                  <TableRow
                    sx={{
                      '& th': {
                        backgroundColor: '#217346',
                        color: '#fff',
                        fontWeight: 700,
                      },
                    }}
                  >
                    <TableCell>Ticket</TableCell>
                    <TableCell>Mode</TableCell>
                    <TableCell>Bénéficiaire</TableCell>
                    <TableCell align="right">Montant TTC</TableCell>
                    <TableCell>Pièce</TableCell>
                    <TableCell align="center">PDF</TableCell>
                    <TableCell align="center">Réglée</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {depensesTicketsReglement.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} sx={{ whiteSpace: 'nowrap' }}>
                        Aucun ticket généré.
                      </TableCell>
                    </TableRow>
                  ) : (
                    depensesTicketsReglement.map((t) => (
                      <TableRow
                        key={t.id}
                        hover
                        selected={selectedTicket?.id === t.id}
                        sx={{ cursor: 'pointer' }}
                        onClick={() => setSelectedTicket(t)}
                      >
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{`n°${t.id
                          .slice(0, 4)
                          .toUpperCase()}`}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{t.mode_reglement ?? '—'}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          {t.nom_beneficiaire_reglement ?? '—'}
                        </TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                          {formatDzd(t.montant_ttc)} DZD
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          {t.piece_reglement_url ? (
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={(e) => {
                                e.stopPropagation();
                                void openReglementProof(t);
                              }}
                            >
                              Voir
                            </Button>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={(e) => {
                              e.stopPropagation();
                              downloadTicketPdf(t);
                            }}
                          >
                            Télécharger
                          </Button>
                        </TableCell>
                        <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                          <Button
                            size="small"
                            variant="contained"
                            disabled={isActionSubmitting || !!t.reglee_at}
                            onClick={(e) => {
                              e.stopPropagation();
                              void markTicketAsReglee(t);
                            }}
                          >
                            {t.reglee_at ? 'Réglée' : 'Marquer réglée'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Box>
          </Paper>

          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              gap: 2,
              mt: 3,
              flexWrap: 'wrap',
            }}
          >
            <Button
              variant="contained"
              disabled={!selected || isActionSubmitting}
              onClick={() => void validateSelected()}
              sx={{
                py: 1.6,
                px: 4,
                fontWeight: 700,
                borderRadius: 2,
                minWidth: 220,
                boxShadow: 2,
                textTransform: 'uppercase',
              }}
            >
              Valider
            </Button>

            <Button
              variant="contained"
              color="error"
              disabled={!selected || isActionSubmitting || normalizeStatut(selected.statut) === 'validee'}
              onClick={() => {
                setRejectError(null);
                setRejectReason('');
                setRejectOpen(true);
              }}
              sx={{
                py: 1.6,
                px: 4,
                fontWeight: 700,
                borderRadius: 2,
                minWidth: 220,
                boxShadow: 2,
                textTransform: 'uppercase',
              }}
            >
              Rejeter
            </Button>
          </Box>

          <Dialog
            open={detailsOpen}
            onClose={() => setDetailsOpen(false)}
            fullWidth
            maxWidth="sm"
            scroll="paper"
            PaperProps={{ sx: { mt: 10, maxHeight: 'calc(100vh - 96px)' } }}
          >
            <DialogTitle>Détails de la saisie</DialogTitle>
            <DialogContent dividers>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Box>
                  <Typography variant="subtitle2">Num dépense</Typography>
                  <Typography variant="body1">{selected?.id ? `n°${selected.id.slice(0, 4).toUpperCase()}` : '-'}</Typography>
                </Box>
                <Box>
                  <Typography variant="subtitle2">Nom du saisisseur</Typography>
                  <Typography variant="body1">{selected?.saisisseur_nom ?? '-'}</Typography>
                </Box>
                <Box>
                  <Typography variant="subtitle2">Date</Typography>
                  <Typography variant="body1">{selected?.date_depense ?? '-'}</Typography>
                </Box>
                <Box>
                  <Typography variant="subtitle2">Catégorie</Typography>
                  <Typography variant="body1">{prettyText(selected?.categorie)}</Typography>
                </Box>
                <Box>
                  <Typography variant="subtitle2">Ligne</Typography>
                  <Typography variant="body1">{prettyText(selected?.ligne)}</Typography>
                </Box>
                <Box>
                  <Typography variant="subtitle2">Sous ligne</Typography>
                  <Typography variant="body1">{prettyText(selected?.sous_ligne)}</Typography>
                </Box>
                <Box>
                  <Typography variant="subtitle2">Libellé</Typography>
                  <Typography variant="body1" sx={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                    {selected?.libelle ?? '-'}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="subtitle2">Montant TTC</Typography>
                  <Typography variant="body1">{selected?.montant_ttc != null ? `${formatDzd(selected.montant_ttc)} DZD` : '-'}</Typography>
                </Box>
                <Box>
                  <Typography variant="subtitle2">Statut</Typography>
                  <Typography variant="body1">{statutLabel(selected?.statut)}</Typography>
                </Box>
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDetailsOpen(false)}>Fermer</Button>
            </DialogActions>
          </Dialog>

          <Dialog
            open={pjPreviewOpen}
            onClose={() => {
              setPjPreviewOpen(false);
              setPjSignedUrl(null);
              setPjContentType(null);
              setPjError(null);
            }}
            fullWidth
            maxWidth="md"
            scroll="paper"
            PaperProps={{ sx: { mt: 10, maxHeight: 'calc(100vh - 96px)' } }}
          >
            <DialogTitle>Pièce justificative</DialogTitle>
            <DialogContent dividers>
              {pjError ? (
                <Typography color="error">{pjError}</Typography>
              ) : pjSignedUrl ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {isImagePreview ? (
                    <Box
                      component="img"
                      src={pjSignedUrl}
                      alt="Pièce justificative"
                      sx={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }}
                    />
                  ) : isPdfPreview ? (
                    <Box
                      component="iframe"
                      src={pjSignedUrl}
                      sx={{ width: '100%', height: '70vh', border: 0 }}
                      title="Pièce"
                    />
                  ) : (
                    <Typography>
                      Aperçu indisponible pour ce type de fichier. Utilisez Ouvrir.
                    </Typography>
                  )}
                </Box>
              ) : (
                <Typography>Loading...</Typography>
              )}
            </DialogContent>
            <DialogActions>
              <Button
                variant="outlined"
                color="primary"
                size="medium"
                sx={{ textTransform: 'none', fontWeight: 500, px: 2, py: 1 }}
                disabled={!pjSignedUrl}
                onClick={() => {
                  if (!pjSignedUrl) return;
                  window.open(pjSignedUrl, '_blank', 'noopener,noreferrer');
                }}
              >
                Ouvrir
              </Button>
              <Button
                variant="outlined"
                color="primary"
                size="medium"
                sx={{ textTransform: 'none', fontWeight: 500, px: 2, py: 1 }}
                onClick={() => {
                  setPjPreviewOpen(false);
                  setPjSignedUrl(null);
                  setPjContentType(null);
                  setPjError(null);
                }}
              >
                Fermer
              </Button>
            </DialogActions>
          </Dialog>

          <Dialog
            open={rejectOpen}
            onClose={() => {
              setRejectOpen(false);
              setRejectError(null);
              setRejectReason('');
            }}
            fullWidth
            maxWidth="sm"
          >
            <DialogTitle>Motif du rejet</DialogTitle>
            <DialogContent dividers>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Typography variant="body2">
                  Veuillez indiquer la raison du rejet. Ce champ est obligatoire.
                </Typography>
                <TextField
                  label="Motif"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  multiline
                  minRows={3}
                  fullWidth
                  error={!!rejectError}
                  helperText={rejectError ?? ' '}
                />
              </Box>
            </DialogContent>
            <DialogActions>
              <Button
                onClick={() => {
                  setRejectOpen(false);
                  setRejectError(null);
                  setRejectReason('');
                }}
              >
                Annuler
              </Button>
              <Button
                variant="contained"
                color="error"
                disabled={!selected || isActionSubmitting}
                onClick={() => void confirmReject()}
              >
                Confirmer le rejet
              </Button>
            </DialogActions>
          </Dialog>
        </Paper>
      </Container>
    </>
  );
}
