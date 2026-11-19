import { BadRequestException, UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CurrentUser, type AuthUser } from '@/core/decorators/current-user.decorator';
import { GqlAuthGuard } from '@/core/guards/gql-auth.guard';
import {
  AdjustEarningInput,
  ApproveEarningInput,
  CodFilterInput,
  CostReportInput,
  EarningsFilterInput,
  MarkEarningsPaidInput,
  RecordCodSettlementInput,
  ResolveCodInput,
} from '../dto/inputs/finance.inputs';
import { CodRecordType, CodSummaryType, DeliveryCostReportType, DeliveryEarningType, DeliveryStatementType } from '../dto/types/finance.type';
import { PERIOD_PATTERN } from '../dto/inputs/settings.inputs';
import { CodService } from '../services/cod/cod.service';
import { EarningsService } from '../services/earnings/earnings.service';
import { StatementsService } from '../services/earnings/statements.service';

/** COD reconciliation and delivery cost reports for the Delivery Management page. */
@Resolver()
@UseGuards(GqlAuthGuard)
export class WorkspaceDeliveryFinanceResolver {
  constructor(
    private readonly cod: CodService,
    private readonly earnings: EarningsService,
    private readonly statements: StatementsService,
  ) {}

  /** Monthly statements for every agent who delivered for the workspace in the period. */
  @Query(() => [DeliveryStatementType])
  orqspaceDeliveryStatements(
    @CurrentUser() user: AuthUser,
    @Args('orqspaceId', { type: () => ID }) orqspaceId: string,
    @Args('periodMonth') periodMonth: string,
  ) {
    if (!PERIOD_PATTERN.test(periodMonth)) throw new BadRequestException('Period must be YYYY-MM');
    return this.statements.listForWorkspace(user, orqspaceId, periodMonth);
  }

  @Query(() => [CodRecordType])
  orqspaceCodRecords(@CurrentUser() user: AuthUser, @Args('filter') filter: CodFilterInput) {
    return this.cod.list(user, filter);
  }

  @Query(() => CodSummaryType)
  orqspaceCodSummary(@CurrentUser() user: AuthUser, @Args('orqspaceId', { type: () => ID }) orqspaceId: string) {
    return this.cod.summary(user, orqspaceId);
  }

  @Mutation(() => CodRecordType)
  recordCodSettlement(@CurrentUser() user: AuthUser, @Args('input') input: RecordCodSettlementInput) {
    return this.cod.recordSettlement(user, input);
  }

  @Mutation(() => CodRecordType)
  resolveCodRecord(@CurrentUser() user: AuthUser, @Args('input') input: ResolveCodInput) {
    return this.cod.resolve(user, input);
  }

  @Query(() => [DeliveryEarningType])
  orqspaceDeliveryEarnings(@CurrentUser() user: AuthUser, @Args('filter') filter: EarningsFilterInput) {
    return this.earnings.list(user, filter);
  }

  @Query(() => DeliveryCostReportType)
  orqspaceDeliveryCostReport(@CurrentUser() user: AuthUser, @Args('input') input: CostReportInput) {
    return this.earnings.costReport(user, input);
  }

  @Mutation(() => DeliveryEarningType)
  approveDeliveryEarning(@CurrentUser() user: AuthUser, @Args('input') input: ApproveEarningInput) {
    return this.earnings.approve(user, input);
  }

  @Mutation(() => DeliveryEarningType)
  adjustDeliveryEarning(@CurrentUser() user: AuthUser, @Args('input') input: AdjustEarningInput) {
    return this.earnings.adjust(user, input);
  }

  @Mutation(() => [DeliveryEarningType])
  markDeliveryEarningsPaid(@CurrentUser() user: AuthUser, @Args('input') input: MarkEarningsPaidInput) {
    return this.earnings.markPaid(user, input);
  }
}
