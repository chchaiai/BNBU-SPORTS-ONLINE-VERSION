import { Injectable, type OnModuleInit } from '@nestjs/common';
import { argon2id, hash, verify } from 'argon2';

@Injectable()
export class PasswordHasherService implements OnModuleInit {
  private dummyHash = '';

  async onModuleInit(): Promise<void> {
    this.dummyHash = await hash('synthetic-non-user-password', { type: argon2id });
  }

  hash(password: string): Promise<string> {
    return hash(password, { type: argon2id });
  }

  async verify(passwordHash: string | null, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash ?? this.dummyHash, password);
    } catch {
      return false;
    }
  }
}
