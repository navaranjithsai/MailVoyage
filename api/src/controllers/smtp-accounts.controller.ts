import { Request, Response } from 'express';
import * as smtpService from '../services/smtp-accounts.service.js';
import { logger } from '../utils/logger.js';

const getUser = (req: Request) => {
  if (!req.user) throw new Error('User not authenticated');
  return req.user as { id: string };
};

export const list = async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const items = await smtpService.getSmtpAccountsByUserId(user.id);
    const sanitized = items.map(({ password, ...rest }) => ({ ...rest }));
    res.json(sanitized);
  } catch (err) {
    logger.error('Error listing SMTP accounts:', err);
    res.status(500).json({ message: 'Failed to fetch SMTP accounts' });
  }
};

export const getOne = async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const item = await smtpService.getSmtpAccountById(String(req.params.id), user.id);
    if (!item) return res.status(404).json({ message: 'SMTP account not found' });
    const { password, ...sanitized } = item;
    res.json(sanitized);
  } catch (err) {
    logger.error('Error getting SMTP account:', err);
    res.status(500).json({ message: 'Failed to fetch SMTP account' });
  }
};

export const create = async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const newItem = await smtpService.createSmtpAccount({ ...req.body, userId: user.id });
    const { password, ...sanitized } = newItem;
    res.status(201).json(sanitized);
  } catch (err) {
    logger.error('Error creating SMTP account:', err);
    res.status(500).json({ message: 'Failed to create SMTP account' });
  }
};

export const update = async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const updated = await smtpService.updateSmtpAccount(String(req.params.id), user.id, req.body);
    if (!updated) return res.status(404).json({ message: 'SMTP account not found' });
    const { password, ...sanitized } = updated;
    res.json(sanitized);
  } catch (err) {
    logger.error('Error updating SMTP account:', err);
    res.status(500).json({ message: 'Failed to update SMTP account' });
  }
};

export const remove = async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const ok = await smtpService.deleteSmtpAccount(String(req.params.id), user.id);
    if (!ok) return res.status(404).json({ message: 'SMTP account not found' });
    res.json({ message: 'SMTP account deleted successfully' });
  } catch (err) {
    logger.error('Error deleting SMTP account:', err);
    res.status(500).json({ message: 'Failed to delete SMTP account' });
  }
};

export const test = async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const result = await smtpService.testSmtpAccount(String(req.params.id), user.id);
    res.json(result);
  } catch (err) {
    logger.error('Error testing SMTP account:', err);
    res.status(500).json({ message: 'Failed to test SMTP account' });
  }
};
