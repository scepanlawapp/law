import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app/app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const globalPrefix = "api";
  app.setGlobalPrefix(globalPrefix);
  app.enableCors({
    origin: process.env.AUTH_FRONTEND_ORIGIN ?? "http://localhost:4200",
    credentials: true,
  });
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  Logger.log(
    `Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
}

void bootstrap();
