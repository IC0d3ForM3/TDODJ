import { Request, Response } from 'express';
import * as contactService from '../services/contactService';

export const submitContact = async (req: Request, res: Response) => {
  const { name, email, problem, username, message } = req.body;
  if (!name || !email || !problem || !message) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const ok = await contactService.submitContactRequest({ name, email, problem, username, message });
  if (!ok) return res.status(500).json({ error: 'Failed to submit contact request' });
  res.json({ result: 1 });
};

export const getContacts = async (_req: Request, res: Response) => {
  const contacts = await contactService.getAllContactRequests();
  res.json(contacts);
};

export const updateContactFlags = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  const { isread, isresponded } = req.body;
  if (typeof isread !== 'boolean' || typeof isresponded !== 'boolean') {
    return res.status(400).json({ error: 'isread and isresponded must be booleans' });
  }
  const updated = await contactService.updateContactFlags(id, isread, isresponded);
  if (!updated) return res.status(404).json({ error: 'Contact request not found' });
  res.json(updated);
};
