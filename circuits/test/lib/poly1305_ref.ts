/*
 * Pure-TS Poly1305 reference (RFC 8439 §2.5) over BigInt, used to
 * cross-check the Circom template. Validated in the spec against the
 * RFC §2.5.2 vector and against Node's OpenSSL-backed
 * chacha20-poly1305 AEAD (the AEAD tag is Poly1305 over the RFC §2.8
 * MAC data, which exercises this code with an independent oracle).
 */

export function leBytesToBigInt(bytes: Uint8Array): bigint {
  let v = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) {
    v = (v << 8n) | BigInt(bytes[i]);
  }
  return v;
}

export function bigIntToLeBytes(v: bigint, len: number): Uint8Array {
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = Number((v >> BigInt(8 * i)) & 0xffn);
  }
  return out;
}

const P130 = (1n << 130n) - 5n;
const CLAMP = 0x0ffffffc0ffffffc0ffffffc0fffffffn;

export function poly1305(key: Uint8Array, msg: Uint8Array): Uint8Array {
  if (key.length !== 32) throw new Error("poly1305 key must be 32 bytes");
  const r = leBytesToBigInt(key.slice(0, 16)) & CLAMP;
  const s = leBytesToBigInt(key.slice(16, 32));
  let acc = 0n;
  for (let i = 0; i < msg.length; i += 16) {
    const chunk = msg.slice(i, Math.min(i + 16, msg.length));
    const n = leBytesToBigInt(chunk) + (1n << BigInt(8 * chunk.length));
    acc = ((acc + n) * r) % P130;
  }
  const tag = (acc + s) & ((1n << 128n) - 1n);
  return bigIntToLeBytes(tag, 16);
}

// RFC 8439 §2.8 MAC data: aad ‖ pad16 ‖ ct ‖ pad16 ‖ le64(|aad|) ‖ le64(|ct|)
export function aeadMacData(aad: Uint8Array, ct: Uint8Array): Uint8Array {
  const pad = (n: number) => new Uint8Array((16 - (n % 16)) % 16);
  const parts = [
    aad,
    pad(aad.length),
    ct,
    pad(ct.length),
    bigIntToLeBytes(BigInt(aad.length), 8),
    bigIntToLeBytes(BigInt(ct.length), 8),
  ];
  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}
