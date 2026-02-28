import {
  forgotPasswordController,
  loginController,
  logoutController,
  meController,
  refreshTokenController,
  registerController,
  resetPasswordController
} from '@controllers/auth.controller';
import { requireBearerAuth } from '@middlewares/auth.middleware';
import { validate } from '@middlewares/validate.middleware';
import {
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema
} from '@validators/auth.validator';
import { Router } from 'express';

const authRouter = Router();

authRouter.post('/register', validate(registerSchema), registerController);
authRouter.post('/login', validate(loginSchema), loginController);
authRouter.post('/forgot-password', validate(forgotPasswordSchema), forgotPasswordController);
authRouter.post('/reset-password', validate(resetPasswordSchema), resetPasswordController);
authRouter.post('/refresh', validate(refreshSchema), refreshTokenController);
authRouter.post('/logout', requireBearerAuth, validate(logoutSchema), logoutController);
authRouter.get('/me', requireBearerAuth, meController);

export default authRouter;
