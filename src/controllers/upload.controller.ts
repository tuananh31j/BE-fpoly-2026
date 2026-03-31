import { StatusCodes } from 'http-status-codes';
import multer from 'multer';

import { uploadImageFromBuffer, type UploadFolder } from '@services/upload.service';
import { ApiError } from '@utils/api-error';
import { asyncHandler } from '@utils/async-handler';
import { sendSuccess } from '@utils/response';

const ALLOWED_UPLOAD_FOLDERS: UploadFolder[] = ['avatars', 'products', 'categories', 'others'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (_req, file, callback) => {
    if (!file.mimetype.startsWith('image/')) {
      return callback(new ApiError(StatusCodes.BAD_REQUEST, 'Only image files are allowed'));
    }

    callback(null, true);
  }
});

const resolveUploadFolder = (value: unknown): UploadFolder => {
  if (typeof value !== 'string' || !value.trim()) {
    return 'others';
  }

  const normalizedValue = value.trim().toLowerCase();

  if (!ALLOWED_UPLOAD_FOLDERS.includes(normalizedValue as UploadFolder)) {
    throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, 'Invalid upload folder');
  }

  return normalizedValue as UploadFolder;
};

export const uploadSingleImageMiddleware = upload.single('file');

export const uploadImageController = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Image file is required');
  }

  const folder = resolveUploadFolder(req.body?.folder ?? req.query?.folder);
  const uploadResult = await uploadImageFromBuffer(req.file.buffer, {
    folder
  });

  return sendSuccess(res, {
    message: 'Upload image successfully',
    data: uploadResult
  });
});
