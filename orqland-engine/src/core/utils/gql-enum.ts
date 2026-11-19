import { registerEnumType } from '@nestjs/graphql';

/** Builds a GraphQL enum from a Drizzle pgEnum's values so the database stays the single source of truth. */
export function gqlEnumFrom<T extends string>(values: readonly T[], name: string): { [K in T]: K } {
  const enumObject = Object.fromEntries(values.map((v) => [v, v])) as { [K in T]: K };
  registerEnumType(enumObject, { name });
  return enumObject;
}
