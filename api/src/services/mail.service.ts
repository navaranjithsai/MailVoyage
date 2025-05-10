import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { simpleParser, ParsedMail, AddressObject } from 'mailparser'; // Import AddressObject
import { logger } from '../utils/logger.js';
import { AppError } from '../utils/errors.js';
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
