import mongoose from 'mongoose';

export const connectDB = async () => {
  try {
    const connStr = process.env.MONGODB_URI;
    if (!connStr || connStr.includes('demo:demo')) {
      console.warn('⚠️ [MongoDB Atlas Warning]: Please configure a valid MONGODB_URI in server/.env');
      return;
    }
    await mongoose.connect(connStr);
    console.log('✅ MongoDB Atlas connected successfully.');
  } catch (error: any) {
    console.error('❌ MongoDB Connection Error:', error.message || error);
    console.warn('👉 Tip: Ensure your current IP address is whitelisted in MongoDB Atlas Network Access (or add 0.0.0.0/0).');
    // Keep server running so HTTP & Sockets continue working
  }
};
