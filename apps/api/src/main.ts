import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app/app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const globalPrefix = "api";
  app.setGlobalPrefix(globalPrefix);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  const config = app.get(ConfigService);
  const frontendOrigin =
    config.get<string>("AUTH_FRONTEND_ORIGIN") ?? "http://localhost:4200";
  const allowedOrigins = [frontendOrigin];
  const frontendUrl = new URL(frontendOrigin);
  if (
    frontendUrl.hostname === "localhost" ||
    frontendUrl.hostname === "127.0.0.1"
  ) {
    frontendUrl.hostname =
      frontendUrl.hostname === "localhost" ? "127.0.0.1" : "localhost";
    allowedOrigins.push(frontendUrl.origin);
  }
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });
  const port = config.get<number>("PORT", 3000);
  await app.listen(port);
  Logger.log(
    `Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
}

void bootstrap();
