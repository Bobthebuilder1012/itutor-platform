/**
 * When true, the iTutor AI marking feature is shut down: the /tools/ai page shows
 * a maintenance screen and the AI API routes reject requests with 403.
 * Set NEXT_PUBLIC_AI_FEATURE_MAINTENANCE=false to restore access.
 */
export function isAiFeatureInMaintenance(): boolean {
  return (process.env.NEXT_PUBLIC_AI_FEATURE_MAINTENANCE ?? 'true') !== 'false';
}

export const AI_FEATURE_MAINTENANCE_MESSAGE =
  'iTutor AI is temporarily unavailable while we perform maintenance.';
