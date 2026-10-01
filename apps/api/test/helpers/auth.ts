import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

export interface TestUser {
  email: string;
  password: string;
}

export type TestAgent = ReturnType<typeof request.agent>;

export function makeUser(index = 0): TestUser {
  return {
    email: `user${index}@example.com`,
    password: 'correct-horse-battery-staple',
  };
}

/** Extracts a cookie value from a `set-cookie` header array. */
export function extractCookie(setCookies: string[], name: string): string {
  const raw = setCookies.find((c) => c.startsWith(`${name}=`));
  if (!raw) {
    throw new Error(`${name} cookie not found`);
  }
  const match = new RegExp(`^${name}=([^;]+)`).exec(raw);
  if (!match) {
    throw new Error(`${name} cookie value not found`);
  }
  return match[1] ?? '';
}

/** Registers a user and returns an agent holding the session cookies. */
export async function registerAgent(
  app: INestApplication,
  user: TestUser = makeUser(),
): Promise<{ agent: TestAgent; userId: string; refreshToken: string }> {
  const agent = request.agent(app.getHttpServer());
  const res = await agent.post('/api/v1/auth/register').send(user).expect(201);
  return {
    agent,
    userId: res.body.user.id as string,
    refreshToken: extractCookie(res.headers['set-cookie'] as unknown as string[], 'refresh_token'),
  };
}