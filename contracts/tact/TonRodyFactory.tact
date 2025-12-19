// contracts/tact/TonRodyFactory.tact
//
// Factory contract responsible for deploying new CoinFlip and Lobby
// contracts and maintaining a registry of deployed games. Each game
// receives a deterministic address based on the contract init code
// and data. This factory exposes messages to create new CoinFlip games
// and getters to query the registry. Only the contract owner can
// deploy new games.

import "@stdlib/deploy";

// Opcodes for factory messages. We accept explicit hex codes to avoid
// ambiguity when extending functionality.
enum FactoryOp {
  DEPLOY_LOBBY = 0x444C4F42,    // 'DLOB'
  DEPLOY_COINFLIP = 0x44434F49  // 'DCOI'
}

// Message to deploy a new Lobby game. The factory uses the provided
// parameters to construct a new TonRodyLobby. `gameId` must be
// unique. All value attached to this message is forwarded to the
// newly created contract as its deployment balance.
// Deploy a new lobby raffle.  The lobbyId must be provided by the caller
// and must be unique.  All attached value is forwarded to the new
// contract as its deployment balance.  We name the identifier field
// `lobbyId` for clarity and consistency within the registry.
message(0x444C4F42) DeployLobby {
  stakeNano: Int;
  maxPlayers: Int;
  joinDeadline: Int;
  revealDeadline: Int;
  feeBps: Int;
  feeRecipient: Address;
  lobbyId: Int;
}

// Message to deploy a new CoinFlip game. A unique gameId must be provided
// by the caller. The factory will reject duplicate gameIds. All value
// attached to this message will be forwarded to the new contract as its
// deployment balance.
message(0x44434F49) DeployCoinFlip {
  stakeNano: Int;
  joinDeadline: Int;
  revealDeadline: Int;
  feeBps: Int;
  feeRecipient: Address;
  gameId: Int;
}

contract TonRodyFactory with Deployable {
  const ZERO_ADDRESS: Address = address("0:0");
  // Owner who is allowed to deploy new games
  owner: Address;
  // Registry mapping gameId -> coin flip address
  coinFlips: map<Int, Address>;
  // Sequential index to enumerate deployed coin flips
  coinFlipList: map<Int, Address>;
  coinFlipCount: Int;

  // === Lobby registry ===
  // We persist full lobby metadata on chain so that off-chain systems can
  // enumerate and index all lobbies without knowing their addresses in
  // advance. Each lobby is assigned a unique lobbyId by the creator and
  // stored in a mapping along with its address, creator, creation
  // timestamp, stake and maxPlayers. A separate sequential index to
  // lobbyId allows pagination.

  // Information recorded for each lobby deployed via this factory
  struct LobbyMeta {
    lobbyId: Int;        // unique identifier for the lobby
    address: Address;    // deployed lobby address
    creator: Address;    // sender who deployed the lobby
    createdAt: Int;      // unix timestamp when the lobby was deployed
    stakeNano: Int;      // stake required per player in nanoTON
    maxPlayers: Int;     // maximum number of players
  }
  // Mapping from lobbyId to its metadata
  lobbies: map<Int, LobbyMeta>;
  // Mapping from sequential index to lobbyId for enumeration
  lobbyIds: map<Int, Int>;
  // Total number of lobbies deployed
  lobbyCount: Int;

  init(owner: Address) {
    self.owner = owner;
    self.coinFlips = emptyMap();
    self.coinFlipList = emptyMap();
    self.coinFlipCount = 0;
    // initialise lobby registry maps
    self.lobbies = emptyMap();
    self.lobbyIds = emptyMap();
    self.lobbyCount = 0;
  }

  // Only owner guard
  fun onlyOwner() { require(sender() == self.owner, "only owner"); }

  // Deploy a new coin flip game. The caller must provide enough value to
  // cover the deployment of the new contract. The new game is
  // initialized with the provided parameters and a deterministic address.
  receive(msg: DeployCoinFlip) {
    self.onlyOwner();
    // Ensure the gameId is unique
    let existing = self.coinFlips.get(msg.gameId);
    require(existing == null(), "gameId exists");
    // Prepare StateInit for TonRodyCoinFlip contract
    // The TonRodyCoinFlip init signature is:
    // (owner, stakeNano, joinDeadline, revealDeadline, feeBps, feeRecipient, gameId)
    let init: StateInit = initOf TonRodyCoinFlip(self.owner, msg.stakeNano, msg.joinDeadline, msg.revealDeadline, msg.feeBps, msg.feeRecipient, msg.gameId);
    // Compute deterministic address for the new game
    let addr: Address = contractAddress(init);
    // Save to registry
    self.coinFlips.set(msg.gameId, addr);
    self.coinFlipList.set(self.coinFlipCount, addr);
    self.coinFlipCount = self.coinFlipCount + 1;
    // Forward all attached value to the new contract with code/data fields to deploy
    let value: Int = messageValue();
    send(SendParameters{
      to: addr,
      value: value,
      bounce: false,
      mode: SendRemainingValue(false),
      code: init.code,
      data: init.data,
      body: emptyCell()
    });
  }

  // Deploy a new lobby raffle. Only the owner may call this. The caller
  // must provide enough value to cover the deployment of the new
  // lobby contract. The lobby receives a deterministic address
  // computed from its init code and data. The lobbyId must be unique.
  receive(msg: DeployLobby) {
    self.onlyOwner();
    // ensure lobbyId is unique
    let existing = self.lobbies.get(msg.lobbyId);
    require(existing == null(), "lobbyId exists");
    // Prepare StateInit for TonRodyLobby. The constructor signature is:
    // (owner, stakeNano, maxPlayers, joinDeadline, revealDeadline,
    //  feeBps, feeRecipient, lobbyId)
    let init: StateInit = initOf TonRodyLobby(
      self.owner,
      msg.stakeNano,
      msg.maxPlayers,
      msg.joinDeadline,
      msg.revealDeadline,
      msg.feeBps,
      msg.feeRecipient,
      msg.lobbyId
    );
    // Compute deterministic address for the new lobby
    let addr: Address = contractAddress(init);
    // Persist full lobby metadata for enumeration
    let meta: LobbyMeta = {
      lobbyId: msg.lobbyId,
      address: addr,
      creator: sender(),
      createdAt: timestamp(),
      stakeNano: msg.stakeNano,
      maxPlayers: msg.maxPlayers
    };
    self.lobbies.set(msg.lobbyId, meta);
    self.lobbyIds.set(self.lobbyCount, msg.lobbyId);
    self.lobbyCount = self.lobbyCount + 1;
    // Forward all attached value to the new contract with code/data to deploy
    let value: Int = messageValue();
    send(SendParameters{
      to: addr,
      value: value,
      bounce: false,
      mode: SendRemainingValue(false),
      code: init.code,
      data: init.data,
      body: emptyCell()
    });
  }

  // Get the address of a coin flip game by its id. Returns null if not found.
  get fun getCoinFlipAddress(id: Int): Address? {
    return self.coinFlips.get(id);
  }

  // Get the total number of coin flip games deployed.
  get fun getCoinFlipCount(): Int { return self.coinFlipCount; }

  // Get a coin flip address by its index in the deployment order. Returns
  // null if index is out of range.
  get fun getCoinFlipByIndex(idx: Int): Address? {
    if (idx < 0 || idx >= self.coinFlipCount) return null();
    return self.coinFlipList.get(idx);
  }

  // ===== Lobby registry getters =====
  // Get lobby address by its id. Returns null if not found.
  get fun getLobbyAddress(id: Int): Address? {
    let mOpt = self.lobbies.get(id);
    if (mOpt == null()) return null();
    let m = mOpt!!;
    return m.address;
  }
  // Get total number of lobbies deployed.
  get fun getLobbyCount(): Int { return self.lobbyCount; }
  // Get lobby id by deployment index. Returns null if out of range.
  get fun getLobbyIdByIndex(idx: Int): Int? {
    if (idx < 0 || idx >= self.lobbyCount) return null();
    return self.lobbyIds.get(idx);
  }
  // Get lobby address by deployment index. Maintains backward compatibility.
  get fun getLobbyByIndex(idx: Int): Address? {
    let idOpt = self.getLobbyIdByIndex(idx);
    if (idOpt == null()) return null();
    let id = idOpt!!;
    return self.getLobbyAddress(id);
  }
  // Return a cell containing lobbyIds starting at offset up to limit. Each
  // lobbyId is stored as a 257-bit integer to avoid truncation. If
  // offset+limit exceeds the total count, the returned cell includes
  // available ids only.
  get fun getLobbyIds(offset: Int, limit: Int): cell {
    var safeOffset: Int = (offset < 0) ? 0 : offset;
    var safeLimit: Int = (limit < 0) ? 0 : limit;
    let count: Int = self.lobbyCount;
    if (safeOffset > count) {
      safeOffset = count;
    }
    let remaining: Int = count - safeOffset;
    if (safeLimit > remaining) {
      safeLimit = remaining;
    }
    var i = 0;
    let b = beginCell();
    while (i < safeLimit) {
      let idx = safeOffset + i;
      let id = self.lobbyIds.get(idx)!!;
      b.storeInt(id, 257);
      i = i + 1;
    }
    return b.endCell();
  }
  // Return metadata for a lobby.  The function returns a tuple
  // `(found, lobbyId, lobbyAddress, creator, createdAt, stakeNano, maxPlayers)`.  The
  // boolean `found` is true when the lobby exists in the registry and
  // false otherwise.  When not found, addresses are set to the zero
  // address (workchain 0, hash 0) and numeric fields are zero.
  get fun getLobbyMeta(id: Int): (Bool, Int, Address, Address, Int, Int, Int) {
    let mOpt = self.lobbies.get(id);
    if (mOpt == null()) {
      return (false, 0, ZERO_ADDRESS, ZERO_ADDRESS, 0, 0, 0);
    }
    let m = mOpt!!;
    return (
      true,
      m.lobbyId,
      m.address,
      m.creator,
      m.createdAt,
      m.stakeNano,
      m.maxPlayers
    );
  }
  // Return latest lobbyIds up to `limit`.  This getter slices the list
  // of lobby identifiers from the end.  Negative limits are clamped
  // to zero and limits greater than the number of lobbies are
  // clamped to the total count.  We use mutable variables (`var`)
  // because reassignment of `let` values is not allowed in Tact.
  get fun getLatestLobbies(limit: Int): cell {
    var lim: Int = (limit < 0) ? 0 : limit;
    let count: Int = self.lobbyCount;
    if (lim > count) {
      lim = count;
    }
    var startIdx: Int = count - lim;
    if (startIdx < 0) {
      startIdx = 0;
    }
    return self.getLobbyIds(startIdx, lim);
  }
}
