import {
  completeLessonController,
  createCourseController,
  createLessonController,
  createModuleController,
  deleteCourseController,
  deleteLessonController,
  deleteModuleController,
  enrollUserController,
  getCourseDetailController,
  listCoursesController,
  listMyProgressController,
  updateCourseController,
  updateLessonController,
  updateModuleController
} from '@controllers/lms.controller';
import { requireBearerAuth } from '@middlewares/auth.middleware';
import { parsePaginationMiddleware } from '@middlewares/pagination.middleware';
import { requireRoles } from '@middlewares/rbac.middleware';
import { validate } from '@middlewares/validate.middleware';
import {
  completeLessonSchema,
  courseIdParamSchema,
  createCourseSchema,
  createLessonSchema,
  createModuleSchema,
  enrollUserSchema,
  lessonIdParamSchema,
  listCoursesSchema,
  listProgressSchema,
  moduleIdParamSchema,
  updateCourseSchema,
  updateLessonSchema,
  updateModuleSchema
} from '@validators/lms.validator';
import { Router } from 'express';

const lmsRouter = Router();

lmsRouter.get(
  '/courses',
  validate(listCoursesSchema),
  parsePaginationMiddleware,
  listCoursesController
);
lmsRouter.get('/courses/:courseId', validate(courseIdParamSchema), getCourseDetailController);

lmsRouter.get(
  '/me/progress',
  requireBearerAuth,
  validate(listProgressSchema),
  parsePaginationMiddleware,
  listMyProgressController
);
lmsRouter.post(
  '/courses/:courseId/lessons/:lessonId/complete',
  requireBearerAuth,
  validate(completeLessonSchema),
  completeLessonController
);

lmsRouter.post(
  '/courses',
  requireBearerAuth,
  requireRoles('staff', 'admin'),
  validate(createCourseSchema),
  createCourseController
);
lmsRouter.patch(
  '/courses/:courseId',
  requireBearerAuth,
  requireRoles('staff', 'admin'),
  validate(updateCourseSchema),
  updateCourseController
);
lmsRouter.delete(
  '/courses/:courseId',
  requireBearerAuth,
  requireRoles('staff', 'admin'),
  validate(courseIdParamSchema),
  deleteCourseController
);

lmsRouter.post(
  '/modules',
  requireBearerAuth,
  requireRoles('staff', 'admin'),
  validate(createModuleSchema),
  createModuleController
);
lmsRouter.patch(
  '/modules/:moduleId',
  requireBearerAuth,
  requireRoles('staff', 'admin'),
  validate(updateModuleSchema),
  updateModuleController
);
lmsRouter.delete(
  '/modules/:moduleId',
  requireBearerAuth,
  requireRoles('staff', 'admin'),
  validate(moduleIdParamSchema),
  deleteModuleController
);

lmsRouter.post(
  '/lessons',
  requireBearerAuth,
  requireRoles('staff', 'admin'),
  validate(createLessonSchema),
  createLessonController
);
lmsRouter.patch(
  '/lessons/:lessonId',
  requireBearerAuth,
  requireRoles('staff', 'admin'),
  validate(updateLessonSchema),
  updateLessonController
);
lmsRouter.delete(
  '/lessons/:lessonId',
  requireBearerAuth,
  requireRoles('staff', 'admin'),
  validate(lessonIdParamSchema),
  deleteLessonController
);

lmsRouter.post(
  '/enrollments',
  requireBearerAuth,
  requireRoles('admin'),
  validate(enrollUserSchema),
  enrollUserController
);

export default lmsRouter;
