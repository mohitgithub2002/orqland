// [HOST SHIM] Exists in the main codebase — do not copy.
// REST counterpart of GqlAuthGuard: the main codebase verifies the Firebase ID token for HTTP
// controllers. This harness accepts `Authorization: Bearer dev:<orq_users.id>`.
import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '@/infrastructure/database/drizzle.module';
import { orqUsers } from '@/infrastructure/database/schema';
import type { AuthUser } from '../decorators/current-user.decorator';

@Injectable()
export class HttpAuthGuard implements CanActivate {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token?.startsWith('dev:')) throw new UnauthorizedException('Missing or invalid token');

    const [user] = await this.db.select().from(orqUsers).where(eq(orqUsers.id, token.slice(4))).limit(1);
    if (!user || user.accountStatus !== 'ACTIVE') throw new UnauthorizedException('Unknown or inactive user');

    req.user = { id: user.id, firebaseUid: user.firebaseUid, orqUserId: user.orqUserId, roles: user.roles } satisfies AuthUser;
    return true;
  }
}
