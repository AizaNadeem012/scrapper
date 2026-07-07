type ImportMetaEnv = ImportMeta & {
  env?: Record<string, string | boolean | undefined>;
};

function readEnvValue(name: string, fallbackNames: string[] = []): string {
  const candidates = [name, ...fallbackNames];

  for (const candidate of candidates) {
    const processValue = typeof process !== 'undefined' ? process.env?.[candidate] : undefined;
    if (typeof processValue === 'string' && processValue.trim()) {
      return processValue.trim();
    }

    const importMetaEnv = typeof import.meta !== 'undefined' ? (import.meta as ImportMetaEnv).env : undefined;
    const importMetaValue = importMetaEnv?.[candidate];
    if (typeof importMetaValue === 'string' && importMetaValue.trim()) {
      return importMetaValue.trim();
    }
    if (typeof importMetaValue === 'boolean') {
      return String(importMetaValue);
    }
  }

  return '';
}

export function getSupabaseUrl(): string {
  return readEnvValue('SUPABASE_URL', ['VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL']);
}

export function getSupabasePublishableKey(): string {
  return readEnvValue('SUPABASE_PUBLISHABLE_KEY', [
    'SUPABASE_ANON_KEY',
    'VITE_SUPABASE_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  ]);
}

export function getSupabaseServiceRoleKey(): string {
  return readEnvValue('SUPABASE_SERVICE_ROLE_KEY', ['SUPABASE_SECRET_KEY']);
}
