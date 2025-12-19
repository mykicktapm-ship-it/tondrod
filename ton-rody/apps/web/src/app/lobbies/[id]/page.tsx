/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import JoinLobbyModal from '../../../components/JoinLobbyModal';
import RevealSeedModal from '../../../components/RevealSeedModal';

interface LobbyDetail {
  lobbyId: number;
  address: string;
  creator: string;
  createdAt: number;
  stake: string;
  maxPlayers: number;
  playersCount: number;
  state: number;
  winner?: string | null;
}

export default function LobbyDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const lobbyIdNum = Number(params.id);
  const [lobby, setLobby] = useState<LobbyDetail | null>(null);
  const [showJoin, setShowJoin] = useState(false);
  const [showReveal, setShowReveal] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const walletAddress = '';

  useEffect(() => {
    const fetchLobby = async () => {
      const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || '';
      const res = await fetch(`${baseUrl}/lobbies/${lobbyIdNum}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setLobby(data);
      }
    };
    fetchLobby();
  }, [lobbyIdNum]);

  const handleJoin = async (payload: string) => {
    // In a production app this function would interact with the TON
    // wallet (e.g. via ton‑connect) and send the join transaction.
    // For now we simply log the payload and close the modal.
    console.log('join payload', payload);
    setShowJoin(false);
    setMessage('Join transaction prepared. Please submit via your wallet.');
  };

  const handleReveal = (payload: string) => {
    console.log('reveal payload', payload);
    setShowReveal(false);
    setMessage('Reveal transaction prepared. Please submit via your wallet.');
  };

  if (!lobby) {
    return <div className="p-4">Loading…</div>;
  }

  return (
    <div className="p-4">
      <h2 className="text-xl font-semibold mb-4">Lobby #{lobby.lobbyId}</h2>
      {message && <p className="mb-2 text-sm text-green-600">{message}</p>}
      <p className="text-sm mb-1 break-all">Address: {lobby.address}</p>
      <p className="text-sm mb-1 break-all">Creator: {lobby.creator}</p>
      <p className="text-sm mb-1">Stake: {Number(lobby.stake) / 1_000_000_000} TON</p>
      <p className="text-sm mb-1">
        Players: {lobby.playersCount} / {lobby.maxPlayers}
      </p>
      <p className="text-sm mb-4">State: {lobby.state}</p>
      <div className="flex space-x-2 mb-4">
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
          disabled={lobby.state !== 1}
          onClick={() => setShowJoin(true)}
        >
          Join
        </button>
        <button
          className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
          disabled={lobby.state !== 2}
          onClick={() => setShowReveal(true)}
        >
          Reveal
        </button>
      </div>
      {showJoin && (
        <JoinLobbyModal
          lobbyId={lobby.lobbyId}
          lobbyAddress={lobby.address}
          maxPlayers={lobby.maxPlayers}
          stakeNano={BigInt(lobby.stake)}
          walletAddress={walletAddress}
          onJoin={handleJoin}
          onCancel={() => setShowJoin(false)}
        />
      )}
      {showReveal && (
        <RevealSeedModal
          lobbyAddress={lobby.address}
          lobbyId={lobby.lobbyId}
          walletAddress={walletAddress}
          onReveal={handleReveal}
          onCancel={() => setShowReveal(false)}
        />
      )}
    </div>
  );
}