/**
 * Generate a consistent random color for user avatars
 * The color will be the same for the same ID
 * 
 * Colors: Red, Blue, Green, Yellow, Purple, Pink, Orange, Aquamarine, 
 * Dark Green, Dark Blue, Black, Brown
 */

const avatarColors = [
  'from-red-500 to-red-600',           // Red
  'from-blue-500 to-blue-600',         // Blue
  'from-green-500 to-green-600',       // Green
  'from-yellow-400 to-yellow-500',     // Yellow
  'from-purple-500 to-purple-600',     // Purple
  'from-pink-500 to-pink-600',         // Pink
  'from-orange-500 to-orange-600',     // Orange
  'from-cyan-400 to-teal-500',         // Aquamarine
  'from-green-700 to-green-800',       // Dark Green
  'from-blue-700 to-blue-800',         // Dark Blue
  'from-gray-800 to-gray-900',         // Black
  'from-amber-700 to-amber-800',       // Brown
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
