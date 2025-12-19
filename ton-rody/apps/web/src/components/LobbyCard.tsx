interface LobbyCardProps {
  lobbyId: number;
  address: string;
  creator: string;
  stake: bigint;
  maxPlayers: number;
  playersCount?: number;
  onSelect?: () => void;
}

export default function LobbyCard({
  lobbyId,
  address,
  creator,
  stake,
  maxPlayers,
  playersCount,
  onSelect,
}: LobbyCardProps) {
  return (
    <div
      className="p-4 border rounded mb-2 cursor-pointer hover:bg-gray-50"
      onClick={onSelect}
    >
      <h3 className="font-semibold mb-1">Lobby #{lobbyId}</h3>
      <p className="text-xs break-all mb-1">Address: {address}</p>
      <p className="text-xs break-all mb-1">Creator: {creator}</p>
      <p className="text-xs mb-1">
        Stake: {Number(stake) / 1_000_000_000} TON | Players: {playersCount ?? 0} / {maxPlayers}
      </p>
    </div>
  );
}