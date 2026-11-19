import { nanoid } from 'nanoid';

export const newId = () => nanoid(12);
export const nowStamp = () => new Date().toISOString();
