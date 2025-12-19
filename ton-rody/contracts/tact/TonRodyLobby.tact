// ton-rody/contracts/tact/TonRodyLobby.tact
//
// TON‑RODY Lobby Raffle (N‑player)
//
// This contract implements a lobby‑based raffle where up to `maxPlayers`
// participants deposit a fixed stake and commit to a secret tied to the
// lobby context. Each player must join by paying `stakeNano` and
// providing a commitment calculated off‑chain as
//
//     commit = hash(secret || lobbyId || playerAddress)
//
// The secret can be any byte string. Players must reveal their secret
// during the reveal phase by sending a `Reveal` message carrying the
// secret slice. The contract verifies the reveal against the stored
// commitment. If a player fails to reveal before `revealDeadline`,
// they forfeit their stake and cannot win or refund. After the reveal
// phase, the contract deterministically selects a winner from among
// those who revealed. A seed is derived from immutable game
// parameters and the hashes of the revealed secrets. The winner
// receives the pot minus a protocol fee; everyone else loses their
// stake. If nobody reveals, the game is cancelled and all paid
// participants are refunded. Players who did not join in time can
// reclaim their stake after the join deadline. This contract uses
// pull‑payments to transfer funds to winners and the fee recipient.

import "@stdlib/deploy";

// Possible states of the lobby
enum LobbyState {
  OPEN = 1,       // accepting joins
  REVEALING = 2,  // join closed, accepting reveals
  FINALIZED = 3,  // winner selected, payouts assigned
  CANCELED = 4    // game canceled, refunds available
}

// Opcodes for external messages. Using explicit hex values avoids
// accidental collisions when extending functionality.
const OP_JOIN: Int = 0x4A4F494E;    // 'JOIN'
const OP_REVEAL: Int = 0x5245564C;  // 'REVL'
const OP_LOCK: Int = 0x4C4F434B;    // 'LOCK' – optional external lock
const OP_FINALIZE: Int = 0x46494E41; // 'FINA'
const OP_CANCEL: Int = 0x43414E43;   // 'CANC'
const OP_REFUND: Int = 0x52454655;   // 'REFU'
const OP_CLAIM: Int = 0x434C4149;    // 'CLAI'

// Portion of the protocol fee that is paid to the caller of Finalize
// as an incentive to actually finalise the game.  Expressed in
// basis points of the fee amount.  For example, a value of 2000
// means 20% of the fee goes to the finaliser and 80% goes to the
// feeRecipient.  This constant can be adjusted as part of the
// protocol's economic policy.
const FINALIZER_REWARD_BPS: Int = 2000; // 20% of fee

// Information tracked for each player. We avoid storing secrets on
// chain; instead we store the commitment and the hash of the secret
// after reveal. The `refunded` flag prevents double refunds.
struct PlayerInfo {
  commit: Int;      // uint256 commitment provided on join
  joinedAt: Int;    // unix timestamp when joined
  revealed: Bool;   // whether the player revealed
  revealHash: Int;  // uint256 hash of the secret (0 if missing)
  refunded: Bool;   // whether the player has claimed their stake back
}

// Message definitions. Join includes the commitment; Reveal
// carries the secret slice.
message(OP_JOIN) Join { commit: Int; }
message(OP_REVEAL) Reveal { secret: slice; }
message(OP_LOCK) Lock {}
message(OP_FINALIZE) Finalize {}
message(OP_CANCEL) Cancel {}
message(OP_REFUND) Refund {}
message(OP_CLAIM) Claim {}

contract TonRodyLobby with Deployable {
  // Immutable parameters set at deployment
  owner: Address;        // contract owner (deployer)
  stakeNano: Int;        // fixed stake each player must pay
  maxPlayers: Int;       // maximum players allowed
  joinDeadline: Int;     // unix timestamp until which joins are allowed
  revealDeadline: Int;   // unix timestamp until which reveals are allowed
  feeBps: Int;           // fee in basis points (0–10000)
  feeRecipient: Address; // fee recipient
  lobbyId: Int;          // unique lobby identifier
  version: Int;          // contract version for future upgrades

  // Mutable state
  state: LobbyState;      // current state
  players: map<Address, PlayerInfo>; // mapping from address to player info
  order: map<Int, Address>; // index -> player address for deterministic ordering
  playersCount: Int;      // number of players joined
  totalPotNano: Int;      // total pot accumulated (stakeNano * playersCount)
  winner: Address?;       // winner address (null until finalized)
  claimable: map<Address, Int>; // pull‑payment balances
  finalizedAt: Int;        // timestamp when finalized (0 if not finalized)

  // Constructor. Enforces basic parameter correctness and initializes
  // storage variables.
  init(
    owner: Address,
    stakeNano: Int,
    maxPlayers: Int,
    joinDeadline: Int,
    revealDeadline: Int,
    feeBps: Int,
    feeRecipient: Address,
    lobbyId: Int
  ) {
    require(stakeNano > 0, "stake=0");
    require(maxPlayers > 1, "maxPlayers<=1");
    require(revealDeadline > joinDeadline, "reveal<=join");
    require(feeBps >= 0 && feeBps <= 10000, "feeBps");
    self.owner = owner;
    self.stakeNano = stakeNano;
    self.maxPlayers = maxPlayers;
    self.joinDeadline = joinDeadline;
    self.revealDeadline = revealDeadline;
    self.feeBps = feeBps;
    self.feeRecipient = feeRecipient;
    self.lobbyId = lobbyId;
    self.version = 1;
    self.state = LobbyState.OPEN;
    self.players = emptyMap();
    self.order = emptyMap();
    self.playersCount = 0;
    self.totalPotNano = 0;
    self.winner = null();
    self.claimable = emptyMap();
    self.finalizedAt = 0;
  }

  // ===== Helpers =====
  fun now(): Int { return timestamp(); }
  fun onlyOwner() { require(sender() == self.owner, "only owner"); }
  fun addClaimable(to: Address, amount: Int) {
    if (amount <= 0) return;
    let curOpt = self.claimable.get(to);
    let cur = (curOpt == null()) ? 0 : curOpt!!;
    self.claimable.set(to, cur + amount);
  }
  fun trySend(to: Address, amount: Int) {
    if (amount <= 0) return;
    send(SendParameters{
      to: to,
      value: amount,
      bounce: true,
      mode: SendRemainingValue(false)
    });
  }
  // Compute a commit value given a secret slice, lobbyId and address. This
  // matches the off‑chain calculation performed by clients. We store
  // secret verbatim and append lobbyId and address to bind the commit
  // to this lobby and player.
  fun computeCommit(secret: slice, lobbyId: Int, addr: Address): Int {
    let b = beginCell();
    b.storeSlice(secret);
    b.storeInt(lobbyId, 257);
    b.storeAddress(addr);
    let c = b.endCell();
    return c.hash();
  }
  // Compute a deterministic random seed from immutable game parameters
  // and the hashes of all revealed secrets. Non‑revealed players are
  // ignored; only the reveal hashes of revealed players are included.
  fun computeRandom(): Int {
    let b = beginCell();
    // Include lobbyId and contract address to scope randomness
    b.storeInt(self.lobbyId, 257);
    b.storeAddress(myAddress());
    // Include stake and deadlines to tie randomness to game setup
    b.storeInt(self.stakeNano, 257);
    b.storeInt(self.joinDeadline, 257);
    b.storeInt(self.revealDeadline, 257);
    // Include total pot to incorporate the number of players joined
    b.storeInt(self.totalPotNano, 257);
    // Append reveal hashes of each revealed player in order
    var i = 0;
    while (i < self.playersCount) {
      let addr = self.order.get(i)!!;
      let pOpt = self.players.get(addr);
      if (pOpt != null()) {
        let p = pOpt!!;
        if (p.revealed) {
          b.storeUint(p.revealHash, 256);
        }
      }
      i = i + 1;
    }
    let c = b.endCell();
    return c.hash();
  }
  fun allRevealed(): Bool {
    var i = 0;
    while (i < self.playersCount) {
      let addr = self.order.get(i)!!;
      let p = self.players.get(addr)!!;
      if (!p.revealed) return false;
      i = i + 1;
    }
    return true;
  }

  // ===== Getters =====
  // Return high‑level state and parameters for UI and indexing
  get fun getState(): Int { return self.state as Int; }
  get fun getParams(): (Address, Int, Int, Int, Int, Int, Address, Int, Int, Int) {
    return (
      self.owner,
      self.stakeNano,
      self.maxPlayers,
      self.joinDeadline,
      self.revealDeadline,
      self.feeBps,
      self.feeRecipient,
      self.lobbyId,
      self.totalPotNano,
      self.playersCount
    );
  }
  get fun getWinner(): Address? { return self.winner; }
  get fun getClaimable(addr: Address): Int {
    let vOpt = self.claimable.get(addr);
    return (vOpt == null()) ? 0 : vOpt!!;
  }

  // Return the commitment for a given wallet address.  This getter
  // allows clients to validate an imported secret before revealing.
  // If the address is not a participant, returns 0.
  get fun getCommit(addr: Address): Int {
    let pOpt = self.players.get(addr);
    if (pOpt == null()) {
      return 0;
    }
    let p = pOpt!!;
    return p.commit;
  }
  // Returns whether the sender is participating, whether they revealed,
  // and whether they can refund. Refund is allowed only if the game
  // cancelled (state CANCELED) or join failed (not enough players by
  // joinDeadline), and the player has not already refunded. If at
  // least one player revealed, non‑revealers cannot refund.
  get fun getPlayerStatus(addr: Address): (Bool, Bool, Bool) {
    let pOpt = self.players.get(addr);
    if (pOpt == null()) {
      return (false, false, false);
    }
    let p = pOpt!!;
    let hasJoined = true;
    let revealed = p.revealed;
    let refundAllowed: Bool = false;
    if (self.state == LobbyState.CANCELED) {
      // In a canceled game: if someone revealed (revealCount>0), only
      // players who revealed can refund; non‑revealers forfeited.
      var anyReveal: Bool = false;
      var i = 0;
      while (i < self.playersCount) {
        let addrIter = self.order.get(i)!!;
        let pi = self.players.get(addrIter)!!;
        if (pi.revealed) { anyReveal = true; break; }
        i = i + 1;
      }
      if (anyReveal) {
        refundAllowed = p.revealed && !p.refunded;
      } else {
        // nobody revealed -> everyone can refund
        refundAllowed = !p.refunded;
      }
    } else if (self.state == LobbyState.OPEN && self.now() > self.joinDeadline && self.playersCount < 2) {
      // join failed (not enough players) -> everyone can refund
      refundAllowed = !p.refunded;
    }
    return (hasJoined, revealed, refundAllowed);
  }

  // ===== External message handlers =====
  receive(msg: Join) {
    require(self.state == LobbyState.OPEN, "not open");
    // Only allow joining before joinDeadline
    require(self.now() <= self.joinDeadline, "join closed");
    require(self.playersCount < self.maxPlayers, "full");
    // Prevent duplicate joins
    let existing = self.players.get(sender());
    require(existing == null(), "duplicate");
    let value = messageValue();
    require(value >= self.stakeNano, "insufficient");
    // Record the player info
    let pi: PlayerInfo = {
      commit: msg.commit,
      joinedAt: self.now(),
      revealed: false,
      revealHash: 0,
      refunded: false
    };
    self.players.set(sender(), pi);
    self.order.set(self.playersCount, sender());
    self.playersCount = self.playersCount + 1;
    self.totalPotNano = self.totalPotNano + self.stakeNano;
    // return change
    let change = value - self.stakeNano;
    if (change > 0) {
      send(SendParameters{ to: sender(), value: change, bounce: false, mode: SendRemainingValue(false) });
    }
    // If the lobby is full, automatically lock and switch to revealing
    if (self.playersCount == self.maxPlayers) {
      self.state = LobbyState.REVEALING;
    }
  }

  // External lock message. Anyone can lock the lobby once the join
  // deadline has passed or the lobby is full. Moves state from OPEN
  // to REVEALING. This message is optional since Join auto‑locks
  // when full.
  receive(msg: Lock) {
    require(self.state == LobbyState.OPEN, "not open");
    // only lock after joinDeadline or when full
    require(self.now() > self.joinDeadline || self.playersCount == self.maxPlayers, "too early");
    self.state = LobbyState.REVEALING;
  }

  // Reveal a secret. The secret must be provided as a slice. The
  // contract recomputes the commit and checks that it matches the
  // stored commitment. Only allowed during the reveal phase.
  receive(msg: Reveal) {
    require(self.state == LobbyState.REVEALING, "not revealing");
    require(self.now() <= self.revealDeadline, "reveal ended");
    // Check that sender is a participant
    let pOpt = self.players.get(sender());
    require(pOpt != null(), "not participant");
    let p = pOpt!!;
    require(!p.revealed, "already revealed");
    // verify commit
    let computed = self.computeCommit(msg.secret, self.lobbyId, sender());
    require(computed == p.commit, "bad secret");
    // compute reveal hash (hash of secret alone)
    let bh = beginCell();
    bh.storeSlice(msg.secret);
    let ch = bh.endCell();
    let secretHash = ch.hash();
    p.revealed = true;
    p.revealHash = secretHash;
    self.players.set(sender(), p);
  }

  // Finalize the game. Can be called by anyone after the reveal
  // deadline or earlier if all players have revealed. Determines the
  // winner among revealed players, applies penalties to non‑revealers
  // and distributes the pot. If no one revealed, cancels the game.
  receive(msg: Finalize) {
    require(self.state == LobbyState.REVEALING, "not revealing");
    require(self.winner == null(), "finalized");
    // only finalize after revealDeadline or if all players revealed
    require(self.now() > self.revealDeadline || self.allRevealed(), "too early");
    // Count revealed players
    var revealCount: Int = 0;
    var i = 0;
    while (i < self.playersCount) {
      let addr = self.order.get(i)!!;
      let p = self.players.get(addr)!!;
      if (p.revealed) revealCount = revealCount + 1;
      i = i + 1;
    }
    if (revealCount == 0) {
      // No one revealed -> cancel the game
      self.state = LobbyState.CANCELED;
      return;
    }
    // Determine winner index among revealed players
    var winnerIdx: Int = -1;
    if (revealCount == 1) {
      // Only one reveal -> they are winner
      var j = 0;
      var count: Int = 0;
      while (j < self.playersCount) {
        let addr = self.order.get(j)!!;
        let p = self.players.get(addr)!!;
        if (p.revealed) {
          winnerIdx = j;
          break;
        }
        j = j + 1;
      }
    } else {
      // Multiple reveals -> compute deterministic random
      let rnd = self.computeRandom();
      // convert to positive index from 0 .. revealCount-1
      let mod: Int = (rnd % revealCount + revealCount) % revealCount;
      // map mod to the corresponding revealed player index in order
      var j = 0;
      var counter: Int = 0;
      while (j < self.playersCount) {
        let addr = self.order.get(j)!!;
        let p = self.players.get(addr)!!;
        if (p.revealed) {
          if (counter == mod) {
            winnerIdx = j;
            break;
          }
          counter = counter + 1;
        }
        j = j + 1;
      }
    }
    require(winnerIdx >= 0 && winnerIdx < self.playersCount, "invalid winner");
    // Save winner address and update state
    let wAddr = self.order.get(winnerIdx)!!;
    self.winner = wAddr;
    self.state = LobbyState.FINALIZED;
    self.finalizedAt = self.now();
    // Compute fee and payout.  The protocol fee is split between
    // the feeRecipient and the finaliser.  A portion defined by
    // FINALIZER_REWARD_BPS is paid to the caller (sender()) and
    // the remainder to the feeRecipient.  The total payout to the
    // winner is the pot minus the full fee.
    let fee: Int = (self.totalPotNano * self.feeBps) / 10000;
    let payout: Int = self.totalPotNano - fee;
    // compute finaliser reward and recipient share
    let finaliserReward: Int = (fee * FINALIZER_REWARD_BPS) / 10000;
    let recipientFee: Int = fee - finaliserReward;
    // credit recipient fee
    if (recipientFee > 0) {
      self.addClaimable(self.feeRecipient, recipientFee);
      self.trySend(self.feeRecipient, recipientFee);
    }
    // credit finaliser reward
    if (finaliserReward > 0) {
      self.addClaimable(sender(), finaliserReward);
      self.trySend(sender(), finaliserReward);
    }
    // credit winner
    self.addClaimable(wAddr, payout);
    self.trySend(wAddr, payout);
    // Mark all other players as refunded (stake forfeited) so that
    // they cannot later refund. This covers both non‑revealed and
    // revealed losers.
    var k = 0;
    while (k < self.playersCount) {
      let addr = self.order.get(k)!!;
      if (addr != wAddr) {
        let pOpt = self.players.get(addr);
        if (pOpt != null()) {
          let p = pOpt!!;
          p.refunded = true;
          self.players.set(addr, p);
        }
      }
      k = k + 1;
    }
  }

  // Cancel the lobby. Only the owner may cancel before finalization.
  // Cancellation moves the state to CANCELED and allows refunds for
  // applicable players. Once finalized, cancel is not allowed.
  receive(msg: Cancel) {
    self.onlyOwner();
    require(self.state != LobbyState.FINALIZED, "finalized");
    self.state = LobbyState.CANCELED;
  }

  // Refund stake back to a player. Allowed only if the game is
  // cancelled or if join failed (not enough players by joinDeadline).
  // Additionally, if any player revealed, only players who revealed
  // can refund (non‑revealers forfeited). Each player can refund at
  // most once.
  receive(msg: Refund) {
    let pOpt = self.players.get(sender());
    require(pOpt != null(), "not participant");
    let p = pOpt!!;
    require(!p.refunded, "already refunded");
    // Determine refund eligibility
    var refundAllowed: Bool = false;
    if (self.state == LobbyState.CANCELED) {
      // Determine if any reveal happened
      var anyReveal: Bool = false;
      var i = 0;
      while (i < self.playersCount) {
        let addrIter = self.order.get(i)!!;
        let pi = self.players.get(addrIter)!!;
        if (pi.revealed) { anyReveal = true; break; }
        i = i + 1;
      }
      if (anyReveal) {
        // Only revealed players can refund
        refundAllowed = p.revealed;
      } else {
        // No one revealed -> everyone can refund
        refundAllowed = true;
      }
    } else if (self.state == LobbyState.OPEN && self.now() > self.joinDeadline && self.playersCount < 2) {
      // Not enough players joined by deadline -> refund for all
      refundAllowed = true;
    }
    require(refundAllowed, "refund not allowed");
    // mark refunded and pay stake back
    p.refunded = true;
    self.players.set(sender(), p);
    self.addClaimable(sender(), self.stakeNano);
    self.trySend(sender(), self.stakeNano);
  }

  // Claim any pending balance. Pull‑payment pattern ensures safe
  // transfers. Player or fee recipient can call this to withdraw
  // claimable amounts. Clearing claimable prevents reentrancy.
  receive(msg: Claim) {
    let from = sender();
    let amtOpt = self.claimable.get(from);
    require(amtOpt != null(), "nothing");
    let amt = amtOpt!!;
    require(amt > 0, "nothing");
    self.claimable.set(from, 0);
    send(SendParameters{ to: from, value: amt, bounce: true, mode: SendRemainingValue(false) });
  }

  // Bounce handler: no special action needed. Claimable balances are
  // credited before sending, so bounced transfers can be reclaimed
  // with Claim().
  bounced(src: bounced) {
    // no‑op
  }
}