import { Address } from 'ton-core';

const DB_NAME = 'ton-rody-seed-vault';
const STORE_NAME = 'seeds';
const APP_SALT = 'ton-rody-seed-vault-v1';
const PBKDF2_ITERATIONS = 250_000;
const LS_PREFIX = 'ton-rody-seed:';

function normalizeAddress(addr: string): string {
  try {
    return Address.parse(addr).toString();
  } catch {
    return addr.trim().toLowerCase();
  }
}

function buildKey(lobbyAddress: string, walletAddress: string): string {
  const lobby = normalizeAddress(lobbyAddress);
  const wallet = normalizeAddress(walletAddress);
  return `${lobby}:${wallet}`;
}

async function deriveKey(walletAddress: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const material = enc.encode(`${normalizeAddress(walletAddress)}:${APP_SALT}`);
  const keyMaterial = await crypto.subtle.importKey('raw', material, 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(APP_SALT),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptSecret(walletAddress: string, plain: string): Promise<string> {
  const key = await deriveKey(walletAddress);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plain));
  const payload = new Uint8Array(iv.length + ciphertext.byteLength);
  payload.set(iv, 0);
  payload.set(new Uint8Array(ciphertext), iv.length);
  let binary = '';
  for (const b of payload) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary);
}

async function decryptSecret(walletAddress: string, encoded: string): Promise<string> {
  const key = await deriveKey(walletAddress);
  const payload = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const iv = payload.slice(0, 12);
  const data = payload.slice(12);
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(plainBuf);
}

function openDb(): Promise<IDBDatabase> {
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

let dbPromise: Promise<IDBDatabase | null> | null = null;

async function getDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return null;
  if (!dbPromise) {
    dbPromise = openDb().catch(() => null);
  }
  return dbPromise;
}

async function idbPut(key: string, value: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('IndexedDB unavailable');
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(key: string): Promise<string | undefined> {
  const db = await getDb();
  if (!db) throw new Error('IndexedDB unavailable');
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result as any);
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('IndexedDB unavailable');
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbEntries(): Promise<Array<{ key: string; value: string }>> {
  const db = await getDb();
  if (!db) throw new Error('IndexedDB unavailable');
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
}

function lsKey(key: string): string {
  return `${LS_PREFIX}${key}`;
}

function lsPut(key: string, value: string) {
  localStorage.setItem(lsKey(key), value);
}

function lsGet(key: string): string | null {
  return localStorage.getItem(lsKey(key));
}

function lsDelete(key: string) {
  localStorage.removeItem(lsKey(key));
}

function lsEntries(): Array<{ key: string; value: string }> {
  const entries: Array<{ key: string; value: string }> = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(LS_PREFIX)) continue;
    const value = localStorage.getItem(k);
    if (!value) continue;
    entries.push({ key: k.slice(LS_PREFIX.length), value });
  }
  return entries;
}

async function putEncrypted(key: string, value: string) {
  try {
    await idbPut(key, value);
  } catch {
    lsPut(key, value);
  }
}

async function getEncrypted(key: string): Promise<string | null> {
  try {
    const value = await idbGet(key);
    return value ?? null;
  } catch {
    return lsGet(key);
  }
}

async function deleteEncrypted(key: string): Promise<void> {
  try {
    await idbDelete(key);
  } catch {
    lsDelete(key);
  }
}

async function listEncrypted(): Promise<Array<{ key: string; value: string }>> {
  try {
    return await idbEntries();
  } catch {
    return lsEntries();
  }
}

export async function saveSeed(lobbyAddress: string, walletAddress: string, secret: string): Promise<void> {
  const key = buildKey(lobbyAddress, walletAddress);
  const encrypted = await encryptSecret(walletAddress, secret);
  await putEncrypted(key, encrypted);
}

export async function loadSeed(lobbyAddress: string, walletAddress: string): Promise<string | null> {
  const key = buildKey(lobbyAddress, walletAddress);
  const encrypted = await getEncrypted(key);
  if (!encrypted) return null;
  try {
    return await decryptSecret(walletAddress, encrypted);
  } catch {
    return null;
  }
}

export async function deleteSeed(lobbyAddress: string, walletAddress: string): Promise<void> {
  const key = buildKey(lobbyAddress, walletAddress);
  await deleteEncrypted(key);
}

export async function exportSeeds(): Promise<Array<{ lobbyAddress: string; walletAddress: string; secret: string }>> {
  const entries = await listEncrypted();
  const out: Array<{ lobbyAddress: string; walletAddress: string; secret: string }> = [];
  for (const { key, value } of entries) {
    const sep = key.indexOf(':');
    if (sep === -1) continue;
    const lobbyAddress = key.slice(0, sep);
    const walletAddress = key.slice(sep + 1);
    try {
      const secret = await decryptSecret(walletAddress, value);
      out.push({ lobbyAddress, walletAddress, secret });
    } catch {
      // skip unreadable entries
    }
  }
  return out;
}

export async function importSeeds(entries: Array<{ lobbyAddress: string; walletAddress: string; secret: string }>): Promise<void> {
  for (const entry of entries) {
    await saveSeed(entry.lobbyAddress, entry.walletAddress, entry.secret);
  }
}

export function normalizeWalletAddress(address: string): string {
  return normalizeAddress(address);
}
