const axios = require('axios');
const nodemailer = require('nodemailer');
const { logger } = require('./logger');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  if (!host) return null;

  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: process.env.SMTP_USER
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS || '',
        }
      : undefined,
  });

  return transporter;
}

async function sendOtpEmail({ email, code }) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const mailer = getTransporter();

  if (!mailer || !from) {
    logger.warn({ email }, 'SMTP is not configured; OTP email was not sent over SMTP');
    if (String(process.env.OTP_DEV_LOG_CODE || '0') === '1') {
      logger.info({ email, code }, 'Development OTP code');
    }
    return { delivered: false, provider: 'none' };
  }

  await mailer.sendMail({
    from,
    to: email,
    subject: 'Your Qur\'an Academy verification code',
    text: `Your verification code is ${code}. It expires in 10 minutes.`,
  });

  return { delivered: true, provider: 'smtp' };
}

async function sendOtpSms({ phone, code }) {
  const webhook = process.env.SMS_WEBHOOK_URL;
  const message = `Your verification code is ${code}. It expires in 10 minutes.`;

  if (!webhook) {
    logger.warn({ phone }, 'SMS webhook is not configured; OTP SMS was not sent');
    if (String(process.env.OTP_DEV_LOG_CODE || '0') === '1') {
      logger.info({ phone, code }, 'Development OTP code');
    }
    return { delivered: false, provider: 'none' };
  }

  await axios.post(
    webhook,
    {
      phone,
      message,
      code,
    },
    {
      headers: process.env.SMS_WEBHOOK_TOKEN
        ? { Authorization: `Bearer ${process.env.SMS_WEBHOOK_TOKEN}` }
        : undefined,
      timeout: 10000,
    }
  );

  return { delivered: true, provider: 'webhook' };
}

module.exports = {
  sendOtpEmail,
  sendOtpSms,
};
