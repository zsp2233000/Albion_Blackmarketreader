import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Region, UserProfile } from "../types";
import { normalizeRegion } from "../region/regions";

export interface AuthServiceConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export class AuthService {
  private readonly supabase: SupabaseClient;

  constructor(config: AuthServiceConfig) {
    this.supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
  }

  get client(): SupabaseClient {
    return this.supabase;
  }

  // The session (and its embedded user + user_metadata) lives in local storage and is
  // kept fresh by the GoTrue client. Reading it is local/cheap; `getUser()` by contrast
  // is a network round-trip to /auth/v1/user. We coalesce concurrent reads with a
  // single-flight promise so a page mount (AuthGuard + page + specs hook firing together)
  // resolves from ONE getSession instead of several redundant calls.
  private sessionInFlight: ReturnType<SupabaseClient["auth"]["getSession"]> | null = null;

  async getSession() {
    if (!this.sessionInFlight) {
      this.sessionInFlight = this.supabase.auth.getSession();
      // Clear the latch on the next microtask tick so a later mount re-reads fresh state.
      this.sessionInFlight.finally(() => {
        this.sessionInFlight = null;
      });
    }
    const { data, error } = await this.sessionInFlight;
    if (error) throw error;
    return data.session;
  }

  /** Current user straight from the cached session — no network call. */
  async getCurrentUser() {
    const session = await this.getSession();
    return session?.user ?? null;
  }

  async getUserProfile(): Promise<UserProfile | null> {
    // Derive from the local session instead of a getUser() network request; user_metadata
    // is carried in the session and updateUser() refreshes it in place.
    const user = await this.getCurrentUser();
    if (!user) return null;

    const meta = user.user_metadata || {};
    const metaRegion = normalizeRegion(meta.region);
    const metaAvatar = typeof meta.avatar === "string" ? meta.avatar : null;
    const profilePrefs = await this.getProfilePreferences(user.id);

    return {
      id: user.id,
      email: user.email || null,
      emailConfirmed: Boolean(user.email_confirmed_at),
      avatar: profilePrefs?.avatar ?? metaAvatar,
      region: profilePrefs?.region ?? metaRegion
    };
  }

  async isAuthenticated(): Promise<boolean> {
    // Client-side gate: the local session is authoritative enough (RLS protects data
    // server-side). Avoids a second getUser() network call on every guarded navigation.
    const user = await this.getCurrentUser();
    return Boolean(user && user.email_confirmed_at);
  }

  async signInWithPassword(email: string, password: string): Promise<void> {
    const { error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async signOut(): Promise<void> {
    const { error } = await this.supabase.auth.signOut();
    if (error) throw error;
  }

  async updateUserMetadata(data: Record<string, unknown>): Promise<void> {
    const { error } = await this.supabase.auth.updateUser({ data });
    if (error) throw error;
  }

  private async getProfilePreferences(userId: string): Promise<{ avatar: string | null; region: Region | null } | null> {
    void userId;
    return null;
  }
}

const authServiceCache = new Map<string, AuthService>();

/**
 * Returns a singleton AuthService per (supabaseUrl, anonKey) pair so the
 * underlying Supabase/GoTrue client is shared across pages. Multiple instances
 * with the same storage key trigger Supabase's "Multiple GoTrueClient" warning
 * and can cause undefined session behavior.
 */
export function createAuthService(config: AuthServiceConfig): AuthService {
  const cacheKey = `${config.supabaseUrl}::${config.supabaseAnonKey}`;
  const existing = authServiceCache.get(cacheKey);
  if (existing) return existing;
  const service = new AuthService(config);
  authServiceCache.set(cacheKey, service);
  return service;
}

