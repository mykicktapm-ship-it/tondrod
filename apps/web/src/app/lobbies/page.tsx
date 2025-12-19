import Link from 'next/link';
import LobbyCard from '../../components/LobbyCard';

interface LobbyApiResponse {
  lobbyId: number;
  address: string;
  creator: string;
  createdAt: number;
  stakeNano: string;
  maxPlayers: number;
  playersCount: number;
  joinDeadline: number;
  revealDeadline: number;
  state: number;
}

interface LobbyListResponse {
  items: LobbyApiResponse[];
  total: number;
}

export default async function LobbiesPage() {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || '';
  const res = await fetch(`${baseUrl}/lobbies`, { cache: 'no-store' });
  let items: LobbyApiResponse[] = [];
  let total = 0;
  try {
    if (res.ok) {
      const data: LobbyListResponse = await res.json();
      items = data.items || [];
      total = data.total || 0;
    }
  } catch {
    // ignore
  }
  return (
    <div className="p-4">
      <h2 className="text-xl font-semibold mb-1">Lobbies</h2>
      <p className="text-sm text-gray-600 mb-4">Total: {total}</p>
      {items.length === 0 ? (
        <p>No lobbies found.</p>
      ) : (
        <div className="space-y-2">
          {items.map((lobby) => (
            <Link key={lobby.lobbyId} href={`/lobbies/${lobby.lobbyId}`}>
              <LobbyCard
                lobbyId={lobby.lobbyId}
                address={lobby.address}
                creator={lobby.creator}
                stakeNano={BigInt(lobby.stakeNano)}
                maxPlayers={lobby.maxPlayers}
                playersCount={lobby.playersCount}
                state={lobby.state}
                joinDeadline={lobby.joinDeadline}
                revealDeadline={lobby.revealDeadline}
              />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
