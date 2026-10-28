import { Module } from "@nestjs/common";
import { IntegrationsModule } from "../integrations/integrations.module";
import { WorkspaceModule } from "../workspace/workspace.module";
import { DispatcherService } from "./dispatcher.service";
import { ExecutorService } from "./executor.service";
import { HistoryService } from "./history.service";
import { JournalService } from "./journal.service";
import { RunWorkerService } from "./run-worker.service";
import { RunsController } from "./runs.controller";
import { RunsService } from "./runs.service";
import { StepRunner } from "./step-runner.service";
import { StreamController } from "./stream.controller";

@Module({
  imports: [WorkspaceModule, IntegrationsModule],
  controllers: [RunsController, StreamController],
  providers: [
    JournalService,
    HistoryService,
    DispatcherService,
    StepRunner,
    ExecutorService,
    RunWorkerService,
    RunsService,
  ],
  exports: [JournalService, HistoryService, DispatcherService],
})
export class RuntimeModule {}
