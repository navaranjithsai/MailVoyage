import { Router } from 'express';
import authRouter from './auth.router.js';
import userRouter from './user.router.js';
import mailRouter from './mail.router.js';

const router = Router();

router.use('/auth', authRouter);
router.use('/users', userRouter);
router.use('/mail', mailRouter);
// Add other routers (smtp, imap) here when implemented

export default router;
