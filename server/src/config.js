// Runtime settings shared by the app and routes.

/** True on Vercel (it sets VERCEL=1) or any production deployment. */
export const IS_DEPLOYED = Boolean(process.env.VERCEL) || process.env.NODE_ENV === 'production';

/**
 * Community reports need persistent storage and a moderation step, neither of
 * which exists on a serverless deployment yet. They are therefore off when
 * deployed and on for local development. Override with REPORTS_ENABLED=true|false.
 */
export const REPORTS_ENABLED = process.env.REPORTS_ENABLED ? process.env.REPORTS_ENABLED === 'true' : !IS_DEPLOYED;
