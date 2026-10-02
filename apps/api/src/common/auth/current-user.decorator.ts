import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { Request } from "express";
import { UserContext } from "./user-context";

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): UserContext => {
    const request = context.switchToHttp().getRequest<Request & { user: UserContext }>();
    return request.user;
  }
);
