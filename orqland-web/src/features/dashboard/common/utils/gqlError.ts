/** Extracts a readable message from graphql-request errors (falls back to the JS error message). */
export function gqlErrorMessage(error: unknown): string {
  const response = (error as { response?: { errors?: { message: string }[] } })?.response;
  return response?.errors?.[0]?.message ?? (error as Error)?.message ?? 'Something went wrong';
}
