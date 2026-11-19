import { Module } from '@nestjs/common';
import { OrderPaymentHoldJob } from './jobs/order-payment-hold.job';
import { CustomerOrdersResolver } from './resolvers/customer-orders.resolver';
import { OrderFieldsResolver } from './resolvers/order-fields.resolver';
import { WorkspaceOrdersResolver } from './resolvers/workspace-orders.resolver';
import { OrderActionsService } from './services/lifecycle/order-actions.service';
import { OrderInventoryService } from './services/lifecycle/order-inventory.service';
import { OrderLifecycleService } from './services/lifecycle/order-lifecycle.service';
import { OrderPaymentsService } from './services/lifecycle/order-payments.service';
import { OrderPlacementService } from './services/lifecycle/order-placement.service';
import { OrdersQueryService } from './services/orders-query.service';
import { AuditService } from './services/shared/audit.service';
import { OrqspaceAccessService } from './services/shared/orqspace-access.service';

@Module({
  providers: [
    OrqspaceAccessService,
    AuditService,
    OrderInventoryService,
    OrderPaymentsService,
    OrderLifecycleService,
    OrderPlacementService,
    OrderActionsService,
    OrdersQueryService,
    OrderPaymentHoldJob,
    WorkspaceOrdersResolver,
    CustomerOrdersResolver,
    OrderFieldsResolver,
  ],
  exports: [OrqspaceAccessService, AuditService, OrderLifecycleService, OrderPaymentsService, OrdersQueryService],
})
export class OrdersModule {}
