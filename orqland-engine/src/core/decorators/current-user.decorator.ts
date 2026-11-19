// [HOST SHIM] Exists in the main codebase — do not copy.
// Contract relied on by the new modules: the decorator yields the authenticated ORQLAND user
// with its orq_users.id (uuid) as `id` and its `roles`.
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

export interface AuthUser {
  id: string;
  firebaseUid: string;
  orqUserId: string;
  roles: string[];
}

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthUser => {
  const ctx = GqlExecutionContext.create(context);
  return ctx.getContext().req.user as AuthUser;
});
