// decorators/user.decorator.ts
import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { Socket } from "socket.io";

export const User = createParamDecorator((data: string | undefined, ctx: ExecutionContext) => {
    let user: any;

    switch (ctx.getType<"http" | "ws">()) {
        case "http": {
            const request = ctx.switchToHttp().getRequest();
            user = request["user"];
            break;
        }
        case "ws": {
            const client = ctx.switchToWs().getClient<Socket>();
            user = client.data?.user;
            break;
        }
    }

    return data && user ? user[data] : user;
});
