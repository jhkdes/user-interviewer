/**
 * A well-formed but never-generated UUID, used across contract tests for
 * "no record with this id" assertions. Real UUID-typed columns (Postgres)
 * reject arbitrary non-UUID strings as a query error rather than returning
 * no rows, so an ordinary-looking placeholder like "does-not-exist" only
 * works against the in-memory fakes — this value behaves identically
 * against both.
 */
export const NONEXISTENT_ID = "00000000-0000-0000-0000-000000000000";
