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
    const region = (meta.region || "").toLowerCase();
    const normalizedRegion: Region | null = region === "eu" || region === "us" ? region : null;

    return {
      id: user.id,
      email: user.email || null,
      emailConfirmed: Boolean(user.email_confirmed_at),
      avatar: (meta.avatar as string) || null,
      region: normalizedRegion
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
}

export function createAuthService(config: AuthServiceConfig): AuthService {
  return new AuthService(config);
}

