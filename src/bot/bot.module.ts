import { Module } from '@nestjs/common';
import { BotService } from './services/bot.service.js';

@Module({
  providers: [BotService]
})
export class BotModule {}
