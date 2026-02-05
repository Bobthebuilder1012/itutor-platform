/**
 * Generate a consistent random color for user avatars (like Google)
 * The color will be the same for the same ID
 */

const avatarColors = [
  'from-red-500 to-red-600',
  'from-orange-500 to-orange-600',
  'from-amber-500 to-amber-600',
  'from-yellow-500 to-yellow-600',
  'from-lime-500 to-lime-600',
  'from-green-500 to-green-600',
  'from-emerald-500 to-emerald-600',
  'from-teal-500 to-teal-600',
  'from-cyan-500 to-cyan-600',
  'from-sky-500 to-sky-600',
  'from-blue-500 to-blue-600',
  'from-indigo-500 to-indigo-600',
  'from-violet-500 to-violet-600',
  'from-purple-500 to-purple-600',
  'from-fuchsia-500 to-fuchsia-600',
  'from-pink-500 to-pink-600',
  'from-rose-500 to-rose-600',
];

/**
 * Get a consistent color for a given user ID
 * @param id - User ID to generate color for
 * @returns Tailwind gradient class string
 */
export function getAvatarColor(id: string): string {
  // Simple hash function to convert ID to number
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Get absolute value and use modulo to get index
  const index = Math.abs(hash) % avatarColors.length;
  return avatarColors[index];
}
