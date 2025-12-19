// ton-rody/contracts/tact/TonRodyCoinFlip.tact
//
// TON-RODY CoinFlip Game
//
// Two-player commit–reveal game. Both players deposit a fixed stake and
// provide a commit that binds their secret to the game context. A valid
// commit is computed off-chain as:
//   commit = hash(secret || gameId || playerAddress)
// where `secret` is an arbitrary byte string chosen by the player.
// Players must reveal their secret before the revealDeadline by calling
// Reveal. The contract verifies that hash(secret || gameId || sender)
// matches the stored commit and records a hash of the secret. If only
// one player reveals before the deadline, that player wins by default
// and the non-revealer forfeits their stake. If neither player reveals,
// the game is canceled and both can refund their stakes. When both
// secrets are revealed, a deterministic seed is derived from the game
// parameters and both secret hashes to choose a winner. Pull‑payment
// pattern is used for payouts and refunds.

import "@stdlib/deploy";

enum GameState {
  OPEN = 1,
  LOCKED = 2,
  FINALIZED = 3,
  CANCELED = 4
}

const OP_JOIN: Int = 0x4A4F494E;
const OP_REVEAL: Int = 0x5245564C;
const OP_FINALIZE: Int = 0x46494E41;
const OP_CANCEL: Int = 0x43414E43;
const OP_REFUND: Int = 0x52454655;
const OP_CLAIM: Int = 0x434C4149;

struct Player {
  addr: Address;
  commit: Int;      // uint256 commitment provided on join
  joinedAt: Int;    // unix timestamp when joined
  revealed: Bool;   // whether the player revealed their secret
  revealHash: Int;  // uint256 hash of the revealed secret (0 if missing)
  refunded: Bool;   // whether the player has claimed a refund (only if canceled)
}

message(OP_JOIN) Join { commit: Int; }
// Reveal message carries the secret as a slice. The secret is a variable‑length
// byte string; its hash must match the stored commit when combined with
// gameId and the sender’s address.
message(OP_REVEAL) Reveal {
  secret: slice;
}
message(OP_FINALIZE) Finalize {}
message(OP_CANCEL) Cancel {}
message(OP_REFUND) Refund {}
message(OP_CLAIM) Claim {}

contract TonRodyCoinFlip with Deployable {
  // immutable config
  owner: Address;
  feeRecipient: Address;
  stakeNano: Int;
  joinDeadline: Int;
  revealDeadline: Int;
  feeBps: Int;
  gameId: Int;
  version: Int;

  // state
  state: GameState;
  players: map<Int, Player>; // index 0 or 1 -> Player
  joinedCount: Int;
  totalPotNano: Int;
  winnerIndex: Int?;
  claimable: map<Address, Int>;
  finalizedAt: Int;

  init(
    owner: Address,
    stakeNano: Int,
    joinDeadline: Int,
    revealDeadline: Int,
    feeBps: Int,
    feeRecipient: Address,
    gameId: Int
  ) {
    require(stakeNano > 0, "stake=0");
    require(revealDeadline > joinDeadline, "reveal<=join");
    require(feeBps >= 0 && feeBps <= 10000, "feeBps");
    self.owner = owner;
    self.stakeNano = stakeNano;
    self.joinDeadline = joinDeadline;
    self.revealDeadline = revealDeadline;
    self.feeBps = feeBps;
    self.feeRecipient = feeRecipient;
    self.gameId = gameId;
    self.version = 1;
    self.state = GameState.OPEN;
    self.players = emptyMap();
    self.joinedCount = 0;
    self.totalPotNano = 0;
    self.winnerIndex = null();
    self.claimable = emptyMap();
    self.finalizedAt = 0;
  }

  // helpers
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
  // Compute a commit by hashing secret || gameId || address. The secret is
  // provided as a slice. Both gameId and address are appended to ensure
  // commits cannot be reused across games or players.
  fun computeCommit(secret: slice, gameId: Int, addr: Address): Int {
    let b = beginCell();
    // store the secret slice verbatim (length is encoded implicitly)
    b.storeSlice(secret);
    // store gameId and address in deterministic order
    b.storeInt(gameId, 257);
    b.storeAddress(addr);
    let c = b.endCell();
    return c.hash();
  }
  // Compute deterministic random seed from revealed hashes and static salt.
  // If a player has not revealed, use 0. The salt ties randomness to
  // immutable game parameters so that the seed cannot be manipulated by
  // join timing. We include joinDeadline and stakeNano as part of the salt.
  fun computeRandom(): Int {
    let b = beginCell();
    // include the gameId to scope randomness to this game
    b.storeInt(self.gameId, 257);
    // append reveal hashes (0 if missing)
    for (let i = 0; i < 2; i++) {
      let pOpt = self.players.get(i);
      let rh: Int = 0;
      if (pOpt != null() && pOpt!!.revealed) {
        rh = pOpt!!.revealHash;
      }
      b.storeUint(rh, 256);
    }
    // deterministic salt: joinDeadline and stakeNano
    b.storeInt(self.joinDeadline, 257);
    b.storeInt(self.stakeNano, 257);
    let c = b.endCell();
    return c.hash();
  }
  fun allJoined(): Bool { return self.joinedCount == 2; }
  fun allRevealed(): Bool {
    for (let i = 0; i < 2; i++) {
      let pOpt = self.players.get(i);
      if (pOpt == null() || !pOpt!!.revealed) return false;
    }
    return true;
  }

  // getters
  get fun getState(): Int { return self.state as Int; }
  get fun getParams(): (Address, Int, Int, Int, Int, Int, Address, Int, Int) {
    return (
      self.owner,
      self.stakeNano,
      self.joinDeadline,
      self.revealDeadline,
      self.feeBps,
      self.gameId,
      self.feeRecipient,
      self.version,
      self.joinedCount
    );
  }
  get fun getWinner(): Int? { return self.winnerIndex; }
  get fun getClaimable(addr: Address): Int {
    let vOpt = self.claimable.get(addr);
    return (vOpt == null()) ? 0 : vOpt!!;
  }
  // Returns information about a player by address. If the address has
  // joined, returns (true, revealed, canRefund). Otherwise returns (false, false, false).
  get fun getPlayerStatus(addr: Address): (Bool, Bool, Bool) {
    for (let i = 0; i < 2; i++) {
      let pOpt = self.players.get(i);
      if (pOpt != null() && pOpt!!.addr == addr) {
        let p = pOpt!!;
        // canRefund only if state is canceled or join failed and not refunded
        let canRefund = (
          (self.state == GameState.CANCELED || (self.state == GameState.OPEN && self.now() > self.joinDeadline && self.joinedCount < 2))
          && !p.refunded
        );
        return (true, p.revealed, canRefund);
      }
    }
    return (false, false, false);
  }

  receive(msg: Join) {
    require(self.state == GameState.OPEN, "not open");
    // must join before joinDeadline
    require(self.now() <= self.joinDeadline, "join closed");
    require(self.joinedCount < 2, "full");
    let idx = self.joinedCount;
    // prevent duplicate joins by same address
    for (let i = 0; i < self.joinedCount; i++) {
      let p = self.players.get(i)!!;
      require(p.addr != sender(), "duplicate");
    }
    let value = messageValue();
    require(value >= self.stakeNano, "insufficient");
    let p: Player = {
      addr: sender(),
      commit: msg.commit,
      joinedAt: self.now(),
      revealed: false,
      revealHash: 0,
      refunded: false
    };
    self.players.set(idx, p);
    self.joinedCount = idx + 1;
    self.totalPotNano = self.totalPotNano + self.stakeNano;
    // return change (use non-bounce send)
    let change = value - self.stakeNano;
    if (change > 0) {
      send(SendParameters{ to: sender(), value: change, bounce: false, mode: SendRemainingValue(false) });
    }
    // if both have joined, move to LOCKED state immediately
    if (self.joinedCount == 2) {
      self.state = GameState.LOCKED;
    }
  }
  receive(msg: Reveal) {
    require(self.state == GameState.LOCKED, "not locked");
    // must reveal before revealDeadline
    require(self.now() <= self.revealDeadline, "reveal ended");
    // find which player index matches sender
    let idx = -1;
    for (let i = 0; i < 2; i++) {
      let pOpt = self.players.get(i);
      if (pOpt != null() && pOpt!!.addr == sender()) idx = i;
    }
    require(idx >= 0, "not participant");
    let p = self.players.get(idx)!!;
    require(!p.revealed, "already revealed");
    // verify commit using secret, gameId and sender
    let computed: Int = self.computeCommit(msg.secret, self.gameId, sender());
    require(computed == p.commit, "bad secret");
    // compute revealHash (hash of secret alone) and store
    let bh = beginCell();
    bh.storeSlice(msg.secret);
    let ch = bh.endCell();
    let secretHash: Int = ch.hash();
    p.revealed = true;
    p.revealHash = secretHash;
    self.players.set(idx, p);
  }
  receive(msg: Finalize) {
    require(self.state == GameState.LOCKED, "not locked");
    require(self.joinedCount == 2, "not enough");
    require(self.winnerIndex == null(), "finalized");
    // only allow finalize after revealDeadline or if both revealed
    require(self.now() > self.revealDeadline || self.allRevealed(), "too early");
    // determine outcome based on reveal status
    let revealCount: Int = 0;
    for (let i = 0; i < 2; i++) {
      let pOpt = self.players.get(i);
      if (pOpt != null() && pOpt!!.revealed) revealCount = revealCount + 1;
    }
    if (revealCount == 0) {
      // no one revealed -> cancel; allow refunds
      self.state = GameState.CANCELED;
      // no winner
      return;
    }
    var idx: Int = -1;
    if (revealCount == 1) {
      // only one reveal -> that player wins automatically
      for (let i = 0; i < 2; i++) {
        let pOpt = self.players.get(i);
        if (pOpt != null() && pOpt!!.revealed) idx = i;
      }
    } else {
      // both revealed -> compute deterministic random
      let rnd: Int = self.computeRandom();
      idx = (rnd % 2 + 2) % 2;
    }
    require(idx >= 0 && idx < 2, "invalid winner");
    self.winnerIndex = idx;
    self.state = GameState.FINALIZED;
    self.finalizedAt = self.now();
    // total pot includes both stakes; non-revealer forfeits stake
    let fee: Int = (self.totalPotNano * self.feeBps) / 10000;
    let payout: Int = self.totalPotNano - fee;
    // credit fee and try send
    if (fee > 0) {
      self.addClaimable(self.feeRecipient, fee);
      self.trySend(self.feeRecipient, fee);
    }
    let winnerAddr: Address = self.players.get(idx)!!.addr;
    self.addClaimable(winnerAddr, payout);
    self.trySend(winnerAddr, payout);
    // mark the losing player as refunded (stake forfeited) so they cannot claim refund
    for (let i = 0; i < 2; i++) {
      if (i != idx) {
        let pOpt = self.players.get(i);
        if (pOpt != null()) {
          let pl = pOpt!!;
          pl.refunded = true;
          self.players.set(i, pl);
        }
      }
    }
  }
  receive(msg: Cancel) {
    self.onlyOwner();
    require(self.state != GameState.FINALIZED, "finalized");
    self.state = GameState.CANCELED;
  }
  receive(msg: Refund) {
    // A participant can refund their stake only if the game is canceled or join phase failed
    // and they have not already refunded. In case of a forfeit (only one reveal), the loser
    // cannot refund.
    let idx: Int = -1;
    for (let i = 0; i < 2; i++) {
      let pOpt = self.players.get(i);
      if (pOpt != null() && pOpt!!.addr == sender()) idx = i;
    }
    require(idx >= 0, "not participant");
    let p = self.players.get(idx)!!;
    require(!p.refunded, "already refunded");
    // Refund allowed only if state is CANCELED or
    // join failed (only one joined and joinDeadline passed)
    let refundAllowed: Bool = (self.state == GameState.CANCELED)
      || (self.state == GameState.OPEN && self.now() > self.joinDeadline && self.joinedCount < 2);
    require(refundAllowed, "refund not allowed");
    // mark refunded
    p.refunded = true;
    self.players.set(idx, p);
    // credit claimable and try push
    self.addClaimable(sender(), self.stakeNano);
    self.trySend(sender(), self.stakeNano);
  }
  receive(msg: Claim) {
    let from = sender();
    let amtOpt = self.claimable.get(from);
    require(amtOpt != null(), "nothing");
    let amt = amtOpt!!;
    require(amt > 0, "nothing");
    self.claimable.set(from, 0);
    send(SendParameters{ to: from, value: amt, bounce: true, mode: SendRemainingValue(false) });
  }
  bounced(src: bounced) {
    // no-op; claimable already credited
  }
}