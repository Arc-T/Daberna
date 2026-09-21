import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { SwaggerModule } from "@nestjs/swagger";
import { swaggerConfig } from "./infrastructure/swagger/swagger.js";
import { ValidationPipe } from "@nestjs/common";

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    app.useGlobalPipes(new ValidationPipe());
    const documentFactory = () => SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("swagger", app, documentFactory);
    app.enableCors({
        origin: ["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"]
    });
    await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
