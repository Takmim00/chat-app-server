import mongoose, { Schema, Document } from 'mongoose';

export interface ICallLog extends Document {
  callerId: mongoose.Types.ObjectId;
  receiverId?: mongoose.Types.ObjectId;
  groupId?: mongoose.Types.ObjectId;
  isGroupCall: boolean;
  startTime: Date;
  endTime?: Date;
  duration: number; // in seconds
  status: 'completed' | 'missed' | 'rejected' | 'cancelled';
  createdAt: Date;
}

const CallLogSchema: Schema = new Schema(
  {
    callerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    receiverId: { type: Schema.Types.ObjectId, ref: 'User' },
    groupId: { type: Schema.Types.ObjectId, ref: 'Group' },
    isGroupCall: { type: Boolean, default: false },
    startTime: { type: Date, default: Date.now },
    endTime: { type: Date },
    duration: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['completed', 'missed', 'rejected', 'cancelled'],
      default: 'missed',
    },
  },
  { timestamps: true }
);

export default mongoose.model<ICallLog>('CallLog', CallLogSchema);
