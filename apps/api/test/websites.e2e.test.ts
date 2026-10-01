import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/app';
import { makeUser, registerAgent, type TestAgent } from './helpers/auth';
import { resetDatabase } from './helpers/db';

describe('websites (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userA: TestAgent;
  let userB: TestAgent;
  let projectId: string;
  let websiteId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);
    ({ agent: userA } = await registerAgent(app, makeUser(0)));
    ({ agent: userB } = await registerAgent(app, makeUser(1)));
    const project = await userA.post('/api/v1/projects').send({ name: 'Site Project' }).expect(201);
    projectId = project.body.id as string;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('CRUD', () => {
    it('creates a website with normalized fields', async () => {
      const res = await userA
        .post(`/api/v1/projects/${projectId}/websites`)
        .send({ name: 'Example', url: 'HTTPS://Example.COM/' })
        .expect(201);

      expect(res.body).toMatchObject({
        projectId,
        name: 'Example',
        url: 'HTTPS://Example.COM/',
        normalizedUrl: 'https://example.com',
        host: 'example.com',
      });
      websiteId = res.body.id as string;
    });

    it('lists websites of a project', async () => {
      const res = await userA.get(`/api/v1/projects/${projectId}/websites`).expect(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0]?.id).toBe(websiteId);
    });

    it('gets a website by id', async () => {
      const res = await userA.get(`/api/v1/websites/${websiteId}`).expect(200);
      expect(res.body.id).toBe(websiteId);
    });

    it('updates a website (name and url)', async () => {
      const res = await userA
        .patch(`/api/v1/websites/${websiteId}`)
        .send({ name: 'Example Org', url: 'https://example.org/docs' })
        .expect(200);
      expect(res.body.name).toBe('Example Org');
      expect(res.body.host).toBe('example.org');
      expect(res.body.normalizedUrl).toBe('https://example.org/docs');
    });

    it('rejects a duplicate website in the same project', async () => {
      // same normalized URL as the previously created website
      const res = await userA
        .post(`/api/v1/projects/${projectId}/websites`)
        .send({ name: 'Duplicate', url: 'https://example.org/docs' })
        .expect(409);
      expect(res.body.error.code).toBe('WEBSITE_ALREADY_EXISTS');
    });

    it('deletes a website', async () => {
      await userA.delete(`/api/v1/websites/${websiteId}`).expect(204);
      const res = await userA.get(`/api/v1/websites/${websiteId}`).expect(404);
      expect(res.body.error.code).toBe('WEBSITE_NOT_FOUND');
    });
  });

  describe('URL validation', () => {
    it('rejects invalid URLs with 400 INVALID_TARGET_URL', async () => {
      const cases = [
        'ftp://example.com',
        'javascript:alert(1)',
        'https://user:pass@example.com',
        'not-a-url',
        'https://exa mple.com',
      ];
      for (const url of cases) {
        const res = await userA
          .post(`/api/v1/projects/${projectId}/websites`)
          .send({ name: 'Bad', url })
          .expect(400);
        expect(res.body.error.code).toBe('INVALID_TARGET_URL');
      }
    });
  });

  describe('authorization', () => {
    it('hides other users\' websites (404)', async () => {
      const created = await userA
        .post(`/api/v1/projects/${projectId}/websites`)
        .send({ name: 'Mine', url: 'https://private.example.com' })
        .expect(201);

      const get = await userB.get(`/api/v1/websites/${created.body.id}`).expect(404);
      expect(get.body.error.code).toBe('WEBSITE_NOT_FOUND');

      await userB.patch(`/api/v1/websites/${created.body.id}`).send({ name: 'Hacked' }).expect(404);
      await userB.delete(`/api/v1/websites/${created.body.id}`).expect(404);
    });

    it('does not allow creating websites in another user\'s project', async () => {
      const res = await userB
        .post(`/api/v1/projects/${projectId}/websites`)
        .send({ name: 'Sneaky', url: 'https://example.com' })
        .expect(404);
      expect(res.body.error.code).toBe('PROJECT_NOT_FOUND');

      const list = await userB.get(`/api/v1/projects/${projectId}/websites`).expect(404);
      expect(list.body.error.code).toBe('PROJECT_NOT_FOUND');
    });

    it('requires authentication', async () => {
      await request(app.getHttpServer()).get(`/api/v1/projects/${projectId}/websites`).expect(401);
    });
  });
});