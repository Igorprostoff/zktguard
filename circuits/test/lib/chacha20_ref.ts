/*
 * Pure-TS ChaCha20 reference (RFC 8439) used to cross-check the
 * Circom templates. The spec first asserts this implementation
 * reproduces the RFC test vectors byte-for-byte, then uses it to
 * derive expected circuit outputs for padded inputs.
 */

export function rotl(x: number, n: number): number {
  return ((x << n) | (x >>> (32 - n))) >>> 0;
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/[^0-9a-fA-F]/g, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(2 * i, 2 * i + 2), 16);
  }
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// 4 bytes little-endian per word; length must be a multiple of 4.
export function bytesToWordsLE(bytes: Uint8Array): Uint32Array {
  const words = new Uint32Array(bytes.length / 4);
  for (let i = 0; i < words.length; i++) {
    words[i] =
      (bytes[4 * i] |
        (bytes[4 * i + 1] << 8) |
        (bytes[4 * i + 2] << 16) |
        (bytes[4 * i + 3] << 24)) >>>
      0;
  }
  return words;
}

export function wordsToBytesLE(words: Uint32Array): Uint8Array {
  const bytes = new Uint8Array(words.length * 4);
  for (let i = 0; i < words.length; i++) {
    bytes[4 * i] = words[i] & 0xff;
    bytes[4 * i + 1] = (words[i] >>> 8) & 0xff;
    bytes[4 * i + 2] = (words[i] >>> 16) & 0xff;
    bytes[4 * i + 3] = (words[i] >>> 24) & 0xff;
  }
  return bytes;
}

// RFC 8439 §2.3 block function. key: 8 words, nonce: 3 words.
export function chachaBlock(
  key: Uint32Array,
  nonce: Uint32Array,
  counter: number,
): Uint32Array {
  const st = new Uint32Array(16);
  st[0] = 0x61707865;
  st[1] = 0x3320646e;
  st[2] = 0x79622d32;
  st[3] = 0x6b206574;
  st.set(key, 4);
  st[12] = counter >>> 0;
  st.set(nonce, 13);

  const w = Uint32Array.from(st);
  const qr = (a: number, b: number, c: number, d: number) => {
    w[a] = (w[a] + w[b]) >>> 0;
    w[d] = rotl(w[d] ^ w[a], 16);
    w[c] = (w[c] + w[d]) >>> 0;
    w[b] = rotl(w[b] ^ w[c], 12);
    w[a] = (w[a] + w[b]) >>> 0;
    w[d] = rotl(w[d] ^ w[a], 8);
    w[c] = (w[c] + w[d]) >>> 0;
    w[b] = rotl(w[b] ^ w[c], 7);
  };
  for (let r = 0; r < 10; r++) {
    qr(0, 4, 8, 12);
    qr(1, 5, 9, 13);
    qr(2, 6, 10, 14);
    qr(3, 7, 11, 15);
    qr(0, 5, 10, 15);
    qr(1, 6, 11, 12);
    qr(2, 7, 8, 13);
    qr(3, 4, 9, 14);
  }
  for (let i = 0; i < 16; i++) {
    w[i] = (w[i] + st[i]) >>> 0;
  }
  return w;
}

// RFC 8439 §2.4 encryption. Byte-level, arbitrary plaintext length.
export function chachaEncrypt(
  keyBytes: Uint8Array,
  nonceBytes: Uint8Array,
  counter: number,
  plaintext: Uint8Array,
): Uint8Array {
  const key = bytesToWordsLE(keyBytes);
  const nonce = bytesToWordsLE(nonceBytes);
  const out = new Uint8Array(plaintext.length);
  for (let b = 0; b * 64 < plaintext.length; b++) {
    const ks = wordsToBytesLE(chachaBlock(key, nonce, counter + b));
    const upper = Math.min(64, plaintext.length - b * 64);
    for (let i = 0; i < upper; i++) {
      out[b * 64 + i] = plaintext[b * 64 + i] ^ ks[i];
    }
  }
  return out;
}
