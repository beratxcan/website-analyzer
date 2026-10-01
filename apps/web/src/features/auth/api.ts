import type {
  AuthMeResponse,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
} from '@analyzer/contracts';
import { apiClient } from '@/lib/api/client';

export function register(input: RegisterRequest): Promise<RegisterResponse> {
  return apiClient.request('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function login(input: LoginRequest): Promise<LoginResponse> {
  return apiClient.request('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function logout(): Promise<void> {
  return apiClient.request('/api/v1/auth/logout', { method: 'POST' });
}

export function getMe(): Promise<AuthMeResponse> {
  return apiClient.request('/api/v1/auth/me');
}