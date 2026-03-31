import { StatusCodes } from 'http-status-codes';

import { CourseModel } from '@models/course.model';
import { EmployeeProgressModel } from '@models/employee-progress.model';
import { LessonModel } from '@models/lesson.model';
import { ModuleModel } from '@models/module.model';
import { ApiError } from '@utils/api-error';
import { toObjectId } from '@utils/object-id';
import { toPaginatedData } from '@utils/pagination';

interface CoursePayload {
  title: string;
  description?: string;
  thumbnail?: string;
  instructorId: string;
  isActive?: boolean;
}

interface ModulePayload {
  courseId: string;
  title: string;
  order?: number;
}

interface LessonPayload {
  moduleId: string;
  title: string;
  content?: string;
  duration?: number;
  isRequired?: boolean;
  order?: number;
}

const calculateProgress = (totalRequired: number, completedRequired: number) => {
  if (totalRequired <= 0) {
    return 100;
  }

  return Math.min(100, Math.round((completedRequired / totalRequired) * 10000) / 100);
};

export const listCourses = async (options: { page: number; limit: number; isActive?: boolean }) => {
  const filters: Record<string, unknown> = {};

  if (typeof options.isActive === 'boolean') {
    filters.isActive = options.isActive;
  }

  const totalItems = await CourseModel.countDocuments(filters);
  const items = await CourseModel.find(filters)
    .sort({ createdAt: -1 })
    .skip((options.page - 1) * options.limit)
    .limit(options.limit)
    .lean();

  return toPaginatedData(items, totalItems, options.page, options.limit);
};

export const getCourseDetail = async (courseId: string) => {
  const _courseId = toObjectId(courseId, 'courseId');
  const course = await CourseModel.findById(_courseId).lean();

  if (!course) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Course not found');
  }

  const modules = await ModuleModel.find({ courseId: _courseId }).sort({ order: 1 }).lean();
  const moduleIds = modules.map((moduleDoc) => moduleDoc._id);
  const lessons = await LessonModel.find({ moduleId: { $in: moduleIds } })
    .sort({ order: 1 })
    .lean();

  const lessonMap = new Map<string, typeof lessons>();

  for (const lesson of lessons) {
    const key = String(lesson.moduleId);
    const bucket = lessonMap.get(key) ?? [];
    bucket.push(lesson);
    lessonMap.set(key, bucket);
  }

  return {
    course,
    modules: modules.map((moduleDoc) => ({
      ...moduleDoc,
      lessons: lessonMap.get(String(moduleDoc._id)) ?? []
    }))
  };
};

export const createCourse = async (payload: CoursePayload) => {
  const created = await CourseModel.create({
    title: payload.title,
    description: payload.description,
    thumbnail: payload.thumbnail,
    instructorId: toObjectId(payload.instructorId, 'instructorId'),
    isActive: payload.isActive ?? true
  });

  return created.toObject();
};

export const updateCourse = async (courseId: string, payload: Partial<CoursePayload>) => {
  const updateData: Record<string, unknown> = {
    ...payload
  };

  if (payload.instructorId !== undefined) {
    updateData.instructorId = toObjectId(payload.instructorId, 'instructorId');
  }

  const updated = await CourseModel.findByIdAndUpdate(
    toObjectId(courseId, 'courseId'),
    updateData,
    {
      returnDocument: 'after'
    }
  ).lean();

  if (!updated) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Course not found');
  }

  return updated;
};

export const deleteCourse = async (courseId: string) => {
  const _courseId = toObjectId(courseId, 'courseId');
  const deleted = await CourseModel.findByIdAndDelete(_courseId).lean();

  if (!deleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Course not found');
  }

  const modules = await ModuleModel.find({ courseId: _courseId }, { _id: 1 }).lean();
  const moduleIds = modules.map((moduleDoc) => moduleDoc._id);

  await Promise.all([
    ModuleModel.deleteMany({ courseId: _courseId }),
    LessonModel.deleteMany({ moduleId: { $in: moduleIds } }),
    EmployeeProgressModel.deleteMany({ courseId: _courseId })
  ]);

  return {
    id: String(deleted._id)
  };
};

export const createModule = async (payload: ModulePayload) => {
  const _courseId = toObjectId(payload.courseId, 'courseId');
  const course = await CourseModel.findById(_courseId).lean();

  if (!course) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Course not found');
  }

  const created = await ModuleModel.create({
    courseId: _courseId,
    title: payload.title,
    order: payload.order ?? 0
  });

  return created.toObject();
};

export const updateModule = async (
  moduleId: string,
  payload: {
    title?: string;
    order?: number;
  }
) => {
  const updated = await ModuleModel.findByIdAndUpdate(toObjectId(moduleId, 'moduleId'), payload, {
    returnDocument: 'after'
  }).lean();

  if (!updated) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Module not found');
  }

  return updated;
};

export const deleteModule = async (moduleId: string) => {
  const _moduleId = toObjectId(moduleId, 'moduleId');
  const deleted = await ModuleModel.findByIdAndDelete(_moduleId).lean();

  if (!deleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Module not found');
  }

  await LessonModel.deleteMany({ moduleId: _moduleId });

  return {
    id: String(deleted._id)
  };
};

export const createLesson = async (payload: LessonPayload) => {
  const _moduleId = toObjectId(payload.moduleId, 'moduleId');
  const moduleDoc = await ModuleModel.findById(_moduleId).lean();

  if (!moduleDoc) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Module not found');
  }

  const created = await LessonModel.create({
    moduleId: _moduleId,
    title: payload.title,
    content: payload.content,
    duration: payload.duration,
    isRequired: payload.isRequired ?? true,
    order: payload.order ?? 0
  });

  return created.toObject();
};

export const updateLesson = async (
  lessonId: string,
  payload: {
    title?: string;
    content?: string;
    duration?: number;
    isRequired?: boolean;
    order?: number;
  }
) => {
  const updated = await LessonModel.findByIdAndUpdate(toObjectId(lessonId, 'lessonId'), payload, {
    returnDocument: 'after'
  }).lean();

  if (!updated) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Lesson not found');
  }

  return updated;
};

export const deleteLesson = async (lessonId: string) => {
  const _lessonId = toObjectId(lessonId, 'lessonId');
  const deleted = await LessonModel.findByIdAndDelete(_lessonId).lean();

  if (!deleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Lesson not found');
  }

  await EmployeeProgressModel.updateMany(
    {
      completedLessonIds: _lessonId
    },
    {
      $pull: {
        completedLessonIds: _lessonId
      }
    }
  );

  return {
    id: String(deleted._id)
  };
};

export const enrollUserToCourse = async (userId: string, courseId: string) => {
  const _userId = toObjectId(userId, 'userId');
  const _courseId = toObjectId(courseId, 'courseId');

  const course = await CourseModel.findById(_courseId).lean();

  if (!course) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Course not found');
  }

  const enrolled = await EmployeeProgressModel.findOneAndUpdate(
    {
      userId: _userId,
      courseId: _courseId
    },
    {
      $setOnInsert: {
        status: 'enrolled',
        progressPercentage: 0,
        enrolledAt: new Date(),
        completedLessonIds: []
      }
    },
    {
      upsert: true,
      returnDocument: 'after'
    }
  ).lean();

  return enrolled;
};

export const listMyProgress = async (userId: string, options: { page: number; limit: number }) => {
  const _userId = toObjectId(userId, 'userId');
  const filters = {
    userId: _userId
  };

  const totalItems = await EmployeeProgressModel.countDocuments(filters);
  const items = await EmployeeProgressModel.find(filters)
    .sort({ enrolledAt: -1 })
    .skip((options.page - 1) * options.limit)
    .limit(options.limit)
    .lean();

  return toPaginatedData(items, totalItems, options.page, options.limit);
};

export const completeLesson = async (userId: string, courseId: string, lessonId: string) => {
  const _userId = toObjectId(userId, 'userId');
  const _courseId = toObjectId(courseId, 'courseId');
  const _lessonId = toObjectId(lessonId, 'lessonId');

  const progress = await EmployeeProgressModel.findOne({
    userId: _userId,
    courseId: _courseId
  });

  if (!progress) {
    throw new ApiError(StatusCodes.FORBIDDEN, 'You are not enrolled in this course');
  }

  const lesson = await LessonModel.findById(_lessonId).lean();

  if (!lesson) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Lesson not found');
  }

  const moduleDoc = await ModuleModel.findById(lesson.moduleId).lean();

  if (!moduleDoc || String(moduleDoc.courseId) !== String(_courseId)) {
    throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, 'Lesson does not belong to this course');
  }

  if (!progress.completedLessonIds.some((id) => String(id) === String(_lessonId))) {
    progress.completedLessonIds.push(_lessonId);
  }

  const modules = await ModuleModel.find({ courseId: _courseId }, { _id: 1 }).lean();
  const moduleIds = modules.map((moduleDoc2) => moduleDoc2._id);

  const requiredLessons = await LessonModel.find(
    {
      moduleId: { $in: moduleIds },
      isRequired: true
    },
    { _id: 1 }
  ).lean();

  const requiredLessonIds = new Set(requiredLessons.map((item) => String(item._id)));
  const completedRequired = progress.completedLessonIds.filter((id) =>
    requiredLessonIds.has(String(id))
  ).length;

  const progressPercentage = calculateProgress(requiredLessonIds.size, completedRequired);

  progress.progressPercentage = progressPercentage;

  if (progressPercentage >= 100) {
    progress.status = 'completed';
    progress.completedAt = new Date();
  } else {
    progress.status = 'in_progress';
    progress.completedAt = undefined;
  }

  await progress.save();

  return progress.toObject();
};
