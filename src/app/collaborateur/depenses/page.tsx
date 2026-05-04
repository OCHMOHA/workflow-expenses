"use client";

import * as React from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { NotificationsBell } from '@/components/NotificationsBell';
import {
  Box,
  Button,
  Container,
  Divider,
  MenuItem,
  Paper,
  InputAdornment,
  Alert,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs, { Dayjs } from 'dayjs';

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

const normalizeStatut = (statut: string | null | undefined) => {
  const s = (statut ?? '').toString().trim().toUpperCase();
  if (s === 'A_VALIDER_N2') return 'SOUMISE';
  return s || '-';
};

type DepenseRow = {
  id: string;
  date_depense: string;
  categorie: string;
  montant_ttc: number;
  statut: string;
  saisisseur_id?: string;
  montant_ht?: number;
  tva?: number;
  montant_tva?: number;
  fournisseur?: string | null;
  nom_beneficiaire?: string | null;
  mois?: string | null;
  nom_vehicule?: string | null;
  nom_commercial?: string | null;
  provenance?: string | null;
  nom_produit?: string | null;
  quantite_kg?: number | null;
  dossier_importation?: string | null;
  ligne?: string | null;
  sous_ligne?: string | null;
  libelle?: string | null;
  valideur_id?: string | null;
  mode_reglement?: string | null;
  nom_beneficiaire_reglement?: string | null;
  piece_reglement_url?: string | null;
  piece_justificative_url?: string | null;
  reglee_at?: string | null;
  reglee_par?: string | null;
  custom_fields?: Record<string, unknown> | null;
};

const expenseSchema = z.object({
  matricule: z.string().optional(),
  nomSaisisseur: z.string().optional(),
  dateDepense: z
    .date()
    .refine(
      (d) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const value = new Date(d);
        value.setHours(0, 0, 0, 0);

        return value.getTime() <= today.getTime();
      },
      { message: "La date ne peut pas être dans le futur" }
    ),
  categorie: z.string().min(1, 'Catégorie obligatoire'),
  ligne: z.string().min(1, 'Ligne obligatoire'),
  sousLigne: z.string().min(1, 'Sous-ligne obligatoire'),
  montantHt: z.number().nonnegative('Montant HT doit être positif'),
  tva: z.enum(['19%', '9%', '0%', 'NC']),
  montantTva: z.number().nonnegative('Montant TVA doit être positif'),
  montantTtc: z.number().nonnegative('Montant TTC doit être positif'),
  libelle: z
    .string()
    .min(3, 'Libellé trop court')
    .max(255, 'Libellé ne doit pas dépasser 255 caractères'),
  fournisseur: z.string().optional(),
  nomBeneficiaire: z.string().optional(),
  mois: z.string().optional(),
  nomVehicule: z.string().optional(),
  nomCommercial: z.string().optional(),
  provenance: z.string().optional(),
  nomProduit: z.string().optional(),
  quantiteKg: z.number().nonnegative('Quantité doit être positive').optional(),
  dossierImportation: z.string().optional(),
  pieceJustificative: z.any().optional(),
});

type ExpenseFormValues = z.infer<typeof expenseSchema>;

type ProfileRow = {
  id: string;
  matricule: string | null;
  nom_complet: string | null;
  role?: string | null;
};

type ValideurNameRow = {
  id: string;
  nom_complet: string | null;
};

type CustomSectionRow = {
  id: string;
  title: string;
  position: number;
  enabled: boolean;
};

type CustomFieldType = 'text' | 'textarea' | 'number' | 'select' | 'date' | 'file';

type CustomFieldRow = {
  id: string;
  section_id: string;
  key: string;
  label: string;
  type: CustomFieldType;
  required: boolean;
  enabled: boolean;
  position: number;
  options: unknown | null;
};

type FormFieldTypeV2 = 'text' | 'textarea' | 'number' | 'select' | 'date' | 'file';
type FieldTargetV2 = 'SYSTEM_COLUMN' | 'CUSTOM_JSON';

type FormFieldV2Row = {
  id: string;
  section_id: string;
  field_key: string | null;
  system_key: string | null;
  label: string;
  type: FormFieldTypeV2;
  target: FieldTargetV2;
  required: boolean;
  enabled: boolean;
  position: number;
  options: unknown | null;
  visible_when: unknown | null;
  is_mandatory: boolean;
};

const getCustomFieldKeyV2 = (f: FormFieldV2Row): string => {
  if (f.target !== 'CUSTOM_JSON') return '';
  return (f.field_key ?? '').toString().trim();
};

const getSystemFieldKeyV2 = (f: FormFieldV2Row): string | null => {
  if (f.target !== 'SYSTEM_COLUMN') return null;
  const k = (f.system_key ?? '').toString().trim();
  return k ? k : null;
};

const optionsArray = (v: unknown): string[] => {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (x ?? '').toString().trim())
    .filter((x) => x.length > 0);
};

const optionsSousLigneMap = (v: unknown): Record<string, string[]> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const rec = v as Record<string, unknown>;
  const out: Record<string, string[]> = {};
  for (const [k, val] of Object.entries(rec)) {
    const key = (k ?? '').toString().trim();
    if (!key) continue;
    out[key] = optionsArray(val);
  }
  return out;
};

async function getDepensesForCurrentUser(): Promise<DepenseRow[]> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.user) {
    return [];
  }

  const { data, error } = await supabase
    .from('depenses')
    .select(
      'id, date_depense, categorie, montant_ht, tva, montant_tva, fournisseur, nom_beneficiaire, mois, nom_vehicule, nom_commercial, provenance, nom_produit, quantite_kg, dossier_importation, ligne, sous_ligne, libelle, montant_ttc, statut, valideur_id, mode_reglement, nom_beneficiaire_reglement, piece_reglement_url, piece_justificative_url, reglee_at, reglee_par'
    )
    .eq('saisisseur_id', session.user.id)
    .order('date_depense', { ascending: false });

  if (error || !data) {
    return [];
  }

  return data as unknown as DepenseRow[];
}

const CACHE_TTL_MS = 1000 * 30;

const formatTvaValue = (tva: number | null | undefined) => {
  if (tva == null) return '-';
  if (!Number.isFinite(tva)) return '-';
  return `${tva}%`;
};

export default function CollaborateurDepensesPage() {
  const router = useRouter();
  const [depenses, setDepenses] = React.useState<DepenseRow[]>([]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [selectedDepense, setSelectedDepense] = React.useState<DepenseRow | null>(
    null
  );
  const [fetchError, setFetchError] = React.useState<string | null>(null);
  const [v2LoadError, setV2LoadError] = React.useState<string | null>(null);
  const [currentProfile, setCurrentProfile] = React.useState<ProfileRow | null>(null);
  const [valideurNameById, setValideurNameById] = React.useState<Map<string, string>>(
    () => new Map()
  );
  const [selectedReglement, setSelectedReglement] = React.useState<DepenseRow | null>(null);
  const [modeReglement, setModeReglement] = React.useState('');
  const [nomBeneficiaireReglement, setNomBeneficiaireReglement] = React.useState('');
  const [pieceReglement, setPieceReglement] = React.useState<File | null>(null);
  const [reglementError, setReglementError] = React.useState<string | null>(null);
  const [reglementSuccess, setReglementSuccess] = React.useState<string | null>(null);
  const [pjError, setPjError] = React.useState<string | null>(null);
  const [pjPreviewOpen, setPjPreviewOpen] = React.useState(false);
  const [pjSignedUrl, setPjSignedUrl] = React.useState<string | null>(null);
  const [pjContentType, setPjContentType] = React.useState<string | null>(null);
  const [isReglementSubmitting, setIsReglementSubmitting] = React.useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      matricule: '',
      nomSaisisseur: '',
      dateDepense: new Date(),
      categorie: '',
      ligne: '',
      sousLigne: '',
      montantHt: 0,
      tva: 'NC',
      montantTva: 0,
      montantTtc: 0,
      libelle: '',
      fournisseur: '',
      nomBeneficiaire: '',
      mois: '',
      nomVehicule: '',
      nomCommercial: '',
      provenance: '',
      nomProduit: '',
      quantiteKg: 0,
      dossierImportation: '',
      pieceJustificative: undefined,
    },
  });

  const hydrateDepensesFromCache = React.useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const userId = session?.user?.id;
    if (!userId) return;
    const cached = cacheGet<DepenseRow[]>(`depenses:collab:${userId}`, CACHE_TTL_MS);
    if (cached && Array.isArray(cached) && cached.length > 0) {
      setDepenses(cached);
    }
  }, []);

  const refreshMyDepenses = React.useCallback(async () => {
    const rows = await getDepensesForCurrentUser();
    setDepenses(rows);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (userId) cacheSet(`depenses:collab:${userId}`, rows);
  }, []);

  const openPieceJustificative = async (d: DepenseRow) => {
    setPjError(null);
    setPjSignedUrl(null);
    setPjContentType(null);
    const path = (d.piece_justificative_url ?? '').toString();
    if (!path) return;

    const lower = path.toLowerCase();
    const ext = lower.includes('.') ? lower.split('.').pop() ?? '' : '';
    const contentTypeByExt: Record<string, string> = {
      pdf: 'application/pdf',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
    };
    const inferredType = contentTypeByExt[ext] ?? null;

    const { data, error } = await supabase
      .storage
      .from('pieces-justificatives')
      .createSignedUrl(path, 60 * 5);

    if (error || !data?.signedUrl) {
      setPjError(error?.message ?? "Impossible d'ouvrir la pièce justificative.");
      return;
    }
    
    setPjSignedUrl(data.signedUrl);
    setPjContentType(inferredType);
    setPjPreviewOpen(true);
  };

  const isImagePreview = React.useMemo(() => {
    const t = (pjContentType ?? '').toLowerCase();
    return t.startsWith('image/');
  }, [pjContentType]);

  const isPdfPreview = React.useMemo(() => {
    const t = (pjContentType ?? '').toLowerCase();
    return t === 'application/pdf';
  }, [pjContentType]);

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
  const [customSections, setCustomSections] = React.useState<CustomSectionRow[]>([]);
  const [customFields, setCustomFields] = React.useState<CustomFieldRow[]>([]);
  const [customValues, setCustomValues] = React.useState<Record<string, unknown>>({});
  const [customFiles, setCustomFiles] = React.useState<Record<string, File | null>>({});
  const [v2Fields, setV2Fields] = React.useState<FormFieldV2Row[]>([]);
  const [v2FieldBySystemKey, setV2FieldBySystemKey] = React.useState<Map<string, FormFieldV2Row>>(
    () => new Map()
  );
  const [submitSuccess, setSubmitSuccess] = React.useState<{
    open: boolean;
    depenseId: string;
  }>({ open: false, depenseId: '' });
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const depensesValidees = React.useMemo(
    () => depenses.filter((d) => (d.statut ?? '').toString().trim().toUpperCase() === 'VALIDEE'),
    [depenses]
  );

  const depensesSoumises = React.useMemo(
    () => depenses.filter((d) => (d.statut ?? '').toString().trim().toUpperCase() === 'SOUMISE'),
    [depenses]
  );

  const depensesTicketsReglement = React.useMemo(
    () =>
      depenses.filter(
        (d) =>
          (d.statut ?? '').toString().trim().toUpperCase() === 'TICKET_REGLEMENT_GENERE' &&
          !d.reglee_at
      ),
    [depenses]
  );

  const handleSelectReglement = (d: DepenseRow) => {
    setSelectedReglement(d);
    setModeReglement(d.mode_reglement ?? '');
    setNomBeneficiaireReglement(d.nom_beneficiaire_reglement ?? '');
    setPieceReglement(null);
    setReglementError(null);
    setReglementSuccess(null);
  };

  const openReglementProof = async (d: DepenseRow) => {
    setReglementError(null);
    if (!d.piece_reglement_url) return;
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
      setReglementError(error?.message ?? "Impossible d'ouvrir la pièce de règlement.");
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const submitReglement = async () => {
    setReglementError(null);
    setReglementSuccess(null);
    if (!selectedReglement) return;

    const mode = modeReglement.trim();
    const nomBen = nomBeneficiaireReglement.trim();
    const depenseId = selectedReglement.id;

    if (!mode) {
      setReglementError('Veuillez sélectionner le mode de règlement.');
      return;
    }
    if (!nomBen) {
      setReglementError('Veuillez saisir le nom du bénéficiaire.');
      return;
    }
    if (!pieceReglement) {
      setReglementError('Veuillez numériser (télécharger) la pièce jointe.');
      return;
    }

    setIsReglementSubmitting(true);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session?.user) {
        setReglementError('Session expirée. Veuillez vous reconnecter.');
        return;
      }

      const userId = sessionData.session.user.id;

      const file = pieceReglement;
      const ext = file.name.includes('.') ? file.name.split('.').pop() : '';
      const safeExt = (ext ?? '').toString().toLowerCase();
      const allowed = ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'];
      if (!allowed.includes(safeExt)) {
        setReglementError('Format de fichier non autorisé.');
        return;
      }

      const uuid =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const computedPath = `${userId}/${depenseId}/${uuid}.${safeExt}`;
      const { data: uploadData, error: uploadError } = await supabase
        .storage
        .from('pieces-reglement')
        .upload(computedPath, file, { upsert: false, contentType: file.type });

      if (uploadError) {
        setReglementError(uploadError.message);
        return;
      }

      const storedPath = (uploadData as { path?: string } | null)?.path ?? computedPath;

      const { data: verifyData, error: verifyError } = await supabase
        .storage
        .from('pieces-reglement')
        .createSignedUrl(storedPath, 60);

      if (verifyError || !verifyData?.signedUrl) {
        setReglementError(
          (verifyError?.message ?? "Impossible de vérifier l'upload de la pièce de règlement.") +
          ` (${storedPath})`
        );
        return;
      }

      const { data: updatedRows, error: updateError } = await supabase
        .from('depenses')
        .update({
          mode_reglement: mode,
          nom_beneficiaire_reglement: nomBen,
          piece_reglement_url: storedPath,
          statut: 'TICKET_REGLEMENT_GENERE',
        })
        .eq('id', depenseId)
        .select(
          'id, date_depense, categorie, montant_ht, tva, montant_tva, fournisseur, nom_beneficiaire, mois, nom_vehicule, nom_commercial, provenance, nom_produit, quantite_kg, dossier_importation, ligne, sous_ligne, libelle, montant_ttc, statut, valideur_id, mode_reglement, nom_beneficiaire_reglement, piece_reglement_url, piece_justificative_url, reglee_at, reglee_par, custom_fields'
        );

      if (updateError) {
        setReglementError(updateError.message);
        return;
      }

      if (!updatedRows || updatedRows.length === 0) {
        setReglementError(
          "Mise à jour refusée (aucune ligne modifiée). Vérifiez les politiques RLS sur public.depenses (UPDATE) pour l'utilisateur connecté."
        );
        return;
      }

      const updated = (updatedRows ?? [])[0] as DepenseRow | undefined;
      if (!updated) {
        setReglementError(
          "Mise à jour refusée (aucune ligne modifiée). Vérifiez les politiques RLS sur public.depenses (UPDATE) pour l'utilisateur connecté."
        );
        return;
      }

      setSelectedReglement(updated);

      const modeUpper = mode.toUpperCase();
      if (modeUpper === 'CHÈQUE' || modeUpper === 'CHEQUE' || modeUpper === 'VIREMENT') {
        const { data: adminProfile, error: adminError } = await supabase
          .from('profiles')
          .select('id')
          .eq('matricule', 'RES1')
          .maybeSingle();

        if (!adminError && adminProfile?.id) {
          await supabase.from('notifications').insert({
            user_id: adminProfile.id,
            depense_id: depenseId,
            type: 'REGLEMENT_A_SIGNER',
            title: 'Règlement à signer',
            body: `Une demande de règlement (${mode}) est en attente de votre validation pour la dépense n°${depenseId
              .slice(0, 4)
              .toUpperCase()}.`,
          });
        }
      }

      setReglementSuccess(
        `Règlement enregistré. La dépense n°${depenseId.slice(0, 4).toUpperCase()} est en attente de règlement.`
      );
      setSelectedReglement(null);
      setModeReglement('');
      setNomBeneficiaireReglement('');
      setPieceReglement(null);
      await refreshMyDepenses();
    } finally {
      setIsReglementSubmitting(false);
    }
  };

  React.useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!data.session) {
          router.replace('/login?redirect=/collaborateur/depenses');
          return;
        }

        const userId = data.session.user.id;

        (async () => {
          try {
            const { data: profile } = await supabase
              .from('profiles')
              .select('id, matricule, nom_complet, role')
              .eq('id', userId)
              .maybeSingle();

            const p = profile as ProfileRow | null;
            setCurrentProfile(p);
            const role = (p?.role ?? '').toString().trim().toLowerCase();
            if (role && role !== 'collaborateur') {
              await supabase.auth.signOut();
              router.replace('/login?redirect=/collaborateur/depenses');
              return;
            }
            if (p?.matricule) {
              setValue('matricule', p.matricule, { shouldValidate: false });
            }
            if (p?.nom_complet) {
              setValue('nomSaisisseur', p.nom_complet, { shouldValidate: false });
            }
          } catch {
            // ignore profile autofill failures
          }
        })();

        (async () => {
          try {
            await hydrateDepensesFromCache();
            await refreshMyDepenses();
          } catch {
            setDepenses([]);
          }
        })();
      })
      .catch(() => {
        router.replace('/login?redirect=/collaborateur/depenses');
      });
  }, [hydrateDepensesFromCache, refreshMyDepenses, router]);

  React.useEffect(() => {
    const ids = Array.from(
      new Set(depenses.map((d) => d.valideur_id).filter((x): x is string => !!x))
    );
    if (ids.length === 0) {
      setValideurNameById(new Map());
      return;
    }

    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, nom_complet')
        .in('id', ids);

      if (error) {
        setFetchError(error.message);
        return;
      }

      const m = new Map(
        ((data ?? []) as ValideurNameRow[])
          .filter((r) => !!r.id && !!r.nom_complet)
          .map((r) => [r.id, r.nom_complet as string])
      );
      setValideurNameById(m);
    })();
  }, [depenses]);

  React.useEffect(() => {
    (async () => {
      try {
        const { data: secs, error: se } = await supabase
          .from('expense_form_sections')
          .select('id, title, position, enabled')
          .eq('enabled', true)
          .order('position', { ascending: true });
        if (se) return;

        const { data: flds, error: fe } = await supabase
          .from('expense_form_fields')
          .select(
            'id, section_id, key, label, type, required, enabled, position, options'
          )
          .eq('enabled', true)
          .order('position', { ascending: true });
        if (fe) return;

        setCustomSections((secs ?? []) as CustomSectionRow[]);
        setCustomFields((flds ?? []) as CustomFieldRow[]);
      } catch {
        // ignore
      }
    })();
  }, []);

  React.useEffect(() => {
    (async () => {
      try {
        setV2LoadError(null);
        const { data: flds, error: fe } = await supabase
          .from('expense_form_fields_v2')
          .select(
            'id, section_id, field_key, system_key, label, type, target, required, enabled, position, options, visible_when, is_mandatory'
          )
          .order('position', { ascending: true });
        if (fe) {
          setV2LoadError(fe.message);
          return;
        }

        const rows = (flds ?? []) as FormFieldV2Row[];
        // eslint-disable-next-line no-console
        console.log('V2 fields fetched:', rows.length);
        setV2Fields(rows);
        const m = new Map<string, FormFieldV2Row>();
        for (const r of rows) {
          const k = getSystemFieldKeyV2(r);
          if (k) m.set(k, r);
        }
        // eslint-disable-next-line no-console
        console.log('V2 system keys:', Array.from(m.keys()).sort());
        setV2FieldBySystemKey(m);
        if (!m.has('sous_ligne')) {
          setV2LoadError(
            "Le champ 'Sous-ligne' n'est pas accessible depuis ce compte (RLS/politiques) ou n'existe pas dans expense_form_fields_v2."
          );
        }
      } catch {
        setV2LoadError('Erreur lors du chargement du formulaire V2.');
      }
    })();
  }, []);

  React.useEffect(() => {
    const opt = v2FieldBySystemKey.get('sous_ligne')?.options;
    // eslint-disable-next-line no-console
    console.log('V2 sous_ligne options:', opt);
  }, [v2FieldBySystemKey]);

  const sousLigneValideurMap = React.useMemo((): Record<string, string> => {
    const opts = v2FieldBySystemKey.get('sous_ligne')?.options;
    if (!opts || typeof opts !== 'object' || Array.isArray(opts)) return {};
    const raw = (opts as Record<string, unknown>)._valideur_map;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim()) out[k] = v;
    }
    return out;
  }, [v2FieldBySystemKey]);

  const montantHt = watch('montantHt');
  const tva = watch('tva');
  const montantTva = watch('montantTva');
  const montantTtc = watch('montantTtc');
  const libelle = watch('libelle') ?? '';
  const categorieValue = watch('categorie');
  const ligneValue = watch('ligne');
  const matriculeValue = watch('matricule') ?? '';
  const nomSaisisseurValue = watch('nomSaisisseur') ?? '';
  const pieceJustificativeFile = watch('pieceJustificative');

  const selectedMontantHt =
    selectedDepense?.montant_ht != null ? selectedDepense.montant_ht : null;

  const selectedTvaRate =
    typeof selectedDepense?.tva === 'number' ? selectedDepense.tva / 100 : null;

  const selectedMontantTva =
    selectedDepense?.montant_tva != null
      ? selectedDepense.montant_tva
      : selectedMontantHt != null && selectedTvaRate != null
        ? selectedMontantHt * selectedTvaRate
        : null;

  const selectedTvaLabel = React.useMemo(() => {
    if (selectedDepense?.tva == null) return '-';
    if (!Number.isFinite(selectedDepense.tva)) return '-';
    if (selectedDepense.tva === 0 && selectedMontantTva == null) return 'NC';
    return `${selectedDepense.tva}%`;
  }, [selectedDepense?.tva, selectedMontantTva]);

  const tvaRate = React.useMemo(() => {
    if (tva === '19%') return 0.19;
    if (tva === '9%') return 0.09;
    if (tva === '0%') return 0;
    return null;
  }, [tva]);

  const handleDateChange = (value: Dayjs | null) => {
    if (value) {
      setValue('dateDepense', value.toDate(), { shouldValidate: true });
    }
  };

  const sanitizeAmountInput = (raw: string) => {
    const cleaned = raw
      .replace(',', '.')
      .replace(/[\s\u202F\u00A0]/g, '')
      .replace(/[^0-9.]/g, '')
      .replace(/(\..*)\./g, '$1');
    return cleaned;
  };

  const handleMontantChange =
    (field: 'montantHt') =>
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const cleaned = sanitizeAmountInput(e.target.value);

        const numericValue = cleaned === '' ? 0 : Number(cleaned);
        setValue(field, numericValue, { shouldValidate: true });

        const currentHt = numericValue;
        const nextTva = tvaRate == null ? montantTva : currentHt * tvaRate;
        setValue('montantTva', nextTva, { shouldValidate: true });

        const nextTtc = currentHt + nextTva;
        setValue('montantTtc', nextTtc, { shouldValidate: true });
      };

  const handleTvaSelectChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value as ExpenseFormValues['tva'];
    setValue('tva', next, { shouldValidate: true });

    const nextRate =
      next === '19%' ? 0.19 : next === '9%' ? 0.09 : next === '0%' ? 0 : null;
    const nextTva = nextRate == null ? montantTva : montantHt * nextRate;
    setValue('montantTva', nextTva, { shouldValidate: true });

    const nextTtc = montantHt + nextTva;
    setValue('montantTtc', nextTtc, { shouldValidate: true });
  };

  const handleMontantTvaManualChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = sanitizeAmountInput(e.target.value);
    const numericValue = cleaned === '' ? 0 : Number(cleaned);
    setValue('montantTva', numericValue, { shouldValidate: true });
    setValue('montantTtc', montantHt + numericValue, { shouldValidate: true });
  };

  const preventNonNumericKeys = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (['e', 'E', '+', '-'].includes(e.key)) {
      e.preventDefault();
      return;
    }

    if (e.key.length === 1) {
      const isDigit = e.key >= '0' && e.key <= '9';
      const isSeparator = e.key === '.' || e.key === ',';
      if (!isDigit && !isSeparator) {
        e.preventDefault();
      }
    }
  };

  const onSubmit = async (data: ExpenseFormValues) => {
    setIsSubmitting(true);
    try {
      const dateStr = dayjs(data.dateDepense).format('YYYY-MM-DD');
      const optimisticId = crypto.randomUUID();

      const { data: sessionData, error: sessionError2 } = await supabase.auth.getSession();
      if (sessionError2 || !sessionData.session?.user) {
        throw new Error('No authenticated session');
      }
      const userId = sessionData.session.user.id;

      let pieceJustificativePath: string | null = null;
      if (data.pieceJustificative instanceof File) {
        const file = data.pieceJustificative;
        const safeName = (file.name ?? 'piece').toString();
        const ext = safeName.includes('.') ? safeName.split('.').pop()!.toLowerCase() : '';
        const allowed = new Set(['pdf', 'png', 'jpg', 'jpeg', 'webp', 'doc', 'docx']);
        if (!allowed.has(ext)) {
          throw new Error('Format non supporté. Autorisés: PDF, PNG, JPG, WEBP, DOC, DOCX.');
        }
        const path = `${userId}/${optimisticId}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase
          .storage
          .from('pieces-justificatives')
          .upload(path, file, { upsert: false, contentType: file.type });

        if (uploadError) {
          throw new Error(uploadError.message);
        }
        pieceJustificativePath = path;
      }

      const v2CustomPayload: Record<string, unknown> = {};
      for (const f of v2Fields) {
        if (f.target !== 'CUSTOM_JSON') continue;
        if (!f.enabled) continue;
        const k = getCustomFieldKeyV2(f);
        if (!k) continue;
        const v = customValues?.[k];
        if (v == null) continue;
        const s = (v ?? '').toString();
        if (!s.trim()) continue;
        v2CustomPayload[k] = s;
      }
      const newRow: DepenseRow = {
        id: optimisticId,
        date_depense: dateStr,
        categorie: data.categorie,
        montant_ttc: data.montantTtc,
        statut: 'Brouillon',
        custom_fields: {
          ...v2CustomPayload,
        },
      };

      setDepenses((prev) => [newRow, ...prev]);

      setSubmitError(null);

      const payload = {
        date_depense: dateStr,
        categorie: data.categorie,
        montant_ht: data.montantHt,
        tva:
          data.tva === '19%'
            ? 19
            : data.tva === '9%'
              ? 9
              : 0,
        montant_tva: data.montantTva,
        fournisseur: data.fournisseur || null,
        nom_beneficiaire: data.nomBeneficiaire || null,
        mois: data.mois || null,
        nom_vehicule: data.nomVehicule || null,
        nom_commercial: data.nomCommercial || null,
        provenance: data.provenance || null,
        nom_produit: data.nomProduit || null,
        quantite_kg: typeof data.quantiteKg === 'number' ? data.quantiteKg : null,
        dossier_importation: data.dossierImportation || null,
        montant_ttc: data.montantTtc,
        statut: 'SOUMISE',
        saisisseur_id: userId,
        ligne: data.ligne,
        sous_ligne: data.sousLigne,
        libelle: data.libelle,
        piece_justificative_url: pieceJustificativePath,
        valideur_id: (data.sousLigne && sousLigneValideurMap[data.sousLigne]) ? sousLigneValideurMap[data.sousLigne] : null,
        custom_fields: {
          ...v2CustomPayload,
        },
      };

      const { data: insertedRows, error: insertError } = await supabase
        .from('depenses')
        .insert(payload)
        .select('id')
        .limit(1);

      if (!insertError) {
        const insertedId = insertedRows?.[0]?.id ?? optimisticId;
        setSubmitSuccess({ open: true, depenseId: insertedId });
        try {
          const rows = await getDepensesForCurrentUser();
          setDepenses(rows);
        } catch {
          setDepenses([]);
        }
      } else {
        setSubmitError(
          insertError.message ||
          'Insertion Supabase échouée. Vérifiez l\'authentification et les policies RLS.'
        );
      }

      reset({
        matricule: currentProfile?.matricule ?? '',
        nomSaisisseur: currentProfile?.nom_complet ?? '',
        dateDepense: new Date(),
        categorie: '',
        ligne: '',
        sousLigne: '',
        montantHt: 0,
        tva: 'NC',
        montantTva: 0,
        montantTtc: 0,
        libelle: '',
        fournisseur: '',
        nomBeneficiaire: '',
        mois: '',
        nomVehicule: '',
        nomCommercial: '',
        provenance: '',
        nomProduit: '',
        quantiteKg: 0,
        dossierImportation: '',
        pieceJustificative: undefined,
      });

      setCustomValues({});
      setCustomFiles({});
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  const isSystemFieldEnabled = React.useCallback(
    (systemKey: string) => {
      const f = v2FieldBySystemKey.get(systemKey);
      if (!f) return true;
      return !!f.enabled;
    },
    [v2FieldBySystemKey]
  );

  const depensesLigneOptions = React.useMemo(() => {
    const clean = (depenses ?? [])
      .map((d) => (d.ligne ?? '').toString().trim())
      .filter((x) => x.length > 0);
    return Array.from(new Set(clean)).sort((a, b) => a.localeCompare(b));
  }, [depenses]);

  const depensesCategorieOptions = React.useMemo(() => {
    const clean = (depenses ?? [])
      .map((d) => (d.categorie ?? '').toString().trim())
      .filter((x) => x.length > 0);
    return Array.from(new Set(clean)).sort((a, b) => a.localeCompare(b));
  }, [depenses]);

  const depensesSousLigneMap = React.useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const d of depenses ?? []) {
      const l = (d.ligne ?? '').toString().trim();
      const s = (d.sous_ligne ?? '').toString().trim();
      if (!l || !s) continue;
      if (!out[l]) out[l] = [];
      out[l].push(s);
    }
    for (const k of Object.keys(out)) {
      out[k] = Array.from(new Set(out[k])).sort((a, b) => a.localeCompare(b));
    }
    return out;
  }, [depenses]);

  const categorieOptions = React.useMemo(() => {
    const f = v2FieldBySystemKey.get('categorie');
    const v2 = optionsArray(f?.options);
    return v2.length > 0 ? v2 : depensesCategorieOptions;
  }, [depensesCategorieOptions, v2FieldBySystemKey]);

  const ligneOptions = React.useMemo(() => {
    const f = v2FieldBySystemKey.get('ligne');
    // Try map format first (categorie -> lignes)
    const v2Map = optionsSousLigneMap(f?.options);
    if (Object.keys(v2Map).length > 0) {
      return v2Map[categorieValue] ?? [];
    }
    // Fallback to flat array format (backward compat)
    const v2 = optionsArray(f?.options);
    return v2.length > 0 ? v2 : depensesLigneOptions;
  }, [depensesLigneOptions, v2FieldBySystemKey, categorieValue]);

  const sousLigneMap = React.useMemo(() => {
    const f = v2FieldBySystemKey.get('sous_ligne');
    const v2 = optionsSousLigneMap(f?.options);
    return Object.keys(v2).length > 0 ? v2 : depensesSousLigneMap;
  }, [depensesSousLigneMap, v2FieldBySystemKey]);

  const selectedLigne = (watch('ligne') ?? '').toString();

  const sousLigneOptions = React.useMemo(() => {
    const ligneValue = selectedLigne;
    const fromV2 = sousLigneMap[ligneValue] ?? [];
    if (fromV2.length > 0) return fromV2;
    return depensesSousLigneMap[ligneValue] ?? [];
  }, [depensesSousLigneMap, selectedLigne, sousLigneMap]);

  // Reset ligne and sous-ligne when categorie changes
  const prevCategorieRef = React.useRef(categorieValue);
  React.useEffect(() => {
    if (prevCategorieRef.current !== categorieValue) {
      prevCategorieRef.current = categorieValue;
      setValue('ligne', '', { shouldValidate: false });
      setValue('sousLigne', '', { shouldValidate: false });
    }
  }, [categorieValue, setValue]);

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
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
              onClick={handleLogout}
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

      <Container
        maxWidth={false}
        sx={{
          px: { xs: 2, sm: 4, md: 6 },
          py: 4,
          pt: 8,
          width: '100%',
          overflowX: 'hidden',
        }}
      >
        <Typography variant="h5" sx={{ mb: 2 }}>
          Espace Collaborateur
        </Typography>

        <Snackbar
          open={submitSuccess.open}
          autoHideDuration={5000}
          onClose={() => setSubmitSuccess((s) => ({ ...s, open: false }))}
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        >
          <Alert
            severity="success"
            variant="filled"
            onClose={() => setSubmitSuccess((s) => ({ ...s, open: false }))}
          >
            {`Votre dépense n°${submitSuccess.depenseId.slice(0, 4).toUpperCase()} est soumise pour validation.`}
          </Alert>
        </Snackbar>

        <Snackbar
          open={!!v2LoadError}
          autoHideDuration={10000}
          onClose={() => setV2LoadError(null)}
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        >
          <Alert severity="error" variant="filled" onClose={() => setV2LoadError(null)}>
            {v2LoadError}
          </Alert>
        </Snackbar>

        <Snackbar
          open={!!pjError}
          autoHideDuration={10000}
          onClose={() => setPjError(null)}
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        >
          <Alert severity="error" variant="filled" onClose={() => setPjError(null)}>
            {pjError}
          </Alert>
        </Snackbar>

        <Snackbar
          open={!!fetchError}
          autoHideDuration={10000}
          onClose={() => setFetchError(null)}
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        >
          <Alert severity="error" variant="filled" onClose={() => setFetchError(null)}>
            {fetchError}
          </Alert>
        </Snackbar>

        <Snackbar
          open={!!submitError}
          autoHideDuration={8000}
          onClose={() => setSubmitError(null)}
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        >
          <Alert
            severity="error"
            variant="filled"
            onClose={() => setSubmitError(null)}
          >
            {submitError}
          </Alert>
        </Snackbar>

        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: { xs: 2, md: 3 },
            width: '100%',
            minWidth: 0,
          }}
        >
          <Paper sx={{ p: { xs: 2, sm: 3 }, overflow: 'hidden' }}>
            <Typography
              variant="h6"
              gutterBottom
              sx={{ fontSize: { xs: '1.15rem', sm: '1.25rem' } }}
            >
              Nouvelle saisie
            </Typography>

            <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                  gap: 2,
                }}
              >
                <TextField
                  label="Matricule du saisisseur"
                  fullWidth
                  size="small"
                  value={matriculeValue}
                  {...register('matricule')}
                  error={!!errors.matricule}
                  helperText={errors.matricule?.message}
                  InputProps={{ readOnly: true }}
                />

                <TextField
                  label="Nom du saisisseur"
                  fullWidth
                  size="small"
                  value={nomSaisisseurValue}
                  {...register('nomSaisisseur')}
                  error={!!errors.nomSaisisseur}
                  helperText={errors.nomSaisisseur?.message}
                  InputProps={{ readOnly: true }}
                />

                <DatePicker
                  label="Date"
                  value={dayjs(watch('dateDepense'))}
                  maxDate={dayjs()}
                  onChange={handleDateChange}
                  slotProps={{
                    textField: {
                      fullWidth: true,
                      size: 'small',
                      error: !!errors.dateDepense,
                      helperText: errors.dateDepense?.message,
                    },
                  }}
                />

                {isSystemFieldEnabled('categorie') ? (
                  <TextField
                    select
                    label="Catégorie"
                    fullWidth
                    {...register('categorie')}
                    value={watch('categorie')}
                    size="small"
                    error={!!errors.categorie}
                    helperText={errors.categorie?.message}
                  >
                    <MenuItem value="">Tous</MenuItem>
                    {categorieOptions.map((o) => (
                      <MenuItem key={o} value={o}>
                        {prettyText(o)}
                      </MenuItem>
                    ))}
                  </TextField>
                ) : null}

                {isSystemFieldEnabled('ligne') ? (
                  <TextField
                    select
                    label="Ligne"
                    fullWidth
                    {...register('ligne')}
                    value={watch('ligne')}
                    size="small"
                    error={!!errors.ligne}
                    helperText={errors.ligne?.message}
                  >
                    <MenuItem value="">Tous</MenuItem>
                    {ligneOptions.map((o) => (
                      <MenuItem key={o} value={o}>
                        {prettyText(o)}
                      </MenuItem>
                    ))}
                  </TextField>
                ) : null}

                {ligneValue === 'frais_personnel' && (
                  <>
                    {isSystemFieldEnabled('nom_beneficiaire') ? (
                      <TextField
                        label="Nom bénéficiaire"
                        fullWidth
                        size="small"
                        {...register('nomBeneficiaire')}
                      />
                    ) : null}

                    {isSystemFieldEnabled('mois') ? (
                      <TextField
                        select
                        label="Mois"
                        fullWidth
                        size="small"
                        {...register('mois')}
                        value={watch('mois')}
                      >
                        <MenuItem value="">Sélectionner</MenuItem>
                        <MenuItem value="01">Janvier</MenuItem>
                        <MenuItem value="02">Février</MenuItem>
                        <MenuItem value="03">Mars</MenuItem>
                        <MenuItem value="04">Avril</MenuItem>
                        <MenuItem value="05">Mai</MenuItem>
                        <MenuItem value="06">Juin</MenuItem>
                        <MenuItem value="07">Juillet</MenuItem>
                        <MenuItem value="08">Août</MenuItem>
                        <MenuItem value="09">Septembre</MenuItem>
                        <MenuItem value="10">Octobre</MenuItem>
                        <MenuItem value="11">Novembre</MenuItem>
                        <MenuItem value="12">Décembre</MenuItem>
                      </TextField>
                    ) : null}
                  </>
                )}

                {ligneValue === 'carburant' && (
                  <>
                    {isSystemFieldEnabled('nom_beneficiaire') ? (
                      <TextField
                        label="Nom bénéficiaire"
                        fullWidth
                        size="small"
                        {...register('nomBeneficiaire')}
                      />
                    ) : null}

                    {isSystemFieldEnabled('nom_vehicule') ? (
                      <TextField
                        label="Nom véhicule"
                        fullWidth
                        size="small"
                        {...register('nomVehicule')}
                      />
                    ) : null}
                  </>
                )}

                {ligneValue === 'commission_intermediaire' && (
                  isSystemFieldEnabled('nom_commercial') ? (
                    <TextField
                      label="Nom Commercial"
                      fullWidth
                      size="small"
                      {...register('nomCommercial')}
                    />
                  ) : null
                )}

                {ligneValue === 'stock' && (
                  <>
                    {isSystemFieldEnabled('provenance') ? (
                      <TextField
                        label="Provenance"
                        fullWidth
                        size="small"
                        {...register('provenance')}
                      />
                    ) : null}

                    {isSystemFieldEnabled('nom_produit') ? (
                      <TextField
                        label="Nom du produit"
                        fullWidth
                        size="small"
                        {...register('nomProduit')}
                      />
                    ) : null}

                    {isSystemFieldEnabled('quantite_kg') ? (
                      <TextField
                        type="number"
                        label="Quantité (kg)"
                        fullWidth
                        size="small"
                        {...register('quantiteKg', { valueAsNumber: true })}
                      />
                    ) : null}

                    {isSystemFieldEnabled('dossier_importation') ? (
                      <TextField
                        label="Dossier d'importation"
                        fullWidth
                        size="small"
                        {...register('dossierImportation')}
                      />
                    ) : null}
                  </>
                )}

                {isSystemFieldEnabled('sous_ligne') ? (
                  <TextField
                    select
                    label="Sous-ligne"
                    fullWidth
                    {...register('sousLigne')}
                    value={watch('sousLigne')}
                    size="small"
                    error={!!errors.sousLigne}
                    helperText={errors.sousLigne?.message}
                  >
                    <MenuItem value="">Tous</MenuItem>
                    {sousLigneOptions.map((o) => (
                      <MenuItem key={o} value={o}>
                        {prettyText(o)}
                      </MenuItem>
                    ))}
                  </TextField>
                ) : null}

                <TextField
                  label="Montant HT"
                  fullWidth
                  type="text"
                  value={montantHt === 0 ? '' : formatDzd(montantHt)}
                  size="small"
                  inputProps={{
                    step: '0.01',
                    inputMode: 'decimal',
                    pattern: '^[0-9]*[.,]?[0-9]*$',
                  }}
                  onKeyDown={preventNonNumericKeys}
                  onChange={handleMontantChange('montantHt')}
                  error={!!errors.montantHt}
                  helperText={errors.montantHt?.message}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">DZD</InputAdornment>
                    ),
                  }}
                />

                <TextField
                  select
                  label="TVA"
                  fullWidth
                  size="small"
                  value={tva}
                  onChange={handleTvaSelectChange}
                  error={!!errors.tva}
                  helperText={errors.tva?.message}
                >
                  <MenuItem value="19%">19%</MenuItem>
                  <MenuItem value="9%">9%</MenuItem>
                  <MenuItem value="0%">0%</MenuItem>
                  <MenuItem value="NC">NC</MenuItem>
                </TextField>

                <TextField
                  label="Montant TVA"
                  fullWidth
                  type="text"
                  value={montantTva === 0 ? '' : formatDzd(montantTva)}
                  size="small"
                  inputProps={{
                    step: '0.01',
                    readOnly: tva !== 'NC',
                    inputMode: 'decimal',
                    pattern: '^[0-9]*[.,]?[0-9]*$',
                  }}
                  onKeyDown={tva === 'NC' ? preventNonNumericKeys : undefined}
                  onChange={tva === 'NC' ? handleMontantTvaManualChange : undefined}
                  error={!!errors.montantTva}
                  helperText={errors.montantTva?.message}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">DZD</InputAdornment>
                    ),
                  }}
                />

                <TextField
                  label="Montant TTC"
                  fullWidth
                  type="text"
                  inputProps={{
                    step: '0.01',
                    readOnly: true,
                    inputMode: 'decimal',
                    pattern: '^[0-9]*[.,]?[0-9]*$',
                  }}
                  value={montantTtc === 0 ? '' : formatDzd(montantTtc)}
                  size="small"
                  error={!!errors.montantTtc}
                  helperText={errors.montantTtc?.message}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">DZD</InputAdornment>
                    ),
                  }}
                />

                <TextField
                  label="Libellé dépense"
                  fullWidth
                  multiline
                  minRows={2}
                  size="small"
                  {...register('libelle')}
                  spellCheck
                  autoCorrect="on"
                  inputProps={{ maxLength: 255 }}
                  error={!!errors.libelle || libelle.length === 255}
                  helperText={
                    errors.libelle?.message ??
                    `${libelle.length}/255 caractères`
                  }
                />

                {isSystemFieldEnabled('fournisseur') ? (
                  <TextField
                    label="Fournisseur"
                    fullWidth
                    size="small"
                    {...register('fournisseur')}
                  />
                ) : null}

                {v2Fields
                  .filter((f) => f.target === 'CUSTOM_JSON' && f.enabled && f.type === 'text')
                  .slice()
                  .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
                  .map((f) => {
                    const k = getCustomFieldKeyV2(f);
                    if (!k) return null;
                    return (
                      <TextField
                        key={f.id}
                        label={f.label}
                        fullWidth
                        size="small"
                        value={(customValues?.[k] ?? '').toString()}
                        onChange={(e) => {
                          const v = e.target.value;
                          setCustomValues((prev) => ({ ...prev, [k]: v }));
                        }}
                      />
                    );
                  })}

                <Box>
                  <Button variant="outlined" component="label">
                    Pièce justificative
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        setValue('pieceJustificative', file, {
                          shouldValidate: true,
                        });
                      }}
                    />
                  </Button>
                  {pieceJustificativeFile instanceof File ? (
                    <Typography variant="body2" sx={{ mt: 0.5, color: 'text.secondary' }}>
                      {pieceJustificativeFile.name}
                    </Typography>
                  ) : null}
                  {errors.pieceJustificative && (
                    <Typography color="error" variant="body2">
                      {errors.pieceJustificative.message as string}
                    </Typography>
                  )}
                </Box>

                <Button
                  type="submit"
                  variant="contained"
                  fullWidth
                  disabled={isSubmitting}
                >
                  TERMINER LA SAISIE
                </Button>
              </Box>
            </Box>
          </Paper>

          <Paper
            sx={{
              p: { xs: 2, sm: 3 },
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <Typography
              variant="h6"
              gutterBottom
              sx={{ fontSize: { xs: '1.05rem', sm: '1.15rem' } }}
            >
              Mes saisies
            </Typography>

            <Box sx={{ width: '100%', overflowX: 'auto', flex: 1, minHeight: 0 }}>
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
                    <TableCell>Libellé</TableCell>
                    <TableCell align="right">Montant TTC</TableCell>
                    <TableCell>Statut</TableCell>
                    <TableCell>PJ</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {depensesSoumises.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} sx={{ whiteSpace: 'nowrap' }}>
                        Aucune saisie trouvée.
                      </TableCell>
                    </TableRow>
                  ) : (
                    depensesSoumises.map((d) => (
                      <TableRow
                        key={d.id}
                        hover
                        onClick={() => setSelectedDepense(d)}
                        sx={{ cursor: 'pointer' }}
                      >
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          {`n°${d.id.slice(0, 4).toUpperCase()}`}
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          {prettyText(d.ligne)}
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          {prettyText(d.sous_ligne)}
                        </TableCell>
                        <TableCell
                          sx={{ minWidth: 220, whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}
                        >
                          {d.libelle ?? '-'}
                        </TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                          {formatDzd(d.montant_ttc)} DZD
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          {normalizeStatut(d.statut)}
                        </TableCell>
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
          </Paper>

          <Paper
            sx={{
              p: { xs: 2, sm: 3 },
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <Typography
              variant="h6"
              gutterBottom
              sx={{ fontSize: { xs: '1.05rem', sm: '1.15rem' } }}
            >
              Règlement des dépenses
            </Typography>

            <Box
              sx={{
                width: '100%',
                overflowX: 'auto',
                flex: 1,
                minHeight: 0,
              }}
            >
              <Table size="small" sx={{ minWidth: 980 }}>
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#217346' }}>
                    <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Ligne</TableCell>
                    <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Sous ligne</TableCell>
                    <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Libellé</TableCell>
                    <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Nom du valideur</TableCell>
                    <TableCell align="right" sx={{ color: '#fff', fontWeight: 700 }}>
                      Montant TTC
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {depensesValidees.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} sx={{ whiteSpace: 'nowrap' }}>
                        Aucune dépense validée à régler.
                      </TableCell>
                    </TableRow>
                  ) : (
                    depensesValidees.map((d) => (
                      <TableRow
                        key={d.id}
                        hover
                        sx={{ cursor: 'pointer' }}
                        onClick={() => {
                          setSelectedReglement(d);
                          setModeReglement(d.mode_reglement ?? '');
                          setNomBeneficiaireReglement(d.nom_beneficiaire_reglement ?? '');
                          setPieceReglement(null);
                          setReglementError(null);
                          setReglementSuccess(null);
                        }}
                      >
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{prettyText(d.ligne)}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{prettyText(d.sous_ligne)}</TableCell>
                        <TableCell
                          sx={{ minWidth: 240, whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}
                        >
                          {d.libelle?.toString() || '-'}
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          {d.valideur_id ? valideurNameById.get(d.valideur_id) ?? '—' : '—'}
                        </TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                          {formatDzd(d.montant_ttc)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Box>

            {selectedReglement ? (
              <Paper
                variant="outlined"
                sx={{
                  mt: 2,
                  p: 2,
                  borderRadius: 2,
                  minHeight: { xs: 220, md: 280 },
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
                  <Typography variant="subtitle1">
                    {`Dépense n°${selectedReglement.id.slice(0, 4).toUpperCase()}`}
                  </Typography>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => {
                      setSelectedReglement(null);
                      setModeReglement('');
                      setNomBeneficiaireReglement('');
                      setPieceReglement(null);
                      setReglementError(null);
                      setReglementSuccess(null);
                    }}
                  >
                    Fermer
                  </Button>
                </Box>

                <TextField
                  select
                  label="Mode de règlement"
                  size="small"
                  value={modeReglement}
                  onChange={(e) => setModeReglement(e.target.value)}
                >
                  <MenuItem value="">Sélectionner</MenuItem>
                  <MenuItem value="Espèce">Espèce</MenuItem>
                  <MenuItem value="Chèque">Chèque</MenuItem>
                  <MenuItem value="Virement">Virement</MenuItem>
                </TextField>

                <TextField
                  label="Nom du bénéficiaire"
                  size="small"
                  value={nomBeneficiaireReglement}
                  onChange={(e) => setNomBeneficiaireReglement(e.target.value)}
                />

                <Box>
                  <Button variant="outlined" component="label">
                    Numériser
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        setPieceReglement(file);
                      }}
                    />
                  </Button>
                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                    {pieceReglement ? pieceReglement.name : 'Aucun fichier sélectionné'}
                  </Typography>
                </Box>

                {reglementError ? (
                  <Alert severity="error" variant="filled">
                    {reglementError}
                  </Alert>
                ) : null}

                {reglementSuccess ? (
                  <Alert severity="success" variant="filled">
                    {reglementSuccess}
                  </Alert>
                ) : null}

                <Box sx={{ mt: 'auto' }}>
                  <Button
                    fullWidth
                    variant="contained"
                    disabled={isReglementSubmitting}
                    onClick={submitReglement}
                  >
                    Générer ticket de règlement
                  </Button>
                </Box>
              </Paper>
            ) : null}

            <Box sx={{ width: '100%', overflowX: 'auto', mt: 2 }}>
              <Table size="small" sx={{ minWidth: 720 }}>
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
                    <TableCell>Ticket de règlement</TableCell>
                    <TableCell>Mode de règlement</TableCell>
                    <TableCell>Nom du bénéficiaire</TableCell>
                    <TableCell align="right">Montant TTC</TableCell>
                    <TableCell align="center">PDF</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {depensesTicketsReglement.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} sx={{ whiteSpace: 'nowrap' }}>
                        Aucun ticket généré.
                      </TableCell>
                    </TableRow>
                  ) : (
                    depensesTicketsReglement.map((t) => (
                      <TableRow
                        key={t.id}
                        hover
                        sx={{ cursor: 'pointer' }}
                        onClick={() => handleSelectReglement(t)}
                      >
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          {`n°${t.id.slice(0, 4).toUpperCase()}`}
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          {t.mode_reglement?.toString().trim() ? t.mode_reglement : '—'}
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          {t.nom_beneficiaire_reglement?.toString().trim()
                            ? t.nom_beneficiaire_reglement
                            : '—'}
                        </TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                          {formatDzd(t.montant_ttc)}
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
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Box>

          </Paper>
        </Box>

        <Dialog
          open={selectedDepense !== null}
          onClose={() => setSelectedDepense(null)}
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
                <Typography variant="body1">
                  {selectedDepense?.id
                    ? `n°${selectedDepense.id.slice(0, 4).toUpperCase()}`
                    : '-'}
                </Typography>
              </Box>

              <Box>
                <Typography variant="subtitle2">Matricule</Typography>
                <Typography variant="body1">
                  {currentProfile?.matricule ?? '-'}
                </Typography>
              </Box>

              <Box>
                <Typography variant="subtitle2">Nom du saisisseur</Typography>
                <Typography variant="body1">
                  {currentProfile?.nom_complet ?? '-'}
                </Typography>
              </Box>

              <Box>
                <Typography variant="subtitle2">Date</Typography>
                <Typography variant="body1">
                  {selectedDepense?.date_depense ?? '-'}
                </Typography>
              </Box>

              <Box>
                <Typography variant="subtitle2">Catégorie</Typography>
                <Typography variant="body1">
                  {prettyText(selectedDepense?.categorie)}
                </Typography>
              </Box>

              <Box>
                <Typography variant="subtitle2">Ligne</Typography>
                <Typography variant="body1">
                  {prettyText(selectedDepense?.ligne)}
                </Typography>
              </Box>

              <Box>
                <Typography variant="subtitle2">Sous-ligne</Typography>
                <Typography variant="body1">
                  {prettyText(selectedDepense?.sous_ligne)}
                </Typography>
              </Box>

              <Box>
                <Typography variant="subtitle2">Montant HT</Typography>
                <Typography variant="body1">
                  {selectedDepense?.montant_ht != null
                    ? `${formatDzd(selectedDepense.montant_ht)} DZD`
                    : '-'}
                </Typography>
              </Box>

              <Box>
                <Typography variant="subtitle2">TVA</Typography>
                <Typography variant="body1">
                  {selectedTvaLabel}
                </Typography>
              </Box>

              <Box>
                <Typography variant="subtitle2">Libellé</Typography>
                <Typography
                  variant="body1"
                  sx={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
                >
                  {selectedDepense?.libelle ?? '-'}
                </Typography>
              </Box>

              {selectedDepense?.nom_beneficiaire && (
                <Box>
                  <Typography variant="subtitle2">Nom bénéficiaire</Typography>
                  <Typography variant="body1">
                    {selectedDepense.nom_beneficiaire}
                  </Typography>
                </Box>
              )}

              {selectedDepense?.mois && (
                <Box>
                  <Typography variant="subtitle2">Mois</Typography>
                  <Typography variant="body1">
                    {selectedDepense.mois}
                  </Typography>
                </Box>
              )}

              {selectedDepense?.nom_vehicule && (
                <Box>
                  <Typography variant="subtitle2">Nom véhicule</Typography>
                  <Typography variant="body1">
                    {selectedDepense.nom_vehicule}
                  </Typography>
                </Box>
              )}

              {(((selectedDepense?.custom_fields as { nomCommercial?: unknown } | null | undefined)
                ?.nomCommercial as string | undefined) ||
                selectedDepense?.nom_commercial) && (
                  <Box>
                    <Typography variant="subtitle2">Nom Commercial</Typography>
                    <Typography variant="body1">
                      {((selectedDepense?.custom_fields as { nomCommercial?: unknown } | null | undefined)
                        ?.nomCommercial as string | undefined) ??
                        selectedDepense?.nom_commercial}
                    </Typography>
                  </Box>
                )}

              {(((selectedDepense?.custom_fields as { provenance?: unknown } | null | undefined)
                ?.provenance as string | undefined) ||
                selectedDepense?.provenance) && (
                  <Box>
                    <Typography variant="subtitle2">Provenance</Typography>
                    <Typography variant="body1">
                      {((selectedDepense?.custom_fields as { provenance?: unknown } | null | undefined)
                        ?.provenance as string | undefined) ??
                        selectedDepense?.provenance}
                    </Typography>
                  </Box>
                )}

              {(((selectedDepense?.custom_fields as { nomProduit?: unknown } | null | undefined)
                ?.nomProduit as string | undefined) ||
                selectedDepense?.nom_produit) && (
                  <Box>
                    <Typography variant="subtitle2">Nom du produit</Typography>
                    <Typography variant="body1">
                      {((selectedDepense?.custom_fields as { nomProduit?: unknown } | null | undefined)
                        ?.nomProduit as string | undefined) ??
                        selectedDepense?.nom_produit}
                    </Typography>
                  </Box>
                )}

              {((typeof (selectedDepense?.custom_fields as { quantiteKg?: unknown } | null | undefined)
                ?.quantiteKg === 'number' &&
                ((selectedDepense?.custom_fields as { quantiteKg?: unknown } | null | undefined)
                  ?.quantiteKg as number) > 0) ||
                (typeof selectedDepense?.quantite_kg === 'number' &&
                  selectedDepense.quantite_kg > 0)) && (
                  <Box>
                    <Typography variant="subtitle2">Quantité (kg)</Typography>
                    <Typography variant="body1">
                      {((selectedDepense?.custom_fields as { quantiteKg?: unknown } | null | undefined)
                        ?.quantiteKg as number | undefined) ??
                        selectedDepense?.quantite_kg}
                    </Typography>

                  </Box>
                )}

              {(((selectedDepense?.custom_fields as { dossierImportation?: unknown } | null | undefined)
                ?.dossierImportation as string | undefined) ||
                selectedDepense?.dossier_importation) && (
                  <Box>
                    <Typography variant="subtitle2">Dossier d'importation</Typography>
                    <Typography variant="body1">
                      {((selectedDepense?.custom_fields as { dossierImportation?: unknown } | null | undefined)
                        ?.dossierImportation as string | undefined) ??
                        selectedDepense?.dossier_importation}
                    </Typography>
                  </Box>
                )}

              {(((selectedDepense?.custom_fields as { fournisseur?: unknown } | null | undefined)
                ?.fournisseur as string | undefined) ||
                selectedDepense?.fournisseur) && (
                  <Box>
                    <Typography variant="subtitle2">Fournisseur</Typography>
                    <Typography variant="body1">
                      {((selectedDepense?.custom_fields as { fournisseur?: unknown } | null | undefined)
                        ?.fournisseur as string | undefined) ??
                        selectedDepense?.fournisseur}
                    </Typography>
                  </Box>
                )}

              <Box>
                <Typography variant="subtitle2">Montant TVA</Typography>
                <Typography variant="body1">
                  {selectedMontantTva != null ? `${formatDzd(selectedMontantTva)} DZD` : '-'}
                </Typography>
              </Box>

              <Box>
                <Typography variant="subtitle2">Montant TTC</Typography>
                <Typography variant="body1">
                  {selectedDepense
                    ? `${formatDzd(selectedDepense.montant_ttc)} DZD`
                    : '-'}
                </Typography>
              </Box>

              <Box>
                <Typography variant="subtitle2">Libellé</Typography>
                <Typography
                  variant="body1"
                  sx={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
                >
                  {((selectedDepense?.custom_fields as { libelle?: unknown } | null | undefined)
                    ?.libelle as string | undefined) ??
                    selectedDepense?.libelle ??
                    '-'}
                </Typography>
              </Box>

              <Box>
                <Typography variant="subtitle2">Statut</Typography>
                <Typography variant="body1">{normalizeStatut(selectedDepense?.statut)}</Typography>
              </Box>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setSelectedDepense(null)}>Fermer</Button>
          </DialogActions>
        </Dialog>

        <Dialog
          open={pjPreviewOpen}
          onClose={() => {
            setPjPreviewOpen(false);
            setPjSignedUrl(null);
            setPjContentType(null);
          }}
          fullWidth
          maxWidth="md"
          scroll="paper"
          PaperProps={{ sx: { mt: 10, maxHeight: 'calc(100vh - 96px)' } }}
        >
          <DialogTitle>Pièce justificative</DialogTitle>
          <DialogContent dividers>
            {pjSignedUrl ? (
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
              }}
            >
              Fermer
            </Button>
          </DialogActions>
        </Dialog>
      </Container>
    </LocalizationProvider>
  );
}
