// XTrend Batch Configuration

export interface Config {
  xBearerToken: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  /** HTTP port for Cloud Run (optional, defaults to 8080) */
  port: number;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadConfig(): Config {
  return {
    xBearerToken: requireEnv('X_BEARER_TOKEN'),
    supabaseUrl: requireEnv('SUPABASE_URL'),
    supabaseServiceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    port: parseInt(process.env.PORT || '8080', 10),
  };
}

/** Target WOEIDs for MVP */
export const TARGET_WOEIDS = [
  23424856, // Japan
  1118370,  // Tokyo
  15015370, // Osaka
] as const;
