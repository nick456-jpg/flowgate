import { Module } from "@nestjs/common";
import { AccessService } from "./access.service";
import { ProjectsController, WorkspacesController } from "./workspaces.controller";

@Module({
  controllers: [WorkspacesController, ProjectsController],
  providers: [AccessService],
  exports: [AccessService],
})
export class WorkspaceModule {}
