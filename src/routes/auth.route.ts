import {
  changePasswordController,
  forgotPasswordController,
  loginController,
  logoutController,
  meController,
  refreshTokenController,
  registerController,
  resetPasswordController,
  updateMeController
} from '@controllers/auth.controller';
import { requireBearerAuth } from '@middlewares/auth.middleware';
import { validate } from '@middlewares/validate.middleware';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  updateMeSchema
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
authRouter.patch('/me', requireBearerAuth, validate(updateMeSchema), updateMeController);
authRouter.post(
  '/change-password',
  requireBearerAuth,
  validate(changePasswordSchema),
  changePasswordController
);

export default authRouter;
