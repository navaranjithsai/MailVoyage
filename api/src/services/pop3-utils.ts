import crypto from 'crypto';

/**
 * Convert a stable POP3 message fingerprint into a positive integer UID.
 * We hash the raw message so the cache can upsert across reloads even when
 * POP3 message numbers shift after deletions.
 */
export function pop3FingerprintToNumericUid(fingerprint: string): number {
  const hash = crypto.createHash('md5').update(fingerprint).digest();
  // Use first 4 bytes as unsigned 32-bit int (always positive)
  return hash.readUInt32BE(0);
}

/**
 * Parse a POP3 STAT response into the message count.
 *
 * Different servers return different formats:
 * - "OK 61 102400"
 * - "+OK 100 50000"
 * - "61 102400"
 *
 * The message count is the first purely-numeric token. Returns 0 when no
 * numeric token exists, so a malformed response never crashes the poller.
 */
export function parsePop3StatCount(statInfo: unknown): number {
  const statLine = String(statInfo).trim();
  const statParts = statLine.split(/\s+/);
  return parseInt(
    statParts.find(p => /^\d+$/.test(p)) || statParts[1] || '0',
    10
  );
}
