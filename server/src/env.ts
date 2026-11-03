import { config as loadDotenv } from 'dotenv';
import { envFile } from './paths.js';

loadDotenv({ path: envFile });

export const env = {
  tutorModel: process.env.TUTOR_MODEL || 'opus',
  utilModel: process.env.UTIL_MODEL || 'sonnet',
  port: Number(process.env.PORT) || 3111,
  host: process.env.HOST || '127.0.0.1',
};

export const MISSING_API_KEY_WARNING =
  'ANTHROPIC_API_KEY is not set — the tutor will fail unless Claude auth is configured another way';

/** Clear error for a model the API key cannot use. */
export function modelUnavailableError(model: string, envVar: 'TUTOR_MODEL' | 'UTIL_MODEL'): Error {
  return new Error(`Model ${model} is not available for your API key. Change ${envVar} in .env.`);
}

/** True when SDK result errors say the model does not exist or is not allowed. */
export function looksLikeModelUnavailable(errors: string[]): boolean {
  return errors.some((e) => /model[\s\S]*(not[ _]found|not available|does not exist|not_found_error)/i.test(e));
}
