import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './helpers/app';
import { makeUser, registerAgent, type TestAgent } from './helpers/auth';
import { resetDatabase } from './helpers/db';

describe('projects (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userA: TestAgent;
  let userB: TestAgent;
  let projectId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);
    ({ agent: userA } = await registerAgent(app, makeUser(0)));
    ({ agent: userB } = await registerAgent(app, makeUser(1)));
  });

  afterAll(async () => {
    await app.close();
  });

  describe('CRUD', () => {
    it('creates a project', async () => {
      const res = await userA
        .post('/api/v1/projects')
        .send({ name: 'Alpha', description: 'First project' })
        .expect(201);

      expect(res.body).toMatchObject({ name: 'Alpha', description: 'First project' });
      expect(res.body.id).toEqual(expect.any(String));
      expect(res.body).not.toHaveProperty('userId');
      projectId = res.body.id as string;
    });

    it('lists projects for the owner', async () => {
      const res = await userA.get('/api/v1/projects').expect(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0]?.id).toBe(projectId);
    });

    it('gets a project', async () => {
      const res = await userA.get(`/api/v1/projects/${projectId}`).expect(200);
      expect(res.body.id).toBe(projectId);
      expect(res.body.name).toBe('Alpha');
    });

    it('updates a project', async () => {
      const res = await userA
        .patch(`/api/v1/projects/${projectId}`)
        .send({ name: 'Alpha V2', description: null })
        .expect(200);
      expect(res.body.name).toBe('Alpha V2');
      expect(res.body.description).toBeNull();
    });

    it('deletes a project', async () => {
      await userA.delete(`/api/v1/projects/${projectId}`).expect(204);
      const res = await userA.get(`/api/v1/projects/${projectId}`).expect(404);
      expect(res.body.error.code).toBe('PROJECT_NOT_FOUND');
    });
  });

  describe('validation', () => {
    it('rejects empty names and unknown fields', async () => {
      await userA.post('/api/v1/projects').send({ name: '' }).expect(400);
      await userA.post('/api/v1/projects').send({ name: 'X', owner: 'hack' }).expect(400);
    });
  });

  describe('authorization', () => {
    it('hides other users\' projects (404)', async () => {
      const created = await userA.post('/api/v1/projects').send({ name: 'Secret' }).expect(201);

      const get = await userB.get(`/api/v1/projects/${created.body.id}`).expect(404);
      expect(get.body.error.code).toBe('PROJECT_NOT_FOUND');

      await userB.patch(`/api/v1/projects/${created.body.id}`).send({ name: 'Hacked' }).expect(404);
      await userB.delete(`/api/v1/projects/${created.body.id}`).expect(404);

      const list = await userB.get('/api/v1/projects').expect(200);
      expect(list.body.items).toHaveLength(0);
    });

    it('requires authentication', async () => {
      await request(app.getHttpServer()).get('/api/v1/projects').expect(401);
      await request(app.getHttpServer()).post('/api/v1/projects').send({ name: 'X' }).expect(401);
    });
  });
});