import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import App from './App';
import '@calcom/cal-sans-ui/ui.css';
import './index.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');
ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      <App />
      <Toaster position="bottom-right" richColors closeButton />
    </ThemeProvider>
  </React.StrictMode>,
);
