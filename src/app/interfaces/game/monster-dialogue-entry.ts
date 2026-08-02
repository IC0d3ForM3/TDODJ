/**
 * A single question/response entry in a monster placement's dialogue tree.
 * The PC can ask the question; a random response is picked from `responses`.
 * `triggersAttack` makes the monster hostile immediately after answering.
 * `preventsAttackUnlessAttacked` makes the monster passive (won't attack
 * unless the PC attacks first) once this question has been asked.
 */
export interface MonsterDialogueEntry {
  id: number;
  question: string;
  responses: string[];
  triggersAttack?: boolean;
  preventsAttackUnlessAttacked?: boolean;
}
