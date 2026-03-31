import bcrypt from 'bcryptjs';

import { logger } from '@/config/logger';
import { connectMongo, disconnectMongo } from '@/config/mongoose';
import { UserModel } from '@/models/user.model';

const DEFAULT_PASSWORD = '12345678';

const main = async () => {
  await connectMongo();

  const email = 'admin@gmail.com';
  const exists = await UserModel.exists({ email });

  if (exists) {
    logger.warn(`⚠️  Bỏ qua – email đã tồn tại: ${email}`);
    await disconnectMongo();
    return;
  }

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  await UserModel.create({
    email,
    passwordHash,
    fullName: 'Quản trị hệ thống',
    role: 'admin',
    isActive: true,
    loyaltyPoints: 0,
    membershipTier: 'platinum',
    staffDepartment: 'Management',
    staffStartDate: new Date(),
  });

  logger.info(`✅ Tạo admin: ${email}`);
  logger.info(`🔑 Mật khẩu: ${DEFAULT_PASSWORD}`);

  await disconnectMongo();
};

main().catch((error) => {
  logger.error('Seed admin thất bại:', error);
  process.exit(1);
});
