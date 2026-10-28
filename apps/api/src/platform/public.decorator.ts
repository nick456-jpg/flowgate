import { SetMetadata, createParamDecorator, type ExecutionContext } from "@nestjs/common";

export const IS_PUBLIC_KEY = "flowgate:isPublic";

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  sessionId: string;
};

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthUser => {
  return context.switchToHttp().getRequest<{ user: AuthUser }>().user;
});
