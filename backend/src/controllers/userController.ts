import { Request, Response } from 'express';
import * as userService from '../services/userService';

export const getAllUsers = async (req: Request, res: Response) => {
  const users = await userService.getAllUsers();
  res.json(users);
};

export const loginUser = async (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Missing username or password' });
  }
  const user = await userService.loginUser(username, password);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials or user not active' });
  }
  res.json(user);
};


export const getUser = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid user id' });
  }

  const user = await userService.fetchUser(id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json(user);
};

export const createUser = async (req: Request, res: Response) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ result: -1, error: 'Missing fields' });
  }
  const result = await userService.createUser({ username, email, password });
  res.json({ result });
};

export const updateUserFlags = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid user id' });
  }

  const { isactive, isadmin, iscreator } = req.body as Partial<{
    isactive: boolean;
    isadmin: boolean;
    iscreator: boolean;
  }>;

  if (
    typeof isactive !== 'boolean' ||
    typeof isadmin !== 'boolean' ||
    typeof iscreator !== 'boolean'
  ) {
    return res.status(400).json({
      error: 'isactive, isadmin, and iscreator must be boolean values',
    });
  }

  const updatedUser = await userService.updateUserFlags(id, {
    isactive,
    isadmin,
    iscreator,
  });

  if (!updatedUser) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json(updatedUser);
};
