// Vibe-coded by Antigravity v2.0 on 2026-08-13. Driven by @dt1900.

import { describe, expect, it } from 'vitest';
import { verifyHeyPocketSignature } from '../src/services/verifier.js';

describe('verifyHeyPocketSignature', () => {
  const secret = 'my-super-secret-key-123';
  const rawBody = JSON.stringify({ event: 'recording.created', id: '123' });
  const timestamp = '1710000000000';

  it('should return valid if no secret is configured', async () => {
    const res = await verifyHeyPocketSignature(rawBody, undefined, undefined, '');
    expect(res.isValid).toBe(true);
  });

  it('should return invalid if signature header is missing when secret is set', async () => {
    const res = await verifyHeyPocketSignature(rawBody, undefined, undefined, secret);
    expect(res.isValid).toBe(false);
    expect(res.reason).toContain('Missing');
  });

  it('should successfully verify a valid HMAC-SHA256 signature with timestamp', async () => {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const payloadText = `${timestamp}.${rawBody}`;
    const sigBuffer = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(payloadText));
    const hexSig = Array.from(new Uint8Array(sigBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const res = await verifyHeyPocketSignature(rawBody, hexSig, timestamp, secret);
    expect(res.isValid).toBe(true);
  });

  it('should reject invalid signature', async () => {
    const res = await verifyHeyPocketSignature(
      rawBody,
      'deadbeef00000000000000000000000000000000000000000000000000000000',
      timestamp,
      secret
    );
    expect(res.isValid).toBe(false);
    expect(res.reason).toContain('mismatch');
  });
});
