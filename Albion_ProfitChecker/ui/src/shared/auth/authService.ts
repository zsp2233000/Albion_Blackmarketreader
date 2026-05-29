import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Region, UserProfile } from "../types";

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

  async getSession() {
    const { data, error } = await this.supabase.auth.getSession();
    if (error) throw error;
    return data.session;
  }

  async getUserProfile(): Promise<UserProfile | null> {
    const { data, error } = await this.supabase.auth.getUser();
    if (error) throw error;
    const user = data.user;
    if (!user) return null;

    const meta = user.user_metadata || {};
    const metaRegion = this.normalizeRegion(meta.region);
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
    const session = await this.getSession();
    if (!session) return false;
    const profile = await this.getUserProfile();
    return Boolean(profile && profile.emailConfirmed);
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

  private normalizeRegion(value: unknown): Region | null {
    const region = String(value || "").toLowerCase();
    return region === "eu" || region === "us" ? region : null;
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

