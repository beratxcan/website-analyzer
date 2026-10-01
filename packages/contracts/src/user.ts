/** Safe representation of a user exposed through the API (never includes the password hash). */
export interface AuthUser {
  id: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}