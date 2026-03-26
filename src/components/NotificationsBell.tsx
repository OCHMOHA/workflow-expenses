"use client";

import * as React from 'react';
import {
  Badge,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Typography,
} from '@mui/material';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import { supabase } from '@/lib/supabaseClient';
import { cacheGet, cacheSet } from '@/lib/queryCache';

type NotificationRow = {
  id: string;
  title: string;
  body: string;
  type: string;
  depense_id: string | null;
  read_at: string | null;
  created_at: string;
};

function formatDateTime(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('fr-FR');
}

const CACHE_TTL_MS = 1000 * 30;

export function NotificationsBell({ variant = 'fixed' }: { variant?: 'fixed' | 'inline' }) {
  const [open, setOpen] = React.useState(false);
  const [rows, setRows] = React.useState<NotificationRow[]>([]);
  const [dialogRows, setDialogRows] = React.useState<NotificationRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [sessionUserId, setSessionUserId] = React.useState<string | null>(null);

  const unreadRows = React.useMemo(() => rows.filter((n) => !n.read_at), [rows]);

  const unreadCount = React.useMemo(
    () => rows.filter((n) => !n.read_at).length,
    [rows]
  );

  const hydrateNotificationsFromCache = React.useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id ?? null;
    if (!userId) return;
    const cached = cacheGet<NotificationRow[]>(`notifications:${userId}`, CACHE_TTL_MS);
    if (cached && Array.isArray(cached) && cached.length > 0) {
      setRows(cached);
    }
  }, []);

  const fetchNotifications = React.useCallback(async () => {
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id ?? null;
      setSessionUserId(userId);
      if (!userId) {
        setRows([]);
        return;
      }

      const { data, error } = await supabase
        .from('notifications')
        .select('id, title, body, type, depense_id, read_at, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!error) {
        const nextRows = (data ?? []) as NotificationRow[];
        setRows(nextRows);
        cacheSet(`notifications:${userId}`, nextRows);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    (async () => {
      await hydrateNotificationsFromCache();
      await fetchNotifications();
    })();
  }, [fetchNotifications]);

  React.useEffect(() => {
    if (!sessionUserId) return;

    const channel = supabase
      .channel(`notifications:${sessionUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${sessionUserId}`,
        },
        () => {
          fetchNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchNotifications, sessionUserId]);

  const markAsRead = async (id: string) => {
    const now = new Date().toISOString();
    setRows((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: now } : n)));
    await supabase.from('notifications').update({ read_at: now }).eq('id', id);
  };

  const markAllAsRead = async () => {
    if (!sessionUserId) return;
    const now = new Date().toISOString();
    setRows((prev) => prev.map((n) => (!n.read_at ? { ...n, read_at: now } : n)));
    await supabase
      .from('notifications')
      .update({ read_at: now })
      .eq('user_id', sessionUserId)
      .is('read_at', null);
  };

  const handleToggle = () => {
    setOpen((prev) => {
      const next = !prev;
      if (next) {
        setDialogRows(unreadRows);
      }
      return next;
    });
  };

  const handleClose = () => {
    setOpen(false);
    fetchNotifications();
  };

  return (
    <Box
      sx={
        variant === 'fixed'
          ? { position: 'fixed', top: 12, right: 72, zIndex: 1300 }
          : undefined
      }
    >
      <IconButton
        color="inherit"
        onClick={handleToggle}
        aria-label="Notifications"
      >
        <Badge color="error" badgeContent={unreadCount} invisible={unreadCount === 0}>
          <NotificationsNoneIcon />
        </Badge>
      </IconButton>

      <Dialog
        open={open}
        onClose={handleClose}
        fullWidth
        maxWidth="sm"
        scroll="paper"
        PaperProps={{
          sx: {
            position: 'fixed',
            top: 72,
            right: 24,
            m: 0,
            width: 420,
            maxWidth: 'calc(100vw - 48px)',
            maxHeight: 'calc(100vh - 96px)',
          },
        }}
      >
        <DialogTitle>Notifications</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="body2">
              {loading ? 'Chargement…' : unreadCount > 0 ? `${unreadCount} non lues` : ''}
            </Typography>
            <Button
              size="small"
              onClick={markAllAsRead}
              disabled={unreadCount === 0}
              sx={{ textTransform: 'none' }}
            >
              Tout marquer comme lu
            </Button>
          </Box>

          {dialogRows.length === 0 ? (
            <Typography>Aucune notification.</Typography>
          ) : (
            <List dense disablePadding>
              {dialogRows.map((n) => (
                <ListItem
                  key={n.id}
                  disableGutters
                >
                  <ListItemButton
                    onClick={() => {
                      if (!n.read_at) void markAsRead(n.id);
                    }}
                  >
                    <Box sx={{ width: '100%' }}>
                      <Box
                        sx={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          gap: 1,
                        }}
                      >
                        <Typography variant="subtitle2" sx={{ lineHeight: 1.2 }}>
                          {n.title}
                        </Typography>
                        {!n.read_at ? (
                          <Button
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              void markAsRead(n.id);
                            }}
                            sx={{ alignSelf: 'flex-start', whiteSpace: 'nowrap', textTransform: 'none' }}
                          >
                            Marquer comme lu
                          </Button>
                        ) : null}
                      </Box>

                      <Typography
                        variant="body2"
                        sx={{ display: 'block', mt: 0.5, whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}
                      >
                        {n.body}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                        {formatDateTime(n.created_at)}
                      </Typography>
                    </Box>
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Fermer</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
