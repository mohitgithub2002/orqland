// [HOST SHIM] Integration point — map to your Firebase client: `Bearer ${await auth.currentUser.getIdToken()}`.
// Used for the engine's REST upload/download routes (GraphQL already goes through graphqlClient).
import { DEV_USER_KEY } from './graphqlClient';

export async function getAuthorizationHeader(): Promise<string> {
  const userId = typeof window !== 'undefined' ? window.localStorage.getItem(DEV_USER_KEY) : null;
  return `Bearer dev:${userId ?? ''}`;
}

/** Engine origin derived from the GraphQL endpoint (e.g. http://localhost:4000). */
export const ENGINE_ORIGIN = (process.env.NEXT_PUBLIC_GRAPHQL_URL ?? 'http://localhost:4000/graphql').replace(/\/graphql\/?$/, '');
