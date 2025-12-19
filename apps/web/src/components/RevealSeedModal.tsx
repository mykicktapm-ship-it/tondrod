'use client';

import { useState, useEffect } from 'react';
import { loadSeed, exportSeeds } from '../lib/seedVault';
import { secretToBigInt } from '../lib/ton';

interface RevealSeedModalProps {
  lobbyAddress: string;
  lobbyId: number;
  walletAddress: string;
  onReveal: (secret: bigint) => void;
  onCancel: () => void;
}

/**
 * RevealSeedModal
 *
 * Allows the player to reveal their previously committed secret.  The
 * modal checks that the secret is present in the Seed Vault and
 * prevents the user from sending a reveal if the secret cannot be
 * loaded.  A backup/export option is provided so the user can
 * copy or scan their secrets onto another device before attempting
 * reveal elsewhere.
 */
export default function RevealSeedModal({
  lobbyAddress,
  lobbyId,
  walletAddress,
  onReveal,
  onCancel,
}: RevealSeedModalProps) {
  const [secret, setSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportData, setExportData] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const s = await loadSeed(lobbyAddress, walletAddress);
      if (mounted) {
        setSecret(s);
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [lobbyAddress, walletAddress]);

  const handleReveal = async () => {
    if (!secret) return;
    onReveal(secretToBigInt(secret));
  };

  const handleExport = async () => {
    const entries = await exportSeeds();
    const text = JSON.stringify(entries, null, 2);
    setExportData(text);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold mb-4">Reveal Secret</h3>
        {loading ? (
          <p>Loading...</p>
        ) : secret ? (
          <>
            <p className="text-sm mb-2">
              Your secret has been found. Revealing will finalise the game
              once all players have revealed or the deadline passes.
            </p>
            <div className="bg-gray-100 text-xs p-2 rounded mb-4 break-all">
              Secret: {secret}
            </div>
            <div className="flex justify-end space-x-2">
              <button
                className="px-4 py-2 text-sm bg-gray-200 rounded"
                onClick={onCancel}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 text-sm bg-green-600 text-white rounded"
                onClick={handleReveal}
              >
                Reveal
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm mb-4">
              Reveal is impossible on this device because the secret is
              missing. If you joined elsewhere, import your backup here
              before attempting to reveal.
            </p>
            {exportData ? (
              <textarea
                className="w-full h-40 p-2 text-xs border rounded mb-2"
                readOnly
                value={exportData}
              />
            ) : null}
            <div className="flex justify-end space-x-2">
              <button
                className="px-4 py-2 text-sm bg-gray-200 rounded"
                onClick={onCancel}
              >
                Close
              </button>
              <button
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded"
                onClick={handleExport}
              >
                Export Vault
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
