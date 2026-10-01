import type { AuthUser } from './user';

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface RegisterResponse {
  user: AuthUser;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: AuthUser;
}

export interface RefreshResponse {
  user: AuthUser;
}

/** Response of `GET /api/v1/auth/me`. */
export interface AuthMeResponse {
  user: AuthUser;
}