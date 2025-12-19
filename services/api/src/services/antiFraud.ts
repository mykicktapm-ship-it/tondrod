/**
 * Anti-fraud stub.
 *
 * Exposes simple functions to check whether a user or wallet should be
 * blocked based on configured limits. In this stub we always
 * approve actions. A real implementation would track counters
 * by IP, telegram ID, wallet address and enforce limits defined in
 * the project spec.
 */
export async function checkCreateLobbyLimit(userId: string): Promise<boolean> {
  // always allow in stub
  return true;
}

export async function checkJoinLimit(userId: string): Promise<boolean> {
  return true;
}

export default {
  checkCreateLobbyLimit,
  checkJoinLimit,
};