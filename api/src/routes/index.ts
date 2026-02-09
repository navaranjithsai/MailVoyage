import { Router } from 'express';
import authRouter from './auth.router.js';
import userRouter from './user.router.js';
import mailRouter from './mail.router.js';
import emailAccountsRouter from './email-accounts.router.js';
import smtpAccountsRouter from './smtp-accounts.router.js';
import sentMailsRouter from './sent-mails.router.js';
import inboxRouter from './inbox.router.js';

const router = Router();

router.use('/auth', authRouter);
router.use('/users', userRouter);
router.use('/mail', mailRouter);
router.use('/email-accounts', emailAccountsRouter);
router.use('/smtp-accounts', smtpAccountsRouter);
router.use('/sent-mails', sentMailsRouter);
router.use('/inbox', inboxRouter);

export default router;
