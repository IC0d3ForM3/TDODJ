import { Key } from "./key";
import { Trap } from "./game/trap";

export interface DoorItemRequirement {
    itemId: number;
    itemName: string;
    consume: boolean;
}

export type DoorOpenDirection = 'top' | 'bottom' | 'left' | 'right';

export interface Door {
    id: number;
    name: string;
    description: string;
    keyLock: Key | null;
    isLocked: boolean;
    isTrapped: boolean;
    toPick: number | null;
    trap: Trap | null;
    HP: number;
    state: 'open' | 'closed' | 'destroyed';
    isHidden: boolean;
    toFind: number;
    isFound: boolean;
    spReward: number | null;
    itemRequirement: DoorItemRequirement | null;
    oneWay: boolean;
    openDirection: DoorOpenDirection | null;
}
