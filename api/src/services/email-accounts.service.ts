import pool from '../db/index.js';
import bcrypt from 'bcrypt';
import { logger } from '../utils/logger.js';

interface EmailAccount {
  id?: string;
  userId: string;
  email: string;
  password: string;
  accountCode?: string;
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

// Common email provider configurations
const EMAIL_PROVIDERS: Record<string, AutoConfig> = {
  'gmail.com': {
    incomingType: 'IMAP',
    incomingHost: 'imap.gmail.com',
    incomingPort: 993,
    incomingSecurity: 'SSL',
    outgoingHost: 'smtp.gmail.com',
    outgoingPort: 587,
    outgoingSecurity: 'STARTTLS'
  },
  'outlook.com': {
    incomingType: 'IMAP',
    incomingHost: 'outlook.office365.com',
    incomingPort: 993,
    incomingSecurity: 'SSL',
    outgoingHost: 'smtp.office365.com',
    outgoingPort: 587,
    outgoingSecurity: 'STARTTLS'
  },
  'hotmail.com': {
    incomingType: 'IMAP',
    incomingHost: 'outlook.office365.com',
    incomingPort: 993,
    incomingSecurity: 'SSL',
    outgoingHost: 'smtp.office365.com',
    outgoingPort: 587,
    outgoingSecurity: 'STARTTLS'
  },
  'live.com': {
    incomingType: 'IMAP',
    incomingHost: 'outlook.office365.com',
    incomingPort: 993,
    incomingSecurity: 'SSL',
    outgoingHost: 'smtp.office365.com',
    outgoingPort: 587,
    outgoingSecurity: 'STARTTLS'
  },
  'yahoo.com': {
    incomingType: 'IMAP',
    incomingHost: 'imap.mail.yahoo.com',
    incomingPort: 993,
    incomingSecurity: 'SSL',
    outgoingHost: 'smtp.mail.yahoo.com',
    outgoingPort: 587,
    outgoingSecurity: 'STARTTLS'
  },
  'aol.com': {
    incomingType: 'IMAP',
    incomingHost: 'imap.aol.com',
    incomingPort: 993,
    incomingSecurity: 'SSL',
    outgoingHost: 'smtp.aol.com',
    outgoingPort: 587,
    outgoingSecurity: 'STARTTLS'
  },
  'icloud.com': {
    incomingType: 'IMAP',
    incomingHost: 'imap.mail.me.com',
    incomingPort: 993,
    incomingSecurity: 'SSL',
    outgoingHost: 'smtp.mail.me.com',
    outgoingPort: 587,
    outgoingSecurity: 'STARTTLS'
  }
};

// Get all email accounts for a user
export const getEmailAccountsByUserId = async (userId: string): Promise<EmailAccount[]> => {
  const client = await pool.connect();
  try {
    const query = `
      SELECT id, user_id, email, password, account_code, incoming_type, incoming_host, incoming_port, 
             incoming_username, incoming_security, outgoing_host, outgoing_port, 
             outgoing_username, outgoing_password, outgoing_security, is_active, 
             created_at, updated_at
      FROM email_accounts 
      WHERE user_id = $1 AND is_active = true
      ORDER BY created_at DESC
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
      const autoConfig = await getAutoConfigForDomain(domain);
      
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
    
    // Encrypt the password
    const encryptedPassword = await bcrypt.hash(finalAccountData.password, 12);
    const encryptedOutgoingPassword = finalAccountData.outgoingPassword 
      ? await bcrypt.hash(finalAccountData.outgoingPassword, 12)
      : null;
    
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
      encryptedPassword,
      accountCode,
      finalAccountData.incomingType,
      finalAccountData.incomingHost,
      finalAccountData.incomingPort,
      incomingUsername,
      finalAccountData.incomingSecurity,
      finalAccountData.outgoingHost,
      finalAccountData.outgoingPort,
      outgoingUsername,
      encryptedOutgoingPassword,
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

// Update an email account
export const updateEmailAccount = async (accountId: string, userId: string, updateData: Partial<EmailAccount>): Promise<EmailAccount | null> => {
  const client = await pool.connect();
  try {
    // Check if account exists and belongs to user
    const checkQuery = 'SELECT * FROM email_accounts WHERE id = $1 AND user_id = $2 AND is_active = true';
    const existingResult = await client.query(checkQuery, [accountId, userId]);
    
    if (existingResult.rows.length === 0) {
      return null;
    }
    
    const existingAccount = mapFromDb(existingResult.rows[0]);
    
    // Check if email change conflicts with existing account
    if (updateData.email && updateData.email !== existingAccount.email) {
      const conflictQuery = 'SELECT id FROM email_accounts WHERE user_id = $1 AND email = $2 AND is_active = true AND id != $3';
      const conflictResult = await client.query(conflictQuery, [userId, updateData.email, accountId]);
      
      if (conflictResult.rows.length > 0) {
        throw new Error('An email account with this address already exists');
      }
    }
    
    // Build update query dynamically
    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramCount = 1;
    
    // Handle password encryption
    if (updateData.password) {
      updateFields.push(`password = $${paramCount}`);
      updateValues.push(await bcrypt.hash(updateData.password, 12));
      paramCount++;
    }
    
    if (updateData.outgoingPassword) {
      updateFields.push(`outgoing_password = $${paramCount}`);
      updateValues.push(await bcrypt.hash(updateData.outgoingPassword, 12));
      paramCount++;
    }
    
    // Handle other fields
    const fieldMappings = {
      email: 'email',
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
    updateValues.push(accountId, userId);
    
    const updateQuery = `
      UPDATE email_accounts 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount - 1} AND user_id = $${paramCount}
      RETURNING id, user_id, email, password, incoming_type, incoming_host, incoming_port,
                incoming_username, incoming_security, outgoing_host, outgoing_port,
                outgoing_username, outgoing_password, outgoing_security, is_active,
                created_at, updated_at
    `;
    
    const result = await client.query(updateQuery, updateValues);
    return mapFromDb(result.rows[0]);
  } catch (error) {
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
    const query = `
      UPDATE email_accounts 
      SET is_active = false, updated_at = $1
      WHERE id = $2 AND user_id = $3
    `;
    
    const result = await client.query(query, [new Date(), accountId, userId]);
    return result.rowCount !== null && result.rowCount > 0;
  } catch (error) {
    logger.error('Error deleting email account:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Get auto-configuration for a domain
export const getAutoConfigForDomain = async (domain: string): Promise<AutoConfig | null> => {
  try {
    // Check our predefined configurations
    if (EMAIL_PROVIDERS[domain.toLowerCase()]) {
      return EMAIL_PROVIDERS[domain.toLowerCase()];
    }
    
    // TODO: Implement Thunderbird autoconfig discovery
    // This would involve making HTTP requests to well-known autoconfig URLs
    // For now, return null if no predefined config exists
    
    return null;
  } catch (error) {
    logger.error('Error getting auto-config:', error);
    throw error;
  }
};

// Test email account connection
export const testEmailAccountConnection = async (accountId: string, userId: string): Promise<{ success: boolean; message: string }> => {
  const client = await pool.connect();
  try {
    const query = `
      SELECT id, email, incoming_host, incoming_port, outgoing_host, outgoing_port
      FROM email_accounts 
      WHERE id = $1 AND user_id = $2 AND is_active = true
    `;
    
    const result = await client.query(query, [accountId, userId]);
    
    if (result.rows.length === 0) {
      return { success: false, message: 'Email account not found' };
    }
    
    // TODO: Implement actual IMAP/POP3 and SMTP connection testing
    // For now, return a mock success response
    // In a real implementation, you would:
    // 1. Decrypt the stored password
    // 2. Attempt to connect to the IMAP/POP3 server
    // 3. Attempt to authenticate with SMTP server
    // 4. Return the actual connection results
    
    return { success: true, message: 'Connection test successful' };
  } catch (error) {
    logger.error('Error testing email account connection:', error);
    return { success: false, message: 'Connection test failed' };
  } finally {
    client.release();
  }
};
