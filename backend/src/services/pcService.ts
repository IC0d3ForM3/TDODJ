import {
  PcRecord,
  UpsertPcPayload,
  SamplePcRecord,
  AdminPcRecord,
  getPcByIdForUser,
  getPcByIdPublic,
  getPcsByUserGuid,
  insertPcForUser,
  updatePcForUser,
  addSpToPc,
  getSamplePcsFromDb,
  setSamplePcInDb,
  getAllPcsForAdmin,
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

export const awardSpToPc = async (
  id: number,
  userguid: string,
  amount: number
): Promise<number | null> => {
  return await addSpToPc(id, userguid, amount);
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

export const fetchSamplePcs = async (): Promise<SamplePcRecord[]> => {
  return await getSamplePcsFromDb();
};

export const setSamplePc = async (id: number, issample: boolean): Promise<boolean> => {
  return await setSamplePcInDb(id, issample);
};

export const fetchAllPcsForAdmin = async (): Promise<AdminPcRecord[]> => {
  return await getAllPcsForAdmin();
};

export const fetchSamplePcById = async (id: number): Promise<PcRecord | null> => {
  return await getPcByIdPublic(id);
};
