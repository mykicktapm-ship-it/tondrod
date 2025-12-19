interface LobbyCardProps {
  lobbyId: number;
  address: string;
  creator: string;
  stakeNano: bigint;
  maxPlayers: number;
  playersCount?: number;
  state: number;
  joinDeadline: number;
  revealDeadline: number;
  onSelect?: () => void;
}

function stateLabel(state: number): string {
  switch (state) {
    case 1:
      return 'OPEN';
    case 2:
      return 'REVEALING';
    case 3:
      return 'FINALIZED';
    case 4:
      return 'CANCELED';
    default:
      return 'UNKNOWN';
  }
}

export default function LobbyCard({
  lobbyId,
  address,
  creator,
  stakeNano,
  maxPlayers,
  playersCount,
  state,
  joinDeadline,
  revealDeadline,
  onSelect,
}: LobbyCardProps) {
  return (
    <div
      className="p-4 border rounded mb-2 cursor-pointer hover:bg-gray-50"
      onClick={onSelect}
    >
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold">Lobby #{lobbyId}</h3>
        <span className="text-xs font-mono">{stateLabel(state)}</span>
      </div>
      <p className="text-xs break-all mb-1">Address: {address}</p>
      <p className="text-xs break-all mb-1">Creator: {creator}</p>
      <p className="text-xs mb-1">
        Stake: {Number(stakeNano) / 1_000_000_000} TON | Players: {playersCount ?? 0} / {maxPlayers}
      </p>
      <p className="text-xs mb-1">Join by: {new Date(joinDeadline * 1000).toLocaleString()}</p>
      <p className="text-xs">Reveal by: {new Date(revealDeadline * 1000).toLocaleString()}</p>
    </div>
  );
}
