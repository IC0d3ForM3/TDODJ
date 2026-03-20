import {
  getTresherLibraryByUserGuid,
  getTreshersByIds,
  isTresherAccessibleByIdForUser,
  TresherRecord,
  UpsertTresherPayload,
  getTreshersByUserGuid,
  insertTresherForUser,
  isAdminUserByGuid,
  updateTresherForUser,
} from '../repositories/tresherRepository';

export const fetchTreshersByUserGuid = async (
  userguid: string
): Promise<TresherRecord[]> => {
  return await getTreshersByUserGuid(userguid);
};

export const fetchTresherLibraryByUserGuid = async (
  userguid: string
): Promise<TresherRecord[]> => {
  return await getTresherLibraryByUserGuid(userguid);
};

export const checkUserIsAdminByGuid = async (userguid: string): Promise<boolean> => {
  return await isAdminUserByGuid(userguid);
};

export const fetchTreshersByIds = async (
  ids: number[]
): Promise<TresherRecord[]> => {
  return await getTreshersByIds(ids);
};

export const checkTresherAccessibleByIdForUser = async (
  tresherId: number,
  userguid: string
): Promise<boolean> => {
  return await isTresherAccessibleByIdForUser(tresherId, userguid);
};

export const createTresherForUser = async (
  userguid: string,
  payload: UpsertTresherPayload
): Promise<TresherRecord> => {
  return await insertTresherForUser(userguid, payload);
};

export const saveTresherForUser = async (
  id: number,
  userguid: string,
  payload: UpsertTresherPayload
): Promise<TresherRecord | null> => {
  return await updateTresherForUser(id, userguid, payload);
};
