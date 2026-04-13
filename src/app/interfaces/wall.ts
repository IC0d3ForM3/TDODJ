import { Key } from "./key";

export interface Wall {
    id: number;
    name: string;
    description: string;
    HP: number;
    state: 'intact' | 'destroyed';
    isDestructible?: boolean;
}
