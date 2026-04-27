import * as contactRepo from '../repositories/contactRepository';

export const submitContactRequest = async (data: {
  name: string;
  email: string;
  problem: string;
  username?: string;
  message: string;
}) => {
  return contactRepo.insertContactRequest(data);
};

export const getAllContactRequests = async () => {
  return contactRepo.getAllContactRequests();
};

export const updateContactFlags = async (id: number, isread: boolean, isresponded: boolean) => {
  return contactRepo.updateContactFlags(id, isread, isresponded);
};
