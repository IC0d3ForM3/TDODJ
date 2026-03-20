export interface DoorPromptResult {
  state: 'open' | 'closed';
  hp: number;
  isLocked: boolean;
  name: string;
  description: string;
}
