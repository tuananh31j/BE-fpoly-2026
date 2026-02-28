import authRouter from '@routes/auth.route';
import healthRouter from '@routes/health.route';
import { Router } from 'express';

const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);

export default apiRouter;
