import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

@Injectable()
export class PasswordService {
  /** Hashes a plain-text password with Argon2. Plain text is never stored or logged. */
  hashPassword(password: string): Promise<string> {
    return hash(password);
  }

  /** Verifies a plain-text password against an Argon2 hash. */
  verifyPassword(passwordHash: string, password: string): Promise<boolean> {
    return verify(passwordHash, password);
  }
}