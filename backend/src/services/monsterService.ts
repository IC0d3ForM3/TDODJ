import {
  MonsterRecord,
  UpsertMonsterPayload,
  getMonsterLibraryByUserGuid,
  getMonstersByUserGuid,
  getAllMonstersWithUsername,
  insertMonsterForUser,
  isAdminUserByGuid,
  updateMonsterForUser,
} from '../repositories/monsterRepository';

export const fetchMonstersByUserGuid = async (userguid: string): Promise<MonsterRecord[]> => {
  return await getMonstersByUserGuid(userguid);
};

export const fetchMonsterLibraryByUserGuid = async (
  userguid: string
): Promise<MonsterRecord[]> => {
  return await getMonsterLibraryByUserGuid(userguid);
};

export const fetchAllMonstersWithUsername = async (): Promise<MonsterRecord[]> => {
  return await getAllMonstersWithUsername();
};

export const checkUserIsAdminByGuid = async (userguid: string): Promise<boolean> => {
  return await isAdminUserByGuid(userguid);
};

export const createMonsterForUser = async (
  userguid: string,
  payload: UpsertMonsterPayload
): Promise<MonsterRecord> => {
  return await insertMonsterForUser(userguid, payload);
};

export const saveMonsterForUser = async (
  id: number,
  userguid: string,
  payload: UpsertMonsterPayload
): Promise<MonsterRecord | null> => {
  return await updateMonsterForUser(id, userguid, payload);
};
