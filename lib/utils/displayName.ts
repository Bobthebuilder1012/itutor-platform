/**
 * Gets the display name for a user.
 * Returns display_name if set, otherwise falls back to full_name, then username.
 * 
 * @param profile - User profile object with username and optional display_name
 * @returns The name to display to users
 */
export function getDisplayName(profile: {
  username?: string | null;
  display_name?: string | null;
  full_name?: string | null;
}): string {
  // Priority: display_name > full_name > username > 'User'
  if (profile.display_name && profile.display_name.trim() !== '') {
    return profile.display_name;
  }
  
  if (profile.full_name && profile.full_name.trim() !== '') {
    return profile.full_name;
  }
  
  if (profile.username && profile.username.trim() !== '') {
    return profile.username;
  }
  
  return 'User';
}














