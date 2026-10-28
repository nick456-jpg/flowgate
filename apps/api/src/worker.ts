import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";

async function bootstrap(): Promise<void> {
  process.env.RUNTIME_ROLE = "worker";
  const { AppModule } = await import("./app.module");

  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  app.get(Logger).log("FlowGate worker context ready");
}

bootstrap();
