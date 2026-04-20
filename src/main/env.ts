import { type ZodType, z } from 'zod';

function createEnv<TSchema extends Record<string, ZodType>>(opts: {
  schema: TSchema;
  runtimeEnv: Record<string, unknown>;
}): Readonly<z.infer<z.ZodObject<TSchema>>> {
  const result = z.object(opts.schema).safeParse(opts.runtimeEnv);
  if (!result.success) {
    const details = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${details}`);
  }
  return Object.freeze(result.data);
}

export const env = createEnv({
  schema: {
    CLOUDFLARE_ACCOUNT_ID: z.string().min(1).optional(),
    CLOUDFLARE_API_TOKEN: z.string().min(1).optional(),
    CLOUDFLARE_GATEWAY_ID: z.string().min(1).default('default'),
    OPENAI_API_KEY: z.string().min(1).optional(),
    SUPABASE_URL: z.url().optional(),
    SUPABASE_ANON_KEY: z.string().min(1).optional(),
    SLOWBLINK_API_BASE: z.url().optional(),
  },
  // `import.meta.env` is baked in at build time from dotenv files (.env,
  // .env.local) filtered by electron-vite's `envPrefix`. `process.env` is
  // what Doppler / the shell inject at runtime. Merge both so either path
  // works and runtime values win over build-time defaults.
  runtimeEnv: { ...import.meta.env, ...process.env },
});
