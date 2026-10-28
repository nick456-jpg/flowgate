import "reflect-metadata";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { Logger } from "nestjs-pino";
import { ProblemFilter } from "./platform/problem";

async function bootstrap(): Promise<void> {
  process.env.RUNTIME_ROLE ??= "http";
  const { AppModule } = await import("./app.module");

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());

  const config = app.get(ConfigService);
  app.enableCors({
    origin: config.get<string>("WEB_ORIGIN"),
    credentials: true,
  });
  app.setGlobalPrefix("v1");
  app.useGlobalFilters(new ProblemFilter());
  app.enableShutdownHooks();

  const port = config.get<number>("API_PORT") ?? 3000;
  await app.listen(port);
}

bootstrap();
