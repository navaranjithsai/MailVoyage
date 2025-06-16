import nodemailer from 'nodemailer';
import crypto from 'crypto';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../utils/errors.js';

// Create nodemailer transporter
const createTransporter = () => {
  if (!config.smtp.user || !config.smtp.pass) {
    throw new AppError('SMTP credentials not configured', 500, false);
  }

  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure, // true for 465, false for other ports
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
    tls: {
      // Do not fail on invalid certs in development
      rejectUnauthorized: config.nodeEnv === 'production',
    },
    // Enable STARTTLS for non-secure connections
    requireTLS: !config.smtp.secure,
  });
};

/**
 * Generate a 6-character alphanumeric OTP
 */
export const generateOTP = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let otp = '';
  for (let i = 0; i < 6; i++) {
    otp += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return otp;
};

/**
 * Hash OTP with username using SHA-256
 */
export const hashOTP = (otp: string, username: string): string => {
  const combined = otp + username;
  return crypto.createHash('sha256').update(combined).digest('hex');
};

/**
 * Send OTP email to user
 */
export const sendOTPEmail = async (email: string, username: string, otp: string): Promise<void> => {
  try {
    logger.info(`Attempting to send OTP email to ${email} for user ${username}`);
    logger.debug('SMTP Config:', {
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      user: config.smtp.user,
      fromName: config.smtp.fromName,
      fromEmail: config.smtp.fromEmail,
    });

    const transporter = createTransporter();
    logger.debug('SMTP transporter created successfully');

    const mailOptions = {
      from: `"${config.smtp.fromName}" <${config.smtp.fromEmail}>`,
      to: email,
      subject: 'Password Reset OTP - MailVoyage',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
          <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #1f2937; margin: 0; font-size: 24px;">Password Reset Request</h1>
            </div>
            
            <div style="margin-bottom: 30px;">
              <p style="color: #4b5563; margin: 0 0 16px 0; font-size: 16px;">Hello ${username},</p>
              <p style="color: #4b5563; margin: 0 0 16px 0; font-size: 16px;">
                You have requested to reset your password for your MailVoyage account. Please use the following OTP to proceed:
              </p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; border: 2px dashed #d1d5db;">
                <span style="font-size: 32px; font-weight: bold; color: #1f2937; letter-spacing: 4px; font-family: monospace;">
                  ${otp}
                </span>
              </div>
              <p style="color: #6b7280; margin: 10px 0 0 0; font-size: 14px;">
                This OTP is valid for 10 minutes only
              </p>
            </div>
            
            <div style="margin-bottom: 30px;">
              <p style="color: #4b5563; margin: 0 0 16px 0; font-size: 16px;">
                If you didn't request this password reset, please ignore this email. Your account remains secure.
              </p>
            </div>
            
            <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; text-align: center;">
              <p style="color: #6b7280; margin: 0; font-size: 14px;">
                © 2025 MailVoyage. All rights reserved.
              </p>
            </div>
          </div>
        </div>
      `,
      text: `
        Password Reset Request - MailVoyage
        
        Hello ${username},
        
        You have requested to reset your password for your MailVoyage account.
        
        Your OTP: ${otp}
        
        This OTP is valid for 10 minutes only.
        
        If you didn't request this password reset, please ignore this email.
        
        © 2025 MailVoyage. All rights reserved.
      `
    };
    
    logger.debug('Sending email with options:', {
      from: mailOptions.from,
      to: mailOptions.to,
      subject: mailOptions.subject,
    });

    await transporter.sendMail(mailOptions);
    logger.info(`OTP email sent successfully to ${email}`);  } catch (error: any) {
    logger.error('Error sending OTP email:', {
      message: error.message,
      code: error.code,
      response: error.response,
      command: error.command,
      stack: error.stack,
    });
    throw new AppError('Failed to send OTP email', 500, false);
  }
};

/**
 * Test SMTP connection
 */
export const testSMTPConnection = async (): Promise<boolean> => {
  try {
    logger.info('Testing SMTP connection...');
    const transporter = createTransporter();
    
    await transporter.verify();
    logger.info('SMTP connection test successful');
    return true;
  } catch (error: any) {
    logger.error('SMTP connection test failed:', {
      message: error.message,
      code: error.code,
      response: error.response,
    });
    return false;
  }
};
