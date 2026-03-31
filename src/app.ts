import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';

import { env } from '@config/env';
import { logger } from '@config/logger';
import { initPassport } from '@config/passport';
import { swaggerSpec } from '@config/swagger';
import { errorMiddleware } from '@middlewares/error.middleware';
import { notFoundMiddleware } from '@middlewares/not-found.middleware';
import apiRouter from '@routes/index';
import express from 'express';

const app = express();
const passport = initPassport();

app.use(
  morgan(env.isDevelopment ? 'dev' : 'combined', {
    stream: {
      write: (message) => {
        logger.info(message.trim());
      }
    }
  })
);
app.use(helmet());
app.use(
  cors({
    origin: env.corsOriginList === '*' ? true : env.corsOriginList,
    credentials: true
  })
);
// app.use(
//   rateLimit({
//     windowMs: env.RATE_LIMIT_WINDOW_MS,
//     max: env.RATE_LIMIT_MAX_REQUESTS,
//     standardHeaders: true,
//     legacyHeaders: false
//   })
// );
app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(passport.initialize());

app.use(`${env.API_PREFIX}/docs`, swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use(env.API_PREFIX, apiRouter);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;
