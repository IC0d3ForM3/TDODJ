import {
  CurseRecord,
  UpsertCursePayload,
  isAdminUserByGuid,
  getCursesByUserGuid,
  insertCurseForUser,
  updateCurseForUser,
} from '../repositories/curseRepository';

export const fetchCursesByUserGuid = (userguid: string): Promise<CurseRecord[]> =>
  getCursesByUserGuid(userguid);

export const checkUserIsAdminByGuid = (userguid: string): Promise<boolean> =>
  isAdminUserByGuid(userguid);

export const createCurseForUser = (
  userguid: string,
  payload: UpsertCursePayload
): Promise<CurseRecord> => insertCurseForUser(userguid, payload);

export const saveCurseForUser = (
  id: number,
  userguid: string,
  payload: UpsertCursePayload
): Promise<CurseRecord | null> => updateCurseForUser(id, userguid, payload);
