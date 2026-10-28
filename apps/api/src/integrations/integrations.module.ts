import { Module } from "@nestjs/common";
import { HttpClient } from "./http.client";
import { LlmClient } from "./llm.client";

@Module({
  providers: [LlmClient, HttpClient],
  exports: [LlmClient, HttpClient],
})
export class IntegrationsModule {}
