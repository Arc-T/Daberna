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
    await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
