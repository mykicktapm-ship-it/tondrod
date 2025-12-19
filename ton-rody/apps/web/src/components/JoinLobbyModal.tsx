import { useState, useEffect } from 'react';
import { beginCell, Address } from 'ton-core';
import { saveSeed } from '../lib/seedVault';
import { buildJoinPayload } from '../lib/ton';

interface JoinLobbyModalProps {
  lobbyId: number;
  lobbyAddress: string;
  maxPlayers: number;
  stakeNano: bigint;
  walletAddress: string;
  onJoin: (payload: string) => void;
  onCancel: () => void;
}

/**
 * JoinLobbyModal
 *
 * Provides a simple form for a user to join a lobby.  It generates a
 * random secret, computes the commitment according to the contract
 * specification (hash(secret || lobbyId || walletAddress)) and
 * encrypts the secret in the Seed Vault.  A confirmation dialog is
 * displayed before the join action is triggered.  Once confirmed the
 * caller receives the payload that must be attached to the TON
 * transaction.
 */
export default function JoinLobbyModal({
  lobbyId,
  lobbyAddress,
  maxPlayers,
  stakeNano,
  walletAddress,
  onJoin,
  onCancel,
}: JoinLobbyModalProps) {
  const [secret, setSecret] = useState<string>('');
  const [commit, setCommit] = useState<bigint | null>(null);
  const [warningAck, setWarningAck] = useState(false);

  // Generate a random secret once when the modal opens
  useEffect(() => {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    const s = Array.from(arr)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    setSecret(s);
  }, []);

  // Compute commit whenever secret or lobbyId or wallet changes
  useEffect(() => {
    if (!secret || !walletAddress) return;
    try {
      const sc = beginCell();
      sc.storeBuffer(Buffer.from(secret, 'hex'));
      sc.storeInt(BigInt(lobbyId), 257);
      sc.storeAddress(Address.parse(walletAddress));
      const c = sc.endCell();
      const h = c.hash();
      setCommit(h);
    } catch (err) {
      console.error(err);
    }
  }, [secret, lobbyId, walletAddress]);

  const handleJoin = async () => {
    if (!warningAck || commit === null) return;
    // Persist secret in the Seed Vault under lobbyAddress:walletAddress
    await saveSeed(lobbyAddress, walletAddress, secret);
    // Build join payload for TON transaction
    const payload = buildJoinPayload(commit as bigint);
    onJoin(payload);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold mb-4">Join Lobby #{lobbyId}</h3>
        <p className="text-sm mb-2">
          You are about to join this lobby. A random secret has been
          generated for you. Please note that losing the secret will
          prevent you from revealing and winning.
        </p>
        <div className="bg-gray-100 text-xs p-2 rounded mb-2 break-all">
          Secret: {secret}
        </div>
        <label className="flex items-start space-x-2 mb-4">
          <input
            type="checkbox"
            checked={warningAck}
            onChange={(e) => setWarningAck(e.target.checked)}
          />
          <span className="text-sm">
            I understand that if I lose this secret I will be unable to
            reveal and I may lose my stake. I will back it up via the Seed
            Vault.
          </span>
        </label>
        <div className="flex justify-end space-x-2">
          <button
            className="px-4 py-2 text-sm bg-gray-200 rounded"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded disabled:opacity-50"
            disabled={!warningAck || commit === null}
            onClick={handleJoin}
          >
            Join
          </button>
        </div>
      </div>
    </div>
  );
}