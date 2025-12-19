'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTonAddress, useTonConnectUI } from '@tonconnect/ui-react';
import JoinLobbyModal from '../../../components/JoinLobbyModal';
import RevealSeedModal from '../../../components/RevealSeedModal';
import TonConnectButton from '../../../components/TonConnectButton';
import { getAllowedActions } from '../../../lib/lobbyRules';
import { loadSeed } from '../../../lib/seedVault';
import { getClaimable, getPlayerStatus } from '../../../lib/tonGetters';
import { claimTx, finalizeTx, joinTx, refundTx, revealTx } from '../../../lib/txBuilders';

interface LobbyDetail {
  lobbyId: number;
  address: string;
  creator: string;
  createdAt: number;
  stakeNano: string;
  maxPlayers: number;
  joinDeadline: number;
  revealDeadline: number;
  feeBps: number;
  feeRecipient: string;
  state: number;
  playersCount: number;
  potNano: string;
  winner: string;
}

export default function LobbyDetailPage({ params }: { params: { id: string } }) {
  const lobbyIdNum = Number(params.id);
  const walletAddress = useTonAddress();
  const [tonConnectUI] = useTonConnectUI();
  const [lobby, setLobby] = useState<LobbyDetail | null>(null);
  const [showJoin, setShowJoin] = useState(false);
  const [showReveal, setShowReveal] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [hasSecret, setHasSecret] = useState(false);
  const [playerStatus, setPlayerStatus] = useState({ joined: false, revealed: false, canRefund: false });
  const [claimable, setClaimable] = useState<bigint>(0n);

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

  useEffect(() => {
    if (!lobby || !walletAddress) {
      setHasSecret(false);
      return;
    }
    let mounted = true;
    loadSeed(lobby.address, walletAddress).then((secret) => {
      if (mounted) {
        setHasSecret(Boolean(secret));
      }
    });
    return () => {
      mounted = false;
    };
  }, [lobby, walletAddress]);

  useEffect(() => {
    if (!lobby || !walletAddress) {
      setPlayerStatus({ joined: false, revealed: false, canRefund: false });
      setClaimable(0n);
      return;
    }
    let mounted = true;
    const fetchStatus = async () => {
      try {
        const status = await getPlayerStatus(lobby.address, walletAddress);
        const claim = await getClaimable(lobby.address, walletAddress);
        if (mounted) {
          setPlayerStatus(status);
          setClaimable(claim);
        }
      } catch {
        if (mounted) {
          setPlayerStatus({ joined: false, revealed: false, canRefund: false });
          setClaimable(0n);
        }
      }
    };
    fetchStatus();
    return () => {
      mounted = false;
    };
  }, [lobby, walletAddress]);

  const actions = useMemo(() => {
    if (!lobby || !walletAddress) return [];
    return getAllowedActions({
      state: lobby.state,
      joinDeadline: lobby.joinDeadline,
      revealDeadline: lobby.revealDeadline,
      playersCount: lobby.playersCount,
      maxPlayers: lobby.maxPlayers,
      isParticipant: playerStatus.joined,
      hasRevealed: playerStatus.revealed,
      canRefund: playerStatus.canRefund,
      hasSecret,
      claimable,
    });
  }, [lobby, playerStatus, hasSecret, claimable]);

  const sendTx = async (tx: any, successMessage: string) => {
    try {
      await tonConnectUI.sendTransaction(tx);
      setMessage(successMessage);
    } catch (err: any) {
      setMessage(err?.message || 'Transaction failed');
    }
  };

  const handleJoin = async (commit: bigint) => {
    if (!lobby) return;
    const stake = BigInt(lobby.stakeNano);
    await sendTx(joinTx(lobby.address, stake, commit), 'Join transaction sent.');
    setShowJoin(false);
  };

  const handleReveal = async (secret: bigint) => {
    if (!lobby) return;
    await sendTx(revealTx(lobby.address, secret), 'Reveal transaction sent.');
    setShowReveal(false);
  };

  const handleFinalize = async () => {
    if (!lobby) return;
    await sendTx(finalizeTx(lobby.address), 'Finalize transaction sent.');
  };

  const handleRefund = async () => {
    if (!lobby) return;
    await sendTx(refundTx(lobby.address), 'Refund transaction sent.');
  };

  const handleClaim = async () => {
    if (!lobby) return;
    await sendTx(claimTx(lobby.address), 'Claim transaction sent.');
  };

  if (!lobby) {
    return <div className="p-4">Loading...</div>;
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Lobby #{lobby.lobbyId}</h2>
        <TonConnectButton />
      </div>
      {message && <p className="mb-2 text-sm text-green-600">{message}</p>}
      <p className="text-sm mb-1 break-all">Address: {lobby.address}</p>
      <p className="text-sm mb-1 break-all">Creator: {lobby.creator}</p>
      <p className="text-sm mb-1">Stake: {Number(lobby.stakeNano) / 1_000_000_000} TON</p>
      <p className="text-sm mb-1">
        Players: {lobby.playersCount} / {lobby.maxPlayers}
      </p>
      <p className="text-sm mb-1">Join deadline: {new Date(lobby.joinDeadline * 1000).toLocaleString()}</p>
      <p className="text-sm mb-1">Reveal deadline: {new Date(lobby.revealDeadline * 1000).toLocaleString()}</p>
      <p className="text-sm mb-4">State: {lobby.state}</p>

      {lobby.state === 2 && playerStatus.joined && !hasSecret && (
        <p className="text-sm text-red-600 mb-4">Reveal is impossible on this device.</p>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        {actions.includes('join') && (
          <button className="px-4 py-2 bg-blue-600 text-white rounded" onClick={() => setShowJoin(true)}>
            Join
          </button>
        )}
        {actions.includes('reveal') && (
          <button className="px-4 py-2 bg-green-600 text-white rounded" onClick={() => setShowReveal(true)}>
            Reveal
          </button>
        )}
        {actions.includes('finalize') && (
          <button className="px-4 py-2 bg-gray-900 text-white rounded" onClick={handleFinalize}>
            Finalize
          </button>
        )}
        {actions.includes('refund') && (
          <button className="px-4 py-2 bg-yellow-600 text-white rounded" onClick={handleRefund}>
            Refund
          </button>
        )}
        {actions.includes('claim') && (
          <button className="px-4 py-2 bg-purple-600 text-white rounded" onClick={handleClaim}>
            Claim
          </button>
        )}
      </div>

      {showJoin && (
        <JoinLobbyModal
          lobbyId={lobby.lobbyId}
          lobbyAddress={lobby.address}
          maxPlayers={lobby.maxPlayers}
          stakeNano={BigInt(lobby.stakeNano)}
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
