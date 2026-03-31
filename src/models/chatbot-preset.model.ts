import { Schema, model, type Types } from 'mongoose';

export interface ChatbotPresetDocument {
  question: string;
  answer?: string;
  productIds: Types.ObjectId[];
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const chatbotPresetSchema = new Schema<ChatbotPresetDocument>(
  {
    question: {
      type: String,
      required: true,
      trim: true
    },
    answer: {
      type: String,
      trim: true
    },
    productIds: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Product',
        required: true
      }
    ],
    isActive: {
      type: Boolean,
      default: true
    },
    sortOrder: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

chatbotPresetSchema.index({ isActive: 1, sortOrder: 1, updatedAt: -1 });
chatbotPresetSchema.index({ question: 1 });

export const ChatbotPresetModel = model<ChatbotPresetDocument>('ChatbotPreset', chatbotPresetSchema);
