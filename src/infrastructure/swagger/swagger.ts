import { DocumentBuilder } from "@nestjs/swagger";

export const swaggerConfig = new DocumentBuilder()
    .setTitle("Daberna")
    .setDescription("The daberna APIs in REST")
    .setVersion("1.0")
    .addTag("api")
    .build();
