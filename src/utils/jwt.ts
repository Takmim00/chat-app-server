import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'aurora_messenger_super_secret_jwt_key_2026';

export const generateToken = (userId: string, rememberMe: boolean = true): string => {
  const expiresIn = rememberMe ? '30d' : '1d';
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn });
};

export const verifyToken = (token: string): { userId: string } => {
  return jwt.verify(token, JWT_SECRET) as { userId: string };
};
