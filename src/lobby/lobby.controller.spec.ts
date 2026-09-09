import { Test, TestingModule } from '@nestjs/testing';
import { LobbyController } from './controllers/lobby.controller.js';

describe('LobbyController', () => {
  let controller: LobbyController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LobbyController],
    }).compile();

    controller = module.get<LobbyController>(LobbyController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
