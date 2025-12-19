import '../styles/globals.css';
import { TonConnectUIProvider } from '@tonconnect/ui-react';
import type { ReactNode } from 'react';

export default function RootLayout({ children }: { children: ReactNode }) {
  const manifestUrl = process.env.NEXT_PUBLIC_TON_CONNECT_MANIFEST_URL || '/tonconnect-manifest.json';
  return (
    <TonConnectUIProvider manifestUrl={manifestUrl}>
      <html lang="en">
        <body className="min-h-screen bg-gray-50">
          {children}
        </body>
      </html>
    </TonConnectUIProvider>
  );
}