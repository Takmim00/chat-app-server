import mongoose, { Schema, Document } from 'mongoose';

export interface IGroup extends Document {
  groupId: string;
  name: string;
  avatar: string;
  description: string;
  ownerId: mongoose.Types.ObjectId;
  admins: mongoose.Types.ObjectId[];
  members: mongoose.Types.ObjectId[];
  bannedMembers: mongoose.Types.ObjectId[];
  privacy: 'public' | 'private';
  inviteLinkCode: string;
  pinnedMessageIds: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const GroupSchema: Schema = new Schema(
  {
    groupId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    avatar: { type: String, default: '' },
    description: { type: String, default: '' },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    admins: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    members: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    bannedMembers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    privacy: { type: String, enum: ['public', 'private'], default: 'private' },
    inviteLinkCode: { type: String, required: true, unique: true },
    pinnedMessageIds: [{ type: Schema.Types.ObjectId, ref: 'Message' }],
  },
  { timestamps: true }
);

export default mongoose.model<IGroup>('Group', GroupSchema);
