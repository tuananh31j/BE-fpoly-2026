import { uploadImageController, uploadSingleImageMiddleware } from '@controllers/upload.controller';
import { requireBearerAuth } from '@middlewares/auth.middleware';
import { Router } from 'express';

const uploadRouter = Router();

uploadRouter.post('/image', requireBearerAuth, uploadSingleImageMiddleware, uploadImageController);

export default uploadRouter;
