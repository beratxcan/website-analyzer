import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/app';
import { extractCookie, makeUser, registerAgent } from './helpers/auth';
import { resetDatabase } from './helpers/db';

describe('auth (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('register', () => {
    it('registers a user, sets session cookies and never returns the password hash', async () => {
      const user = makeUser();
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(user)
        .expect(201);

      expect(res.body.user).toMatchObject({ email: user.email });
      expect(res.body.user).not.toHaveProperty('passwordHash');
      expect(res.body.user).not.toHaveProperty('password');
      expect(typeof res.body.user.id).toBe('string');

      const cookies = res.headers['set-cookie'] as unknown as string[];
      expect(extractCookie(cookies, 'access_token')).not.toHaveLength(0);
      expect(extractCookie(cookies, 'refresh_token')).not.toHaveLength(0);
      expect(cookies.join(';')).toContain('HttpOnly');
    });

    it('rejects a duplicate email with 409', async () => {
      const user = makeUser(10);
      await request(app.getHttpServer()).post('/api/v1/auth/register').send(user).expect(201);

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(user)
        .expect(409);
      expect(res.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
    });

    it('rejects invalid payloads with 400 VALIDATION_ERROR', async () => {
      const server = app.getHttpServer();
      await request(server)
        .post('/api/v1/auth/register')
        .send({ email: 'nope', password: 'long-enough-password' })
        .expect(400);
      await request(server)
        .post('/api/v1/auth/register')
        .send({ email: 'a@b.com', password: 'short' })
        .expect(400);
      // unknown fields are rejected (mass assignment protection)
      await request(server)
        .post('/api/v1/auth/register')
        .send({ email: 'a@b.com', password: 'long-enough-password', admin: true })
        .expect(400);
    });
  });

  describe('login', () => {
    it('logs in and establishes a session', async () => {
      const user = makeUser(20);
      await request(app.getHttpServer()).post('/api/v1/auth/register').send(user).expect(201);

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: user.email.toUpperCase(), password: user.password })
        .expect(200);
      expect(res.body.user.email).toBe(user.email);
    });

    it('returns a generic 401 for unknown email or wrong password', async () => {
      const user = makeUser(21);
      await request(app.getHttpServer()).post('/api/v1/auth/register').send(user).expect(201);

      const unknown = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'ghost@example.com', password: user.password })
        .expect(401);
      expect(unknown.body.error.code).toBe('INVALID_CREDENTIALS');

      const wrong = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'wrong-password' })
        .expect(401);
      expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(wrong.body.error.message).toBe('Invalid email or password');
    });
  });

  describe('me', () => {
    it('returns the current user', async () => {
      const user = makeUser(30);
      const { agent, userId } = await registerAgent(app, user);
      const res = await agent.get('/api/v1/auth/me').expect(200);
      expect(res.body.user.id).toBe(userId);
      expect(res.body.user.email).toBe(user.email);
      expect(res.body.user).not.toHaveProperty('passwordHash');
    });

    it('rejects unauthenticated requests', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects an invalid access token', async () => {
      const agent = request.agent(app.getHttpServer());
      agent.jar.setCookie('access_token=garbage-token');
      const res = await agent.get('/api/v1/auth/me').expect(401);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    });
  });

  describe('refresh & rotation', () => {
    it('rotates the refresh token and revokes the previous one', async () => {
      const { agent, refreshToken: oldToken } = await registerAgent(app, makeUser(40));

      const before = await agent.post('/api/v1/auth/refresh').expect(200);
      const newToken = extractCookie(
        before.headers['set-cookie'] as unknown as string[],
        'refresh_token',
      );

      expect(newToken).not.toBe(oldToken);

      // replaying the old (rotated) token must be rejected
      const replayAgent = request.agent(app.getHttpServer());
      replayAgent.jar.setCookie(`refresh_token=${oldToken}`);
      const res = await replayAgent.post('/api/v1/auth/refresh').expect(401);
      expect(res.body.error.code).toBe('TOKEN_REVOKED');
    });
  });

  describe('logout', () => {
    it('revokes the session and clears cookies', async () => {
      const { agent, refreshToken } = await registerAgent(app, makeUser(50));

      const res = await agent.post('/api/v1/auth/logout').expect(204);
      const setCookies = res.headers['set-cookie'] as unknown as string[] | undefined;
      expect(setCookies?.some((c) => c.startsWith('access_token=;'))).toBe(true);

      // the revoked refresh token can no longer be used
      const replayAgent = request.agent(app.getHttpServer());
      replayAgent.jar.setCookie(`refresh_token=${refreshToken}`);
      const replay = await replayAgent.post('/api/v1/auth/refresh').expect(401);
      expect(replay.body.error.code).toBe('TOKEN_REVOKED');
    });
  });
});