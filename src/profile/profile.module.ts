import { Module } from '@nestjs/common';
import { ProfileService } from './services/profile.service.js';
import { ProfileController } from './controllers/profile.controller.js';

@Module({
  providers: [ProfileService],
  controllers: [ProfileController]
})
export class ProfileModule {}
