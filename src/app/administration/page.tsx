"use client";

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Container,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Snackbar,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { supabase } from '@/lib/supabaseClient';
import { cacheGet, cacheSet } from '@/lib/queryCache';

type ProfileRow = {
  id: string;
  username?: string | null;
  matricule: string | null;
  nom_complet: string | null;
  role: string | null;
};

type DepenseRow = {
  id: string;
  date_depense: string;
  categorie: string;
  montant_ttc: number;
  statut: string;
  saisisseur_id: string;
  ligne: string | null;
  sous_ligne: string | null;
  libelle: string | null;
  mode_reglement: string | null;
  nom_beneficiaire_reglement: string | null;
  piece_reglement_url?: string | null;
  reglee_at?: string | null;
};

type FormSectionRow = {
  id: string;
  title: string;
  position: number;
  enabled: boolean;
};

type FormSectionV2Row = {
  id: string;
  title: string;
  position: number;
  enabled: boolean;
};

type FormFieldType = 'text' | 'textarea' | 'number' | 'select' | 'date' | 'file';

type FormFieldRow = {
  id: string;
  section_id: string;
  key: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  enabled: boolean;
  position: number;
  options: unknown | null;
};

type FieldTargetV2 = 'SYSTEM_COLUMN' | 'CUSTOM_JSON';

type FormFieldV2Row = {
  id: string;
  section_id: string;
  field_key: string | null;
  system_key: string | null;
  label: string;
  type: FormFieldType;
  target: FieldTargetV2;
  required: boolean;
  enabled: boolean;
  position: number;
  options: unknown | null;
  visible_when: unknown | null;
  is_mandatory: boolean;
};

const CACHE_TTL_MS = 1000 * 30;

const optionsArray = (v: unknown): string[] => {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (x ?? '').toString().trim())
    .filter((x) => x.length > 0);
};

const optionsSousLigneMap = (v: unknown): Record<string, string[]> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const o = v as Record<string, unknown>;
  const out: Record<string, string[]> = {};
  for (const [k, val] of Object.entries(o)) {
    if (!k) continue;
    out[k] = optionsArray(val);
  }
  return out;
};

type CreateUserForm = {
  username: string;
  password: string;
  matricule: string;
  nom_complet: string;
  role: 'COLLABORATEUR' | 'RESPONSABLE' | 'RESPONSABLE_N2' | 'ADMINISTRATEUR';
};

const roles = ['COLLABORATEUR', 'RESPONSABLE', 'RESPONSABLE_N2', 'ADMINISTRATEUR'] as const;

const slugifyFieldKey = (label: string) => {
  const base = (label ?? '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return base || 'champ';
};
type RoleValue = (typeof roles)[number];

const normalizeRoleForDb = (role: string) => {
  const s = (role ?? '').toString().trim().toLowerCase();
  if (s === 'responsable niveau 2' || s === 'responsable_niveau_2' || s === 'responsable-niveau-2') {
    return 'responsable niveau 2';
  }
  if (s === 'collaborateur') return 'collaborateur';
  if (s === 'responsable') return 'responsable';
  if (s === 'administrateur') return 'administrateur';
  return role;
};

const prettyText = (value: string | null | undefined) => {
  const raw = (value ?? '').toString().trim();
  if (!raw) return '';
  const cleaned = raw.replaceAll('_', ' ').replace(/\s+/g, ' ').trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
};

const statutLabel = (raw: string | null | undefined) => {
  const s = (raw ?? '').toString().trim().toUpperCase();
  if (s === 'A_VALIDER_N2') return 'SOUMISE';
  if (s === 'TICKET_REGLEMENT_GENERE') return 'TICKET REGLEMENT GENERE';
  return s || '-';
};

const toRoleValue = (v: unknown): RoleValue => {
  const s = (v ?? '').toString().trim().toUpperCase();
  if (s === 'RESPONSABLE NIVEAU 2' || s === 'RESPONSABLE_N2') return 'RESPONSABLE_N2';
  if (s === 'COLLABORATEUR' || s === 'RESPONSABLE' || s === 'ADMINISTRATEUR') return s;
  return 'COLLABORATEUR';
};

const toDbRole = (v: RoleValue): string => {
  if (v === 'RESPONSABLE_N2') return 'responsable niveau 2';
  return v.toLowerCase();
};

const systemFieldPalette = [
  { system_key: 'date_depense', label: 'Date', type: 'date' as const },
  { system_key: 'categorie', label: 'Catégorie', type: 'select' as const },
  { system_key: 'ligne', label: 'Ligne', type: 'select' as const },
  { system_key: 'sous_ligne', label: 'Sous-ligne', type: 'select' as const },
  { system_key: 'montant_ht', label: 'Montant HT', type: 'number' as const },
  { system_key: 'tva', label: 'TVA', type: 'select' as const },
  { system_key: 'montant_tva', label: 'Montant TVA', type: 'number' as const },
  { system_key: 'montant_ttc', label: 'Montant TTC', type: 'number' as const },
  { system_key: 'libelle', label: 'Libellé', type: 'text' as const },
  { system_key: 'fournisseur', label: 'Fournisseur', type: 'text' as const },
  { system_key: 'nom_beneficiaire', label: 'Nom bénéficiaire', type: 'text' as const },
  { system_key: 'mois', label: 'Mois', type: 'select' as const },
  { system_key: 'nom_vehicule', label: 'Nom véhicule', type: 'text' as const },
  { system_key: 'nom_commercial', label: 'Nom Commercial', type: 'text' as const },
  { system_key: 'provenance', label: 'Provenance', type: 'text' as const },
  { system_key: 'nom_produit', label: 'Nom du produit', type: 'text' as const },
  { system_key: 'quantite_kg', label: 'Quantité (kg)', type: 'number' as const },
  { system_key: 'dossier_importation', label: 'Dossier d’importation', type: 'text' as const },
] as const;

export default function AdministrationPage() {
  const router = useRouter();

  const [me, setMe] = React.useState<ProfileRow | null>(null);
  const [loading, setLoading] = React.useState(true);

  const [profiles, setProfiles] = React.useState<ProfileRow[]>([]);
  const [depenses, setDepenses] = React.useState<DepenseRow[]>([]);

  const [sectionsV2, setSectionsV2] = React.useState<FormSectionV2Row[]>([]);
  const [fieldsV2, setFieldsV2] = React.useState<FormFieldV2Row[]>([]);
  const [selectedSectionIdV2, setSelectedSectionIdV2] = React.useState<string>('');

  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [createForm, setCreateForm] = React.useState<CreateUserForm>({
    username: '',
    password: '',
    matricule: '',
    nom_complet: '',
    role: 'COLLABORATEUR',
  });

  const [taxonomyLigneDraft, setTaxonomyLigneDraft] = React.useState('');
  const [taxonomyCategorieDraft, setTaxonomyCategorieDraft] = React.useState('');
  const [taxonomySousLigneLigne, setTaxonomySousLigneLigne] = React.useState('');
  const [taxonomySousLigneDraft, setTaxonomySousLigneDraft] = React.useState('');
  const [taxonomyEditorKey, setTaxonomyEditorKey] = React.useState<'ligne' | 'categorie' | 'sous_ligne'>('ligne');
  const [taxonomySelectedValue, setTaxonomySelectedValue] = React.useState('');
  const [taxonomyLigneCategorieParent, setTaxonomyLigneCategorieParent] = React.useState('');
  const [systemFieldPickerLabel, setSystemFieldPickerLabel] = React.useState<string>('');
  const [adminTab, setAdminTab] = React.useState<'USERS' | 'DEPENSES' | 'TICKETS' | 'TAXONOMY'>('TAXONOMY');

  const profilesById = React.useMemo(() => {
    const m = new Map<string, ProfileRow>();
    for (const p of profiles) m.set(p.id, p);
    return m;
  }, [profiles]);


  const fieldBySystemKeyV2 = React.useMemo(() => {
    const m = new Map<string, FormFieldV2Row>();
    for (const f of fieldsV2) {
      if (f.target !== 'SYSTEM_COLUMN') continue;
      const k = (f.system_key ?? '').toString().trim();
      if (!k) continue;
      m.set(k, f);
    }
    return m;
  }, [fieldsV2]);

  const responsableProfiles = React.useMemo(() => {
    return profiles.filter((p) => {
      const r = (p.role ?? '').toString().trim().toLowerCase();
      return r === 'responsable' || r === 'responsable niveau 2';
    });
  }, [profiles]);

  const sousLigneValideurMap = React.useMemo((): Record<string, string> => {
    const opts = fieldBySystemKeyV2.get('sous_ligne')?.options;
    if (!opts || typeof opts !== 'object' || Array.isArray(opts)) return {};
    const raw = (opts as Record<string, unknown>)._valideur_map;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim()) out[k] = v;
    }
    return out;
  }, [fieldBySystemKeyV2]);

  const customFieldsInFormV2 = React.useMemo(() => {
    return fieldsV2
      .filter((f) => f.target === 'CUSTOM_JSON')
      .slice()
      .sort((a, b) => {
        const ap = a.position ?? 0;
        const bp = b.position ?? 0;
        if (ap !== bp) return ap - bp;
        return (a.label ?? '').localeCompare(b.label ?? '');
      });
  }, [fieldsV2]);

  const systemFieldsInFormV2 = React.useMemo(() => {
    return fieldsV2
      .filter((f) => f.target === 'SYSTEM_COLUMN')
      .slice()
      .sort((a, b) => {
        const ap = a.position ?? 0;
        const bp = b.position ?? 0;
        if (ap !== bp) return ap - bp;
        return (a.label ?? '').localeCompare(b.label ?? '');
      });
  }, [fieldsV2]);

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

  const categorieOptionsV2 = React.useMemo(() => {
    const v2 = optionsArray(fieldBySystemKeyV2.get('categorie')?.options);
    return v2.length > 0 ? v2 : depensesCategorieOptions;
  }, [depensesCategorieOptions, fieldBySystemKeyV2]);

  const ligneRawOptions = React.useMemo(() => fieldBySystemKeyV2.get('ligne')?.options, [fieldBySystemKeyV2]);

  const ligneIsFlatArray = React.useMemo(() => Array.isArray(ligneRawOptions), [ligneRawOptions]);

  const ligneMapV2 = React.useMemo(() => {
    const v2 = optionsSousLigneMap(ligneRawOptions);
    return Object.keys(v2).length > 0 ? v2 : {};
  }, [ligneRawOptions]);

  const ligneFlatArray = React.useMemo(() => optionsArray(ligneRawOptions), [ligneRawOptions]);

  const ligneOptionsV2 = React.useMemo(() => {
    // Flatten all lignes across all categories
    const fromMap = Object.values(ligneMapV2).flat();
    if (fromMap.length > 0) return Array.from(new Set(fromMap)).sort((a, b) => a.localeCompare(b));
    // Fallback to flat array format (backward compat)
    return ligneFlatArray.length > 0 ? ligneFlatArray : depensesLigneOptions;
  }, [ligneMapV2, ligneFlatArray, depensesLigneOptions]);

  const sousLigneMapV2 = React.useMemo(() => {
    const v2 = optionsSousLigneMap(fieldBySystemKeyV2.get('sous_ligne')?.options);
    return Object.keys(v2).length > 0 ? v2 : depensesSousLigneMap;
  }, [depensesSousLigneMap, fieldBySystemKeyV2]);

  const [deleteDepenseId, setDeleteDepenseId] = React.useState<string | null>(null);
  const [deletingDepense, setDeletingDepense] = React.useState(false);
  const [deleteTicketId, setDeleteTicketId] = React.useState<string | null>(null);
  const [deletingTicket, setDeletingTicket] = React.useState(false);
  const [deleteUserId, setDeleteUserId] = React.useState<string | null>(null);
  const [deletingUser, setDeletingUser] = React.useState(false);

  const ticketsReglement = React.useMemo(() => {
    return (depenses ?? []).filter(
      (d) => (d.statut ?? '').toString().trim().toUpperCase() === 'TICKET_REGLEMENT_GENERE'
    );
  }, [depenses]);

  const hydrateFromCache = React.useCallback(() => {
    const cachedProfiles = cacheGet<ProfileRow[]>('admin:profiles', CACHE_TTL_MS);
    if (cachedProfiles && Array.isArray(cachedProfiles)) {
      setProfiles(cachedProfiles);
    }

    const cachedDepenses = cacheGet<DepenseRow[]>('admin:depenses', CACHE_TTL_MS);
    if (cachedDepenses && Array.isArray(cachedDepenses)) {
      setDepenses(cachedDepenses);
    }

    const cachedSectionsV2 = cacheGet<FormSectionV2Row[]>('admin:sections_v2', CACHE_TTL_MS);
    if (cachedSectionsV2 && Array.isArray(cachedSectionsV2)) {
      setSectionsV2(cachedSectionsV2);
    }

    const cachedFieldsV2 = cacheGet<FormFieldV2Row[]>('admin:fields_v2', CACHE_TTL_MS);
    if (cachedFieldsV2 && Array.isArray(cachedFieldsV2)) {
      setFieldsV2(cachedFieldsV2);
    }
  }, []);

  const loadAll = React.useCallback(async () => {
    setError(null);
    try {
      const { data: profs, error: pe } = await supabase
        .from('profiles')
        .select('id, username, matricule, nom_complet, role')
        .order('matricule', { ascending: true });

      if (pe) throw pe;

      const { data: deps, error: de } = await supabase
        .from('depenses')
        .select(
          'id, date_depense, categorie, montant_ttc, statut, saisisseur_id, ligne, sous_ligne, libelle, mode_reglement, nom_beneficiaire_reglement, piece_reglement_url, reglee_at'
        )
        .order('date_depense', { ascending: false })
        .limit(200);

      if (de) throw de;

      setProfiles((profs ?? []) as ProfileRow[]);
      setDepenses((deps ?? []) as DepenseRow[]);

      const { data: secs2, error: se2 } = await supabase
        .from('expense_form_sections_v2')
        .select('id, title, position, enabled')
        .order('position', { ascending: true });
      if (se2) throw se2;

      const { data: flds2, error: fe2 } = await supabase
        .from('expense_form_fields_v2')
        .select(
          'id, section_id, field_key, system_key, label, type, target, required, enabled, position, options, visible_when, is_mandatory'
        )
        .order('position', { ascending: true });
      if (fe2) throw fe2;

      const v2Secs = (secs2 ?? []) as FormSectionV2Row[];
      setSectionsV2(v2Secs);
      setFieldsV2((flds2 ?? []) as FormFieldV2Row[]);

      cacheSet('admin:profiles', (profs ?? []) as ProfileRow[]);
      cacheSet('admin:depenses', (deps ?? []) as DepenseRow[]);
      cacheSet('admin:sections_v2', v2Secs);
      cacheSet('admin:fields_v2', (flds2 ?? []) as FormFieldV2Row[]);

      if (!selectedSectionIdV2 && v2Secs.length > 0) {
        setSelectedSectionIdV2(v2Secs[0].id);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [selectedSectionIdV2]);

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        hydrateFromCache();
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session?.user) {
          router.replace('/login?redirect=/administration');
          return;
        }

        const userId = sessionData.session.user.id;
        const { data: p, error: pe } = await supabase
          .from('profiles')
          .select('id, matricule, nom_complet, role')
          .eq('id', userId)
          .maybeSingle();

        if (pe) throw pe;

        const profile = p as ProfileRow | null;
        setMe(profile);

        const role = (profile?.role ?? '').toString().trim().toLowerCase();
        if (role !== 'administrateur') {
          await supabase.auth.signOut();
          router.replace('/login?redirect=/administration');
          return;
        }

        await loadAll();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [hydrateFromCache, loadAll, router]);

  const updateRole = async (id: string, nextRole: string) => {
    setError(null);
    setSuccess(null);
    const normalized = toRoleValue(nextRole);
    const dbRole = toDbRole(normalized);
    const { error: ue } = await supabase
      .from('profiles')
      .update({ role: dbRole })
      .eq('id', id);

    if (ue) {
      setError(ue.message);
      return;
    }

    setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, role: dbRole } : p)));
    setSuccess('Rôle mis à jour.');
  };

  const addCustomTextFieldToFormV2 = React.useCallback(
    async (label: string) => {
      setError(null);
      setSuccess(null);
      if (!selectedSectionIdV2) {
        setError('Veuillez sélectionner une section');
        return;
      }

      const cleanLabel = (label ?? '').toString().trim();
      if (!cleanLabel) {
        setError('Veuillez saisir un champ.');
        return;
      }

      const baseKey = slugifyFieldKey(cleanLabel);
      const keyExists = (k: string) =>
        fieldsV2.some((f) => f.target === 'CUSTOM_JSON' && (f.field_key ?? '').toString().trim() === k);

      let fieldKey = baseKey;
      let i = 2;
      while (keyExists(fieldKey)) {
        fieldKey = `${baseKey}_${i}`;
        i += 1;
        if (i > 50) break;
      }

      const existsLabel = fieldsV2.some(
        (f) =>
          f.target === 'CUSTOM_JSON' &&
          (f.label ?? '').toString().trim().toLowerCase() === cleanLabel.toLowerCase()
      );
      if (existsLabel) {
        setError('Ce champ existe déjà.');
        return;
      }

      const position =
        (fieldsV2
          .filter((f) => f.section_id === selectedSectionIdV2)
          .map((f) => f.position ?? 0)
          .reduce((m, x) => Math.max(m, x), 0) || 0) + 1;

      const { data, error: ie } = await supabase
        .from('expense_form_fields_v2')
        .insert({
          section_id: selectedSectionIdV2,
          system_key: null,
          field_key: fieldKey,
          target: 'CUSTOM_JSON',
          label: cleanLabel,
          type: 'text',
          required: false,
          enabled: true,
          position,
          options: null,
          visible_when: {},
          is_mandatory: false,
        })
        .select(
          'id, section_id, field_key, system_key, label, type, target, required, enabled, position, options, visible_when, is_mandatory'
        )
        .maybeSingle();

      if (ie) {
        setError(ie.message);
        return;
      }

      const created = data as FormFieldV2Row | null;
      if (created) {
        setFieldsV2((prev) => [...prev, created].sort((a, b) => a.position - b.position));
      }
      setSuccess('Champ ajouté.');
    },
    [fieldsV2, selectedSectionIdV2]
  );

  const updateFieldV2 = async (id: string, patch: Partial<FormFieldV2Row>) => {
    setError(null);
    setSuccess(null);
    const { error: ue } = await supabase.from('expense_form_fields_v2').update(patch).eq('id', id);
    if (ue) {
      setError(ue.message);
      return;
    }
    try {
      const { data: fresh, error: fe } = await supabase
        .from('expense_form_fields_v2')
        .select(
          'id, section_id, field_key, system_key, label, type, target, required, enabled, position, options, visible_when, is_mandatory'
        )
        .eq('id', id)
        .maybeSingle();

      if (fe) throw fe;
      const nextRow = (fresh ?? null) as FormFieldV2Row | null;
      if (nextRow) {
        setFieldsV2((prev) =>
          prev
            .map((f) => (f.id === id ? nextRow : f))
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        );

      } else {
        setFieldsV2((prev) =>
          prev
            .map((f) => (f.id === id ? { ...f, ...patch } : f))
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        );
      }
      setSuccess('Champ mis à jour.');
    } catch (e: unknown) {
      setFieldsV2((prev) =>
        prev
          .map((f) => (f.id === id ? { ...f, ...patch } : f))
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      );
      setSuccess('Champ mis à jour.');
    }
  };

  const saveSystemOptionsV2 = React.useCallback(
    async (systemKey: 'categorie' | 'ligne' | 'sous_ligne', nextOptions: unknown) => {
      const row = fieldBySystemKeyV2.get(systemKey);
      if (!row) {
        setError(`Champ introuvable: ${systemKey}`);
        return;
      }
      await updateFieldV2(row.id, { options: nextOptions });
    },
    [fieldBySystemKeyV2]
  );

  const addSystemFieldToFormV2 = React.useCallback(
    async (system_key: string) => {
      setError(null);
      setSuccess(null);
      if (!selectedSectionIdV2) {
        setError('Veuillez sélectionner une section');
        return;
      }
      const exists = fieldsV2.some(
        (f) => f.target === 'SYSTEM_COLUMN' && (f.system_key ?? '').toString().trim() === system_key
      );
      if (exists) {
        setError('Ce champ existe déjà.');
        return;
      }

      const palette = systemFieldPalette.find((p) => p.system_key === system_key);
      const label = palette?.label ?? system_key;
      const type = (palette?.type ?? 'text') as FormFieldType;
      const position =
        (fieldsV2
          .filter((f) => f.section_id === selectedSectionIdV2)
          .map((f) => f.position ?? 0)
          .reduce((m, x) => Math.max(m, x), 0) || 0) + 1;

      const { data, error: ie } = await supabase
        .from('expense_form_fields_v2')
        .insert({
          section_id: selectedSectionIdV2,
          system_key,
          field_key: null,
          target: 'SYSTEM_COLUMN',
          label,
          type,
          required: false,
          enabled: true,
          position,
          options: null,
          visible_when: {},
          is_mandatory: false,
        })
        .select(
          'id, section_id, field_key, system_key, label, type, target, required, enabled, position, options, visible_when, is_mandatory'
        )
        .maybeSingle();
      if (ie) {
        setError(ie.message);
        return;
      }
      const created = data as FormFieldV2Row | null;
      if (created) {
        setFieldsV2((prev) => [...prev, created].sort((a, b) => a.position - b.position));
      }
      setSuccess('Champ ajouté.');
    },
    [fieldsV2, selectedSectionIdV2]
  );

  const deleteFieldV2 = async (row: FormFieldV2Row) => {
    setError(null);
    setSuccess(null);
    if (row.is_mandatory) {
      setError('Impossible de supprimer un champ système obligatoire. Vous pouvez le désactiver à la place.');
      return;
    }
    const { error: de } = await supabase.from('expense_form_fields_v2').delete().eq('id', row.id);
    if (de) {
      setError(de.message);
      return;
    }
    setFieldsV2((prev) => prev.filter((f) => f.id !== row.id));
    setSuccess('Champ supprimé.');
  };

  const callFunction = async (name: string, body: Record<string, unknown>) => {
    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    if (sessionErr) throw sessionErr;
    const token = sessionData.session?.access_token;
    if (!token) throw new Error('Non authentifié');
    const apikey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '')
      .toString()
      .trim()
      .replace(/^"|"$/g, '');
    const baseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
      .toString()
      .trim()
      .replace(/^"|"$/g, '');
    if (!apikey || !baseUrl) throw new Error('Variables Supabase manquantes');

    let res: Response;
    try {
      res = await fetch(`${baseUrl}/functions/v1/${name}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
    } catch (e: unknown) {
      const rawMsg = e instanceof Error ? e.message : String(e);
      throw new Error(
        `Impossible d'appeler la fonction Edge "${name}". (${rawMsg})\n` +
        `Vérifiez que Supabase Edge Functions est déployé et accessible.\n` +
        `URL utilisée: ${baseUrl}/functions/v1/${name}`
      );
    }

    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }

    if (!res.ok) {
      const msg =
        typeof parsed === 'object' && parsed && 'error' in parsed
          ? String((parsed as { error?: unknown }).error)
          : typeof parsed === 'object' && parsed && 'message' in parsed
            ? String((parsed as { message?: unknown }).message)
            : typeof parsed === 'string'
              ? parsed
              : `Edge Function failed (${res.status})`;
      throw new Error(msg);
    }

    return parsed;
  };

  const createUser = async () => {
    setError(null);
    setSuccess(null);

    const username = createForm.username.trim().toLowerCase();
    const password = createForm.password;

    if (!username) {
      setError("Le nom d'utilisateur est obligatoire");
      return;
    }
    if (!password || password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }

    try {
      await callFunction('admin-create-user', {
        username,
        password,
        matricule: createForm.matricule.trim() || null,
        nom_complet: createForm.nom_complet.trim() || null,
        role: toDbRole(createForm.role),
      });
      setSuccess('Utilisateur créé.');
      setCreateOpen(false);
      setCreateForm({ username: '', password: '', matricule: '', nom_complet: '', role: 'COLLABORATEUR' });
      await loadAll();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const deleteUser = async (userId: string) => {
    setError(null);
    setSuccess(null);

    if (userId === me?.id) {
      setError("Vous ne pouvez pas supprimer votre propre compte administrateur.");
      return;
    }

    setDeletingUser(true);
    setProfiles((prev) => prev.filter((p) => p.id !== userId));

    try {
      await callFunction('admin-delete-user', { user_id: userId });
      setSuccess('Utilisateur supprimé.');
      await loadAll();
    } catch (e: unknown) {
      const rawMsg = e instanceof Error ? e.message : String(e);
      const isNetworkError = /NetworkError|Failed to fetch/i.test(rawMsg);

      try {
        const { data: profs, error: pe } = await supabase
          .from('profiles')
          .select('id, username, matricule, nom_complet, role')
          .order('matricule', { ascending: true });

        if (pe) throw pe;

        const nextProfiles = (profs ?? []) as ProfileRow[];
        setProfiles(nextProfiles);
        const stillExists = nextProfiles.some((p) => p.id === userId);
        if (!stillExists) {
          setSuccess('Utilisateur supprimé.');
        } else {
          setError(rawMsg);
        }
      } catch {
        if (isNetworkError) {
          setSuccess('Utilisateur supprimé.');
        } else {
          setError(rawMsg);
        }
      }
    } finally {
      setDeletingUser(false);
    }
  };

  if (loading) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography>Chargement…</Typography>
      </Container>
    );
  }

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
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mb: 2 }}>
            <Typography variant="h5">Administration</Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button variant="outlined" onClick={loadAll}>Actualiser</Button>
              <Button variant="contained" onClick={() => setCreateOpen(true)}>Créer un utilisateur</Button>
            </Box>
          </Box>

          <Paper variant="outlined" sx={{ mb: 2 }}>
            <Tabs
              value={adminTab}
              onChange={(_, v) => setAdminTab(v)}
              variant="scrollable"
              scrollButtons="auto"
            >
              <Tab value="USERS" label="Utilisateurs" />
              <Tab value="DEPENSES" label="Dépenses" />
              <Tab value="TICKETS" label="Tickets de règlement" />
              <Tab value="TAXONOMY" label="Listes Nouvelle saisie" />
            </Tabs>
          </Paper>

          {adminTab !== 'USERS' ? null : (
            <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Utilisateurs
              </Typography>

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
                      <TableCell>Matricule</TableCell>
                      <TableCell>Nom complet</TableCell>
                      <TableCell>Nom d'utilisateur</TableCell>
                      <TableCell>Rôle</TableCell>
                      <TableCell>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {profiles.map((p) => (
                      <TableRow key={p.id} hover>
                        <TableCell>{p.matricule ?? '-'}</TableCell>
                        <TableCell>{p.nom_complet ?? '-'}</TableCell>
                        <TableCell>{p.username ?? '-'}</TableCell>
                        <TableCell>
                          <TextField
                            select
                            size="small"
                            value={toRoleValue(p.role)}
                            onChange={(e) => updateRole(p.id, e.target.value as RoleValue)}
                            sx={{ minWidth: 190 }}
                          >
                            {roles.map((r) => (
                              <MenuItem key={r} value={r}>
                                {r === 'COLLABORATEUR'
                                  ? 'Collaborateur'
                                  : r === 'RESPONSABLE'
                                    ? 'Responsable'
                                    : r === 'RESPONSABLE_N2'
                                      ? 'Responsable niveau 2'
                                      : 'Administrateur'}
                              </MenuItem>
                            ))}
                          </TextField>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="small"
                            color="error"
                            variant="outlined"
                            disabled={p.id === me?.id || deletingUser}
                            onClick={() => setDeleteUserId(p.id)}
                          >
                            Supprimer
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}

                    {customFieldsInFormV2.map((f) => (
                      <TableRow key={f.id} hover>
                        <TableCell sx={{ minWidth: 240 }}>{f.label}</TableCell>
                        <TableCell>
                          <Switch
                            checked={!!f.enabled}
                            onChange={(_, checked) => {
                              void updateFieldV2(f.id, { enabled: checked });
                            }}
                          />
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          <Button
                            size="small"
                            color="error"
                            variant="outlined"
                            onClick={() => void deleteFieldV2(f)}
                          >
                            Supprimer
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            </Paper>
          )}

          {adminTab !== 'TICKETS' ? null : (
            <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Tickets de règlement
              </Typography>

              <Table size="small">
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
                    <TableCell>ID</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell>Saisisseur</TableCell>
                    <TableCell>Mode</TableCell>
                    <TableCell>Bénéficiaire</TableCell>
                    <TableCell>Réglée</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {ticketsReglement.map((t) => (
                    <TableRow key={t.id} hover>
                      <TableCell sx={{ fontFamily: 'monospace' }}>{t.id}</TableCell>
                      <TableCell>{t.date_depense}</TableCell>
                      <TableCell>
                        {(() => {
                          const p = profilesById.get(t.saisisseur_id);
                          return p?.nom_complet || p?.matricule || t.saisisseur_id;
                        })()}
                      </TableCell>
                      <TableCell>{t.mode_reglement ?? '-'}</TableCell>
                      <TableCell>{t.nom_beneficiaire_reglement ?? '-'}</TableCell>
                      <TableCell>{t.reglee_at ? 'Oui' : 'Non'}</TableCell>
                      <TableCell>
                        <Button
                          size="small"
                          color="error"
                          variant="outlined"
                          disabled={deletingTicket}
                          onClick={() => setDeleteTicketId(t.id)}
                        >
                          Supprimer
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}

                  {ticketsReglement.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7}>
                        <Typography>Aucun ticket.</Typography>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </Paper>
          )}

          <Dialog open={!!deleteUserId} onClose={() => setDeleteUserId(null)} maxWidth="xs" fullWidth>
            <DialogTitle>Supprimer l’utilisateur</DialogTitle>
            <DialogContent>
              <Typography>
                Voulez-vous vraiment supprimer cet utilisateur ?
              </Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDeleteUserId(null)} disabled={deletingUser}>
                Annuler
              </Button>
              <Button
                color="error"
                variant="contained"
                disabled={!deleteUserId || deletingUser}
                onClick={async () => {
                  const id = deleteUserId;
                  setDeleteUserId(null);
                  if (id) await deleteUser(id);
                }}
              >
                Supprimer
              </Button>
            </DialogActions>
          </Dialog>

          <Dialog open={!!deleteTicketId} onClose={() => setDeleteTicketId(null)} fullWidth maxWidth="xs">
            <DialogTitle>Supprimer le ticket</DialogTitle>
            <DialogContent dividers>
              <Typography>
                Cette action supprimera définitivement le ticket (ligne depenses) et tentera de supprimer la pièce dans le stockage.
              </Typography>
            </DialogContent>
            <DialogActions>
              <Button disabled={deletingTicket} onClick={() => setDeleteTicketId(null)}>
                Annuler
              </Button>
              <Button
                color="error"
                variant="contained"
                disabled={deletingTicket}
                onClick={async () => {
                  if (!deleteTicketId) return;
                  setDeletingTicket(true);
                  setError(null);
                  setSuccess(null);

                  const ticketId = deleteTicketId;
                  const row = ticketsReglement.find((x) => x.id === ticketId) ?? null;

                  try {
                    const { data: deletedRows, error: de } = await supabase
                      .from('depenses')
                      .delete()
                      .eq('id', ticketId)
                      .select('id');
                    if (de) throw de;
                    if (!deletedRows || deletedRows.length === 0) {
                      throw new Error('Delete was not applied (RLS or permissions).');
                    }

                    const raw = (row?.piece_reglement_url ?? '').toString().trim();
                    if (raw) {
                      const storagePath = raw
                        .replace(/^\/+/, '')
                        .replace(/^pieces-reglement\//i, '')
                        .replace(/^public\//i, '');
                      await supabase.storage.from('pieces-reglement').remove([storagePath]);
                    }

                    setDepenses((prev) => prev.filter((x) => x.id !== ticketId));
                    setSuccess('Ticket supprimé.');
                    setDeleteTicketId(null);
                  } catch (e: unknown) {
                    setError(e instanceof Error ? e.message : String(e));
                  } finally {
                    setDeletingTicket(false);
                  }
                }}
              >
                Supprimer
              </Button>
            </DialogActions>
          </Dialog>

          {adminTab !== 'TAXONOMY' ? null : (
            <Paper sx={{ p: 2, mb: 2 }}>
              <Typography variant="h6" sx={{ mb: 1 }}>
                Listes Nouvelle saisie
              </Typography>

              <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
                <TextField
                  select
                  label="Champ"
                  value={taxonomyEditorKey}
                  onChange={(e) => {
                    setTaxonomyEditorKey(e.target.value as 'ligne' | 'categorie' | 'sous_ligne');
                    setTaxonomySelectedValue('');
                    setTaxonomyLigneCategorieParent('');
                  }}
                  size="small"
                  fullWidth
                >
                  <MenuItem value="categorie">Catégorie</MenuItem>
                  <MenuItem value="ligne">Ligne</MenuItem>
                  <MenuItem value="sous_ligne">Sous-ligne</MenuItem>
                </TextField>

                {taxonomyEditorKey === 'sous_ligne' ? (
                  <TextField
                    select
                    label="Ligne"
                    value={taxonomySousLigneLigne}
                    onChange={(e) => {
                      setTaxonomySousLigneLigne(e.target.value);
                      setTaxonomySelectedValue('');
                    }}
                    size="small"
                    fullWidth
                  >
                    <MenuItem value="">Sélectionner</MenuItem>
                    {ligneOptionsV2.map((l) => (
                      <MenuItem key={l} value={l}>
                        {prettyText(l)}
                      </MenuItem>
                    ))}
                  </TextField>
                ) : taxonomyEditorKey === 'ligne' ? (
                  ligneIsFlatArray ? (
                    <Box />
                  ) : (
                    <TextField
                      select
                      label="Catégorie"
                      value={taxonomyLigneCategorieParent}
                      onChange={(e) => {
                        setTaxonomyLigneCategorieParent(e.target.value);
                        setTaxonomySelectedValue('');
                      }}
                      size="small"
                      fullWidth
                    >
                      <MenuItem value="">Sélectionner</MenuItem>
                      {categorieOptionsV2.map((c) => (
                        <MenuItem key={c} value={c}>
                          {prettyText(c)}
                        </MenuItem>
                      ))}
                    </TextField>
                  )
                ) : (
                  <Box />
                )}
              </Box>

              <Box sx={{ mt: 2, display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
                <TextField
                  select
                  label="Valeurs"
                  size="small"
                  fullWidth
                  value={taxonomySelectedValue}
                  onChange={(e) => setTaxonomySelectedValue(e.target.value)}
                >
                  <MenuItem value="">Sélectionner</MenuItem>
                  {taxonomyEditorKey === 'ligne'
                    ? (ligneIsFlatArray
                        ? ligneFlatArray
                        : taxonomyLigneCategorieParent
                          ? (ligneMapV2[taxonomyLigneCategorieParent] ?? [])
                          : ligneOptionsV2
                      ).map((o) => (
                      <MenuItem key={o} value={o}>
                        {prettyText(o)}
                      </MenuItem>
                    ))
                    : taxonomyEditorKey === 'categorie'
                      ? categorieOptionsV2.map((o) => (
                        <MenuItem key={o} value={o}>
                          {prettyText(o)}
                        </MenuItem>
                      ))
                      : (taxonomySousLigneLigne ? sousLigneMapV2[taxonomySousLigneLigne] ?? [] : []).map((o) => (
                        <MenuItem key={o} value={o}>
                          {prettyText(o)}
                        </MenuItem>
                      ))}
                </TextField>

                <Box sx={{ display: 'flex', gap: 1 }}>
                  <TextField
                    label={
                      taxonomyEditorKey === 'ligne'
                        ? 'Ajouter une ligne'
                        : taxonomyEditorKey === 'categorie'
                          ? 'Ajouter une catégorie'
                          : 'Ajouter une sous-ligne'
                    }
                    value={
                      taxonomyEditorKey === 'ligne'
                        ? taxonomyLigneDraft
                        : taxonomyEditorKey === 'categorie'
                          ? taxonomyCategorieDraft
                          : taxonomySousLigneDraft
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      if (taxonomyEditorKey === 'ligne') setTaxonomyLigneDraft(v);
                      else if (taxonomyEditorKey === 'categorie') setTaxonomyCategorieDraft(v);
                      else setTaxonomySousLigneDraft(v);
                    }}
                    size="small"
                    fullWidth
                    disabled={(taxonomyEditorKey === 'sous_ligne' && !taxonomySousLigneLigne) || (taxonomyEditorKey === 'ligne' && !ligneIsFlatArray && !taxonomyLigneCategorieParent)}
                  />
                  <Button
                    variant="contained"
                    disabled={(taxonomyEditorKey === 'sous_ligne' && !taxonomySousLigneLigne) || (taxonomyEditorKey === 'ligne' && !ligneIsFlatArray && !taxonomyLigneCategorieParent)}
                    onClick={() => {
                      if (taxonomyEditorKey === 'ligne') {
                        const next = taxonomyLigneDraft.trim();
                        if (!next) return;
                        if (ligneIsFlatArray) {
                          // Flat array format: add directly
                          const updated = Array.from(new Set([...ligneFlatArray, next]));
                          void saveSystemOptionsV2('ligne', updated);
                          setTaxonomyLigneDraft('');
                          return;
                        }
                        if (!taxonomyLigneCategorieParent) return;
                        const safeMap = optionsSousLigneMap(fieldBySystemKeyV2.get('ligne')?.options);
                        const current = safeMap[taxonomyLigneCategorieParent] ?? [];
                        const updated = Array.from(new Set([...current, next]));
                        const nextMap = { ...safeMap, [taxonomyLigneCategorieParent]: updated };
                        void saveSystemOptionsV2('ligne', nextMap);
                        setTaxonomyLigneDraft('');
                        return;
                      }
                      if (taxonomyEditorKey === 'categorie') {
                        const next = taxonomyCategorieDraft.trim();
                        if (!next) return;
                        const clean = Array.from(new Set([...categorieOptionsV2, next]));
                        void saveSystemOptionsV2('categorie', clean);
                        setTaxonomyCategorieDraft('');
                        return;
                      }

                      const next = taxonomySousLigneDraft.trim();
                      if (!next) return;
                      if (!taxonomySousLigneLigne) return;
                      const safeMap = optionsSousLigneMap(fieldBySystemKeyV2.get('sous_ligne')?.options);
                      const current = safeMap[taxonomySousLigneLigne] ?? [];
                      const updated = Array.from(new Set([...current, next]));
                      const nextMap = { ...safeMap, [taxonomySousLigneLigne]: updated };
                      void saveSystemOptionsV2('sous_ligne', nextMap);
                      setTaxonomySousLigneDraft('');
                    }}
                  >
                    Ajouter
                  </Button>
                  <Button
                    color="error"
                    variant="outlined"
                    disabled={!taxonomySelectedValue}
                    onClick={() => {
                      if (!taxonomySelectedValue) return;
                      if (taxonomyEditorKey === 'ligne') {
                        if (ligneIsFlatArray) {
                          // Flat array format: filter directly
                          const updated = ligneFlatArray.filter((x) => x !== taxonomySelectedValue);
                          void saveSystemOptionsV2('ligne', updated);
                          setTaxonomySelectedValue('');
                          setTaxonomySousLigneLigne((p) => (p === taxonomySelectedValue ? '' : p));
                          return;
                        }
                        const safeMap = optionsSousLigneMap(fieldBySystemKeyV2.get('ligne')?.options);
                        if (taxonomyLigneCategorieParent) {
                          // Delete from specific category
                          const current = safeMap[taxonomyLigneCategorieParent] ?? [];
                          const updated = current.filter((x) => x !== taxonomySelectedValue);
                          const nextMap = { ...safeMap, [taxonomyLigneCategorieParent]: updated };
                          void saveSystemOptionsV2('ligne', nextMap);
                        } else {
                          // No category selected: remove from ALL categories
                          const nextMap = { ...safeMap };
                          for (const cat of Object.keys(nextMap)) {
                            nextMap[cat] = nextMap[cat].filter((x) => x !== taxonomySelectedValue);
                          }
                          void saveSystemOptionsV2('ligne', nextMap);
                        }
                        setTaxonomySelectedValue('');
                        setTaxonomySousLigneLigne((p) => (p === taxonomySelectedValue ? '' : p));
                        return;
                      }
                      if (taxonomyEditorKey === 'categorie') {
                        const clean = categorieOptionsV2.filter((x) => x !== taxonomySelectedValue);
                        void saveSystemOptionsV2('categorie', clean);
                        setTaxonomySelectedValue('');
                        return;
                      }
                      if (!taxonomySousLigneLigne) return;
                      const safeMap = optionsSousLigneMap(fieldBySystemKeyV2.get('sous_ligne')?.options);
                      const current = safeMap[taxonomySousLigneLigne] ?? [];
                      const updated = current.filter((x) => x !== taxonomySelectedValue);
                      const nextMap = { ...safeMap, [taxonomySousLigneLigne]: updated };
                      void saveSystemOptionsV2('sous_ligne', nextMap);
                      setTaxonomySelectedValue('');
                    }}
                  >
                    Supprimer
                  </Button>
                </Box>
              </Box>

              {taxonomyEditorKey === 'sous_ligne' && taxonomySelectedValue ? (
                <Box sx={{ mt: 2, display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
                  <TextField
                    select
                    label="Valideur assigné"
                    size="small"
                    fullWidth
                    value={sousLigneValideurMap[taxonomySelectedValue] ?? ''}
                    onChange={(e) => {
                      const valideurId = e.target.value;
                      const currentOpts = fieldBySystemKeyV2.get('sous_ligne')?.options;
                      const safeOpts = (currentOpts && typeof currentOpts === 'object' && !Array.isArray(currentOpts))
                        ? { ...(currentOpts as Record<string, unknown>) }
                        : {};
                      const currentMap = (typeof safeOpts._valideur_map === 'object' && safeOpts._valideur_map && !Array.isArray(safeOpts._valideur_map))
                        ? { ...(safeOpts._valideur_map as Record<string, string>) }
                        : {};
                      if (valideurId) {
                        currentMap[taxonomySelectedValue] = valideurId;
                      } else {
                        delete currentMap[taxonomySelectedValue];
                      }
                      const nextOpts = { ...safeOpts, _valideur_map: currentMap };
                      void saveSystemOptionsV2('sous_ligne', nextOpts);
                    }}
                  >
                    <MenuItem value="">Aucun (non assigné)</MenuItem>
                    {responsableProfiles.map((p) => (
                      <MenuItem key={p.id} value={p.id}>
                        {p.nom_complet ?? p.matricule ?? p.id.slice(0, 8)}
                      </MenuItem>
                    ))}
                  </TextField>
                  <Typography variant="body2" sx={{ color: 'text.secondary', alignSelf: 'center' }}>
                    {sousLigneValideurMap[taxonomySelectedValue]
                      ? `Valideur : ${profilesById.get(sousLigneValideurMap[taxonomySelectedValue])?.nom_complet ?? sousLigneValideurMap[taxonomySelectedValue].slice(0, 8)}`
                      : 'Aucun valideur assigné à cette sous-ligne'}
                  </Typography>
                </Box>
              ) : null}

              <Divider sx={{ my: 3 }} />

              <Typography variant="h6" sx={{ mb: 1 }}>
                Champs Nouvelle saisie
              </Typography>

              <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
                <TextField
                  label="Ajouter un champ"
                  value={systemFieldPickerLabel}
                  onChange={(e) => setSystemFieldPickerLabel(e.target.value)}
                  size="small"
                  fullWidth
                />

                <Box sx={{ display: 'flex', gap: 1, justifyContent: { xs: 'flex-start', md: 'flex-end' } }}>
                  <Button
                    variant="contained"
                    onClick={() => {
                      void addCustomTextFieldToFormV2(systemFieldPickerLabel);
                      setSystemFieldPickerLabel('');
                    }}
                  >
                    Ajouter
                  </Button>
                </Box>
              </Box>

              <Box sx={{ mt: 2, width: '100%', overflowX: 'auto' }}>
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
                      <TableCell>Champ</TableCell>
                      <TableCell>Afficher</TableCell>
                      <TableCell>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {systemFieldsInFormV2.map((f) => (
                      <TableRow key={f.id} hover>
                        <TableCell sx={{ minWidth: 240 }}>{f.label}</TableCell>
                        <TableCell>
                          <Switch
                            checked={!!f.enabled}
                            onChange={(_, checked) => {
                              void updateFieldV2(f.id, { enabled: checked });
                            }}
                          />
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          <Button
                            size="small"
                            color="error"
                            variant="outlined"
                            disabled={!!f.is_mandatory}
                            onClick={() => void deleteFieldV2(f)}
                          >
                            Supprimer
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}

                    {customFieldsInFormV2.map((f) => (
                      <TableRow key={f.id} hover>
                        <TableCell sx={{ minWidth: 240 }}>{f.label}</TableCell>
                        <TableCell>
                          <Switch
                            checked={!!f.enabled}
                            onChange={(_, checked) => {
                              void updateFieldV2(f.id, { enabled: checked });
                            }}
                          />
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          <Button
                            size="small"
                            color="error"
                            variant="outlined"
                            disabled={!!f.is_mandatory}
                            onClick={() => void deleteFieldV2(f)}
                          >
                            Supprimer
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            </Paper>
          )}

          {adminTab !== 'DEPENSES' ? null : (
            <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Dépenses
              </Typography>
              <Table size="small">
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
                    <TableCell>ID</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell>Catégorie</TableCell>
                    <TableCell>Montant TTC</TableCell>
                    <TableCell>Statut</TableCell>
                    <TableCell>Saisisseur</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {depenses.map((d) => (
                    <TableRow key={d.id} hover>
                      <TableCell sx={{ fontFamily: 'monospace' }}>{d.id}</TableCell>
                      <TableCell>{d.date_depense}</TableCell>
                      <TableCell>{d.categorie}</TableCell>
                      <TableCell>{d.montant_ttc}</TableCell>
                      <TableCell>{statutLabel(d.statut)}</TableCell>
                      <TableCell>
                        {(() => {
                          const p = profilesById.get(d.saisisseur_id);
                          return p?.nom_complet || p?.matricule || d.saisisseur_id;
                        })()}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="small"
                          color="error"
                          variant="outlined"
                          onClick={() => setDeleteDepenseId(d.id)}
                        >
                          Supprimer
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          )}

          <Snackbar
            open={!!error}
            autoHideDuration={8000}
            onClose={() => setError(null)}
            anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
          >
            <Alert severity="error" variant="filled" onClose={() => setError(null)}>
              {error}
            </Alert>
          </Snackbar>

          <Snackbar
            open={!!success}
            autoHideDuration={4000}
            onClose={() => setSuccess(null)}
            anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
          >
            <Alert severity="success" variant="filled" onClose={() => setSuccess(null)}>
              {success}
            </Alert>
          </Snackbar>

          <Dialog open={createOpen} onClose={() => setCreateOpen(false)} fullWidth maxWidth="sm">
            <DialogTitle>Créer un utilisateur</DialogTitle>
            <DialogContent dividers>
              <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: '1fr', mt: 1 }}>
                <TextField
                  label="Nom d'utilisateur"
                  value={createForm.username}
                  onChange={(e) => setCreateForm((f) => ({ ...f, username: e.target.value }))}
                />
                <TextField
                  label="Mot de passe"
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                />
                <TextField
                  label="Matricule"
                  value={createForm.matricule}
                  onChange={(e) => setCreateForm((f) => ({ ...f, matricule: e.target.value }))}
                />
                <TextField
                  label="Nom complet"
                  value={createForm.nom_complet}
                  onChange={(e) => setCreateForm((f) => ({ ...f, nom_complet: e.target.value }))}
                />
                <TextField
                  select
                  label="Rôle"
                  value={createForm.role}
                  onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value as CreateUserForm['role'] }))}
                >
                  {roles.map((r) => (
                    <MenuItem key={r} value={r}>
                      {r === 'COLLABORATEUR'
                        ? 'Collaborateur'
                        : r === 'RESPONSABLE'
                          ? 'Responsable'
                          : r === 'RESPONSABLE_N2'
                            ? 'Responsable niveau 2'
                            : 'Administrateur'}
                    </MenuItem>
                  ))}
                </TextField>
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setCreateOpen(false)}>Annuler</Button>
              <Button variant="contained" onClick={() => void createUser()}>
                Créer
              </Button>
            </DialogActions>
          </Dialog>

          <Dialog open={!!deleteDepenseId} onClose={() => setDeleteDepenseId(null)} fullWidth maxWidth="xs">
            <DialogTitle>Supprimer la dépense</DialogTitle>
            <DialogContent dividers>
              <Typography>
                Cette action supprimera définitivement la dépense.
              </Typography>
            </DialogContent>
            <DialogActions>
              <Button disabled={deletingDepense} onClick={() => setDeleteDepenseId(null)}>
                Annuler
              </Button>
              <Button
                color="error"
                variant="contained"
                disabled={deletingDepense}
                onClick={async () => {
                  if (!deleteDepenseId) return;
                  setDeletingDepense(true);
                  setError(null);
                  setSuccess(null);
                  try {
                    const { data: deletedRows, error: de } = await supabase
                      .from('depenses')
                      .delete()
                      .eq('id', deleteDepenseId)
                      .select('id');
                    if (de) throw de;
                    if (!deletedRows || deletedRows.length === 0) {
                      throw new Error('Delete was not applied (RLS or permissions).');
                    }
                    setDepenses((prev) => prev.filter((x) => x.id !== deleteDepenseId));
                    try {
                      const { data: deps, error: de2 } = await supabase
                        .from('depenses')
                        .select(
                          'id, date_depense, categorie, montant_ttc, statut, saisisseur_id, ligne, sous_ligne, libelle, mode_reglement, nom_beneficiaire_reglement'
                        )
                        .order('date_depense', { ascending: false })
                        .limit(200);
                      if (!de2) setDepenses((deps ?? []) as DepenseRow[]);
                    } catch {
                      // ignore refresh errors
                    }
                    setSuccess('Dépense supprimée.');
                    setDeleteDepenseId(null);
                  } catch (e: unknown) {
                    setError(e instanceof Error ? e.message : String(e));
                  } finally {
                    setDeletingDepense(false);
                  }
                }}
              >
                Supprimer
              </Button>
            </DialogActions>
          </Dialog>
        </Paper>
      </Container>
    </>
  );
}
