// src/app.service.ts
import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): any {
    return {
      success: true,
      message: 'Affinity Echo Backend v1.0.0',
      docs: '/docs',
      fortress: 'UNBREAKABLE',
    };
  }
}
