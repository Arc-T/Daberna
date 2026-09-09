import { Module } from '@nestjs/common';
import { LobbyController } from './controllers/lobby.controller.js';

@Module({
  controllers: [LobbyController]
})
export class LobbyModule {}
