import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BASE_URLS } from '@arena/contracts';
import { AuthProvider, RequireAuth } from '@arena/web-auth';
import './index.css';
import App from './App.tsx';

const BETTING_URL = import.meta.env.VITE_BETTING_URL ?? BASE_URLS.betting;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider bettingUrl={BETTING_URL}>
      <RequireAuth>
        <App />
      </RequireAuth>
    </AuthProvider>
  </StrictMode>
);
