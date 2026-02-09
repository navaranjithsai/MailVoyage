import { Request, Response } from 'express';
import * as emailAccountsService from '../services/email-accounts.service.js';
import * as smtpAccountsService from '../services/smtp-accounts.service.js';
import { logger } from '../utils/logger.js';

// Type assertion function to check if request has authenticated user
const getAuthenticatedUser = (req: Request) => {
  if (!req.user) {
    throw new Error('User not authenticated');
  }
  return req.user as { id: string; username: string; email: string };
};

// Get all email accounts for the authenticated user
export const getEmailAccounts = async (req: Request, res: Response) => {
  try {
    const user = getAuthenticatedUser(req);
    const [accounts, smtpAccounts] = await Promise.all([
      emailAccountsService.getEmailAccountsByUserId(user.id),
      smtpAccountsService.getSmtpAccountsByUserId(user.id),
    ]);

    // Don't return passwords in the response
    const sanitizedAccounts = accounts.map(account => {
      const { password, outgoingPassword, ...sanitized } = account;
      return sanitized;
    });

    const sanitizedSmtp = smtpAccounts.map(acc => {
      const { password, ...rest } = acc as any;
      return { ...rest, smtpOnly: true };
    });

    res.json({ emailAccounts: sanitizedAccounts, smtpAccounts: sanitizedSmtp });
  } catch (error) {
    logger.error('Error fetching email accounts:', error);
    res.status(500).json({ message: 'Failed to fetch email accounts' });
  }
};

// Get single email account by ID
export const getEmailAccount = async (req: Request, res: Response) => {
  try {
    const user = getAuthenticatedUser(req);
    const accountId = String(req.params.id);
    
    const account = await emailAccountsService.getEmailAccountById(accountId, user.id);
    
    if (!account) {
      return res.status(404).json({ message: 'Email account not found' });
    }
    
    // Don't return passwords in the response
    const { password, outgoingPassword, ...sanitizedAccount } = account;
    
    res.json(sanitizedAccount);
  } catch (error) {
    logger.error('Error fetching email account:', error);
    res.status(500).json({ message: 'Failed to fetch email account' });
  }
};

// Add a new email account
export const addEmailAccount = async (req: Request, res: Response) => {
  try {
    const user = getAuthenticatedUser(req);
    const accountData = {
      ...req.body,
      userId: user.id
    };
    
    const newAccount = await emailAccountsService.createEmailAccount(accountData);
    
    // Don't return password in the response
    const { password, outgoingPassword, ...sanitizedAccount } = newAccount;
    
    res.status(201).json(sanitizedAccount);
  } catch (error) {
    logger.error('Error creating email account:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('already exists')) {
        return res.status(409).json({ message: error.message });
      }
    }
    
    res.status(500).json({ message: 'Failed to create email account' });
  }
};

// Update an existing email account
export const updateEmailAccount = async (req: Request, res: Response) => {
  try {
    const user = getAuthenticatedUser(req);
    const accountId = String(req.params.id);
    
    const updatedAccount = await emailAccountsService.updateEmailAccount(accountId, user.id, req.body);
    
    if (!updatedAccount) {
      return res.status(404).json({ message: 'Email account not found' });
    }
    
    // Don't return password in the response
    const { password, outgoingPassword, ...sanitizedAccount } = updatedAccount;
    
    res.json(sanitizedAccount);
  } catch (error) {
    logger.error('Error updating email account:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('already exists')) {
        return res.status(409).json({ message: error.message });
      }
    }
    
    res.status(500).json({ message: 'Failed to update email account' });
  }
};

// Delete an email account
export const deleteEmailAccount = async (req: Request, res: Response) => {
  try {
    const user = getAuthenticatedUser(req);
    const accountId = String(req.params.id);
    
    const deleted = await emailAccountsService.deleteEmailAccount(accountId, user.id);
    
    if (!deleted) {
      return res.status(404).json({ message: 'Email account not found' });
    }
    
    res.json({ message: 'Email account deleted successfully' });
  } catch (error) {
    logger.error('Error deleting email account:', error);
    res.status(500).json({ message: 'Failed to delete email account' });
  }
};

// Get autoconfig settings for a domain
export const getAutoConfig = async (req: Request, res: Response) => {
  try {
    const domain = String(req.params.domain);
    const email = req.query.email as string | undefined;
    const config = await emailAccountsService.getAutoConfigForDomain(domain, email);
    
    if (!config) {
      return res.status(404).json({ message: 'Auto-configuration not available for this domain' });
    }
    
    res.json(config);
  } catch (error) {
    logger.error('Error getting auto-config:', error);
    res.status(500).json({ message: 'Failed to get auto-configuration' });
  }
};

// Test email account connection
export const testEmailAccount = async (req: Request, res: Response) => {
  try {
    const user = getAuthenticatedUser(req);
    const accountId = String(req.params.id);
    
    const testResult = await emailAccountsService.testEmailAccountConnection(accountId, user.id);
    
    res.json(testResult);
  } catch (error) {
    logger.error('Error testing email account:', error);
    res.status(500).json({ message: 'Failed to test email account connection' });
  }
};

// Test all email accounts for the authenticated user
export const testAllEmailAccounts = async (req: Request, res: Response) => {
  try {
    const user = getAuthenticatedUser(req);
    const { accountCodes } = req.body;
    
    // Get all user's email accounts
    const accounts = await emailAccountsService.getEmailAccountsByUserId(user.id);
    
    // Filter accounts based on provided account codes if specified
    const accountsToTest = accountCodes 
      ? accounts.filter(account => accountCodes.includes(account.accountCode))
      : accounts;
    
    // Test each account
    const testResults = await Promise.allSettled(
      accountsToTest.map(async (account) => {
        const testResult = await emailAccountsService.testEmailAccountConnection(account.id!, user.id);
        return {
          accountId: account.id,
          accountCode: account.accountCode,
          email: account.email,
          status: testResult.success ? 'success' : 'error',
          message: testResult.message,
          details: testResult
        };
      })
    );
    
    // Process results
    const results = testResults.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        const account = accountsToTest[index];
        return {
          accountId: account.id,
          accountCode: account.accountCode,
          email: account.email,
          status: 'error',
          message: 'Connection test failed',
          details: result.reason
        };
      }
    });
    
    res.json({ results });
  } catch (error) {
    logger.error('Error testing all email accounts:', error);
    res.status(500).json({ message: 'Failed to test email accounts' });
  }
};
