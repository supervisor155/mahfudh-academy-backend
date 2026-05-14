/* eslint-disable no-console */
const axios = require('axios');

const API_BASE = process.env.SMOKE_API_BASE || 'http://localhost:4000';
const OWNER_EMAIL = process.env.SMOKE_OWNER_EMAIL;
const OWNER_PASSWORD = process.env.SMOKE_OWNER_PASSWORD;
const GOOGLE_ID_TOKEN = process.env.SMOKE_GOOGLE_ID_TOKEN;
const OTP_FALLBACK_CODE = process.env.SMOKE_OTP_CODE;
const RUN_PHONE_OTP = String(process.env.SMOKE_RUN_PHONE_OTP || '0') === '1';
const PHONE_NUMBER = process.env.SMOKE_PHONE_NUMBER;

function must(name, value) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function ownerLogin(client, checks) {
  const email = must('SMOKE_OWNER_EMAIL', OWNER_EMAIL);
  const password = must('SMOKE_OWNER_PASSWORD', OWNER_PASSWORD);

  const login = await client.post('/api/auth/login', { identifier: email, password });
  const token = login.data?.token;
  const refreshToken = login.data?.refresh_token;
  checks.push({ name: 'POST /api/auth/login (owner)', ok: Boolean(token && refreshToken) });
  return { token, refreshToken, email, password };
}

async function otpRegisterUser({ client, checks, channel, email, phone, name, password, role = 'teacher' }) {
  const requestBody = {
    channel,
    email,
    phone,
  };
  const requestOtp = await client.post('/api/auth/register/request-otp', requestBody);
  checks.push({ name: `POST /api/auth/register/request-otp (${channel})`, ok: requestOtp.status === 200 });

  const otpCode = requestOtp.data?.debug_code || OTP_FALLBACK_CODE;
  if (!otpCode) {
    throw new Error('OTP code is not available. Enable OTP_DEV_LOG_CODE=1 or provide SMOKE_OTP_CODE.');
  }

  const verifyOtp = await client.post('/api/auth/register/verify-otp', {
    ...requestBody,
    code: otpCode,
  });
  const registrationToken = verifyOtp.data?.registration_verification_token;
  checks.push({ name: `POST /api/auth/register/verify-otp (${channel})`, ok: Boolean(registrationToken) });

  const register = await client.post('/api/auth/register', {
    email,
    phone,
    password,
    name,
    role,
    registration_verification_token: registrationToken,
  });
  checks.push({ name: `POST /api/auth/register (${role})`, ok: register.status === 201 });
  return register.data?.user;
}

async function run() {
  const client = axios.create({
    baseURL: API_BASE,
    timeout: 10000,
  });

  const checks = [];

  const health = await client.get('/health');
  checks.push({ name: 'GET /health', ok: health.status === 200 });

  const ready = await client.get('/ready');
  checks.push({ name: 'GET /ready', ok: ready.status === 200 });

  const ownerSession = await ownerLogin(client, checks);
  const token = ownerSession.token;
  const refreshToken = ownerSession.refreshToken;

  client.defaults.headers.common.Authorization = `Bearer ${token}`;

  const securityStatus = await client.get('/api/auth/security/status');
  checks.push({ name: 'GET /api/auth/security/status', ok: securityStatus.status === 200 });

  const tickets = await client.get('/api/auth/security/tickets?limit=5');
  checks.push({ name: 'GET /api/auth/security/tickets', ok: tickets.status === 200 });

  const nonce = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const teacherEmail = `smoke-teacher-${nonce}@example.com`;
  const teacherPassword = `Sm0ke-${nonce}-A!`;
  const teacher = await otpRegisterUser({
    client,
    checks,
    channel: 'email',
    email: teacherEmail,
    name: `Smoke Teacher ${nonce}`,
    password: teacherPassword,
    role: 'teacher',
  });

  const promote = await client.patch(`/api/auth/users/${teacher.id}/role`, {
    role: 'manager',
    owner_password: ownerSession.password,
    reason: 'Smoke test manager promotion flow',
  });
  checks.push({ name: 'PATCH /api/auth/users/:id/role (teacher->manager)', ok: promote.status === 200 });

  const teacherLogin = await client.post('/api/auth/login', {
    identifier: teacherEmail,
    password: teacherPassword,
  });
  checks.push({ name: 'POST /api/auth/login (registered user)', ok: Boolean(teacherLogin.data?.token) });

  if (RUN_PHONE_OTP) {
    const phone = must('SMOKE_PHONE_NUMBER', PHONE_NUMBER);
    await otpRegisterUser({
      client,
      checks,
      channel: 'phone',
      phone,
      name: `Smoke Student ${nonce}`,
      password: `Sm0ke-Phone-${nonce}-A!`,
      role: 'student',
    });
  }

  if (GOOGLE_ID_TOKEN) {
    const google = await client.post('/api/auth/google', {
      id_token: GOOGLE_ID_TOKEN,
      role: 'student',
    });
    checks.push({ name: 'POST /api/auth/google', ok: Boolean(google.data?.token) });
  }

  const refreshed = await client.post('/api/auth/refresh', { refresh_token: refreshToken });
  checks.push({ name: 'POST /api/auth/refresh', ok: Boolean(refreshed.data?.token && refreshed.data?.refresh_token) });

  await client.post('/api/auth/logout', { refresh_token: refreshed.data.refresh_token });
  checks.push({ name: 'POST /api/auth/logout', ok: true });

  const failed = checks.filter((c) => !c.ok);
  console.table(checks);

  if (failed.length) {
    throw new Error(`Smoke tests failed: ${failed.map((f) => f.name).join(', ')}`);
  }

  console.log('Smoke tests passed.');
}

run().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
