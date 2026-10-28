import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Request, Response } from "express";
import { ZodError } from "zod";
import { problemType, type ProblemDetails } from "@flowgate/schema";

export class ProblemException extends HttpException {
  constructor(
    readonly statusCode: number,
    readonly title: string,
    readonly detail?: string,
    readonly errors?: Array<{ pointer: string; message: string }>,
    readonly slug = "error",
  ) {
    super({ title, detail, errors, slug }, statusCode);
  }
}

function pointerOf(path: Array<string | number>): string {
  return path.length === 0 ? "/" : `/${path.map(String).join("/")}`;
}

@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request & { id?: string }>();
    if (response.headersSent) {
      response.end();
      return;
    }

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let title = "服务器内部错误";
    let detail: string | undefined;
    let errors: Array<{ pointer: string; message: string }> | undefined;
    let slug = "internal-error";

    if (exception instanceof ZodError) {
      status = HttpStatus.UNPROCESSABLE_ENTITY;
      title = "请求参数不合法";
      detail = "请检查提交的字段。";
      slug = "validation";
      errors = exception.issues.map((issue) => ({
        pointer: pointerOf(issue.path),
        message: issue.message,
      }));
    } else if (exception instanceof ProblemException) {
      status = exception.statusCode;
      title = exception.title;
      detail = exception.detail;
      errors = exception.errors;
      slug = exception.slug;
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === "P2002") {
        status = HttpStatus.CONFLICT;
        title = "资源已存在";
        slug = "conflict";
      } else if (exception.code === "P2025") {
        status = HttpStatus.NOT_FOUND;
        title = "资源不存在";
        slug = "not-found";
      } else if (exception.code === "P2003") {
        status = HttpStatus.CONFLICT;
        title = "关联资源冲突";
        slug = "relation-conflict";
      }
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      title = exception.message || title;
      slug = status === 404 ? "not-found" : status === 401 ? "unauthenticated" : "http-error";
    }

    const problem: ProblemDetails = {
      type: problemType(slug),
      title,
      status,
      detail,
      instance: request.originalUrl,
      traceId: request.id,
      errors,
    };

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status);
    response.setHeader("Content-Type", "application/problem+json");
    response.json(problem);
  }
}
