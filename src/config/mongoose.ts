import mongoose from 'mongoose';

import { env } from '@config/env';
import { logger } from '@config/logger';

const assertReplicaSetIfRequired = async () => {
  if (!env.mongoRequireReplicaSet || !mongoose.connection.db) {
    return;
  }

  const adminDb = mongoose.connection.db.admin();

  try {
    const helloResult = await adminDb.command({ hello: 1 });

    if (!helloResult.setName) {
      throw new Error('MongoDB replica set is required for transactions');
    }
  } catch (error) {
    throw new Error(`Replica set validation failed: ${(error as Error).message}`);
  }
};

export const connectMongo = async () => {
  await mongoose.connect(env.MONGODB_URI);
  await assertReplicaSetIfRequired();
  logger.info('MongoDB connected');
};

export const disconnectMongo = async () => {
  await mongoose.disconnect();
  logger.info('MongoDB disconnected');
};

export const getMongoHealth = () => {
  return mongoose.connection.readyState === 1 ? 'up' : 'down';
};
