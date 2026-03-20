import {
  PcRecord,
  UpsertPcPayload,
  getPcByIdForUser,
  getPcsByUserGuid,
  insertPcForUser,
  updatePcForUser,
} from '../repositories/pcRepository';

export const fetchPcsByUserGuid = async (userguid: string): Promise<PcRecord[]> => {
  return await getPcsByUserGuid(userguid);
};

export const fetchPcByIdForUser = async (
  id: number,
  userguid: string
): Promise<PcRecord | null> => {
  return await getPcByIdForUser(id, userguid);
};

export const createPcForUser = async (
  userguid: string,
  payload: UpsertPcPayload
): Promise<PcRecord> => {
  return await insertPcForUser(userguid, payload);
};

export const savePcForUser = async (
  id: number,
  userguid: string,
  payload: UpsertPcPayload
): Promise<PcRecord | null> => {
  return await updatePcForUser(id, userguid, payload);
};
