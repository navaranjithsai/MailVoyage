/**
 * Phase 6: Inbox Service Logic Tests
 *
 * Tests the core logic of inbox sync without requiring real mail servers,
 * database connections, or credentials. Each test exercises the exact
 * patterns used in production code (protocol routing, STAT parsing,
 * fingerprint hashing, autoconfig parsing, sync mutex).
 */

import { describe, expect, it, beforeEach } from 'vitest';
import crypto from 'crypto';

// ============================================================================
// 1. POP3 fingerprint hash — must be stable across reloads
// ============================================================================

describe('POP3 fingerprint hashing', () => {
  // Replicate the exact production logic from inbox.service.ts
  const pop3FingerprintToNumericUid = (fingerprint: string): number => {
    const hash = crypto.createHash('md5').update(fingerprint).digest();
    return hash.readUInt32BE(0);
  };

  it('returns a positive 32-bit integer', () => {
    const uid = pop3FingerprintToNumericUid('test-message-id@example.com');
    expect(uid).toBeGreaterThan(0);
    expect(Number.isInteger(uid)).toBe(true);
    expect(uid).toBeLessThanOrEqual(0xFFFFFFFF);
  });

  it('is deterministic — same input always produces the same UID', () => {
    const uid1 = pop3FingerprintToNumericUid('<abc123@mail.example.com>');
    const uid2 = pop3FingerprintToNumericUid('<abc123@mail.example.com>');
    expect(uid1).toBe(uid2);
  });

  it('produces different UIDs for different messages', () => {
    const uid1 = pop3FingerprintToNumericUid('<msg-one@example.com>');
    const uid2 = pop3FingerprintToNumericUid('<msg-two@example.com>');
    expect(uid1).not.toBe(uid2);
  });

  it('handles empty string without crashing', () => {
    expect(() => pop3FingerprintToNumericUid('')).not.toThrow();
  });

  it('handles raw message body as fingerprint (no Message-ID)', () => {
    const rawBody = 'From: test@example.com\r\nSubject: Hello\r\n\r\nBody text';
    expect(() => pop3FingerprintToNumericUid(rawBody)).not.toThrow();
    const uid = pop3FingerprintToNumericUid(rawBody);
    expect(uid).toBeGreaterThan(0);
  });
});

// ============================================================================
// 2. POP3 STAT response parsing — must handle different server formats
// ============================================================================

describe('POP3 STAT response parsing', () => {
  // Replicate the exact parse logic from the production fetchMailsViaPop3 function
  const parseStatCount = (statInfo: unknown): number => {
    const statLine = String(statInfo).trim();
    const statParts = statLine.split(/\s+/);
    return parseInt(
      statParts.find(p => /^\d+$/.test(p)) || statParts[1] || '0',
      10
    );
  };

  it('parses "OK 61 102400" format (some servers include status)', () => {
    expect(parseStatCount('OK 61 102400')).toBe(61);
  });

  it('parses "61 102400" format (bare count + size)', () => {
    expect(parseStatCount('61 102400')).toBe(61);
  });

  it('parses "+OK 0 0" (empty mailbox)', () => {
    expect(parseStatCount('+OK 0 0')).toBe(0);
  });

  it('parses "+OK 100 50000"', () => {
    expect(parseStatCount('+OK 100 50000')).toBe(100);
  });

  it('returns 0 for non-numeric garbage', () => {
    expect(parseStatCount('ERROR')).toBe(0);
  });

  it('handles non-string input (array element)', () => {
    // node-pop3 returns [response, stream], so statInfo may be a buffer
    expect(parseStatCount(Buffer.from('OK 5 2048'))).toBe(5);
  });
});

// ============================================================================
// 3. Protocol routing — IMAP accounts must use IMAP, POP3 must use POP3
// ============================================================================

describe('protocol routing logic', () => {
  // Replicate the production routing condition
  const routeToPop3 = (incomingType: string | undefined | null): boolean => {
    const protocol = (incomingType || 'IMAP').toUpperCase().trim();
    return protocol === 'POP3';
  };

  it('routes "IMAP" to IMAP (not POP3)', () => {
    expect(routeToPop3('IMAP')).toBe(false);
  });

  it('routes "POP3" to POP3', () => {
    expect(routeToPop3('POP3')).toBe(true);
  });

  it('defaults to IMAP when type is undefined', () => {
    expect(routeToPop3(undefined)).toBe(false);
  });

  it('defaults to IMAP when type is null', () => {
    expect(routeToPop3(null)).toBe(false);
  });

  it('is case-insensitive — "pop3" routes to POP3', () => {
    expect(routeToPop3('pop3')).toBe(true);
  });

  it('is case-insensitive — "imap" routes to IMAP', () => {
    expect(routeToPop3('imap')).toBe(false);
  });

  it('is case-insensitive — "Pop3" routes to POP3', () => {
    expect(routeToPop3('Pop3')).toBe(true);
  });

  it('is case-insensitive — "Imap" routes to IMAP', () => {
    expect(routeToPop3('Imap')).toBe(false);
  });

  it('handles whitespace — " POP3 " routes to POP3', () => {
    expect(routeToPop3(' POP3 ')).toBe(true);
  });

  it('treats unknown protocols as IMAP (safe default)', () => {
    expect(routeToPop3('EXCHANGE')).toBe(false);
    expect(routeToPop3('')).toBe(false);
  });
});

// ============================================================================
// 4. Autoconfig XML parser — must prefer IMAP over POP3 and normalize types
// ============================================================================

describe('autoconfig XML parsing logic', () => {
  // Minimal replica of the production parser logic for testing
  const parseAutoconfig = (xmlText: string) => {
    const incomingServerRegex = /<incomingServer[^>]*type="([^"]*)"[^>]*>(.*?)<\/incomingServer>/gs;
    const outgoingServerRegex = /<outgoingServer[^>]*type="([^"]*)"[^>]*>(.*?)<\/outgoingServer>/gs;

    let incomingConfig: { type: string; hostname: string; port: number; socketType: string } | null = null;
    let outgoingConfig: { hostname: string; port: number; socketType: string } | null = null;

    const pop3Configs: Array<{ type: string; hostname: string; port: number; socketType: string }> = [];
    const imapConfigs: Array<{ type: string; hostname: string; port: number; socketType: string }> = [];

    let incomingMatch;
    while ((incomingMatch = incomingServerRegex.exec(xmlText)) !== null) {
      const serverType = incomingMatch[1];
      const serverContent = incomingMatch[2];
      const hostnameMatch = serverContent.match(/<hostname>(.*?)<\/hostname>/);
      const portMatch = serverContent.match(/<port>(.*?)<\/port>/);
      const socketTypeMatch = serverContent.match(/<socketType>(.*?)<\/socketType>/);
      if (hostnameMatch && portMatch) {
        const config = { type: serverType, hostname: hostnameMatch[1], port: parseInt(portMatch[1]), socketType: socketTypeMatch ? socketTypeMatch[1] : 'SSL' };
        const normalizedType = serverType.toLowerCase().trim();
        if (normalizedType === 'pop3') pop3Configs.push(config);
        else if (normalizedType === 'imap') imapConfigs.push(config);
      }
    }

    if (imapConfigs.length > 0) incomingConfig = imapConfigs[0];
    else if (pop3Configs.length > 0) incomingConfig = pop3Configs[0];

    let outgoingMatch;
    while ((outgoingMatch = outgoingServerRegex.exec(xmlText)) !== null) {
      const serverType = outgoingMatch[1];
      const serverContent = outgoingMatch[2];
      if (serverType.toLowerCase().trim() === 'smtp') {
        const hostnameMatch = serverContent.match(/<hostname>(.*?)<\/hostname>/);
        const portMatch = serverContent.match(/<port>(.*?)<\/port>/);
        const socketTypeMatch = serverContent.match(/<socketType>(.*?)<\/socketType>/);
        if (hostnameMatch && portMatch) {
          outgoingConfig = { hostname: hostnameMatch[1], port: parseInt(portMatch[1]), socketType: socketTypeMatch ? socketTypeMatch[1] : 'SSL' };
          break;
        }
      }
    }

    if (incomingConfig && outgoingConfig) {
      const mapSocketType = (socketType: string): 'SSL' | 'STARTTLS' | 'NONE' => {
        switch (socketType.toUpperCase()) {
          case 'SSL': case 'TLS': return 'SSL';
          case 'STARTTLS': return 'STARTTLS';
          default: return 'NONE';
        }
      };
      return {
        incomingType: incomingConfig.type.toLowerCase() === 'pop3' ? 'POP3' : 'IMAP',
        incomingHost: incomingConfig.hostname,
        incomingPort: incomingConfig.port,
        incomingSecurity: mapSocketType(incomingConfig.socketType),
        outgoingHost: outgoingConfig.hostname,
        outgoingPort: outgoingConfig.port,
        outgoingSecurity: mapSocketType(outgoingConfig.socketType),
      };
    }

    return null;
  };

  const sampleXmlWithBoth = `<?xml version="1.0"?>
<clientConfig>
  <emailProvider id="example.com">
    <domain>example.com</domain>
    <incomingServer type="pop3">
      <hostname>pop.example.com</hostname>
      <port>995</port>
      <socketType>SSL</socketType>
    </incomingServer>
    <incomingServer type="imap">
      <hostname>imap.example.com</hostname>
      <port>993</port>
      <socketType>SSL</socketType>
    </incomingServer>
    <outgoingServer type="smtp">
      <hostname>smtp.example.com</hostname>
      <port>465</port>
      <socketType>SSL</socketType>
    </outgoingServer>
  </emailProvider>
</clientConfig>`;

  const sampleXmlPop3Only = `<?xml version="1.0"?>
<clientConfig>
  <emailProvider id="example.com">
    <incomingServer type="pop3">
      <hostname>pop.example.com</hostname>
      <port>995</port>
      <socketType>SSL</socketType>
    </incomingServer>
    <outgoingServer type="smtp">
      <hostname>smtp.example.com</hostname>
      <port>587</port>
      <socketType>STARTTLS</socketType>
    </outgoingServer>
  </emailProvider>
</clientConfig>`;

  const sampleXmlImapOnly = `<?xml version="1.0"?>
<clientConfig>
  <emailProvider id="example.com">
    <incomingServer type="imap">
      <hostname>imap.example.com</hostname>
      <port>993</port>
      <socketType>SSL</socketType>
    </incomingServer>
    <outgoingServer type="smtp">
      <hostname>smtp.example.com</hostname>
      <port>465</port>
      <socketType>SSL</socketType>
    </outgoingServer>
  </emailProvider>
</clientConfig>`;

  it('prefers IMAP when both IMAP and POP3 are available', () => {
    const result = parseAutoconfig(sampleXmlWithBoth);
    expect(result).not.toBeNull();
    expect(result!.incomingType).toBe('IMAP');
    expect(result!.incomingHost).toBe('imap.example.com');
    expect(result!.incomingPort).toBe(993);
  });

  it('falls back to POP3 when only POP3 is available', () => {
    const result = parseAutoconfig(sampleXmlPop3Only);
    expect(result).not.toBeNull();
    expect(result!.incomingType).toBe('POP3');
    expect(result!.incomingHost).toBe('pop.example.com');
  });

  it('uses IMAP when only IMAP is available', () => {
    const result = parseAutoconfig(sampleXmlImapOnly);
    expect(result).not.toBeNull();
    expect(result!.incomingType).toBe('IMAP');
  });

  it('normalizes uppercase "POP3" type from XML', () => {
    const xml = `<clientConfig>
      <emailProvider id="x"><domain>x.com</domain>
        <incomingServer type="POP3"><hostname>p.x.com</hostname><port>995</port><socketType>SSL</socketType></incomingServer>
        <outgoingServer type="smtp"><hostname>s.x.com</hostname><port>465</port><socketType>SSL</socketType></outgoingServer>
      </emailProvider></clientConfig>`;
    const result = parseAutoconfig(xml);
    expect(result).not.toBeNull();
    expect(result!.incomingType).toBe('POP3');
  });

  it('normalizes uppercase "SMTP" type from XML', () => {
    const xml = `<clientConfig>
      <emailProvider id="x"><domain>x.com</domain>
        <incomingServer type="imap"><hostname>i.x.com</hostname><port>993</port><socketType>SSL</socketType></incomingServer>
        <outgoingServer type="SMTP"><hostname>s.x.com</hostname><port>465</port><socketType>SSL</socketType></outgoingServer>
      </emailProvider></clientConfig>`;
    const result = parseAutoconfig(xml);
    expect(result).not.toBeNull();
    expect(result!.outgoingHost).toBe('s.x.com');
  });

  it('maps socketType correctly', () => {
    const result = parseAutoconfig(sampleXmlPop3Only);
    expect(result!.incomingSecurity).toBe('SSL');
    expect(result!.outgoingSecurity).toBe('STARTTLS');
  });

  it('returns null for malformed XML', () => {
    expect(parseAutoconfig('not xml at all')).toBeNull();
  });

  it('returns null when incoming server is missing', () => {
    const xml = `<clientConfig>
      <emailProvider id="x"><domain>x.com</domain>
        <outgoingServer type="smtp"><hostname>s.x.com</hostname><port>465</port><socketType>SSL</socketType></outgoingServer>
      </emailProvider></clientConfig>`;
    expect(parseAutoconfig(xml)).toBeNull();
  });

  it('returns null when outgoing server is missing', () => {
    const xml = `<clientConfig>
      <emailProvider id="x"><domain>x.com</domain>
        <incomingServer type="imap"><hostname>i.x.com</hostname><port>993</port><socketType>SSL</socketType></incomingServer>
      </emailProvider></clientConfig>`;
    expect(parseAutoconfig(xml)).toBeNull();
  });
});

// ============================================================================
// 5. Per-account sync mutex — concurrent calls must serialize
// ============================================================================

describe('per-account sync mutex', () => {
  // Replicate the production mutex logic
  const accountSyncLocks = new Map<string, Promise<unknown>>();

  const withAccountSyncLock = async <T>(
    userId: string, accountCode: string, mailbox: string,
    fn: () => Promise<T>
  ): Promise<T> => {
    const lockKey = `${userId}:${accountCode}:${mailbox}`;
    const existing = accountSyncLocks.get(lockKey);
    if (existing) {
      await existing.catch(() => {});
    }
    let release!: () => void;
    const promise = new Promise<void>((resolve) => { release = resolve; });
    accountSyncLocks.set(lockKey, promise);
    try {
      return await fn();
    } finally {
      release();
      if (accountSyncLocks.get(lockKey) === promise) {
        accountSyncLocks.delete(lockKey);
      }
    }
  };

  beforeEach(() => {
    accountSyncLocks.clear();
  });

  it('allows concurrent calls to different accounts to run in parallel', async () => {
    const callOrder: string[] = [];
    const p1 = withAccountSyncLock('user1', 'ACC1', 'INBOX', async () => {
      callOrder.push('ACC1-start');
      await new Promise(r => setTimeout(r, 50));
      callOrder.push('ACC1-end');
      return 'acc1';
    });
    const p2 = withAccountSyncLock('user1', 'ACC2', 'INBOX', async () => {
      callOrder.push('ACC2-start');
      await new Promise(r => setTimeout(r, 50));
      callOrder.push('ACC2-end');
      return 'acc2';
    });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe('acc1');
    expect(r2).toBe('acc2');
    // Both started before either ended (parallel)
    expect(callOrder.indexOf('ACC1-start')).toBeLessThan(callOrder.indexOf('ACC2-start'));
    expect(callOrder.indexOf('ACC2-start')).toBeLessThan(callOrder.indexOf('ACC1-end'));
  });

  it('serializes concurrent calls to the same account', async () => {
    const callOrder: string[] = [];
    const p1 = withAccountSyncLock('user1', 'ACC1', 'INBOX', async () => {
      callOrder.push('first-start');
      await new Promise(r => setTimeout(r, 50));
      callOrder.push('first-end');
      return 'first';
    });
    const p2 = withAccountSyncLock('user1', 'ACC1', 'INBOX', async () => {
      callOrder.push('second-start');
      await new Promise(r => setTimeout(r, 50));
      callOrder.push('second-end');
      return 'second';
    });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe('first');
    expect(r2).toBe('second');
    // First must end before second starts (serialized)
    expect(callOrder.indexOf('first-end')).toBeLessThan(callOrder.indexOf('second-start'));
  });

  it('cleans up the lock after completion', async () => {
    await withAccountSyncLock('u', 'acc', 'INBOX', async () => 42);
    expect(accountSyncLocks.size).toBe(0);
  });

  it('cleans up the lock even if the function throws', async () => {
    try {
      await withAccountSyncLock('u', 'acc', 'INBOX', async () => {
        throw new Error('test error');
      });
    } catch {
      // expected
    }
    expect(accountSyncLocks.size).toBe(0);
  });
});

// ============================================================================
// 6. IMAP empty-range guard — sinceUid >= highestUid must return early
// ============================================================================

describe('IMAP empty-range guard', () => {
  // Replicate the production logic
  const shouldSkipSync = (sinceUid: number | undefined, totalMessages: number, uidNext: number | undefined): boolean => {
    const highestKnownUid = typeof uidNext === 'number' && uidNext > 0
      ? uidNext - 1
      : totalMessages;
    return !!(sinceUid && sinceUid >= highestKnownUid);
  };

  it('skips when sinceUid equals highestUid (already caught up)', () => {
    expect(shouldSkipSync(61, 61, 62)).toBe(true);
  });

  it('skips when sinceUid exceeds highestUid (somehow ahead)', () => {
    expect(shouldSkipSync(100, 61, 62)).toBe(true);
  });

  it('does NOT skip when sinceUid is less than highestUid (new mail available)', () => {
    expect(shouldSkipSync(50, 61, 62)).toBe(false);
  });

  it('does NOT skip when sinceUid is 0 (first sync)', () => {
    expect(shouldSkipSync(0, 61, 62)).toBe(false);
  });

  it('does NOT skip when sinceUid is undefined (full fetch)', () => {
    expect(shouldSkipSync(undefined, 61, 62)).toBe(false);
  });

  it('falls back to totalMessages when uidNext is missing', () => {
    expect(shouldSkipSync(61, 61, undefined)).toBe(true);
    expect(shouldSkipSync(60, 61, undefined)).toBe(false);
  });

  it('falls back to totalMessages when uidNext is 0', () => {
    expect(shouldSkipSync(61, 61, 0)).toBe(true);
  });
});
