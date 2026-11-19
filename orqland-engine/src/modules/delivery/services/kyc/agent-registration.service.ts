import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, ne, or, sql } from 'drizzle-orm';
import type { AuthUser } from '@/core/decorators/current-user.decorator';
import { DRIZZLE, type DrizzleDB } from '@/infrastructure/database/drizzle.module';
import {
  deliveryAgentProfiles,
  deliveryAgents,
  deliveryAgentVerifications,
  orqUsers,
  type KycCheckStatus,
  type KycCheckType,
  type KycTrigger,
  type VehicleCategory,
} from '@/infrastructure/database/schema';
import { isUniqueViolation, type DbExecutor, type DbTx } from '@/core/utils/db-executor';
import { AuditService } from '@/modules/orders/services/shared/audit.service';
import type { ChangeVehicleInput, RegisterDeliveryAgentInput } from '../../dto/inputs/agent-registration.inputs';
import type { DeliveryAgentProfileType } from '../../dto/types/agent.type';
import { assessAgentKyc } from '../../helpers/agent-eligibility';
import { deliveryConfig } from '@/config/delivery.config';
import {
  isPlausibleLicenceNumber,
  isPlausibleVehicleNumber,
  maskVehicleNumber,
  normalizeIdentifier,
} from '../../helpers/kyc-normalize';
import { addMonths } from '../../helpers/period';
import { AgentDirectoryService, displayNameOf, type AgentProfileRow } from '../agents/agent-directory.service';
import { DeliveryFilesService } from '../files/delivery-files.service';
import { DeliveryNotifierService } from '../notifications/delivery-notifier.service';
import { KycCryptoService } from './kyc-crypto.service';
import { evaluateLicence, evaluateVehicle, type CheckEvaluation } from './kyc-rules';
import { SurepassClient } from './surepass.client';

type CheckResults = Partial<Record<KycCheckType, CheckEvaluation>>;

const ATTEMPT_TO_CHECK_STATUS: Record<CheckEvaluation['status'], KycCheckStatus> = {
  PASSED: 'VERIFIED',
  FAILED: 'FAILED',
  MISMATCH: 'MISMATCH',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
};

/**
 * Module A/B — delivery agent registration, Surepass verification, DA fingerprint, role grant and re-KYC.
 * The ORQLAND account is never modified on failure; the DELIVERY_AGENT role is granted only when all checks pass.
 */
@Injectable()
export class AgentRegistrationService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly crypto: KycCryptoService,
    private readonly surepass: SurepassClient,
    private readonly audit: AuditService,
    private readonly notifier: DeliveryNotifierService,
    private readonly directory: AgentDirectoryService,
    private readonly files: DeliveryFilesService,
  ) {}

  async getMyProfile(user: AuthUser): Promise<DeliveryAgentProfileType | null> {
    const [row] = await this.db.select().from(deliveryAgentProfiles).where(eq(deliveryAgentProfiles.userId, user.id));
    return row ? this.toProfileType(row) : null;
  }

  async register(user: AuthUser, input: RegisterDeliveryAgentInput): Promise<DeliveryAgentProfileType> {
    const licence = normalizeIdentifier(input.licenceNumber);
    const vehicle = normalizeIdentifier(input.vehicleNumber);
    if (!isPlausibleLicenceNumber(licence)) throw new BadRequestException('Enter a valid driving licence number');
    if (!isPlausibleVehicleNumber(vehicle)) throw new BadRequestException('Enter a valid vehicle registration number');
    if (this.ageOn(input.dateOfBirth) < 18) throw new BadRequestException('Delivery agents must be at least 18 years old');

    const [account] = await this.db.select().from(orqUsers).where(eq(orqUsers.id, user.id));
    if (!account || account.accountStatus !== 'ACTIVE') throw new BadRequestException('Your Orqland account is not active');

    const [existing] = await this.db.select().from(deliveryAgentProfiles).where(eq(deliveryAgentProfiles.userId, user.id));
    if (existing && !['REJECTED', 'PENDING_VERIFICATION'].includes(existing.agentStatus)) {
      throw new ConflictException(
        existing.agentStatus === 'MANUAL_REVIEW'
          ? 'Your application is under review'
          : 'You are already registered. Use re-verification or vehicle change instead.',
      );
    }

    const fps = this.crypto.fingerprints(licence, vehicle);
    await this.assertNoDuplicates(user.id, fps);

    const values = {
      agentStatus: 'PENDING_VERIFICATION' as const,
      licenceNumberEnc: this.crypto.encrypt(licence),
      licenceNumberLast4: licence.slice(-4),
      licenceDobEnc: this.crypto.encrypt(input.dateOfBirth),
      licenceStatus: 'PENDING' as const,
      licenceValidTo: null,
      vehicleNumberEnc: this.crypto.encrypt(vehicle),
      vehicleNumberMasked: maskVehicleNumber(vehicle),
      vehicleCategory: input.vehicleCategory,
      vehicleStatus: 'PENDING' as const,
      vehicleRcValidTo: null,
      ...fps,
      licenceFrontFileId: input.licenceFrontFileId,
      licenceBackFileId: input.licenceBackFileId,
      vehicleRcFileId: input.vehicleRcFileId ?? null,
      consentVersion: deliveryConfig.consentVersion,
      consentGivenAt: new Date(),
      lastFailureReason: null,
    };
    try {
      await this.db.transaction(async (tx) => {
        await this.files.attach(tx, user.id, 'LICENCE_FRONT', [input.licenceFrontFileId]);
        await this.files.attach(tx, user.id, 'LICENCE_BACK', [input.licenceBackFileId]);
        await this.files.attach(tx, user.id, 'VEHICLE_RC', [input.vehicleRcFileId]);
        await tx
          .insert(deliveryAgentProfiles)
          .values({ userId: user.id, ...values })
          .onConflictDoUpdate({ target: deliveryAgentProfiles.userId, set: values });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw this.duplicateError();
      throw error;
    }

    const results = await this.runChecks(user.id, ['DRIVING_LICENCE', 'VEHICLE_RC'], 'REGISTRATION', {
      licence,
      dob: input.dateOfBirth,
      vehicle,
      category: input.vehicleCategory,
      expectedName: displayNameOf(account),
    });
    return this.finalizeRegistration(user.id, results);
  }

  /** Re-runs selected checks (re-KYC, or retry after a provider outage) using the stored encrypted identifiers. */
  async reverify(user: AuthUser, checks: KycCheckType[]): Promise<DeliveryAgentProfileType> {
    const profile = await this.requireProfile(user.id);
    if (!['ACTIVE', 'KYC_BLOCKED', 'PENDING_VERIFICATION'].includes(profile.agentStatus)) {
      throw new BadRequestException(`Re-verification is not available while your status is ${profile.agentStatus}`);
    }
    const [account] = await this.db.select().from(orqUsers).where(eq(orqUsers.id, user.id));
    const trigger: KycTrigger = profile.agentStatus === 'PENDING_VERIFICATION' ? 'REGISTRATION' : 'RE_KYC';
    const results = await this.runChecks(user.id, [...new Set(checks)], trigger, {
      licence: this.crypto.decrypt(profile.licenceNumberEnc),
      dob: this.crypto.decrypt(profile.licenceDobEnc),
      vehicle: this.crypto.decrypt(profile.vehicleNumberEnc),
      category: profile.vehicleCategory,
      expectedName: displayNameOf(account),
    });

    if (trigger === 'REGISTRATION') {
      const merged: CheckResults = {
        DRIVING_LICENCE: results.DRIVING_LICENCE ?? this.evaluationFromStatus(profile.licenceStatus, profile.licenceValidTo),
        VEHICLE_RC: results.VEHICLE_RC ?? this.evaluationFromStatus(profile.vehicleStatus, profile.vehicleRcValidTo),
      };
      return this.finalizeRegistration(user.id, merged);
    }
    return this.finalizeReKyc(user.id, results);
  }

  async changeVehicle(user: AuthUser, input: ChangeVehicleInput): Promise<DeliveryAgentProfileType> {
    const profile = await this.requireProfile(user.id);
    if (!['ACTIVE', 'KYC_BLOCKED'].includes(profile.agentStatus)) {
      throw new BadRequestException('Only verified agents can change their vehicle');
    }
    const load = (await this.directory.activeTaskCounts([user.id])).get(user.id) ?? 0;
    if (load > 0) throw new BadRequestException('Finish your active deliveries before changing vehicle');

    const licence = this.crypto.decrypt(profile.licenceNumberEnc);
    const vehicle = normalizeIdentifier(input.vehicleNumber);
    if (!isPlausibleVehicleNumber(vehicle)) throw new BadRequestException('Enter a valid vehicle registration number');
    const fps = this.crypto.fingerprints(licence, vehicle);
    await this.assertNoDuplicates(user.id, fps);

    const results = await this.runChecks(user.id, ['VEHICLE_RC'], 'VEHICLE_CHANGE', {
      licence,
      dob: '',
      vehicle,
      category: input.vehicleCategory,
      expectedName: '',
    });
    const evaluation = results.VEHICLE_RC!;
    if (evaluation.status !== 'PASSED') {
      throw new BadRequestException(evaluation.reason ?? 'The new vehicle could not be verified');
    }

    const now = new Date();
    try {
      await this.db.transaction(async (tx) => {
        await this.files.attach(tx, user.id, 'VEHICLE_RC', [input.vehicleRcFileId]);
        await tx
          .update(deliveryAgentProfiles)
          .set({
            ...(input.vehicleRcFileId ? { vehicleRcFileId: input.vehicleRcFileId } : {}),
            vehicleNumberEnc: this.crypto.encrypt(vehicle),
            vehicleNumberMasked: maskVehicleNumber(vehicle),
            vehicleCategory: input.vehicleCategory,
            vehicleStatus: 'VERIFIED',
            vehicleRcValidTo: evaluation.validTo,
            vehicleVerifiedAt: now,
            vehicleNextDueAt: addMonths(now, deliveryConfig.vehicleReKycMonths),
            ...fps,
          })
          .where(eq(deliveryAgentProfiles.userId, user.id));
        await tx
          .update(deliveryAgents)
          .set({ vehicleNumber: maskVehicleNumber(vehicle), updatedAt: now })
          .where(eq(deliveryAgents.userId, user.id));
        await this.recomputeStatus(tx, user.id);
        await this.audit.record(tx, {
          entityType: 'delivery_agent',
          entityId: user.id,
          action: 'agent.vehicle_changed',
          actorUserId: user.id,
          actorRole: 'AGENT',
          before: { vehicle: profile.vehicleNumberMasked, category: profile.vehicleCategory },
          after: { vehicle: maskVehicleNumber(vehicle), category: input.vehicleCategory },
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw this.duplicateError();
      throw error;
    }
    return this.toProfileType(await this.requireProfile(user.id));
  }

  /** Platform admin decision on an application in MANUAL_REVIEW. */
  async reviewDecision(admin: AuthUser, userId: string, approve: boolean, reason: string) {
    const profile = await this.requireProfile(userId);
    if (profile.agentStatus !== 'MANUAL_REVIEW') throw new BadRequestException('Application is not under manual review');
    await this.db.transaction(async (tx) => {
      if (approve) {
        const fix = (s: KycCheckStatus): KycCheckStatus => (s === 'MISMATCH' ? 'VERIFIED' : s);
        if (fix(profile.licenceStatus) !== 'VERIFIED' || fix(profile.vehicleStatus) !== 'VERIFIED') {
          throw new BadRequestException('Only name/category mismatches can be approved manually');
        }
        await this.activate(tx, profile, { licenceValidTo: profile.licenceValidTo, vehicleRcValidTo: profile.vehicleRcValidTo });
      } else {
        await tx
          .update(deliveryAgentProfiles)
          .set({ agentStatus: 'REJECTED', lastFailureReason: reason })
          .where(eq(deliveryAgentProfiles.userId, userId));
      }
      await this.audit.record(tx, {
        entityType: 'delivery_agent',
        entityId: userId,
        action: approve ? 'agent.review_approved' : 'agent.review_rejected',
        actorUserId: admin.id,
        actorRole: 'PLATFORM_ADMIN',
        reason,
      });
    });
    await this.notifier.send({
      userId,
      type: approve ? 'KYC_APPROVED' : 'KYC_REJECTED',
      title: approve ? 'You are now an Orqland delivery agent' : 'Delivery agent application declined',
      body: approve ? 'Orqland Run is now available in your account.' : reason,
    });
    return this.toProfileType(await this.requireProfile(userId));
  }

  /** Recomputes ACTIVE ⇄ KYC_BLOCKED from current check validity. Never touches SUSPENDED/REJECTED/etc. */
  async recomputeStatus(exec: DbExecutor, userId: string): Promise<void> {
    const [profile] = await exec.select().from(deliveryAgentProfiles).where(eq(deliveryAgentProfiles.userId, userId));
    if (!profile || !['ACTIVE', 'KYC_BLOCKED'].includes(profile.agentStatus)) return;
    const valid = assessAgentKyc({ ...profile, agentStatus: 'ACTIVE' }).valid;
    const next = valid ? 'ACTIVE' : 'KYC_BLOCKED';
    if (next !== profile.agentStatus) {
      await exec.update(deliveryAgentProfiles).set({ agentStatus: next }).where(eq(deliveryAgentProfiles.userId, userId));
    }
  }

  async toProfileType(row: AgentProfileRow): Promise<DeliveryAgentProfileType> {
    const [account] = await this.db.select().from(orqUsers).where(eq(orqUsers.id, row.userId));
    const verifications = await this.db
      .select()
      .from(deliveryAgentVerifications)
      .where(eq(deliveryAgentVerifications.userId, row.userId))
      .orderBy(desc(deliveryAgentVerifications.requestedAt))
      .limit(20);
    const kyc = assessAgentKyc(row, new Date(), deliveryConfig.reKycReminderDays);
    return {
      ...row,
      orqUserId: account.orqUserId,
      displayName: displayNameOf(account),
      eligibleForAssignments: kyc.valid,
      kycAlerts: row.agentStatus === 'ACTIVE' || row.agentStatus === 'KYC_BLOCKED' ? kyc.alerts : [],
      verifications,
    };
  }

  // ── internals ──────────────────────────────────────────────────────────

  private async runChecks(
    userId: string,
    checks: KycCheckType[],
    trigger: KycTrigger,
    ids: { licence: string; dob: string; vehicle: string; category: VehicleCategory; expectedName: string },
  ): Promise<CheckResults> {
    const results: CheckResults = {};
    for (const checkType of checks) {
      const [attempt] = await this.db
        .insert(deliveryAgentVerifications)
        .values({ userId, checkType, trigger, status: 'PENDING', requestedByUserId: userId })
        .returning({ id: deliveryAgentVerifications.id });

      let evaluation: CheckEvaluation;
      let reference: string | null;
      let httpStatus: number | null;
      let providerStatus: string | null = null;
      if (checkType === 'DRIVING_LICENCE') {
        const res = await this.surepass.verifyDrivingLicence(ids.licence, ids.dob, { holderName: ids.expectedName });
        evaluation = evaluateLicence(res, ids.expectedName, deliveryConfig.requireNameMatch);
        reference = res.reference;
        httpStatus = res.httpStatus;
      } else {
        const res = await this.surepass.verifyVehicleRc(ids.vehicle, { category: ids.category });
        evaluation = evaluateVehicle(res, ids.category);
        reference = res.reference;
        httpStatus = res.httpStatus;
        providerStatus = res.rcStatus;
      }

      await this.db
        .update(deliveryAgentVerifications)
        .set({
          status: evaluation.status,
          providerReference: reference,
          providerHttpStatus: httpStatus,
          mismatchFields: evaluation.mismatchFields,
          responseSummary: {
            validTo: evaluation.validTo,
            providerStatus,
            nameMatch: checkType === 'DRIVING_LICENCE' ? !evaluation.mismatchFields.includes('holder_name') : null,
            categoryMatch: checkType === 'VEHICLE_RC' ? !evaluation.mismatchFields.includes('vehicle_category') : null,
            notes: evaluation.notes,
          },
          completedAt: new Date(),
        })
        .where(eq(deliveryAgentVerifications.id, attempt.id));
      results[checkType] = evaluation;
    }
    return results;
  }

  private async finalizeRegistration(userId: string, results: CheckResults): Promise<DeliveryAgentProfileType> {
    const dl = results.DRIVING_LICENCE!;
    const rc = results.VEHICLE_RC!;
    const statuses = [dl.status, rc.status];
    const reason = [dl.reason, rc.reason].filter(Boolean).join(' ') || null;

    const profile = await this.requireProfile(userId);
    await this.db.transaction(async (tx) => {
      const checkPatch = {
        licenceStatus: ATTEMPT_TO_CHECK_STATUS[dl.status],
        licenceValidTo: dl.validTo,
        vehicleStatus: ATTEMPT_TO_CHECK_STATUS[rc.status],
        vehicleRcValidTo: rc.validTo,
      };
      if (statuses.every((s) => s === 'PASSED')) {
        await this.activate(tx, profile, { licenceValidTo: dl.validTo, vehicleRcValidTo: rc.validTo });
        return;
      }
      const agentStatus = statuses.includes('FAILED')
        ? 'REJECTED'
        : statuses.includes('MISMATCH')
          ? 'MANUAL_REVIEW'
          : 'PENDING_VERIFICATION';
      await tx
        .update(deliveryAgentProfiles)
        .set({ ...checkPatch, agentStatus, lastFailureReason: reason })
        .where(eq(deliveryAgentProfiles.userId, userId));
    });

    const updated = await this.requireProfile(userId);
    if (updated.agentStatus === 'ACTIVE') {
      await this.notifier.send({
        userId,
        type: 'KYC_APPROVED',
        title: 'You are now an Orqland delivery agent',
        body: 'Orqland Run is ready. Accept a workspace invitation to start receiving deliveries.',
      });
    } else if (updated.agentStatus === 'REJECTED') {
      await this.notifier.send({ userId, type: 'KYC_REJECTED', title: 'Verification failed', body: reason ?? '' });
    } else if (updated.agentStatus === 'MANUAL_REVIEW') {
      await this.notifier.send({ userId, type: 'KYC_MANUAL_REVIEW', title: 'Application under review', body: reason ?? '' });
    }
    return this.toProfileType(updated);
  }

  private async finalizeReKyc(userId: string, results: CheckResults): Promise<DeliveryAgentProfileType> {
    const now = new Date();
    await this.db.transaction(async (tx) => {
      const patch: Partial<AgentProfileRow> = {};
      const dl = results.DRIVING_LICENCE;
      const rc = results.VEHICLE_RC;
      // A provider outage never downgrades a still-valid check.
      if (dl && dl.status !== 'PROVIDER_UNAVAILABLE') {
        patch.licenceStatus = ATTEMPT_TO_CHECK_STATUS[dl.status];
        patch.licenceValidTo = dl.validTo;
        if (dl.status === 'PASSED') {
          patch.licenceVerifiedAt = now;
          patch.licenceNextDueAt = addMonths(now, deliveryConfig.licenceReKycMonths);
        }
      }
      if (rc && rc.status !== 'PROVIDER_UNAVAILABLE') {
        patch.vehicleStatus = ATTEMPT_TO_CHECK_STATUS[rc.status];
        patch.vehicleRcValidTo = rc.validTo;
        if (rc.status === 'PASSED') {
          patch.vehicleVerifiedAt = now;
          patch.vehicleNextDueAt = addMonths(now, deliveryConfig.vehicleReKycMonths);
        }
      }
      const failures = [dl, rc].filter((r) => r && r.status !== 'PASSED').map((r) => r!.reason);
      patch.lastFailureReason = failures.length ? failures.join(' ') : null;
      await tx.update(deliveryAgentProfiles).set(patch).where(eq(deliveryAgentProfiles.userId, userId));
      await this.recomputeStatus(tx, userId);
    });
    return this.toProfileType(await this.requireProfile(userId));
  }

  /** All checks passed: verify profile, create/refresh the delivery_agents row, grant the role, start OFFLINE. */
  private async activate(tx: DbTx, profile: AgentProfileRow, validity: { licenceValidTo: string | null; vehicleRcValidTo: string | null }) {
    const now = new Date();
    await tx
      .update(deliveryAgentProfiles)
      .set({
        agentStatus: 'ACTIVE',
        availability: 'OFFLINE',
        licenceStatus: 'VERIFIED',
        licenceValidTo: validity.licenceValidTo,
        licenceVerifiedAt: now,
        licenceNextDueAt: addMonths(now, deliveryConfig.licenceReKycMonths),
        vehicleStatus: 'VERIFIED',
        vehicleRcValidTo: validity.vehicleRcValidTo,
        vehicleVerifiedAt: now,
        vehicleNextDueAt: addMonths(now, deliveryConfig.vehicleReKycMonths),
        lastFailureReason: null,
        activatedAt: profile.activatedAt ?? now,
      })
      .where(eq(deliveryAgentProfiles.userId, profile.userId));

    // delivery_agents.driving_license_image_url points at the engine's authorised download route,
    // never at a public bucket URL (KYC images are private).
    const licenceImageRef = profile.licenceFrontFileId ? `/delivery/files/${profile.licenceFrontFileId}` : null;
    await tx
      .insert(deliveryAgents)
      .values({ userId: profile.userId, vehicleNumber: profile.vehicleNumberMasked, drivingLicenseImageUrl: licenceImageRef })
      .onConflictDoUpdate({
        target: deliveryAgents.userId,
        set: { vehicleNumber: profile.vehicleNumberMasked, drivingLicenseImageUrl: licenceImageRef, updatedAt: now },
      });

    await tx
      .update(orqUsers)
      .set({ roles: sql`array_append(${orqUsers.roles}, 'DELIVERY_AGENT')` })
      .where(and(eq(orqUsers.id, profile.userId), sql`NOT ('DELIVERY_AGENT' = ANY(${orqUsers.roles}))`));

    await this.audit.record(tx, {
      entityType: 'delivery_agent',
      entityId: profile.userId,
      action: 'agent.activated',
      actorUserId: null,
      actorRole: 'SYSTEM',
      after: { role: 'DELIVERY_AGENT' },
    });
  }

  private async assertNoDuplicates(userId: string, fps: { licenceFp: string; vehicleFp: string; combinedFp: string }) {
    const conflicts = await this.db
      .select({
        licenceFp: deliveryAgentProfiles.licenceFp,
        vehicleFp: deliveryAgentProfiles.vehicleFp,
        combinedFp: deliveryAgentProfiles.combinedFp,
      })
      .from(deliveryAgentProfiles)
      .where(
        and(
          ne(deliveryAgentProfiles.userId, userId),
          // Rejected applications never block anyone (prevents squatting on someone else's licence).
          ne(deliveryAgentProfiles.agentStatus, 'REJECTED'),
          or(
            eq(deliveryAgentProfiles.licenceFp, fps.licenceFp),
            eq(deliveryAgentProfiles.vehicleFp, fps.vehicleFp),
            eq(deliveryAgentProfiles.combinedFp, fps.combinedFp),
          ),
        ),
      );
    if (conflicts.some((c) => c.combinedFp === fps.combinedFp || c.licenceFp === fps.licenceFp)) {
      throw this.duplicateError();
    }
    if (!deliveryConfig.allowSharedVehicle && conflicts.some((c) => c.vehicleFp === fps.vehicleFp)) {
      throw new ConflictException({
        code: 'DUPLICATE_VEHICLE',
        message: 'This vehicle is already registered to another delivery agent.',
      });
    }
  }

  private duplicateError() {
    return new ConflictException({
      code: 'DUPLICATE_AGENT',
      message: 'This driving licence is already registered with another Orqland account.',
    });
  }

  private evaluationFromStatus(status: KycCheckStatus, validTo: string | null): CheckEvaluation {
    const map: Partial<Record<KycCheckStatus, CheckEvaluation['status']>> = {
      VERIFIED: 'PASSED',
      MISMATCH: 'MISMATCH',
      FAILED: 'FAILED',
    };
    return { status: map[status] ?? 'PROVIDER_UNAVAILABLE', mismatchFields: [], reason: null, validTo, notes: [] };
  }

  private async requireProfile(userId: string): Promise<AgentProfileRow> {
    const [row] = await this.db.select().from(deliveryAgentProfiles).where(eq(deliveryAgentProfiles.userId, userId));
    if (!row) throw new NotFoundException('Delivery agent profile not found');
    return row;
  }

  private ageOn(dob: string): number {
    const birth = new Date(`${dob}T00:00:00Z`);
    const now = new Date();
    let age = now.getUTCFullYear() - birth.getUTCFullYear();
    if (now.getUTCMonth() < birth.getUTCMonth() || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate())) age--;
    return age;
  }
}

