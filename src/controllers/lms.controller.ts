import { StatusCodes } from 'http-status-codes';

import {
  completeLesson,
  createCourse,
  createLesson,
  createModule,
  deleteCourse,
  deleteLesson,
  deleteModule,
  enrollUserToCourse,
  getCourseDetail,
  listCourses,
  listMyProgress,
  updateCourse,
  updateLesson,
  updateModule
} from '@services/lms.service';
import { ApiError } from '@utils/api-error';
import { asyncHandler } from '@utils/async-handler';
import { getParam } from '@utils/request';
import { sendSuccess } from '@utils/response';
import type { Request } from 'express';

const getUserId = (req: Request) => {
  const userId = req.user?.id;

  if (!userId) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Unauthorized');
  }

  return userId;
};

export const listCoursesController = asyncHandler(async (req, res) => {
  const data = await listCourses({
    page: res.locals.pagination?.page ?? 1,
    limit: res.locals.pagination?.limit ?? 20,
    isActive:
      req.query.isActive === undefined
        ? undefined
        : String(req.query.isActive).toLowerCase() === 'true'
  });

  return sendSuccess(res, {
    message: 'Get courses successfully',
    data
  });
});

export const getCourseDetailController = asyncHandler(async (req, res) => {
  const data = await getCourseDetail(getParam(req.params.courseId, 'courseId'));

  return sendSuccess(res, {
    message: 'Get course detail successfully',
    data
  });
});

export const createCourseController = asyncHandler(async (req, res) => {
  const data = await createCourse(req.body);

  return sendSuccess(res, {
    statusCode: StatusCodes.CREATED,
    message: 'Create course successfully',
    data
  });
});

export const updateCourseController = asyncHandler(async (req, res) => {
  const data = await updateCourse(getParam(req.params.courseId, 'courseId'), req.body);

  return sendSuccess(res, {
    message: 'Update course successfully',
    data
  });
});

export const deleteCourseController = asyncHandler(async (req, res) => {
  const data = await deleteCourse(getParam(req.params.courseId, 'courseId'));

  return sendSuccess(res, {
    message: 'Delete course successfully',
    data
  });
});

export const createModuleController = asyncHandler(async (req, res) => {
  const data = await createModule(req.body);

  return sendSuccess(res, {
    statusCode: StatusCodes.CREATED,
    message: 'Create module successfully',
    data
  });
});

export const updateModuleController = asyncHandler(async (req, res) => {
  const data = await updateModule(getParam(req.params.moduleId, 'moduleId'), req.body);

  return sendSuccess(res, {
    message: 'Update module successfully',
    data
  });
});

export const deleteModuleController = asyncHandler(async (req, res) => {
  const data = await deleteModule(getParam(req.params.moduleId, 'moduleId'));

  return sendSuccess(res, {
    message: 'Delete module successfully',
    data
  });
});

export const createLessonController = asyncHandler(async (req, res) => {
  const data = await createLesson(req.body);

  return sendSuccess(res, {
    statusCode: StatusCodes.CREATED,
    message: 'Create lesson successfully',
    data
  });
});

export const updateLessonController = asyncHandler(async (req, res) => {
  const data = await updateLesson(getParam(req.params.lessonId, 'lessonId'), req.body);

  return sendSuccess(res, {
    message: 'Update lesson successfully',
    data
  });
});

export const deleteLessonController = asyncHandler(async (req, res) => {
  const data = await deleteLesson(getParam(req.params.lessonId, 'lessonId'));

  return sendSuccess(res, {
    message: 'Delete lesson successfully',
    data
  });
});

export const enrollUserController = asyncHandler(async (req, res) => {
  const data = await enrollUserToCourse(req.body.userId, req.body.courseId);

  return sendSuccess(res, {
    statusCode: StatusCodes.CREATED,
    message: 'Enroll user successfully',
    data
  });
});

export const listMyProgressController = asyncHandler(async (req, res) => {
  const data = await listMyProgress(getUserId(req), {
    page: res.locals.pagination?.page ?? 1,
    limit: res.locals.pagination?.limit ?? 20
  });

  return sendSuccess(res, {
    message: 'Get learning progress successfully',
    data
  });
});

export const completeLessonController = asyncHandler(async (req, res) => {
  const data = await completeLesson(
    getUserId(req),
    getParam(req.params.courseId, 'courseId'),
    getParam(req.params.lessonId, 'lessonId')
  );

  return sendSuccess(res, {
    message: 'Complete lesson successfully',
    data
  });
});
