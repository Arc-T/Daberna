import { Catch, ArgumentsHost, WsExceptionFilter as IWsExceptionFilter } from "@nestjs/common";
import { WsException } from "@nestjs/websockets";

@Catch(WsException)
export class WsExceptionFilter implements IWsExceptionFilter {
    catch(exception: WsException, host: ArgumentsHost) {
        const client = host.switchToWs().getClient();
        const error = exception.getError();
        client.emit("exception", { status: "error", message: error });
    }
}
