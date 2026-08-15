import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'aurora_messenger_super_secret_jwt_key_2026';
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || JWT_SECRET;

export const generateToken = (userId: string, rememberMe: boolean = true): string => {
  const expiresIn = rememberMe ? '30d' : '1d';
  const type = rememberMe ? 'refresh' : 'access';
  const secret = rememberMe ? JWT_REFRESH_SECRET : JWT_ACCESS_SECRET;
  return jwt.sign({ userId, type }, secret, { expiresIn });
};

export const verifyToken = (token: string): { userId: string } => {
  try {
    return jwt.verify(token, JWT_ACCESS_SECRET) as { userId: string };
  } catch (error) {
    return jwt.verify(token, JWT_REFRESH_SECRET) as { userId: string };
  }
};
