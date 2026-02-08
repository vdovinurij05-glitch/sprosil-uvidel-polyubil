import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  BOT_TOKEN: z.string().min(1),
  WEBAPP_URL: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1),
  LOBBY_TIMEOUT_SEC: z.coerce.number().default(90),
  MIN_PLAYERS_PER_GENDER: z.coerce.number().default(2),
  MAX_PLAYERS_PER_GENDER: z.coerce.number().default(3),
  ANSWER_TIMEOUT_SEC: z.coerce.number().default(60),
  VOTE_TIMEOUT_SEC: z.coerce.number().default(30),
});

function loadConfig() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment variables:', result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}

export const config = loadConfig();
export type Config = z.infer<typeof envSchema>;
