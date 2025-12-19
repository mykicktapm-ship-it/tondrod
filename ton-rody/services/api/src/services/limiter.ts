/**
 * Limiter stub.
 *
 * Provides helper functions to check and update per-user action
 * counters. Real implementation would use Redis or DB to track
 * counts and TTLs. Here we simply return true for all checks.
 */
export async function canCreateLobby(userId: string): Promise<boolean> {
  return true;
}

export async function canJoinLobby(userId: string): Promise<boolean> {
  return true;
}

export default {
  canCreateLobby,
  canJoinLobby,
};