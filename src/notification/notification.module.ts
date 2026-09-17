import { Global, Module } from "@nestjs/common";
import { NotificationService } from "./services/notification.service.js";

@Global()
@Module({
    providers: [NotificationService],
    exports: [NotificationService],
})
export class NotificationModule {}