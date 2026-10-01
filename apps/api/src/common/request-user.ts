/** Minimal authenticated principal attached to the request by the access guard. */
export interface RequestUser {
  id: string;
  email: string;
}