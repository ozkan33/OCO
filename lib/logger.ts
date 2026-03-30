// Central logger — debug/info are silenced in production.
// Use this instead of console.log in all API routes.

const IS_PROD = process.env.NODE_ENV === 'production';

export const logger = {
  debug: (...args: unknown[]) => { if (!IS_PROD) console.debug(...args); },
  info:  (...args: unknown[]) => { if (!IS_PROD) console.info(...args);  },
  // warn and error always log — they indicate real problems worth seeing in prod
  warn:  (...args: unknown[]) => console.warn(...args),
  error: (...args: unknown[]) => console.error(...args),
};
