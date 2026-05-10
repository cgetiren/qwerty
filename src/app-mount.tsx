import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import { AuthProvider } from './lib/auth.tsx';
import { BrandProvider } from './lib/brand.tsx';
import { ThemeProvider } from './lib/theme.tsx';
import { registerServiceWorker } from './lib/pushNotifications.ts';

export function mountApp(rootEl: HTMLElement) {
  registerServiceWorker();

  createRoot(rootEl).render(
    <StrictMode>
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <BrandProvider>
              <App />
            </BrandProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </StrictMode>
  );
}
