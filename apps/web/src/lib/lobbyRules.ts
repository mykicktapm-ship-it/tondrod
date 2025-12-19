/**
 * Lobby rules engine
 *
 * This module encapsulates the UI policy for the TON‑RODY lobby
 * application.  It maps on‑chain state and local context into a set
 * of permissible user actions.  The goal of this function is to
 * ensure that the UI never offers an action that would result in an
 * invalid transaction or a loss of funds.  Business logic (such as
 * winner selection and payouts) remains solely on chain; this
 * module merely derives which buttons to show.
 */

export type AllowedAction =
  | 'join'
  | 'reveal'
  | 'finalize'
  | 'refund'
  | 'claim'
  | 'cancel';

export interface LobbyContext {
  /** Current lobby state (1=OPEN, 2=REVEALING, 3=FINALIZED, 4=CANCELED) */
  state: number;
  /** Timestamp when joining closes */
  joinDeadline: number;
  /** Timestamp when revealing closes */
  revealDeadline: number;
  /** Current number of players */
  playersCount: number;
  /** Maximum allowed players */
  maxPlayers: number;
  /** Whether the current user has joined the lobby */
  isParticipant: boolean;
  /** Whether the current user has already revealed */
  hasRevealed: boolean;
  /** Whether the current user can refund according to on-chain status */
  canRefund: boolean;
  /** Whether the current device has the secret stored */
  hasSecret: boolean;
  /** Claimable balance in nanoTON for the current user */
  claimable: bigint;
  /** Current time (unix seconds).  Defaults to Date.now()/1000 */
  now?: number;
}

/**
 * Determine which actions are allowed for the current user in the
 * given lobby context.  The returned list is a set of high‑level
 * actions that the UI can map to buttons or other controls.  The
 * rules implemented here follow the TON‑RODY specification but do
 * not attempt to pre‑evaluate economic conditions (e.g. whether
 * finalisation will succeed).  Instead, they provide a safe
 * approximation to avoid prompting the user to perform actions
 * outside the allowed windows or without the necessary secret.
 */
export function getAllowedActions(ctx: LobbyContext): AllowedAction[] {
  const now = ctx.now ?? Math.floor(Date.now() / 1000);
  const actions: AllowedAction[] = [];
  // OPEN state: allow join until joinDeadline and capacity
  if (ctx.state === 1) {
    if (!ctx.isParticipant && ctx.playersCount < ctx.maxPlayers && now <= ctx.joinDeadline) {
      actions.push('join');
    }
    // Once join deadline has passed and lobby is not full, refunds become possible
    if (ctx.isParticipant && ctx.canRefund && now > ctx.joinDeadline && ctx.playersCount < 2) {
      actions.push('refund');
    }
  }
  // REVEALING state: allow reveal if user joined, has not revealed, and secret present
  if (ctx.state === 2) {
    const withinReveal = now <= ctx.revealDeadline;
    if (ctx.isParticipant && !ctx.hasRevealed && ctx.hasSecret && withinReveal) {
      actions.push('reveal');
    }
    // If reveal phase is over or everyone revealed, allow anyone to finalise
    if (now > ctx.revealDeadline) {
      actions.push('finalize');
    }
  }
  // CANCELED state: allow refund if the contract says it is possible
  if (ctx.state === 4 && ctx.isParticipant && ctx.canRefund) {
    actions.push('refund');
  }
  // FINALIZED or CANCELED: allow claim if there is a claimable balance
  if ((ctx.state === 3 || ctx.state === 4) && ctx.claimable > 0n) {
    actions.push('claim');
  }
  return actions;
}
