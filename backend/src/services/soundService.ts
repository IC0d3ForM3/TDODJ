import {
  CreateSoundPayload,
  SoundRecord,
  UpdateSoundPayload,
  getSoundLibraryByUserGuid,
  getSoundsByUserGuid,
  insertSoundForUser,
  isAdminUserByGuid,
  isSoundAccessibleByIdForUser,
  getSoundsByIds,
  updateSoundForUser,
} from '../repositories/soundRepository';

export const fetchSoundsByUserGuid = async (userguid: string): Promise<SoundRecord[]> => {
  return await getSoundsByUserGuid(userguid);
};

export const fetchSoundLibraryByUserGuid = async (userguid: string): Promise<SoundRecord[]> => {
  return await getSoundLibraryByUserGuid(userguid);
};

export const fetchSoundsByIds = async (ids: number[]): Promise<SoundRecord[]> => {
  return await getSoundsByIds(ids);
};

export const checkUserIsAdminByGuid = async (userguid: string): Promise<boolean> => {
  return await isAdminUserByGuid(userguid);
};

export const checkSoundAccessibleByIdForUser = async (
  soundId: number,
  userguid: string
): Promise<boolean> => {
  return await isSoundAccessibleByIdForUser(soundId, userguid);
};

export const createSoundForUser = async (
  userguid: string,
  payload: CreateSoundPayload
): Promise<SoundRecord> => {
  return await insertSoundForUser(userguid, payload);
};

export const saveSoundForUser = async (
  id: number,
  userguid: string,
  payload: UpdateSoundPayload
): Promise<SoundRecord | null> => {
  return await updateSoundForUser(id, userguid, payload);
};
