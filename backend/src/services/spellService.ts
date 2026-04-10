import {
  SpellRecord,
  UpsertSpellPayload,
  fetchSpellsByIds,
  getSpellsByUserGuid,
  insertSpellForUser,
  isAdminUserByGuid,
  updateSpellForUser,
} from '../repositories/spellRepository';

export const fetchSpellsByIdsForGame = async (ids: number[]): Promise<SpellRecord[]> => {
  return await fetchSpellsByIds(ids);
};

export const fetchSpellsByUserGuid = async (userguid: string): Promise<SpellRecord[]> => {
  return await getSpellsByUserGuid(userguid);
};

export const checkUserIsAdminByGuid = async (userguid: string): Promise<boolean> => {
  return await isAdminUserByGuid(userguid);
};

export const createSpellForUser = async (
  userguid: string,
  payload: UpsertSpellPayload
): Promise<SpellRecord> => {
  return await insertSpellForUser(userguid, payload);
};

export const saveSpellForUser = async (
  id: number,
  userguid: string,
  payload: UpsertSpellPayload
): Promise<SpellRecord | null> => {
  return await updateSpellForUser(id, userguid, payload);
};
