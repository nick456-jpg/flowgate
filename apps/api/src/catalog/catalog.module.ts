import { Module } from "@nestjs/common";
import { WorkspaceModule } from "../workspace/workspace.module";
import { CatalogService } from "./catalog.service";
import { PipelinesController } from "./pipelines.controller";

@Module({
  imports: [WorkspaceModule],
  controllers: [PipelinesController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
