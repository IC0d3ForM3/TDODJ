import {
  PotionRecord,
  UpsertPotionPayload,
  getPotionsByUserGuid,
  getPotionsByIds,
  getAllPotionsWithUsername,
  insertPotionForUser,
  isAdminUserByGuid,
  updatePotionForUser,
} from '../repositories/potionRepository';

export const fetchPotionsByUserGuid = async (userguid: string): Promise<PotionRecord[]> => {
  return await getPotionsByUserGuid(userguid);
};

export const fetchAllPotionsWithUsername = async (): Promise<PotionRecord[]> => {
  return await getAllPotionsWithUsername();
};

export const fetchPotionsByIds = async (ids: number[]): Promise<PotionRecord[]> => {
  return await getPotionsByIds(ids);
};

export const checkUserIsAdminByGuid = async (userguid: string): Promise<boolean> => {
  return await isAdminUserByGuid(userguid);
};

export const createPotionForUser = async (
  userguid: string,
  payload: UpsertPotionPayload
): Promise<PotionRecord> => {
  return await insertPotionForUser(userguid, payload);
};

export const savePotionForUser = async (
  id: number,
  userguid: string,
  payload: UpsertPotionPayload
): Promise<PotionRecord | null> => {
  return await updatePotionForUser(id, userguid, payload);
};
