import dotenv from 'dotenv';
dotenv.config();

export const CONFIG = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN || '',
  CLIENT_ID: process.env.CLIENT_ID || '',
  DATABASE_URL: process.env.DATABASE_URL || '',
  PORT: process.env.PORT || '3000',
};

if (!CONFIG.DISCORD_TOKEN && process.env.NODE_ENV === 'production') {
  console.warn('⚠️ DISCORD_TOKEN이 설정되지 않았습니다. .env 파일을 확인해 주세요.');
}
