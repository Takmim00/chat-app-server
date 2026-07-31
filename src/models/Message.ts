import mongoose, { Schema, Document } from 'mongoose';

export interface ISeenDeliveredInfo {
  userId: mongoose.Types.ObjectId;
  timestamp: Date;
}

export interface IReaction {
  userId: mongoose.Types.ObjectId;
  emoji: string;
}

export interface IMessage extends Document {
  chatId?: mongoose.Types.ObjectId;
  groupId?: mongoose.Types.ObjectId;
  senderId: mongoose.Types.ObjectId;
  content?: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'system' | 'call';
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  callDuration?: number;   // seconds — for call type messages
  callStatus?: 'completed' | 'missed' | 'rejected' | 'cancelled'; // for call type messages
  replyToId?: mongoose.Types.ObjectId;
  isEdited: boolean;
  isPinned: boolean;
  deletedFor: mongoose.Types.ObjectId[];
  isDeletedForEveryone: boolean;
  seenBy: ISeenDeliveredInfo[];
  deliveredTo: ISeenDeliveredInfo[];
  mentions: mongoose.Types.ObjectId[];
  reactions: IReaction[];
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema: Schema = new Schema(
  {
    chatId: { type: Schema.Types.ObjectId, ref: 'User' },
    groupId: { type: Schema.Types.ObjectId, ref: 'Group' },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, default: '' },
    type: {
      type: String,
      enum: ['text', 'image', 'video', 'audio', 'document', 'system', 'call'],
      default: 'text',
    },
    fileUrl: { type: String },
    fileName: { type: String },
    fileSize: { type: Number },
    fileType: { type: String },
    callDuration: { type: Number },
    callStatus: { type: String, enum: ['completed', 'missed', 'rejected', 'cancelled'] },
    replyToId: { type: Schema.Types.ObjectId, ref: 'Message' },
    isEdited: { type: Boolean, default: false },
    isPinned: { type: Boolean, default: false },
    deletedFor: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    isDeletedForEveryone: { type: Boolean, default: false },
    seenBy: [
      {
        userId: { type: Schema.Types.ObjectId, ref: 'User' },
        timestamp: { type: Date, default: Date.now },
      },
    ],
    deliveredTo: [
      {
        userId: { type: Schema.Types.ObjectId, ref: 'User' },
        timestamp: { type: Date, default: Date.now },
      },
    ],
    mentions: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    reactions: [
      {
        userId: { type: Schema.Types.ObjectId, ref: 'User' },
        emoji: { type: String },
      },
    ],
  },
  { timestamps: true }
);

MessageSchema.index({ chatId: 1, createdAt: 1 });
MessageSchema.index({ groupId: 1, createdAt: 1 });

export default mongoose.model<IMessage>('Message', MessageSchema);
