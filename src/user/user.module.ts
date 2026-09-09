import { Module } from "@nestjs/common";
import { UserService } from "./services/user.service.js";
import { UserRepository } from "./repositories/user.repository.js";

@Module({
    providers: [UserService, UserRepository],
    exports: [UserService, UserRepository]
})
export class UserModule {}
