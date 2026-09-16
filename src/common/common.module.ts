import { Global, Module } from "@nestjs/common";
import { PasswordService } from "./services/password.service.js";

@Global()
@Module({
    providers: [PasswordService],
    exports: [PasswordService]
})
export class CommonModule {}
