import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { WsException } from "@nestjs/websockets";
import { Socket } from "socket.io";
import { Request } from "express";
import { IS_PUBLIC_KEY } from "../decorators/skipt-auth.decorator.js";

@Injectable()
export class AuthGuard implements CanActivate {
    constructor(
        private readonly jwtService: JwtService,
        private readonly reflector: Reflector
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass()
        ]);
        if (isPublic) return true;

        // 2. Branch by transport
        switch (context.getType<"http" | "ws">()) {
            case "http":
                return this.handleHttp(context);
            case "ws":
                return this.handleWs(context);
            default:
                return true;
        }
    }

    // ─── HTTP ────────────────────────────────────────────────────────────
    private async handleHttp(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const token = this.extractTokenFromHeader(request);

        if (!token) throw new UnauthorizedException("دسترسی غیر مجاز");

        try {
            request["user"] = await this.jwtService.verifyAsync(token);
            return true;
        } catch {
            throw new UnauthorizedException("دسترسی غیر مجاز");
        }
    }

    private extractTokenFromHeader(request: Request): string | undefined {
        const [type, token] = request.headers.authorization?.split(" ") ?? [];
        return type === "Bearer" ? token : undefined;
    }

    // ─── WS ──────────────────────────────────────────────────────────────
    private async handleWs(context: ExecutionContext): Promise<boolean> {
        const client = context.switchToWs().getClient<Socket>();

        // Already verified during handshake middleware? Trust it.
        if (client.data?.user) return true;

        const token = this.extractTokenFromSocket(client);
        if (!token) throw new WsException("دسترسی غیر مجاز");

        try {
            client.data.user = await this.jwtService.verifyAsync(token);
            return true;
        } catch {
            throw new WsException("دسترسی غیر مجاز");
        }
    }

    private extractTokenFromSocket(client: Socket): string | undefined {
        const authToken = client.handshake.auth?.token;
        if (authToken) return authToken;

        const [type, token] = client.handshake.headers.authorization?.split(" ") ?? [];
        return type === "Bearer" ? token : undefined;
    }
}
