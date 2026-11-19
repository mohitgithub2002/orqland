import type { deliveryAgentProfiles } from '@/infrastructure/database/schema';

type Profile = typeof deliveryAgentProfiles.$inferSelect;

export interface KycAssessment {
  valid: boolean;
  reasons: string[];
  alerts: string[];
}

const DAY_MS = 86_400_000;

/** Single definition of "may receive new delivery work", used by search, assignment and the Run app. */
export function assessAgentKyc(profile: Profile, now = new Date(), reminderDays = 15): KycAssessment {
  const reasons: string[] = [];
  const alerts: string[] = [];

  if (profile.agentStatus !== 'ACTIVE') reasons.push(`Agent status is ${profile.agentStatus}`);
  if (profile.licenceStatus !== 'VERIFIED') reasons.push('Driving licence is not verified');
  if (profile.vehicleStatus !== 'VERIFIED') reasons.push('Vehicle registration is not verified');

  const checkDue = (label: string, due: Date | null) => {
    if (!due) return;
    const days = Math.ceil((due.getTime() - now.getTime()) / DAY_MS);
    if (days <= 0) reasons.push(`${label} re-verification is overdue`);
    else if (days <= reminderDays) alerts.push(`${label} re-verification due in ${days} day${days === 1 ? '' : 's'}`);
  };
  checkDue('Driving licence', profile.licenceNextDueAt);
  checkDue('Vehicle', profile.vehicleNextDueAt);

  const today = now.toISOString().slice(0, 10);
  if (profile.licenceValidTo && profile.licenceValidTo < today) reasons.push('Driving licence has expired');
  if (profile.vehicleRcValidTo && profile.vehicleRcValidTo < today) reasons.push('Vehicle registration has expired');

  return { valid: reasons.length === 0, reasons, alerts: [...reasons, ...alerts] };
}
