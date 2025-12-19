'use client';

import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { exportSeeds, importSeeds } from '../lib/seedVault';
import { computeCommit } from '../lib/ton';
import { getLobbyCommit, getLobbyParams } from '../lib/tonGetters';

export default function SeedVault() {
  const [entries, setEntries] = useState<Array<{ lobbyAddress: string; walletAddress: string; secret: string }> | null>(null);
  const [importText, setImportText] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [exportText, setExportText] = useState<string>('');
  const [exportQr, setExportQr] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const ex = await exportSeeds();
    setEntries(ex);
  };

  useEffect(() => {
    load();
  }, []);

  const handleExport = async () => {
    const data = await exportSeeds();
    const text = JSON.stringify(data, null, 2);
    setExportText(text);
    try {
      const qr = await QRCode.toDataURL(text, { errorCorrectionLevel: 'M' });
      setExportQr(qr);
    } catch {
      setExportQr('');
    }
  };

  const handleImport = async () => {
    setMessage(null);
    setBusy(true);
    try {
      const data = JSON.parse(importText);
      if (!Array.isArray(data)) throw new Error('Invalid format: expected array');
      for (const entry of data) {
        if (!entry?.lobbyAddress || !entry?.walletAddress || !entry?.secret) {
          throw new Error('Invalid entry: lobbyAddress, walletAddress, secret required');
        }
        const params = await getLobbyParams(entry.lobbyAddress);
        const commitLocal = computeCommit(entry.secret, Number(params.lobbyId), entry.walletAddress);
        const commitChain = await getLobbyCommit(entry.lobbyAddress, entry.walletAddress);
        if (commitChain !== commitLocal) {
          throw new Error(`Commit mismatch for ${entry.lobbyAddress}`);
        }
      }
      await importSeeds(data as any);
      setImportText('');
      setMessage('Imported successfully');
      await load();
    } catch (err: any) {
      setMessage(err?.message || 'Failed to import');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-xl font-semibold mb-4">Seed Vault</h2>
      {message && <p className="mb-2 text-sm text-red-600">{message}</p>}
      <div className="mb-4 flex gap-2">
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded"
          onClick={load}
        >
          Refresh
        </button>
        <button
          className="px-4 py-2 bg-gray-900 text-white rounded"
          onClick={handleExport}
        >
          Export
        </button>
      </div>
      {entries ? (
        <table className="w-full text-sm mb-4">
          <thead>
            <tr>
              <th className="text-left p-1">Lobby</th>
              <th className="text-left p-1">Wallet</th>
              <th className="text-left p-1">Secret</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={`${e.lobbyAddress}:${e.walletAddress}`}>
                <td className="border p-1 align-top break-all font-mono text-xs">
                  {e.lobbyAddress}
                </td>
                <td className="border p-1 align-top break-all font-mono text-xs">
                  {e.walletAddress}
                </td>
                <td className="border p-1 align-top break-all font-mono text-xs">
                  {e.secret}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>Loading...</p>
      )}
      {exportText && (
        <div className="mb-6">
          <h3 className="text-md font-semibold mb-2">Export JSON</h3>
          <textarea
            className="w-full h-32 border rounded mb-2 p-2 text-xs"
            readOnly
            value={exportText}
          />
          {exportQr && (
            <img src={exportQr} alt="Seed Vault QR" className="w-48 h-48" />
          )}
        </div>
      )}
      <h3 className="text-md font-semibold mb-2">Import backup</h3>
      <textarea
        className="w-full h-32 border rounded mb-2 p-2 text-xs"
        value={importText}
        onChange={(e) => setImportText(e.target.value)}
        placeholder="Paste JSON backup here"
      />
      <button
        className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
        disabled={busy}
        onClick={handleImport}
      >
        {busy ? 'Validating...' : 'Import'}
      </button>
    </div>
  );
}
