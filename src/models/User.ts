import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  email: string;
  otp?: string;
  otpExpires?: Date;
  name: string;
  username: string;
  profilePic?: string;
  bio?: string;
  friendId: string;
  friends: mongoose.Types.ObjectId[];
  blockedUsers: mongoose.Types.ObjectId[];
  isOnline: boolean;
  lastSeen: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    otp: { type: String },
    otpExpires: { type: Date },
    name: { type: String, default: 'Aurora User' },
    username: { type: String, unique: true, sparse: true },
    profilePic: { type: String, default: '' },
    bio: { type: String, default: 'Hey there! I am using Aurora Messenger.' },
    friendId: { type: String, required: true, unique: true, index: true },
    friends: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    blockedUsers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    isOnline: { type: Boolean, default: false },
    lastSeen: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model<IUser>('User', UserSchema);
