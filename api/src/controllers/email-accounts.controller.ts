import { Request, Response } from 'express';
import * as emailAccountsService from '../services/email-accounts.service.js';
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
    const accounts = await emailAccountsService.getEmailAccountsByUserId(user.id);
    
    // Don't return passwords in the response
    const sanitizedAccounts = accounts.map(account => {
      const { password, outgoingPassword, ...sanitized } = account;
      return sanitized;
    });
    
    res.json(sanitizedAccounts);
  } catch (error) {
    logger.error('Error fetching email accounts:', error);
    res.status(500).json({ message: 'Failed to fetch email accounts' });
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
    const accountId = req.params.id;
    
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
    const accountId = req.params.id;
    
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
    const domain = req.params.domain;
    const config = await emailAccountsService.getAutoConfigForDomain(domain);
    
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
    const accountId = req.params.id;
    
    const testResult = await emailAccountsService.testEmailAccountConnection(accountId, user.id);
    
    res.json(testResult);
  } catch (error) {
    logger.error('Error testing email account:', error);
    res.status(500).json({ message: 'Failed to test email account connection' });
  }
};
