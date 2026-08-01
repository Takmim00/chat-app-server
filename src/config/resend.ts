import { Resend } from 'resend';

export const sendOtpEmail = async (email: string, otp: string) => {
  const apiKey = process.env.RESEND_API_KEY;
  console.log(`[AUTH OTP DEV CONSOLE] Generated OTP for ${email}: ${otp}`);

  if (!apiKey || apiKey.trim() === '' || apiKey.includes('your_resend_api_key')) {
    console.log(`[RESEND API] Valid RESEND_API_KEY not found in .env. Using Dev Console OTP mode.`);
    return { success: true, message: 'OTP sent (Dev mode log)' };
  }

  try {
    const resend = new Resend(apiKey.trim());
    const sender = process.env.SENDER_EMAIL || 'onboarding@resend.dev';
    
    console.log(`[RESEND API] Sending OTP email to ${email} via Resend...`);
    const response = await resend.emails.send({
      from: sender.includes('<') ? sender : `Aurora Chat <${sender}>`,
      to: email,
      subject: 'Your Aurora Messenger OTP Code',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #6366f1;">Aurora Messenger Verification Code</h2>
          <p>Your one-time login OTP code is:</p>
          <div style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #4f46e5; margin: 16px 0;">${otp}</div>
          <p>This code expires in 10 minutes. If you did not request this, please ignore this email.</p>
        </div>
      `,
    });

    console.log('[RESEND API Response]:', response);

    if (response.error) {
      console.error('❌ [RESEND API Error]:', response.error);
      const isSandboxRestriction =
        response.error.message?.toLowerCase().includes('only send testing emails') ||
        response.error.name === 'validation_error';

      return {
        success: false,
        error: response.error,
        isSandboxRestriction,
        message: response.error.message || 'Resend email delivery failed',
      };
    }

    return { success: true, data: response.data };
  } catch (error: any) {
    console.error('❌ [RESEND API Error Exception]:', error);
    return { success: false, error, message: error?.message || 'Failed to trigger email' };
  }
};
