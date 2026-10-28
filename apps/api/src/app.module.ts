import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import { validateEnv } from "./config/env";
import { IdentityModule } from "./identity/identity.module";
import { CatalogModule } from "./catalog/catalog.module";
import { IntegrationsModule } from "./integrations/integrations.module";
import { HealthController } from "./platform/health.controller";
import { PlatformModule } from "./platform/platform.module";
import { RuntimeModule } from "./runtime/runtime.module";
import { WorkspaceModule } from "./workspace/workspace.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env", "../../.env"],
      validate: validateEnv,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? "info",
        redact: [
          "req.headers.authorization",
          "req.headers.cookie",
          "res.headers['set-cookie']",
        ],
      },
    }),
    PlatformModule,
    IdentityModule,
    WorkspaceModule,
    CatalogModule,
    IntegrationsModule,
    RuntimeModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
