import { registerAs } from '@nestjs/config';

const num = (name: string, fallback: number) => {
  const raw = process.env[name];
  const value = raw === undefined || raw === '' ? NaN : Number(raw);
  return Number.isFinite(value) ? value : fallback;
};

/** Configuration for the Orders module. */
export const ordersConfig = {
  /**
   * ONLINE orders still unpaid and not yet accepted this many minutes after placement are cancelled by the system and
   * their reserved stock is released ("failed or expired payments"). 0 disables the rule.
   */
  paymentHoldMinutes: num('ORDER_PAYMENT_HOLD_MINUTES', 60),
  /** SLA target for a workspace to accept a new order, used by the operations overview. */
  slaAcceptMinutes: num('ORDER_SLA_ACCEPT_MINUTES', 15),
  /** Default preparation time offered when the workspace accepts / starts preparing an order. */
  defaultPreparationMinutes: num('ORDER_DEFAULT_PREPARATION_MINUTES', 15),
  /** Each "+N min" press extends the preparation timer by this much. */
  preparationExtensionMinutes: num('ORDER_PREPARATION_EXTENSION_MINUTES', 2),
  /** Customers can request a return for this many hours after delivery / pickup (0 = no limit). */
  returnWindowHours: num('ORDER_RETURN_WINDOW_HOURS', 48),
  /** How far ahead a customer can schedule a delivery or pickup. */
  maxScheduleDays: num('ORDER_MAX_SCHEDULE_DAYS', 14),
};

export type OrdersConfig = typeof ordersConfig;

export default registerAs('orders', () => ordersConfig);
