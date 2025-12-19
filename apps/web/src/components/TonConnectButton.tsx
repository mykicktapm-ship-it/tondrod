'use client';

import { useTonConnectUI, useTonAddress } from '@tonconnect/ui-react';

export default function TonConnectButton() {
  const address = useTonAddress();
  const [tonConnectUI] = useTonConnectUI();
  return (
    <button
      className="px-4 py-2 rounded bg-blue-600 text-white"
      onClick={() => tonConnectUI.connectWallet()}
    >
      {address ? `Connected: ${address.slice(0, 6)}...${address.slice(-4)}` : 'Connect Wallet'}
    </button>
  );
}
