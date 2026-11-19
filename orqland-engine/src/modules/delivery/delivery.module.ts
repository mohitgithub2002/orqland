import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { DeliveryFilesController } from './controllers/delivery-files.controller';
import { AgentAdminResolver, AgentRegistrationResolver } from './resolvers/agent-registration.resolver';
import {
  AgentConnectionFieldsResolver,
  DeliveryTaskFieldsResolver,
  OrderDeliveryFieldsResolver,
} from './resolvers/delivery-fields.resolver';
import { RunResolver } from './resolvers/run.resolver';
import { AgentSupportResolver, DeliveryNotificationsResolver, PlatformDeliveryAdminResolver } from './resolvers/support.resolver';
import { WorkspaceDeliveryFinanceResolver } from './resolvers/workspace-delivery-finance.resolver';
import { WorkspaceDeliveryResolver } from './resolvers/workspace-delivery.resolver';
import { AgentAvailabilityService } from './services/agents/agent-availability.service';
import { AgentDirectoryService } from './services/agents/agent-directory.service';
import { CodService } from './services/cod/cod.service';
import { ConnectionsService } from './services/connections/connections.service';
import { EarningsService } from './services/earnings/earnings.service';
import { StatementsService } from './services/earnings/statements.service';
import { AgentAdminService } from './services/kyc/agent-admin.service';
import { AgentRegistrationService } from './services/kyc/agent-registration.service';
import { KycCryptoService } from './services/kyc/kyc-crypto.service';
import { ReKycJob } from './services/kyc/re-kyc.job';
import { SurepassClient } from './services/kyc/surepass.client';
import { DELIVERY_FILE_STORAGE, LocalEncryptedFileStorage } from './services/files/delivery-file-storage';
import { DeliveryFilesService } from './services/files/delivery-files.service';
import { DeliveryNotifierService } from './services/notifications/delivery-notifier.service';
import { NotificationPreferencesService } from './services/notifications/notification-preferences.service';
import { NotificationsQueryService } from './services/notifications/notifications-query.service';
import { DeliveryOperationsService } from './services/operations/delivery-operations.service';
import { RunHomeService } from './services/run/run-home.service';
import { SupportService } from './services/support/support.service';
import { DeliverySettingsService } from './services/settings/delivery-settings.service';
import { AgentTaskActionsService } from './services/tasks/agent-task-actions.service';
import { AssignmentEngineService } from './services/tasks/assignment-engine.service';
import { DeliveryJobs } from './services/tasks/delivery-jobs';
import { DeliveryOtpService } from './services/tasks/delivery-otp.service';
import { DispatchService } from './services/tasks/dispatch.service';
import { TaskQueryService } from './services/tasks/task-query.service';
import { TaskTransitionsService } from './services/tasks/task-transitions.service';
import { TrackingService } from './services/tracking/tracking.service';

/**
 * Delivery agent registration/KYC, workspace connections, dispatch & assignment, Orqland Run,
 * live tracking, COD and earnings. Requires ScheduleModule.forRoot() once in AppModule.
 */
@Module({
  imports: [OrdersModule],
  controllers: [DeliveryFilesController],
  providers: [
    DeliveryNotifierService,
    KycCryptoService,
    // Swap for a GCP-bucket implementation of DeliveryFileStorage on merge (see MERGE_GUIDE.md).
    { provide: DELIVERY_FILE_STORAGE, useClass: LocalEncryptedFileStorage },
    DeliveryFilesService,
    SurepassClient,
    AgentDirectoryService,
    AgentAvailabilityService,
    AgentRegistrationService,
    AgentAdminService,
    ReKycJob,
    DeliverySettingsService,
    ConnectionsService,
    TrackingService,
    CodService,
    EarningsService,
    StatementsService,
    DeliveryOtpService,
    TaskTransitionsService,
    AssignmentEngineService,
    TaskQueryService,
    DispatchService,
    AgentTaskActionsService,
    DeliveryJobs,
    NotificationsQueryService,
    NotificationPreferencesService,
    SupportService,
    RunHomeService,
    DeliveryOperationsService,
    AgentRegistrationResolver,
    AgentAdminResolver,
    WorkspaceDeliveryResolver,
    WorkspaceDeliveryFinanceResolver,
    RunResolver,
    DeliveryTaskFieldsResolver,
    AgentConnectionFieldsResolver,
    OrderDeliveryFieldsResolver,
    DeliveryNotificationsResolver,
    AgentSupportResolver,
    PlatformDeliveryAdminResolver,
  ],
})
export class DeliveryModule {}
