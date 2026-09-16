import { Module } from '@nestjs/common';
import { MatchService } from './match.service.js';

@Module({
  providers: [MatchService]
})
export class MatchModule {}
