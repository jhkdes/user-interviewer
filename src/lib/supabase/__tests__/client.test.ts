import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServerSupabaseClient } from "../client";

describe("createServerSupabaseClient", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("throws a clear error when SUPABASE_URL is missing", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    expect(() => createServerSupabaseClient()).toThrow(/SUPABASE_URL/);
  });

  it("throws a clear error when SUPABASE_SERVICE_ROLE_KEY is missing", () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    expect(() => createServerSupabaseClient()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("returns a client when both env vars are set", () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    expect(() => createServerSupabaseClient()).not.toThrow();
  });
});
