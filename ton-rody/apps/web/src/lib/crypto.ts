export function randomSeed256(): bigint {
  const buf = new Uint8Array(32);
  if (typeof window !== 'undefined' && (window.crypto as Crypto).getRandomValues) {
    window.crypto.getRandomValues(buf);
  } else {
    for (let i = 0; i < buf.length; i++) {
      buf[i] = Math.floor(Math.random() * 256);
    }
  }
  let result = 0n;
  for (const b of buf) {
    result = (result << 8n) + BigInt(b);
  }
  return result;
}