import * as userRepo from '../repositories/userRepository';
import { LoginUserRecord, NewUser, UserFlagUpdate } from '../repositories/userRepository';
import * as dailyHitsService from './dailyHitsService';

export const getAllUsers = async () => {
  return await userRepo.getAllUsers();
};
export const loginUser = async (username: string, password: string): Promise<LoginUserRecord | null> => {
  const user = await userRepo.getActiveUserByCredentials(username, password);
  if (user) {
    try {
      await dailyHitsService.recordLoginHit();
    } catch (error) {
      // Do not block valid logins if stats tracking has a transient issue.
      console.error('Failed to record login hit:', error);
    }
  }
  return user;
};

export const fetchUser = async (id: number) => {
  const user = await userRepo.getUserById(id);
  return user;
};

export const createUser = async (user: NewUser): Promise<number> => {
  try {
    const emailUsed = await userRepo.isEmailUsed(user.email);
    if (emailUsed) return 2;
    const success = await userRepo.insertUser(user);
    return success ? 1 : -1;
  } catch(error) {
    console.error('Error creating user:', error);
    return -1;
  }
};

export const updateUserFlags = async (id: number, flags: UserFlagUpdate) => {
  return await userRepo.updateUserFlags(id, flags);
};
