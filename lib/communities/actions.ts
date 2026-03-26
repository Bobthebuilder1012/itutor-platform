'use server';

import {
  joinCommunity,
  leaveCommunity,
  setMute,
  createCommunity,
  updateCommunityAvatar,
} from '@/lib/communities';

export async function joinCommunityAction(communityId: string) {
  return joinCommunity(communityId);
}

export async function leaveCommunityAction(communityId: string) {
  return leaveCommunity(communityId);
}

export async function setMuteAction(
  communityId: string,
  muted: boolean,
  mutedUntil?: string | null
) {
  return setMute(communityId, muted, mutedUntil);
}

export async function createCommunityAction(params: {
  name: string;
  description?: string;
  avatar_url?: string;
}) {
  return createCommunity(params);
}

export async function updateCommunityAvatarAction(communityId: string, avatarUrl: string) {
  return updateCommunityAvatar(communityId, avatarUrl);
}
