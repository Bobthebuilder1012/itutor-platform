// Errors that mean "this migration has not been applied here", as opposed to a
// real failure. Staging and production run different migration sets, so a
// feature whose tables are missing has to behave as switched off rather than
// answer 500.
//
//   42P01     relation does not exist (Postgres)
//   42883     function does not exist (Postgres)
//   PGRST202  function not found in the schema cache (PostgREST)
//   PGRST205  table not found in the schema cache (PostgREST)

export function isMissingSchema(error: { code?: unknown; message?: unknown } | null | undefined): boolean {
  if (!error) return false;
  const code = String(error.code ?? '');
  const message = String(error.message ?? '').toLowerCase();
  return (
    code === '42P01' ||
    code === '42883' ||
    code === 'PGRST202' ||
    code === 'PGRST205' ||
    message.includes('does not exist') ||
    message.includes('could not find')
  );
}
