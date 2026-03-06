/**
 * When true, communities are archived for 3.0 launch: hidden from nav and routes show archived message.
 * Set NEXT_PUBLIC_COMMUNITIES_ARCHIVED=false to show communities again.
 */
export function isCommunitiesArchived(): boolean {
  return (process.env.NEXT_PUBLIC_COMMUNITIES_ARCHIVED ?? 'true') !== 'false';
}
