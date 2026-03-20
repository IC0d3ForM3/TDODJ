import { Key } from "./key";

export interface Door {
    id: number;
    name: string;
    description: string;
    keyLock: Key | null;
    isLocked: boolean;
    isTrapped: boolean;
    HP: number;
    state: 'open' | 'closed' | 'destroyed';
    isHidden: boolean;
    spReward: number | null;
}
