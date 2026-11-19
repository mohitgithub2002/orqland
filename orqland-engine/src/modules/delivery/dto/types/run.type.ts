import { Field, Int, ObjectType } from '@nestjs/graphql';
import { DeliveryAgentProfileType } from './agent.type';
import { AgentConnectionType } from './connection.type';
import { AgentOfferType, DeliveryTaskType } from './delivery-task.type';
import { AgentEarningsWindowType } from './finance.type';

/** Everything the Orqland Run home screen needs in one round trip. */
@ObjectType('RunHome')
export class RunHomeType {
  @Field(() => DeliveryAgentProfileType) profile: DeliveryAgentProfileType;
  @Field(() => [DeliveryTaskType]) activeTasks: DeliveryTaskType[];
  @Field(() => [AgentOfferType]) openOffers: AgentOfferType[];
  @Field(() => [AgentConnectionType]) invitations: AgentConnectionType[];
  @Field(() => [AgentConnectionType]) connections: AgentConnectionType[];
  @Field(() => AgentEarningsWindowType) today: AgentEarningsWindowType;
  @Field(() => Int) connectionLimit: number;
  @Field(() => Int) unreadNotifications: number;
}
