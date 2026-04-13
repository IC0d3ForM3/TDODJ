import {
  FriendInviteRecord,
  FriendRecord,
  FriendUserLookupRecord,
  createFriendInvite,
  getActiveFriendsByUserKey,
  getInviteByCode,
  getUserByEmail,
  markInviteUsed,
  upsertActiveFriend,
} from '../repositories/friendRepository';

export const fetchActiveFriendsByUserKey = async (
  userkey: string
): Promise<FriendRecord[]> => {
  return await getActiveFriendsByUserKey(userkey);
};

export const fetchUserByEmail = async (
  email: string
): Promise<FriendUserLookupRecord | null> => {
  return await getUserByEmail(email);
};

export const createOrActivateFriend = async (
  userkey: string,
  friendkey: string
): Promise<FriendRecord> => {
  return await upsertActiveFriend(userkey, friendkey);
};

export const createInvite = async (
  inviterkey: string,
  inviteekey: string
): Promise<FriendInviteRecord> => {
  return await createFriendInvite(inviterkey, inviteekey);
};

export const fetchInviteByCode = async (
  code: string
): Promise<FriendInviteRecord | null> => {
  return await getInviteByCode(code);
};

export const useInvite = async (id: number): Promise<void> => {
  await markInviteUsed(id);
};
