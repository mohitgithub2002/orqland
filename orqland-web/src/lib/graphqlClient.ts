// [HOST SHIM] Exists in the main codebase — do not copy.
// The real client attaches the Firebase ID token. This harness sends `Bearer dev:<orq_users.id>`
// from localStorage so you can switch between seeded users with the dev switcher.
import { GraphQLClient } from 'graphql-request';

export const DEV_USER_KEY = 'orq.devUserId';

export const graphqlClient = new GraphQLClient(process.env.NEXT_PUBLIC_GRAPHQL_URL ?? 'http://localhost:4000/graphql', {
  requestMiddleware: async (request) => {
    const userId = typeof window !== 'undefined' ? window.localStorage.getItem(DEV_USER_KEY) : null;
    const headers = new Headers(request.headers as HeadersInit);
    headers.set('Authorization', `Bearer dev:${userId ?? ''}`);
    return { ...request, headers };
  },
});
