// [HOST SHIM] Exists in the main codebase — do not copy.
// On merge, add only the three lines marked "Orders & Delivery" to your AppModule.
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ScheduleModule } from '@nestjs/schedule'; // Orders & Delivery
import { join } from 'path';
import appConfig from './config/app.config';
import deliveryConfig from './config/delivery.config'; // Orders & Delivery
import ordersConfig from './config/orders.config'; // Orders & Delivery
import { DrizzleModule } from './infrastructure/database/drizzle.module';
import { DeliveryModule } from './modules/delivery/delivery.module'; // Orders & Delivery
import { OrdersModule } from './modules/orders/orders.module'; // Orders & Delivery

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [appConfig, ordersConfig, deliveryConfig] }),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'schema.gql'),
      sortSchema: true,
      context: ({ req }: { req: unknown }) => ({ req }),
    }),
    ScheduleModule.forRoot(), // Orders & Delivery (skip if already registered)
    DrizzleModule,
    OrdersModule,
    DeliveryModule,
  ],
})
export class AppModule {}
