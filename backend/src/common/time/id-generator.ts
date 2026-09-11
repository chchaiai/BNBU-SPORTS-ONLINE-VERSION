import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

export abstract class IdGenerator {
  abstract next(): string;
}

@Injectable()
export class UuidV7Generator extends IdGenerator {
  next(): string {
    return uuidv7();
  }
}
