import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { vi } from 'vitest';

import { Game } from './game';

describe('Game', () => {
  let component: Game;
  let fixture: ComponentFixture<Game>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Game],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({}),
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Game);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('requires spells to be learned and equipped before casting', () => {
    const dungonId = 1;
    const spell = {
      id: 101,
      name: 'Test Ward',
      description: 'test',
      range: 0,
      effectOn: 'AC',
      effectAmount: 2,
      successTestValue: 5,
      sp: 1,
      lastFor: 2,
      numberOfTargets: 1,
      magicCost: 1,
      effectOnPc1: true,
      range1: 0,
      lastFor1: 2,
    };

    component.gridPreviewContext.set({
      dungonId,
      centerRow: 0,
      centerColumn: 0,
    } as never);
    component.turnPhase.set('player');
    component.playerHp.set(10);
    component.playerAE.set(3);
    component.playerMp.set(5);
    component.playerMind.set(10);
    component.pcTresherSpellsById.set(new Map([[spell.id, spell as never]]));

    // Not learned and not equipped.
    expect(component.canCastSpell(spell as never)).toBe(false);

    // Learned only is still not enough.
    (component as any).learnedFloorSpellIdsByDungon.set({ [dungonId]: [spell.id] });
    component.equippedSpellIdsByDungon.set({ [dungonId]: [] });
    expect(component.canCastSpell(spell as never)).toBe(false);

    // Learned + equipped allows casting.
    component.equippedSpellIdsByDungon.set({ [dungonId]: [spell.id] });
    expect(component.canCastSpell(spell as never)).toBe(true);
  });

  it('recognizes supported potion effect targets as drinkable', () => {
    const supportedTargets = [
      'AC',
      'HP',
      'Strength',
      'Stamina',
      'Mind',
      'Magic Power',
      'AE',
      'Range of View',
      'Temp HP',
      'Poison Resistance',
      'Number of attacts per Round(NOA)',
    ];

    for (const effectTo of supportedTargets) {
      expect(component.isInnerPotionDrinkable({ effectTo })).toBe(true);
    }
  });

  it('applies NOA and Range of View potion effects to player state', () => {
    const dungonId = 1;
    component.gridPreviewContext.set({ dungonId, centerRow: 0, centerColumn: 0 } as never);
    component.playerNOA.set(1);

    (component as any).applyPotionEffectToPlayer({
      name: 'Quick Hands',
      effectTo: 'Number of attacts per Round(NOA)',
      effectAmount: 1,
      lastFor: 1,
    });
    expect(component.playerNOA()).toBe(2);

    const beforeRos = (component.cheaterByDungon()[dungonId]?.rangeOfSight ?? 5);
    (component as any).applyPotionEffectToPlayer({
      name: 'Far Sight',
      effectTo: 'Range of View',
      effectAmount: 2,
      lastFor: 1,
    });
    const afterRos = component.cheaterByDungon()[dungonId]?.rangeOfSight ?? 0;
    expect(afterRos).toBe(beforeRos + 2);
  });

  it('applies Temp HP and Poison Resistance potion effects on the player', () => {
    const dungonId = 1;
    component.gridPreviewContext.set({ dungonId, centerRow: 0, centerColumn: 0 } as never);
    component.playerMaxHp.set(30);
    component.playerHp.set(10);

    (component as any).applyPotionEffectToPlayer({
      name: 'Stone Skin Draft',
      effectTo: 'Temp HP',
      effectAmount: 4,
      effectAmountMin: 4,
      effectAmountDiceCount: 0,
      effectAmountDiceSides: 0,
      lastFor: 3,
    });

    expect(component.playerHp()).toBe(14);
    expect(component.playerActiveEffects().some((e) => e.sourceName === 'Stone Skin Draft' && e.effectOn === 'HP' && e.behavior === 'modifier')).toBe(true);

    (component as any).applyPotionEffectToPlayer({
      name: 'Antivenom',
      effectTo: 'Poison Resistance',
      effectAmount: 2,
      lastFor: 1,
    });

    expect(component.playerActiveEffects().some((e) => e.sourceName === 'Antivenom' && e.effectOn === 'Poison Resistance' && e.behavior === 'modifier')).toBe(true);
  });

  it('drinkCollectedFloorPotion consumes potion and applies its player effect', () => {
    const dungonId = 1;
    component.gridPreviewContext.set({ dungonId, centerRow: 0, centerColumn: 0 } as never);
    component.turnPhase.set('player');
    component.playerAE.set(2);
    component.playerHp.set(20);
    component.playerNOA.set(1);

    component.collectedFloorPotionsByDungon.set({
      [dungonId]: [
        {
          id: 9001,
          name: 'Battle Focus',
          description: 'Test potion',
          effectTo: 'Number of attacts per Round(NOA)',
          effectAmount: 1,
          lastFor: 1,
        },
      ],
    } as never);

    component.drinkCollectedFloorPotion(9001);

    expect(component.playerNOA()).toBe(2);
    expect((component.collectedFloorPotionsByDungon()[dungonId] ?? []).length).toBe(0);
  });

  it('class checks and class-specific actions behave correctly', () => {
    const dungonId = 1;
    component.gridPreviewContext.set({ dungonId, centerRow: 0, centerColumn: 0 } as never);
    component.turnPhase.set('player');
    component.playerHp.set(10);
    component.playerAE.set(5);

    component.playerType.set('mage');
    expect(component.isMageClass()).toBe(true);
    expect(component.canMageRest()).toBe(true);

    component.playerType.set('healer');
    expect(component.isHealerClass()).toBe(true);
    expect(component.canUseHealerLesserHeal()).toBe(true);

    component.playerType.set('fighter');
    expect(component.isFighterClass()).toBe(true);
    expect(component.canBoostAttack()).toBe(false); // no target monster in range

    component.playerType.set('thieph');
    component.playerSearchesThisTurn.set(1);
    expect(component.canSearch()).toBe(true); // thieph can search twice per round
  });

  it('weapon hit and spell cast both trigger sound paths', () => {
    const dungonId = 1;
    const spellId = 7001;
    const weaponSoundId = 9001;

    component.gridPreviewContext.set({ dungonId, centerRow: 5, centerColumn: 5 } as never);
    component.turnPhase.set('player');
    component.playerAE.set(3);

    component.soundMuted.set(false);
    (component as any).soundPathById.set(new Map([[weaponSoundId, '/sounds/hit.wav']]));

    const playSoundPathSpy = vi.spyOn(component as any, 'playSoundPath').mockImplementation(() => {});

    (component as any).playWeaponHitSound(weaponSoundId);

    expect(playSoundPathSpy).toHaveBeenCalledWith('/sounds/hit.wav');

    component.playerType.set('mage');
    component.playerAE.set(3);
    component.playerMp.set(10);
    component.playerMind.set(10);
    component.monsterInstances.set([]);

    const spell = {
      id: spellId,
      name: 'Focus Ward',
      description: 'buff',
      soundPath: '/sounds/spell.wav',
      range: 0,
      effectOn: 'AC',
      effectAmount: 2,
      successTestValue: 5,
      sp: 1,
      lastFor: 1,
      numberOfTargets: 1,
      magicCost: 1,
      effectOnPc1: true,
      range1: 0,
      lastFor1: 1,
    };
    component.pcTresherSpellsById.set(new Map([[spellId, spell as never]]));
    (component as any).learnedFloorSpellIdsByDungon.set({ [dungonId]: [spellId] });
    component.equippedSpellIdsByDungon.set({ [dungonId]: [spellId] });

    component.castSpell(spellId);

    expect(playSoundPathSpy).toHaveBeenCalledWith('/sounds/spell.wav');

    playSoundPathSpy.mockRestore();
  });

  it('monster death drops coin tresher loot on its square', () => {
    const dungonId = 1;
    const monster = {
      row: 2,
      column: 3,
      dropTresherIds: [],
      dropKeyIds: [],
      dropItemIds: [],
      dropSpellIds: [],
      dropPotionIds: [],
      dropGold: 4,
      dropSilver: 3,
      dropCopper: 2,
      dropZinc: 1,
    };
    const template = { name: 'Coin Slime', tresherIds: [], keyIds: [] };

    component.tresherListByDungon.set({ [dungonId]: [] });
    component.tresherPlacementsByDungon.set({ [dungonId]: [] });

    (component as any).dropMonsterLoot(dungonId, monster as never, template as never);

    const treshers = component.tresherListByDungon()[dungonId] ?? [];
    const placements = component.tresherPlacementsByDungon()[dungonId] ?? [];
    const droppedCoins = treshers.find((t) => t.name === 'Dropped Coins');

    expect(droppedCoins).toBeTruthy();
    expect(droppedCoins?.gold).toBe(4);
    expect(droppedCoins?.silver).toBe(3);
    expect(droppedCoins?.copper).toBe(2);
    expect(droppedCoins?.zinc).toBe(1);
    expect(placements.some((p) => p.row === 2 && p.column === 3 && p.tresherId === droppedCoins?.id)).toBe(true);
  });

  it('useInventoryHealingPotion consumes a potion and restores HP', () => {
    const dungonId = 1;
    component.gridPreviewContext.set({ dungonId, centerRow: 0, centerColumn: 0 } as never);
    component.turnPhase.set('player');
    component.playerAE.set(2);
    component.playerHp.set(5);
    component.playerMaxHp.set(20);

    component.cheaterByDungon.set({
      [dungonId]: {
        inventory: {
          keys: [],
          treshers: [
            {
              id: 111,
              name: 'Lesser Healing Potion',
              type: 'Potion',
              description: 'heals',
              effectTo: 'HP',
              effectAmount: 6,
              lastFor: 1,
            },
          ],
        },
      },
    } as never);

    const saveSpy = vi.spyOn(component as any, 'saveGameState').mockImplementation(() => {});
    const startMonstersSpy = vi.spyOn(component as any, 'startMonsterTurns').mockImplementation(() => {});

    component.useInventoryHealingPotion(0);

    expect(component.playerHp()).toBeGreaterThan(5);
    const remainingTreshers = component.inventoryTreshersForPreview();
    expect(remainingTreshers.length).toBe(0);

    saveSpy.mockRestore();
    startMonstersSpy.mockRestore();
  });
});
