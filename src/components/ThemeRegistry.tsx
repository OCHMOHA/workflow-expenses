'use client';

import * as React from 'react';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';

export default function ThemeRegistry({ children }: { children: React.ReactNode }) {
  const theme = React.useMemo(
    () =>
      createTheme({
        palette: {
          mode: 'light',
          primary: {
            main: '#1976d2',
          },
        },
        typography: {
          fontFamily: [
            'var(--font-geist-sans)',
            'system-ui',
            '-apple-system',
            'sans-serif',
          ].join(','),
        },
      }),
    [],
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
