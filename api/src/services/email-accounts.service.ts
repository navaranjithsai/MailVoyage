import pool from '../db/index.js';
import { logger } from '../utils/logger.js';
import { encrypt as encPwd, tryDecrypt, isEncrypted } from '../utils/crypto.js';
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import net from 'node:net';
import tls from 'node:tls';

interface EmailAccount {
  id?: string;
  userId: string;
  email: string;
  password: string;
  accountCode?: string;
  isPrimary?: boolean;
  autoconfig?: boolean;
  incomingType: 'IMAP' | 'POP3';
  incomingHost: string;
  incomingPort: number;
  incomingUsername?: string;
  incomingSecurity: 'SSL' | 'STARTTLS' | 'NONE';
  outgoingHost: string;
  outgoingPort: number;
  outgoingUsername?: string;
  outgoingPassword?: string;
  outgoingSecurity: 'SSL' | 'STARTTLS' | 'NONE';
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// Database field mapping (camelCase to snake_case)
const mapToDb = (data: Partial<EmailAccount>) => ({
  user_id: data.userId,
  email: data.email,
  password: data.password,
  is_primary: data.isPrimary,
  incoming_type: data.incomingType,
  incoming_host: data.incomingHost,
  incoming_port: data.incomingPort,
  incoming_username: data.incomingUsername,
  incoming_security: data.incomingSecurity,
  outgoing_host: data.outgoingHost,
  outgoing_port: data.outgoingPort,
  outgoing_username: data.outgoingUsername,
  outgoing_password: data.outgoingPassword,
  outgoing_security: data.outgoingSecurity,
  is_active: data.isActive,
  created_at: data.createdAt,
  updated_at: data.updatedAt
});

// Database field mapping (snake_case to camelCase)
const mapFromDb = (data: any): EmailAccount => ({
  id: data.id,
  userId: data.user_id,
  email: data.email,
  password: data.password,
  accountCode: data.account_code,
  isPrimary: data.is_primary,
  incomingType: data.incoming_type,
  incomingHost: data.incoming_host,
  incomingPort: data.incoming_port,
  incomingUsername: data.incoming_username,
  incomingSecurity: data.incoming_security,
  outgoingHost: data.outgoing_host,
  outgoingPort: data.outgoing_port,
  outgoingUsername: data.outgoing_username,
  outgoingPassword: data.outgoing_password,
  outgoingSecurity: data.outgoing_security,
  isActive: data.is_active,
  createdAt: data.created_at,
  updatedAt: data.updated_at
});

// Generate a 3-character alphanumeric account code
const generateAccountCode = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 3; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

interface AutoConfig {
  incomingType: 'IMAP' | 'POP3';
  incomingHost: string;
  incomingPort: number;
  incomingSecurity: 'SSL' | 'STARTTLS' | 'NONE';
  outgoingHost: string;
  outgoingPort: number;
  outgoingSecurity: 'SSL' | 'STARTTLS' | 'NONE';
}

// Get all email accounts for a user
export const getEmailAccountsByUserId = async (userId: string): Promise<EmailAccount[]> => {
  const client = await pool.connect();
  try {
    const query = `
      SELECT id, user_id, email, password, account_code, is_primary, incoming_type, incoming_host, incoming_port,
             incoming_username, incoming_security, outgoing_host, outgoing_port,
             outgoing_username, outgoing_password, outgoing_security, is_active,
             created_at, updated_at
      FROM email_accounts
      WHERE user_id = $1 AND is_active = true
      ORDER BY is_primary DESC, created_at DESC
    `;

    const result = await client.query(query, [userId]);
    return result.rows.map(mapFromDb);
  } catch (error) {
    logger.error('Error fetching email accounts:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Get single email account by ID
export const getEmailAccountById = async (accountId: string, userId: string): Promise<EmailAccount | null> => {
  const client = await pool.connect();
  try {
    const query = `
      SELECT id, user_id, email, password, account_code, is_primary, incoming_type, incoming_host, incoming_port,
             incoming_username, incoming_security, outgoing_host, outgoing_port,
             outgoing_username, outgoing_password, outgoing_security, is_active,
             created_at, updated_at
      FROM email_accounts
      WHERE id = $1 AND user_id = $2 AND is_active = true
    `;

    const result = await client.query(query, [accountId, userId]);

    if (result.rows.length === 0) {
      return null;
    }

    return mapFromDb(result.rows[0]);
  } catch (error) {
    logger.error('Error fetching email account by ID:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Create a new email account
export const createEmailAccount = async (accountData: EmailAccount): Promise<EmailAccount> => {
  const client = await pool.connect();
  try {
    // Check if email already exists for this user
    const checkQuery = 'SELECT id FROM email_accounts WHERE user_id = $1 AND email = $2 AND is_active = true';
    const existingResult = await client.query(checkQuery, [accountData.userId, accountData.email]);
    
    if (existingResult.rows.length > 0) {
      throw new Error('An email account with this address already exists');
    }

    let finalAccountData = { ...accountData };

    // If autoconfig is requested, try to get configuration
    if (accountData.autoconfig) {
      const domain = accountData.email.split('@')[1];
      const autoConfig = await getAutoConfigForDomain(domain, accountData.email);
      
      if (autoConfig) {
        finalAccountData = {
          ...accountData,
          incomingType: autoConfig.incomingType,
          incomingHost: autoConfig.incomingHost,
          incomingPort: autoConfig.incomingPort,
          incomingSecurity: autoConfig.incomingSecurity,
          outgoingHost: autoConfig.outgoingHost,
          outgoingPort: autoConfig.outgoingPort,
          outgoingSecurity: autoConfig.outgoingSecurity,
        };
      } else {
        throw new Error('Auto-configuration not available for this domain. Please use manual setup.');
      }
    }
    
  // Encrypt passwords at rest
  const storedPassword = encPwd(finalAccountData.password);
  const storedOutgoingPassword = finalAccountData.outgoingPassword ? encPwd(finalAccountData.outgoingPassword) : null;
    
    // Set default values
    const incomingUsername = finalAccountData.incomingUsername || finalAccountData.email;
    const outgoingUsername = finalAccountData.outgoingUsername || finalAccountData.email;
    const accountCode = generateAccountCode();
    
    const insertQuery = `
      INSERT INTO email_accounts (
        user_id, email, password, account_code, incoming_type, incoming_host, incoming_port,
        incoming_username, incoming_security, outgoing_host, outgoing_port,
        outgoing_username, outgoing_password, outgoing_security, is_active,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING id, user_id, email, password, account_code, incoming_type, incoming_host, incoming_port,
                incoming_username, incoming_security, outgoing_host, outgoing_port,
                outgoing_username, outgoing_password, outgoing_security, is_active,
                created_at, updated_at
    `;
    
    const now = new Date();
    const values = [
      finalAccountData.userId,
      finalAccountData.email,
  storedPassword,
      accountCode,
      finalAccountData.incomingType,
      finalAccountData.incomingHost,
      finalAccountData.incomingPort,
      incomingUsername,
      finalAccountData.incomingSecurity,
      finalAccountData.outgoingHost,
      finalAccountData.outgoingPort,
      outgoingUsername,
  storedOutgoingPassword,
      finalAccountData.outgoingSecurity,
      true,
      now,
      now
    ];
    
    const result = await client.query(insertQuery, values);
    return mapFromDb(result.rows[0]);
  } catch (error) {
    logger.error('Error creating email account:', error);
    throw error;
  } finally {
    client.release();
  }
};

export const updateEmailAccount = async (accountId: string, userId: string, updateData: Partial<EmailAccount>): Promise<EmailAccount | null> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if account exists and belongs to user
    const checkQuery = 'SELECT * FROM email_accounts WHERE id = $1 AND user_id = $2 AND is_active = true';
    const existingResult = await client.query(checkQuery, [accountId, userId]);
    
    if (existingResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }
    
    const existingAccount = mapFromDb(existingResult.rows[0]);
    
    // Check if email change conflicts with existing account
    if (updateData.email && updateData.email !== existingAccount.email) {
      const conflictQuery = 'SELECT id FROM email_accounts WHERE user_id = $1 AND email = $2 AND is_active = true AND id != $3';
      const conflictResult = await client.query(conflictQuery, [userId, updateData.email, accountId]);
      
      if (conflictResult.rows.length > 0) {
        await client.query('ROLLBACK');
        throw new Error('An email account with this address already exists');
      }
    }

    // Handle primary email logic
    if (updateData.isPrimary === true) {
      // If setting this account as primary, unset all other accounts as primary for this user
      const unsetPrimaryQuery = 'UPDATE email_accounts SET is_primary = false WHERE user_id = $1 AND id != $2';
      await client.query(unsetPrimaryQuery, [userId, accountId]);
    }
    
    // Build update query dynamically
    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramCount = 1;
    
    // Handle passwords (store as provided to allow connectivity testing)
    if (updateData.password) {
  updateFields.push(`password = $${paramCount}`);
  updateValues.push(encPwd(updateData.password));
      paramCount++;
    }
    
    if (updateData.outgoingPassword) {
  updateFields.push(`outgoing_password = $${paramCount}`);
  updateValues.push(encPwd(updateData.outgoingPassword));
      paramCount++;
    }
    
    // Handle other fields
    const fieldMappings = {
      email: 'email',
      isPrimary: 'is_primary',
      incomingType: 'incoming_type',
      incomingHost: 'incoming_host',
      incomingPort: 'incoming_port',
      incomingUsername: 'incoming_username',
      incomingSecurity: 'incoming_security',
      outgoingHost: 'outgoing_host',
      outgoingPort: 'outgoing_port',
      outgoingUsername: 'outgoing_username',
      outgoingSecurity: 'outgoing_security'
    };
    
    Object.entries(fieldMappings).forEach(([jsField, dbField]) => {
      if (updateData[jsField as keyof EmailAccount] !== undefined) {
        updateFields.push(`${dbField} = $${paramCount}`);
        updateValues.push(updateData[jsField as keyof EmailAccount]);
        paramCount++;
      }
    });
    
    // Set default usernames if email is updated
    if (updateData.email) {
      if (!updateData.incomingUsername) {
        updateFields.push(`incoming_username = $${paramCount}`);
        updateValues.push(updateData.email);
        paramCount++;
      }
      if (!updateData.outgoingUsername) {
        updateFields.push(`outgoing_username = $${paramCount}`);
        updateValues.push(updateData.email);
        paramCount++;
      }
    }
    
    // Add updated_at
    updateFields.push(`updated_at = $${paramCount}`);
    updateValues.push(new Date());
    paramCount++;
    
    // Add WHERE conditions
    const whereIdParam = paramCount;
    const whereUserIdParam = paramCount + 1;
    updateValues.push(accountId, userId);
    
    const updateQuery = `
      UPDATE email_accounts 
      SET ${updateFields.join(', ')}
      WHERE id = $${whereIdParam} AND user_id = $${whereUserIdParam}
      RETURNING id, user_id, email, password, account_code, is_primary, incoming_type, incoming_host, incoming_port,
                incoming_username, incoming_security, outgoing_host, outgoing_port,
                outgoing_username, outgoing_password, outgoing_security, is_active,
                created_at, updated_at
    `;
    
    const result = await client.query(updateQuery, updateValues);
    
    await client.query('COMMIT');
    return mapFromDb(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error updating email account:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Delete an email account (soft delete)
export const deleteEmailAccount = async (accountId: string, userId: string): Promise<boolean> => {
  const client = await pool.connect();
  try {
    // Hard delete the row to allow recreating the same email for the user again
    const query = `
      DELETE FROM email_accounts
      WHERE id = $1 AND user_id = $2
    `;

    const result = await client.query(query, [accountId, userId]);
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    logger.error('Error deleting email account:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Get auto-configuration for a domain
export const getAutoConfigForDomain = async (domain: string, email?: string): Promise<AutoConfig | null> => {
  try {
    // Try to fetch from Thunderbird autoconfig service
    const autoconfigUrl = `https://autoconfig.thunderbird.net/v1.1/${domain}`;
    logger.info(`Fetching autoconfig for domain: ${domain} from ${autoconfigUrl}`);

    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(autoconfigUrl, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      logger.warn(`Thunderbird autoconfig fetch failed for ${domain}: ${response.status}`);
    } else {
      const xmlText = await response.text();
      logger.debug(`Thunderbird autoconfig XML received for ${domain}:`, { xmlLength: xmlText.length });

      // Parse the XML to extract configuration
      const config = parseThunderbirdAutoconfig(xmlText);

      if (config) {
        logger.info(`Successfully parsed Thunderbird autoconfig for ${domain}:`, config);
        return config;
      }

      logger.warn(`Failed to parse Thunderbird autoconfig XML for ${domain}`);
    }

    // Fallback: Try ISPDB autoconfig service
    if (email) {
      const ispdbUrl = `https://autoconfig.${domain}/mail/config-v1.1.xml?emailaddress=${encodeURIComponent(email)}`;
      logger.info(`Trying ISPDB autoconfig for domain: ${domain} with email: ${email} from ${ispdbUrl}`);

      const ispdbController = new AbortController();
      const ispdbTimeoutId = setTimeout(() => ispdbController.abort(), 10000); // 10 second timeout

      try {
        const ispdbResponse = await fetch(ispdbUrl, {
          signal: ispdbController.signal,
        });

        clearTimeout(ispdbTimeoutId);

        if (ispdbResponse.ok) {
          const ispdbXmlText = await ispdbResponse.text();
          logger.debug(`ISPDB autoconfig XML received for ${domain}:`, { xmlLength: ispdbXmlText.length });

          // Parse the XML to extract configuration
          const ispdbConfig = parseThunderbirdAutoconfig(ispdbXmlText);

          if (ispdbConfig) {
            logger.info(`Successfully parsed ISPDB autoconfig for ${domain}:`, ispdbConfig);
            return ispdbConfig;
          }

          logger.warn(`Failed to parse ISPDB autoconfig XML for ${domain}`);
        } else {
          logger.warn(`ISPDB autoconfig fetch failed for ${domain}: ${ispdbResponse.status}`);
        }
      } catch (ispdbError) {
        logger.error(`Error fetching ISPDB autoconfig for ${domain}:`, ispdbError);
        clearTimeout(ispdbTimeoutId);
      }
    }

    logger.warn(`No autoconfig found for domain: ${domain}`);
    return null;
  } catch (error) {
    logger.error(`Error getting auto-config for ${domain}:`, error);
    return null;
  }
};

// Parse Thunderbird autoconfig XML
const parseThunderbirdAutoconfig = (xmlText: string): AutoConfig | null => {
  try {
    // Simple XML parsing - look for incomingServer and outgoingServer elements
    const incomingServerRegex = /<incomingServer[^>]*type="([^"]*)"[^>]*>(.*?)<\/incomingServer>/gs;
    const outgoingServerRegex = /<outgoingServer[^>]*type="([^"]*)"[^>]*>(.*?)<\/outgoingServer>/gs;

    let incomingConfig: any = null;
    let outgoingConfig: any = null;

    // Parse incoming servers - prioritize POP3 over IMAP
    let incomingMatch;
    const pop3Configs: any[] = [];
    const imapConfigs: any[] = [];

    while ((incomingMatch = incomingServerRegex.exec(xmlText)) !== null) {
      const serverType = incomingMatch[1];
      const serverContent = incomingMatch[2];

      const hostnameMatch = serverContent.match(/<hostname>(.*?)<\/hostname>/);
      const portMatch = serverContent.match(/<port>(.*?)<\/port>/);
      const socketTypeMatch = serverContent.match(/<socketType>(.*?)<\/socketType>/);

      if (hostnameMatch && portMatch) {
        const config = {
          type: serverType,
          hostname: hostnameMatch[1],
          port: parseInt(portMatch[1]),
          socketType: socketTypeMatch ? socketTypeMatch[1] : 'SSL'
        };

        if (serverType === 'pop3') {
          pop3Configs.push(config);
        } else if (serverType === 'imap') {
          imapConfigs.push(config);
        }
      }
    }

    // Use POP3 if available, otherwise IMAP
    if (pop3Configs.length > 0) {
      incomingConfig = pop3Configs[0];
    } else if (imapConfigs.length > 0) {
      incomingConfig = imapConfigs[0];
    }

    // Parse outgoing servers - look for SMTP
    let outgoingMatch;
    while ((outgoingMatch = outgoingServerRegex.exec(xmlText)) !== null) {
      const serverType = outgoingMatch[1];
      const serverContent = outgoingMatch[2];

      if (serverType === 'smtp') {
        const hostnameMatch = serverContent.match(/<hostname>(.*?)<\/hostname>/);
        const portMatch = serverContent.match(/<port>(.*?)<\/port>/);
        const socketTypeMatch = serverContent.match(/<socketType>(.*?)<\/socketType>/);

        if (hostnameMatch && portMatch) {
          outgoingConfig = {
            hostname: hostnameMatch[1],
            port: parseInt(portMatch[1]),
            socketType: socketTypeMatch ? socketTypeMatch[1] : 'SSL'
          };
          break; // Use first SMTP server found
        }
      }
    }

    if (incomingConfig && outgoingConfig) {
      // Map socketType to our security types
      const mapSocketType = (socketType: string): 'SSL' | 'STARTTLS' | 'NONE' => {
        switch (socketType.toUpperCase()) {
          case 'SSL':
          case 'TLS':
            return 'SSL';
          case 'STARTTLS':
            return 'STARTTLS';
          default:
            return 'NONE';
        }
      };

      return {
        incomingType: incomingConfig.type === 'pop3' ? 'POP3' : 'IMAP',
        incomingHost: incomingConfig.hostname,
        incomingPort: incomingConfig.port,
        incomingSecurity: mapSocketType(incomingConfig.socketType),
        outgoingHost: outgoingConfig.hostname,
        outgoingPort: outgoingConfig.port,
        outgoingSecurity: mapSocketType(outgoingConfig.socketType)
      };
    }

    return null;
  } catch (error) {
    logger.error('Error parsing Thunderbird autoconfig XML:', error);
    return null;
  }
};

// Test email account connection
export const testEmailAccountConnection = async (accountId: string, userId: string): Promise<{ success: boolean; message: string }> => {
  const client = await pool.connect();
  try {
    const query = `
      SELECT id, email, password, incoming_type, incoming_host, incoming_port, incoming_username, incoming_security,
             outgoing_host, outgoing_port, outgoing_username, outgoing_password, outgoing_security
      FROM email_accounts 
      WHERE id = $1 AND user_id = $2 AND is_active = true
    `;

    const result = await client.query(query, [accountId, userId]);

    if (result.rows.length === 0) {
      return { success: false, message: 'Email account not found' };
    }

    const acc = result.rows[0];

    // Decrypt if encrypted; support legacy plaintext values gracefully
    const incomingPassDec = tryDecrypt(acc.password);
    const outgoingPassRaw = acc.outgoing_password ?? null;
    const outgoingPassDec = outgoingPassRaw != null ? tryDecrypt(outgoingPassRaw) : null;
    if (incomingPassDec === null && isEncrypted(acc.password)) {
      // We had an encrypted value that failed to decrypt; likely wrong PWD_SECRET
      return { success: false, message: 'Password decryption failed. Check server PWD_SECRET and restart.' };
    }
    if (outgoingPassRaw != null && outgoingPassDec === null && isEncrypted(outgoingPassRaw)) {
      return { success: false, message: 'Outgoing password decryption failed. Check server PWD_SECRET and restart.' };
    }
    const incomingPass = incomingPassDec ?? acc.password;
    const outgoingPass = outgoingPassDec ?? null;

    // 1) Test incoming server (IMAP or POP3)
  if (acc.incoming_type === 'IMAP') {
      await testImap({
        host: acc.incoming_host,
        port: Number(acc.incoming_port),
        secure: (acc.incoming_security || 'SSL') === 'SSL',
        starttls: (acc.incoming_security || 'SSL') === 'STARTTLS',
        user: acc.incoming_username || acc.email,
    pass: incomingPass,
      });
    } else {
      await testPop3({
        host: acc.incoming_host,
        port: Number(acc.incoming_port),
        secure: (acc.incoming_security || 'SSL') === 'SSL',
        starttls: (acc.incoming_security || 'SSL') === 'STARTTLS',
        user: acc.incoming_username || acc.email,
    pass: incomingPass,
      });
    }

    // 2) Test outgoing server (SMTP)
    await testSmtp({
      host: acc.outgoing_host,
      port: Number(acc.outgoing_port),
      secure: (acc.outgoing_security || 'SSL') === 'SSL',
      user: acc.outgoing_username || acc.email,
      pass: (outgoingPass ?? incomingPass),
      requireTls: (acc.outgoing_security || 'SSL') === 'STARTTLS',
    });

    return { success: true, message: 'Connection test successful' };
  } catch (error) {
    logger.error('Error testing email account connection:', error);
    const message = error instanceof Error ? error.message : 'Connection test failed';
    return { success: false, message };
  } finally {
    client.release();
  }
};

// ----- Helpers for testing servers -----

async function testImap(opts: { host: string; port: number; secure: boolean; starttls?: boolean; user: string; pass: string; }): Promise<void> {
  const client = new ImapFlow({
    host: opts.host,
    port: opts.port,
    secure: opts.secure,
    auth: { user: opts.user, pass: opts.pass },
    logger: false,
  });
  try {
    await client.connect();
    // ImapFlow negotiates STARTTLS automatically when server requires
    // noop login sufficient
  } finally {
    try { await client.logout(); } catch {}
    try { await client.close(); } catch {}
  }
}

async function testPop3(opts: { host: string; port: number; secure: boolean; starttls?: boolean; user: string; pass: string; timeoutMs?: number; }): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 10000;
  const useTls = opts.secure;

  const create = () => useTls
    ? tls.connect({ host: opts.host, port: opts.port, servername: opts.host })
    : net.createConnection({ host: opts.host, port: opts.port });

  await new Promise<void>((resolve, reject) => {
    const socket = create();
    let settled = false;

    const cleanup = () => {
      socket.removeAllListeners();
      try { socket.end(); } catch {}
      try { socket.destroy(); } catch {}
    };

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const succeed = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const timer = setTimeout(() => fail(new Error('POP3 connection timed out')), timeoutMs);

    const readLine = (data: Buffer) => data.toString('utf8');

  let step: 'greet' | 'stls' | 'user' | 'pass' | 'done' = 'greet';

    socket.on('data', (chunk) => {
      const line = readLine(chunk);
      // Server greeting starts with +OK
      if (step === 'greet') {
        if (!line.startsWith('+OK')) return fail(new Error('POP3 server did not greet'));
        if (!useTls && opts.starttls) {
          socket.write('STLS\r\n');
          step = 'stls';
        } else {
          socket.write(`USER ${opts.user}\r\n`);
          step = 'user';
        }
        return;
      }
      if (step === 'stls') {
        if (!line.startsWith('+OK')) return fail(new Error('POP3 STLS not accepted'));
        // Upgrade to TLS
        // Remove listeners temporarily
        socket.removeAllListeners('data');
        // Start TLS on existing socket
        const secureSocket = tls.connect({
          socket,
          servername: opts.host,
        }, () => {
          // Reattach data listener on secure socket
          secureSocket.on('data', (chunk2) => {
            const line2 = readLine(chunk2);
            if (step === 'user') {
              if (!line2.startsWith('+OK')) return fail(new Error('POP3 USER not accepted'));
              secureSocket.write(`PASS ${opts.pass}\r\n`);
              step = 'pass';
              return;
            }
            if (step === 'pass') {
              if (!line2.startsWith('+OK')) return fail(new Error('POP3 authentication failed'));
              secureSocket.write('QUIT\r\n');
              step = 'done';
              clearTimeout(timer);
              return succeed();
            }
          });
          // After TLS, send USER
          secureSocket.write(`USER ${opts.user}\r\n`);
          step = 'user';
        });
        return;
      }
      if (step === 'user') {
        if (!line.startsWith('+OK')) return fail(new Error('POP3 USER not accepted'));
        socket.write(`PASS ${opts.pass}\r\n`);
        step = 'pass';
        return;
      }
      if (step === 'pass') {
        if (!line.startsWith('+OK')) return fail(new Error('POP3 authentication failed'));
        // quit
        socket.write('QUIT\r\n');
        step = 'done';
        clearTimeout(timer);
        return succeed();
      }
    });

    socket.on('error', (err) => fail(err));
    socket.on('timeout', () => fail(new Error('POP3 socket timeout')));
  });
}

async function testSmtp(opts: { host: string; port: number; secure: boolean; user: string; pass: string; requireTls?: boolean; }): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: opts.host,
    port: opts.port,
    secure: opts.secure, // true for 465
    requireTLS: opts.requireTls === true,
    auth: { user: opts.user, pass: opts.pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });

  // verify performs connection and auth if auth provided
  await transporter.verify();
}
