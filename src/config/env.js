require('dotenv').config();

function readEnv(name, { aliases = [], defaultValue, required = false, transform = (value) => value } = {}) {
  for (const key of [name, ...aliases]) {
    const value = process.env[key];
    if (value !== undefined && String(value).trim() !== '') {
      return transform(String(value).trim());
    }
  }

  if (defaultValue !== undefined) {
    return transform(defaultValue);
  }

  if (required) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return undefined;
}

module.exports = {
  JWT_SECRET: readEnv('JWT_SECRET', { required: true }),
  JWT_EXPIRES_IN: readEnv('JWT_EXPIRES_IN', { defaultValue: '12h' }),
  JWT_REFRESH_EXPIRES_DAYS: readEnv('JWT_REFRESH_EXPIRES_DAYS', { defaultValue: 14, transform: Number }),
  JWT_ISSUER: readEnv('JWT_ISSUER', { defaultValue: 'quran-elearning-api' }),
  JWT_AUDIENCE: readEnv('JWT_AUDIENCE', { defaultValue: 'quran-elearning-client' }),
  JWT_REFRESH_AUDIENCE: readEnv('JWT_REFRESH_AUDIENCE', { defaultValue: 'quran-elearning-refresh' }),
  GOOGLE_CLIENT_ID: readEnv('GOOGLE_CLIENT_ID', { defaultValue: '' }),
  OTP_EXPIRES_MINUTES: readEnv('OTP_EXPIRES_MINUTES', { defaultValue: 10, transform: Number }),
  OTP_MAX_ATTEMPTS: readEnv('OTP_MAX_ATTEMPTS', { defaultValue: 5, transform: Number }),
  OTP_MIN_INTERVAL_SECONDS: readEnv('OTP_MIN_INTERVAL_SECONDS', { defaultValue: 60, transform: Number }),
  DB_URL: readEnv('DATABASE_URL', { aliases: ['DB_URL'], required: true }),
};
