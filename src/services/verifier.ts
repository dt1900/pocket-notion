// Vibe-coded by Antigravity v2.0 on 2026-08-13. Driven by @dt1900.

/**
 * Verifies the incoming HeyPocket webhook signature using HMAC-SHA256.
 * Compatible with Web Crypto API (Cloudflare Workers, Edge, Node.js 18+).
 */
export async function verifyHeyPocketSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  timestampHeader: string | null | undefined,
  secret: string
): Promise<{ isValid: boolean; reason?: string }> {
  if (!secret) {
    // If no secret is configured, verification is skipped
    return { isValid: true };
  }

  if (!signatureHeader) {
    return { isValid: false, reason: 'Missing X-HeyPocket-Signature header' };
  }

  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify']
    );

    // Candidates for signature calculation:
    // Format 1: "${timestamp}.${rawBody}"
    // Format 2: rawBody directly
    const payloadsToTest: string[] = [];
    if (timestampHeader) {
      payloadsToTest.push(`${timestampHeader}.${rawBody}`);
      payloadsToTest.push(`${timestampHeader}${rawBody}`);
    }
    payloadsToTest.push(rawBody);

    const cleanSignature = signatureHeader.replace(/^sha256=/i, '').trim().toLowerCase();

    for (const payloadText of payloadsToTest) {
      const signatureBuffer = await crypto.subtle.sign(
        'HMAC',
        cryptoKey,
        encoder.encode(payloadText)
      );

      const computedHex = Array.from(new Uint8Array(signatureBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
        .toLowerCase();

      if (timingSafeEqual(cleanSignature, computedHex)) {
        return { isValid: true };
      }
    }

    return { isValid: false, reason: 'HMAC signature mismatch' };
  } catch (error) {
    return {
      isValid: false,
      reason: error instanceof Error ? error.message : 'Signature calculation error'
    };
  }
}

/**
 * Constant-time comparison string comparison to prevent timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
