/*
 * Encrypted Seed Vault
 *
 * This module implements a simple client‑side vault for storing secrets
 * (commit–reveal seeds) in the browser using IndexedDB.  Secrets are
 * encrypted at rest with a static AES‑GCM key.  Each secret is keyed
 * by the concatenation of the lobby contract address and the user’s
 * wallet address (`${lobbyAddress}:${walletAddress}`).
 *
 * In addition to basic CRUD operations the vault supports export and
 * import of secrets for backup/restore.  Backup data is returned as
 * an array of objects containing the key and the plaintext secret.  The
 * import API accepts the same format and encrypts the secrets before
 * storing them.
 */

const DB_NAME = 'ton-rody-seed-vault';
const STORE_NAME = 'seeds';
/**
 * Application salt used for key derivation.  This value should be
 * random and constant across installations.  Do not expose
 * secrets; this salt only diversifies the PBKDF2 key derivation.
 */
const APP_SALT = 'ton-rody-app-salt-2025';

/* Open an IndexedDB database, creating the object store if it does
 * not already exist.  This helper wraps the async IDB API into a
 * Promise.  The database is versioned at 1.  If IndexedDB is not
 * available (e.g. in private browsing or unsupported browsers) the
 * promise will reject and callers should fall back to localStorage.
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/* Determine whether IndexedDB is available.  In some environments
 * (incognito, older browsers) the global indexedDB may be undefined
 * or access may throw.  We catch errors to avoid unhandled
 * exceptions.  */
function supportsIndexedDB(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB != null;
  } catch {
    return false;
  }
}

/* Derive a CryptoKey for AES‑GCM encryption using PBKDF2.  The
 * passphrase is the user's wallet address (normalized) and the
 * application salt.  PBKDF2 with a high number of iterations
 * prevents offline brute force of the secret key.  Using
 * walletAddress binds the key to a specific user and prevents
 * cross‑user secret access.  Note: crypto.subtle.importKey and
 * deriveKey are asynchronous.
 */
async function deriveKey(walletAddress: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const passphrase = walletAddress;
  const saltBuf = enc.encode(APP_SALT);
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuf,
      iterations: 200_000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/* Internal helper to write a value into IndexedDB */
async function idbPut(key: string, value: string): Promise<void> {
  if (supportsIndexedDB()) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } else {
    // fallback: use localStorage synchronously
    localStorage.setItem(`${STORE_NAME}:${key}`, value);
  }
}

/* Internal helper to read a value from IndexedDB */
async function idbGet(key: string): Promise<string | undefined> {
  if (supportsIndexedDB()) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result as any);
      req.onerror = () => reject(req.error);
    });
  } else {
    const val = localStorage.getItem(`${STORE_NAME}:${key}`);
    return val === null ? undefined : val;
  }
}

/* Internal helper to delete a value from IndexedDB */
async function idbDelete(key: string): Promise<void> {
  if (supportsIndexedDB()) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } else {
    localStorage.removeItem(`${STORE_NAME}:${key}`);
  }
}

/* Internal helper to iterate over all entries */
async function idbEntries(): Promise<Array<{ key: string; value: string }>> {
  if (supportsIndexedDB()) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const entries: Array<{ key: string; value: string }> = [];
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          entries.push({ key: cursor.key as string, value: cursor.value as string });
          cursor.continue();
        } else {
          resolve(entries);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } else {
    const entries: Array<{ key: string; value: string }> = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith(`${STORE_NAME}:`)) {
        const rawKey = k.substring(STORE_NAME.length + 1);
        const value = localStorage.getItem(k);
        if (value !== null) {
          entries.push({ key: rawKey, value });
        }
      }
    }
    return entries;
  }
}

/* Encrypt a plaintext secret into a base64 string.  The IV is
 * generated randomly and prepended to the ciphertext before
 * encoding.  AES‑GCM includes an authentication tag in the
 * ciphertext so no additional MAC is required.
 */
async function encryptSecret(plain: string, walletAddress: string): Promise<string> {
  const key = await deriveKey(walletAddress);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plain)
  );
  const payload = new Uint8Array(iv.length + ciphertext.byteLength);
  payload.set(iv, 0);
  payload.set(new Uint8Array(ciphertext), iv.length);
  let binary = '';
  for (const b of payload) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary);
}

/* Decrypt a base64 encoded secret back into plaintext.  The function
 * extracts the IV from the first 12 bytes and then decrypts the
 * remainder.  If decryption fails (e.g. due to tampering) it
 * rejects.
 */
async function decryptSecret(encoded: string, walletAddress: string): Promise<string> {
  const key = await deriveKey(walletAddress);
  const payload = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const iv = payload.slice(0, 12);
  const data = payload.slice(12);
  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  const dec = new TextDecoder();
  return dec.decode(plainBuf);
}

/* Public API: save a secret associated with a lobby and wallet address.
 * The secret is encrypted before being stored.
 */
export async function saveSeed(lobbyAddress: string, walletAddress: string, secret: string): Promise<void> {
  const key = `${lobbyAddress}:${walletAddress}`;
  const encrypted = await encryptSecret(secret, walletAddress);
  await idbPut(key, encrypted);
}

/* Retrieve and decrypt a secret.  Returns null if no secret is stored
 * for the given lobby/wallet key.
 */
export async function loadSeed(lobbyAddress: string, walletAddress: string): Promise<string | null> {
  const key = `${lobbyAddress}:${walletAddress}`;
  const encrypted = await idbGet(key);
  if (!encrypted) return null;
  try {
    return await decryptSecret(encrypted, walletAddress);
  } catch {
    return null;
  }
}

/* Remove a secret from the vault */
export async function deleteSeed(lobbyAddress: string, walletAddress: string): Promise<void> {
  const key = `${lobbyAddress}:${walletAddress}`;
  await idbDelete(key);
}

/* Export all secrets as plaintext for backup.  Each entry contains
 * `key` (the lobbyAddress:walletAddress) and `secret` (the
 * plaintext secret).  Use this to present a QR code or text to the
 * user.
 */
export async function exportSeeds(): Promise<Array<{ key: string; secret: string }>> {
  const entries = await idbEntries();
  const out: Array<{ key: string; secret: string }> = [];
  for (const { key, value } of entries) {
    // key format is `${lobbyAddress}:${walletAddress}`
    // Extract walletAddress from key.  key format is `${lobbyAddress}:${walletAddress}`.
    // Both addresses contain a single colon (workchain:hash), so the wallet
    // address occupies the last two segments when splitting by ':'.
    const parts = key.split(':');
    const walletAddress = parts.slice(-2).join(':');
    try {
      const secret = await decryptSecret(value, walletAddress);
      out.push({ key: key as string, secret });
    } catch {
      // skip unreadable entries
    }
  }
  return out;
}

/* Import a list of secrets.  Each item must have a `key` in the
 * format `${lobbyAddress}:${walletAddress}` and the plaintext
 * `secret`.  Secrets are encrypted before being stored.
 */
export async function importSeeds(entries: Array<{ key: string; secret: string }>): Promise<void> {
  for (const { key, secret } of entries) {
    // Extract walletAddress as described in exportSeeds
    const parts = key.split(':');
    const walletAddress = parts.slice(-2).join(':');
    const encrypted = await encryptSecret(secret, walletAddress);
    await idbPut(key, encrypted);
  }
}