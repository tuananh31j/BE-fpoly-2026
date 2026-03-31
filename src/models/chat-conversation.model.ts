import type { Types } from 'mongoose';
import { Schema, model } from 'mongoose';

export interface ChatConversationDocument {
  type: string;
  isActive: boolean;
  customerId?: Types.ObjectId;
  participantIds: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const chatConversationSchema = new Schema<ChatConversationDocument>(
  {
    type: { type: String, default: 'support' },
    isActive: { type: Boolean, default: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'User' },
    participantIds: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }]
  },
  {
    timestamps: true
  }
);

chatConversationSchema.index({ participantIds: 1, updatedAt: -1 });

export const ChatConversationModel = model<ChatConversationDocument>(
  'ChatConversation',
  chatConversationSchema
);
