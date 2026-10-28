import { PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";

export class ZodPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown): unknown {
    return this.schema.parse(value);
  }
}
