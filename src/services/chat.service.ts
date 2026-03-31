import { StatusCodes } from 'http-status-codes';

import { getSocketServer } from '@config/socket';
import { ChatConversationModel } from '@models/chat-conversation.model';
import { ChatMessageModel } from '@models/chat-message.model';
import { emitStaffRealtimeNotification } from '@services/realtime-notification.service';
import { ApiError } from '@utils/api-error';
import { toObjectId } from '@utils/object-id';
import { toPaginatedData } from '@utils/pagination';

// worklog: 2026-03-04 09:35:15 | dung | refactor | conversationRoom
// worklog: 2026-03-04 09:25:21 | vanduc | refactor | conversationRoom
const conversationRoom = (conversationId: string) => `conversation:${conversationId}`;

// worklog: 2026-03-04 20:27:39 | dung | feature | assertParticipant
const assertParticipant = async (conversationId: string, userId: string) => {
  const conversation = await ChatConversationModel.findById(
    toObjectId(conversationId, 'conversationId')
  ).lean();

  if (!conversation) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Conversation not found');
  }

  const isParticipant = conversation.participantIds.some((id) => String(id) === userId);

  if (!isParticipant) {
    throw new ApiError(StatusCodes.FORBIDDEN, 'You are not a participant in this conversation');
  }

  return conversation;
};

// worklog: 2026-03-04 21:58:50 | dung | cleanup | createSupportConversation
export const createSupportConversation = async (customerId: string, initialMessage?: string) => {
  const customerObjectId = toObjectId(customerId, 'customerId');

  const created = await ChatConversationModel.create({
    type: 'support',
    isActive: true,
    customerId: customerObjectId,
    participantIds: [customerObjectId]
  });

  const result = created.toObject();

  if (initialMessage?.trim()) {
    await sendMessageToConversation(String(result._id), customerId, initialMessage.trim());
  }

  return result;
};

export const listMyConversations = async (
  userId: string,
  options: { page: number; limit: number }
) => {
  const filters = {
    participantIds: toObjectId(userId, 'userId')
  };

  const totalItems = await ChatConversationModel.countDocuments(filters);
  const items = await ChatConversationModel.find(filters)
    .sort({ updatedAt: -1 })
    .skip((options.page - 1) * options.limit)
    .limit(options.limit)
    .populate('customerId', 'fullName email avatarUrl')
    .lean();

  return toPaginatedData(items, totalItems, options.page, options.limit);
};

export const listAllConversations = async (options: { page: number; limit: number }) => {
  const filters = {
    type: 'support',
    isActive: true
  };

  const totalItems = await ChatConversationModel.countDocuments(filters);
  const items = await ChatConversationModel.find(filters)
    .sort({ updatedAt: -1 })
    .skip((options.page - 1) * options.limit)
    .limit(options.limit)
    .populate('customerId', 'fullName email avatarUrl')
    .lean();

  return toPaginatedData(items, totalItems, options.page, options.limit);
};

export const joinConversationAsStaff = async (conversationId: string, staffId: string) => {
  const updated = await ChatConversationModel.findByIdAndUpdate(
    toObjectId(conversationId, 'conversationId'),
    {
      $addToSet: {
        participantIds: toObjectId(staffId, 'staffId')
      }
    },
    {
      returnDocument: 'after'
    }
  ).lean();

  if (!updated) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Conversation not found');
  }

  return updated;
};

export const listConversationMessages = async (
  conversationId: string,
  userId: string,
  options: { page: number; limit: number }
) => {
  await assertParticipant(conversationId, userId);

  const filters = {
    conversationId: toObjectId(conversationId, 'conversationId')
  };

  const totalItems = await ChatMessageModel.countDocuments(filters);
  const items = await ChatMessageModel.find(filters)
    .sort({ createdAt: -1 })
    .skip((options.page - 1) * options.limit)
    .limit(options.limit)
    .lean();

  return toPaginatedData(items, totalItems, options.page, options.limit);
};

export const sendMessageToConversation = async (
  conversationId: string,
  senderId: string,
  content: string
) => {
  const conversation = await assertParticipant(conversationId, senderId);

  const message = await ChatMessageModel.create({
    conversationId: toObjectId(conversationId, 'conversationId'),
    senderId: toObjectId(senderId, 'senderId'),
    content,
    isRead: false,
    readBy: [toObjectId(senderId, 'senderId')]
  });

  await ChatConversationModel.updateOne(
    {
      _id: toObjectId(conversationId, 'conversationId')
    },
    {
      $set: {
        updatedAt: new Date()
      }
    }
  );

  const io = getSocketServer();

  if (io) {
    io.to(conversationRoom(conversationId)).emit('chat:message_created', {
      conversationId,
      message: {
        id: String(message._id),
        senderId,
        content,
        createdAt: message.createdAt
      }
    });

    io.to(conversationRoom(conversationId)).emit('chat:conversation_updated', {
      conversationId,
      updatedAt: new Date().toISOString()
    });
  }

  const customerId = conversation.customerId ? String(conversation.customerId) : null;

  if (customerId && senderId === customerId) {
    emitStaffRealtimeNotification({
      id: String(message._id),
      type: 'chat_message',
      title: 'Tin nhắn mới từ khách hàng',
      body: content.length > 120 ? `${content.slice(0, 117)}...` : content,
      createdAt: new Date().toISOString(),
      url: '/dashboard/support-chat',
      metadata: {
        conversationId,
        customerId
      }
    });
  }

  return message.toObject();
};

// worklog: 2026-03-04 08:18:00 | dung | cleanup | markMessageAsRead
export const markMessageAsRead = async (messageId: string, userId: string) => {
  const message = await ChatMessageModel.findById(toObjectId(messageId, 'messageId'));

  if (!message) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Message not found');
  }

  const conversation = await assertParticipant(String(message.conversationId), userId);

  if (!message.readBy.some((id) => String(id) === userId)) {
    message.readBy.push(toObjectId(userId, 'userId'));
  }

  message.isRead = message.readBy.length >= conversation.participantIds.length;
  await message.save();

  const io = getSocketServer();

  if (io) {
    io.to(conversationRoom(String(message.conversationId))).emit('chat:mark_read', {
      messageId,
      userId,
      isRead: message.isRead
    });
  }

  return message.toObject();
};
