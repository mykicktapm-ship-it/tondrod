import { useState, useEffect } from 'react';
import { exportSeeds, importSeeds } from '../lib/seedVault';

/**
 * SeedVault component
 *
 * Provides a simple interface for users to inspect, backup and
 * restore their locally stored secrets.  Secrets are displayed
 * decrypted so that users can copy them elsewhere.  Importing
 * requires a JSON array of entries with `key` and `secret` fields.
 */
export default function SeedVault() {
  const [entries, setEntries] = useState<Array<{ key: string; secret: string }> | null>(null);
  const [importText, setImportText] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    const ex = await exportSeeds();
    setEntries(ex);
  };

  useEffect(() => {
    load();
  }, []);

  const handleImport = async () => {
    try {
      const data = JSON.parse(importText);
      if (!Array.isArray(data)) throw new Error('Invalid format');
      await importSeeds(data as any);
      setImportText('');
      setMessage('Imported successfully');
      await load();
    } catch (err: any) {
      setMessage(err.message || 'Failed to import');
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-xl font-semibold mb-4">Seed Vault</h2>
      {message && <p className="mb-2 text-sm text-red-600">{message}</p>}
      <div className="mb-4">
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded"
          onClick={load}
        >
          Refresh
        </button>
      </div>
      {entries ? (
        <table className="w-full text-sm mb-4">
          <thead>
            <tr>
              <th className="text-left p-1">Key</th>
              <th className="text-left p-1">Secret</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.key}>
                <td className="border p-1 align-top break-all font-mono text-xs">
                  {e.key}
                </td>
                <td className="border p-1 align-top break-all font-mono text-xs">
                  {e.secret}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>Loading…</p>
      )}
      <h3 className="text-md font-semibold mb-2">Import backup</h3>
      <textarea
        className="w-full h-32 border rounded mb-2 p-2 text-xs"
        value={importText}
        onChange={(e) => setImportText(e.target.value)}
        placeholder="Paste JSON backup here"
      />
      <button
        className="px-4 py-2 bg-green-600 text-white rounded"
        onClick={handleImport}
      >
        Import
      </button>
    </div>
  );
}