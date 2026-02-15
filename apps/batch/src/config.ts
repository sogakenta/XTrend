// XTrend Batch Configuration

export interface Config {
  xBearerToken: string;
  supabaseUrl: string;
  supabaseSecretKey: string;
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
  // Support both new (SUPABASE_SECRET_KEY) and legacy (SUPABASE_SERVICE_ROLE_KEY) names
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseSecretKey) {
    throw new Error('Missing required environment variable: SUPABASE_SECRET_KEY');
  }

  return {
    xBearerToken: requireEnv('X_BEARER_TOKEN'),
    supabaseUrl: requireEnv('SUPABASE_URL'),
    supabaseSecretKey,
    port: parseInt(process.env.PORT || '8080', 10),
  };
}

/** Target WOEIDs for MVP */
export const TARGET_WOEIDS = [
  23424856, // Japan
  1118370,  // Tokyo
  15015370, // Osaka
] as const;
