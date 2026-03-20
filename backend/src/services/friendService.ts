import {
  FriendRecord,
  FriendUserLookupRecord,
  getActiveFriendsByUserKey,
  getUserByEmail,
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
