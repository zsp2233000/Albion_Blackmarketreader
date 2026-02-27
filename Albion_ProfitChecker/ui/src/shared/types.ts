export type Region = "eu" | "us";

export interface UserProfile {
  id: string;
  email: string | null;
  emailConfirmed: boolean;
  avatar: string | null;
  region: Region | null;
}

export interface ApiErrorShape {
  status: number;
  message: string;
  cause?: unknown;
}

