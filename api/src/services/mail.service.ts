import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { simpleParser, ParsedMail, AddressObject } from 'mailparser'; // Import AddressObject
import { logger } from '../utils/logger.js';
import { AppError } from '../utils/errors.js';
import pool from '../db/index.js';
import { tryDecrypt } from '../utils/crypto.js';
// import crypto from 'crypto'; // For encrypting credentials
// import pool from '../db'; // To save/retrieve credentials

// --- Types (Define properly later) ---
type MailServerConfig = any; // Replace with actual type/interface
type MailData = any; // Replace with actual type/interface

// Placeholder: Encrypt/Decrypt functions (Implement securely)
const encrypt = (text: string): string => {
  logger.warn('Encryption not implemented. Storing credentials as plain text.');
  return text; // Replace with actual encryption
};
const decrypt = (text: string): string => {
  logger.warn('Decryption not implemented.');
  return text; // Replace with actual decryption
};

// Placeholder: Save mail server config (SMTP/IMAP)
export const saveMailServerConfig = async (userId: number, configData: MailServerConfig) => {
  logger.info(`Placeholder: Saving mail config for user ${userId}`);
  // 1. Encrypt sensitive data (passwords)
  // const encryptedPassword = encrypt(configData.smtp.password);
  // 2. Save config to database associated with userId
  // await pool.query('INSERT OR UPDATE user_mail_config SET ... WHERE user_id = $1', [userId, ...]);
};

// Placeholder: Get mail server config
export const getMailServerConfig = async (userId: number): Promise<MailServerConfig | null> => {
  logger.info(`Placeholder: Getting mail config for user ${userId}`);
  // 1. Retrieve config from database
  // const result = await pool.query('SELECT * FROM user_mail_config WHERE user_id = $1', [userId]);
  // if (!result.rows.length) return null;
  // const config = result.rows[0];
  // 2. Decrypt sensitive data
  // config.smtp.password = decrypt(config.smtp.password);
  // return config;
  return null; // Placeholder
};

// Placeholder: Send an email using Nodemailer
export const sendEmail = async (userId: number, mailData: MailData) => {
  logger.info(`Placeholder: Sending email for user ${userId}`);
  const config = await getMailServerConfig(userId);
  if (!config || !config.smtp) {
    throw new AppError('Configuration Error', 400, true, { general: 'SMTP configuration not found.' });
  }

  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure, // true for 465, false for other ports
    auth: {
      user: config.smtp.user,
      pass: config.smtp.password, // Decrypted password
    },
  });

  try {
    const info = await transporter.sendMail({
      from: mailData.from, // sender address
      to: mailData.to, // list of receivers
      subject: mailData.subject, // Subject line
      text: mailData.text, // plain text body
      html: mailData.html, // html body
      // attachments: mailData.attachments // Add attachment handling
    });
    logger.info(`Email sent: ${info.messageId}`);
    return info;
  } catch (error) {
    logger.error('Error sending email:', error);
    throw new AppError('Mail Send Error', 500, false, { general: 'Failed to send email.' });
  }
};

// Placeholder: Fetch emails using ImapFlow
export const fetchEmails = async (userId: number, mailbox: string = 'INBOX') => {
  logger.info(`Placeholder: Fetching emails from ${mailbox} for user ${userId}`);
  const config = await getMailServerConfig(userId);
  if (!config || !config.imap) {
    throw new AppError('Configuration Error', 400, true, { general: 'IMAP configuration not found.' });
  }

  const client = new ImapFlow({
    host: config.imap.host,
    port: config.imap.port,
    secure: config.imap.secure,
    auth: {
      user: config.imap.user,
      pass: config.imap.password, // Decrypted password
    },
    logger: false, // Disable default imapflow logger or customize
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock(mailbox);
    const fetchedMessages = [];
    try {
      const totalMessages = typeof client.mailbox !== 'boolean' && client.mailbox ? client.mailbox.exists : 0; // Check mailbox type before accessing exists

      if (totalMessages && totalMessages > 0) {
        // Determine the sequence set for the latest 10 messages
        const startRange = Math.max(1, totalMessages - 9);
        const sequenceSet = `${startRange}:${totalMessages}`;

        // Fetch messages using the calculated sequence set
        for await (const msg of client.fetch('1:*', { envelope: true, source: true })) {
          // Ensure msg.source is defined and not empty before parsing
          if (msg.source && msg.source.length > 0) {
            const parsedMail: ParsedMail = await simpleParser(msg.source);
            // Helper function to safely get text from AddressObject or array
            const getAddressText = (address: AddressObject | AddressObject[] | undefined): string | undefined => {
              if (!address) return undefined;
              if (Array.isArray(address)) {
                return address.map(a => a.text).join(', '); // Join if multiple addresses
              }
              return address.text;
            };
            fetchedMessages.push({
              id: msg.uid,
              envelope: msg.envelope,
              parsed: {
                subject: parsedMail.subject,
                from: getAddressText(parsedMail.from),
                to: getAddressText(parsedMail.to),
                date: parsedMail.date,
                text: parsedMail.text,
                html: parsedMail.html,
              }
            });
          } else {
            logger.warn(`Message with UID ${msg.uid} did not contain source data or was empty, and was skipped.`);
          }
        }
      } else {
        logger.info(`No messages to fetch from ${mailbox} for user ${userId}`);
      }
    } finally {
      // lock is guaranteed to be defined if this block is reached after successful getMailboxLock
      lock.release();
    }
    await client.logout();
    logger.info(`Fetched ${fetchedMessages.length} emails from ${mailbox}`);
    return fetchedMessages;
  } catch (error) {
    logger.error(`Error fetching emails from ${mailbox}:`, error);
    // Ensure client.logout() is called even if connect() or getMailboxLock() failed.
    if (client && client.usable) { // Check if client is initialized and usable
        try {
            await client.logout();
        } catch (logoutError) {
            logger.error('Error during logout after fetch failure:', logoutError);
        }
    }
    throw new AppError('Mail Fetch Error', 500, false, { general: `Failed to fetch emails from ${mailbox}.` });
  }
};

// Placeholder: List mail folders
export const listFolders = async (userId: number) => {
  logger.info(`Placeholder: Listing folders for user ${userId}`);
  // Use ImapFlow client.list() similar to fetchEmails
  return { message: `Placeholder: Folders for user ${userId}` };
};

// Placeholder: Create mail folder
export const createFolder = async (userId: number, folderName: string) => {
  logger.info(`Placeholder: Creating folder '${folderName}' for user ${userId}`);
  // Use ImapFlow client.mailboxCreate()
  return { message: `Placeholder: Folder '${folderName}' created` };
};

// ===== NEW: Send email using account credentials =====

interface SendMailPayload {
  accountCode: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    content: string; // base64 or buffer
    contentType?: string;
  }>;
}

/**
 * Send email using user's email account credentials
 * Fetches account by accountCode from either email_accounts or smtp_accounts
 */
export const sendMailFromAccount = async (userId: string, payload: SendMailPayload): Promise<{ success: boolean; messageId?: string; message: string }> => {
  const client = await pool.connect();
  
  try {
    logger.info(`Attempting to send email for user ${userId} using account code ${payload.accountCode}`);
    logger.debug(`Query parameters: userId="${userId}", accountCode="${payload.accountCode}"`);
    
    // Step 1: Try to find the account in email_accounts first
    let accountResult = await client.query(
      `SELECT id, email, outgoing_host, outgoing_port, outgoing_username, outgoing_password, outgoing_security
       FROM email_accounts 
       WHERE user_id = $1 AND account_code = $2 AND is_active = true`,
      [userId, payload.accountCode]
    );
    
    logger.debug(`email_accounts query result: ${accountResult.rows.length} rows`);
    
    let smtpConfig: any = null;
    let fromEmail = '';
    
    if (accountResult.rows.length > 0) {
      // Found in email_accounts
      logger.info(`Found account in email_accounts table`);
      const account = accountResult.rows[0];
      fromEmail = account.email;
      
      // Decrypt password
      const decryptedPassword = tryDecrypt(account.outgoing_password);
      if (!decryptedPassword) {
        throw new AppError('Failed to decrypt account password', 500, false);
      }
      
      smtpConfig = {
        host: account.outgoing_host,
        port: account.outgoing_port,
        username: account.outgoing_username || account.email,
        password: decryptedPassword,
        security: account.outgoing_security,
      };
    } else {
      // Step 2: Try smtp_accounts table
      logger.info(`Account not found in email_accounts, trying smtp_accounts`);
      accountResult = await client.query(
        `SELECT id, email, host, port, username, password, security
         FROM smtp_accounts 
         WHERE user_id = $1 AND account_code = $2 AND is_active = true`,
        [userId, payload.accountCode]
      );
      
      logger.debug(`smtp_accounts query result: ${accountResult.rows.length} rows`);
      
      if (accountResult.rows.length === 0) {
        logger.error(`No account found with code ${payload.accountCode} for user ${userId}`);
        throw new AppError('Email account not found or inactive', 404, true);
      }
      
      logger.info(`Found account in smtp_accounts table`);
      const account = accountResult.rows[0];
      fromEmail = account.email;
      
      // Decrypt password
      const decryptedPassword = tryDecrypt(account.password);
      if (!decryptedPassword) {
        throw new AppError('Failed to decrypt account password', 500, false);
      }
      
      smtpConfig = {
        host: account.host,
        port: account.port,
        username: account.username || account.email,
        password: decryptedPassword,
        security: account.security,
      };
    }
    
    // Step 3: Create nodemailer transporter with account credentials
    logger.info(`Creating SMTP transporter: host=${smtpConfig.host}, port=${smtpConfig.port}, security=${smtpConfig.security}`);
    
    const secure = smtpConfig.security === 'SSL';
    const requireTLS = smtpConfig.security === 'TLS' || smtpConfig.security === 'STARTTLS';
    
    const transportConfig: any = {
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: secure, // true for SSL (port 465), false for STARTTLS/TLS
      auth: {
        user: smtpConfig.username,
        pass: smtpConfig.password,
      },
      // Connection pool for better performance with multiple emails
      pool: false, // Set to true if sending multiple emails in quick succession
      maxConnections: 1,
      maxMessages: Infinity,
      // Timeout settings
      connectionTimeout: 60000, // 60 seconds
      greetingTimeout: 30000, // 30 seconds
      socketTimeout: 60000, // 60 seconds
    };
    
    // TLS configuration
    if (requireTLS || !secure) {
      transportConfig.tls = {
        // Do not fail on invalid certs in development
        rejectUnauthorized: process.env.NODE_ENV === 'production',
        minVersion: 'TLSv1.2',
      };
      
      // Explicitly require TLS upgrade for STARTTLS
      if (requireTLS) {
        transportConfig.requireTLS = true;
      }
    }
    
    // Debug mode in development
    if (process.env.NODE_ENV !== 'production') {
      transportConfig.debug = true;
      transportConfig.logger = {
        debug: (msg: string) => logger.debug(`[SMTP Debug] ${msg}`),
        info: (msg: string) => logger.info(`[SMTP Info] ${msg}`),
        warn: (msg: string) => logger.warn(`[SMTP Warn] ${msg}`),
        error: (msg: string) => logger.error(`[SMTP Error] ${msg}`),
      };
    }
    
    const transporter = nodemailer.createTransport(transportConfig);
    
    // Verify SMTP connection before sending
    try {
      logger.info('Verifying SMTP connection...');
      await transporter.verify();
      logger.info('SMTP connection verified successfully');
    } catch (verifyError: any) {
      logger.error('SMTP connection verification failed:', verifyError);
      throw new AppError(
        `SMTP connection failed: ${verifyError.message}`,
        500,
        false,
        { details: verifyError.message }
      );
    }
    
    // Step 4: Prepare email options
    const mailOptions: any = {
      from: `${fromEmail} <${fromEmail}>`,
      to: payload.to.join(', '),
      subject: payload.subject,
      html: payload.html,
      text: payload.text || undefined,
    };
    
    if (payload.cc && payload.cc.length > 0) {
      mailOptions.cc = payload.cc.join(', ');
    }
    
    if (payload.bcc && payload.bcc.length > 0) {
      mailOptions.bcc = payload.bcc.join(', ');
    }
    
    if (payload.attachments && payload.attachments.length > 0) {
      mailOptions.attachments = payload.attachments.map(att => ({
        filename: att.filename,
        content: Buffer.from(att.content, 'base64'),
        contentType: att.contentType,
      }));
    }
    
    // Step 5: Send the email
    logger.info(`Sending email from ${fromEmail} to ${payload.to.join(', ')}`);
    logger.debug(`Email subject: "${payload.subject}"`);
    
    let info;
    try {
      info = await transporter.sendMail(mailOptions);
      logger.info(`Email sent successfully. Message ID: ${info.messageId}`);
    } catch (sendError: any) {
      logger.error('Failed to send email:', sendError);
      throw new AppError(
        `Failed to send email: ${sendError.message}`,
        500,
        false,
        { 
          details: sendError.message,
          response: sendError.response,
          responseCode: sendError.responseCode,
        }
      );
    }
    
    return {
      success: true,
      messageId: info.messageId,
      message: 'Email sent successfully',
    };
    
  } catch (error: any) {
    logger.error('Error in sendMailFromAccount:', error);
    
    if (error instanceof AppError) {
      throw error;
    }
    
    throw new AppError(
      error.message || 'Failed to send email',
      500,
      false,
      { details: error.message, stack: error.stack }
    );
  } finally {
    client.release();
  }
};
