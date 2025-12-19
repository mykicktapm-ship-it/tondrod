import Link from 'next/link';
import LobbyCard from '../../components/LobbyCard';

interface LobbyApiResponse {
  lobbyId: number;
  address: string;
  creator: string;
  createdAt: number;
  stake: string;
  maxPlayers: number;
  playersCount: number;
}

export default async function LobbiesPage() {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || '';
  const res = await fetch(`${baseUrl}/lobbies`, { cache: 'no-store' });
  let lobbies: LobbyApiResponse[] = [];
  try {
    if (res.ok) {
      lobbies = await res.json();
    }
  } catch {
    // ignore
  }
  return (
    <div className="p-4">
      <h2 className="text-xl font-semibold mb-4">Lobbies</h2>
      {lobbies.length === 0 ? (
        <p>No lobbies found.</p>
      ) : (
        <div className="space-y-2">
          {lobbies.map((lobby) => (
            <Link key={lobby.lobbyId} href={`/lobbies/${lobby.lobbyId}`}>
              <LobbyCard
                lobbyId={lobby.lobbyId}
                address={lobby.address}
                creator={lobby.creator}
                stake={BigInt(lobby.stake)}
                maxPlayers={lobby.maxPlayers}
                playersCount={lobby.playersCount}
              />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}