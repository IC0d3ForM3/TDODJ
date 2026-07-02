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

  it('lets a fighter attack a monster in range', () => {
    const dungonId = 1;
    const emptySquare = {
      toTop: null,
      toRight: null,
      toBottom: null,
      toLeft: null,
    };
    component.gridPreviewContext.set({ dungonId, centerRow: 5, centerColumn: 5 } as never);
    component.turnPhase.set('player');
    component.playerType.set('fighter');
    component.playerHp.set(20);
    component.playerAE.set(3);
    component.playerNOA.set(1);
    component.playerAttacksThisTurn.set(0);
    component.playerStrength.set(4);
    component.playerStamina.set(10);

    component.squaresByDungon.set({
      [dungonId]: {
        '5:5': { ...emptySquare } as never,
        '5:6': { ...emptySquare } as never,
      },
    });

    component.cheaterByDungon.set({
      [dungonId]: {
        facingDir: 'right',
        inventory: { keys: [], treshers: [] },
      },
    } as never);

    component.monsterInstances.set([
      {
        placementIndex: 0,
        monsterId: 101,
        row: 5,
        column: 6,
        roam: false,
        currentHp: 8,
        currentMagic: 0,
        permanentStatModifiers: {},
        isDead: false,
        remainingAE: 0,
        attacksUsedThisTurn: 0,
        hasCastSpellThisTurn: false,
        dropTresherIds: [],
        dropKeyIds: [],
        dropItemIds: [],
        dropSpellIds: [],
        dropPotionIds: [],
        dropGold: 0,
        dropSilver: 0,
        dropCopper: 0,
        dropZinc: 0,
        activeEffects: [],
        isDormant: false,
        guardRow: null,
        guardColumn: null,
        isStationary: false,
        stationaryTriggerRow: null,
        stationaryTriggerCol: null,
        noAttackUnlessAttacked: false,
        hasCalledReinforcements: false,
        hasGreeted: false,
        hasSharedInfo: false,
        isSpared: false,
        npcIsHostile: false,
      },
    ] as never);

    component.monsterListByDungon.set({
      [dungonId]: [
        {
          id: 101,
          name: 'Training Goblin',
          ac: 1,
          hp: 8,
          spReward: 0,
          toHitPlusNeeded: 0,
        },
      ],
    } as never);

    const startMonstersSpy = vi.spyOn(component as any, 'startMonsterTurns').mockImplementation(() => {});
    const hitSoundSpy = vi.spyOn(component as any, 'playWeaponHitSound').mockImplementation(() => {});
    const impactSpy = vi.spyOn(component as any, 'triggerWeaponMonsterImpact').mockImplementation(() => {});
    const rollSpy = vi.spyOn(component as any, 'rollD12').mockReturnValue(20);
    const damageSpy = vi.spyOn(component as any, 'randomInt').mockReturnValue(4);

    expect(component.canPlayerAttack()).toBe(true);
    component.tryPlayerAttack();

    const monster = component.monsterInstances()[0];
    expect(component.playerAE()).toBe(2);
    expect(component.playerAttacksThisTurn()).toBe(1);
    expect(monster.currentHp).toBeLessThan(8);
    expect(hitSoundSpy).toHaveBeenCalled();
    expect(impactSpy).toHaveBeenCalled();

    startMonstersSpy.mockRestore();
    hitSoundSpy.mockRestore();
    impactSpy.mockRestore();
    rollSpy.mockRestore();
    damageSpy.mockRestore();
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

  it('monster death drops configured item loot on its square', () => {
    const dungonId = 1;
    const droppedItemId = 77;
    const monster = {
      row: 2,
      column: 3,
      dropTresherIds: [],
      dropKeyIds: [],
      dropItemIds: [droppedItemId],
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
    component.floorItemListByDungon.set({
      [dungonId]: [
        {
          id: droppedItemId,
          name: 'Monster Fang',
          description: 'test drop',
          type: 'other',
          effectValue: 0,
          damage: 0,
          range: 0,
          armorSlot: null,
          effectOn: null,
          isTwoHanded: false,
        },
      ],
    } as never);
    component.floorItemPlacementsByDungon.set({ [dungonId]: [] } as never);

    (component as any).dropMonsterLoot(dungonId, monster as never, template as never);

    const itemPlacements = component.floorItemPlacementsByDungon()[dungonId] ?? [];
    expect(itemPlacements.some((p) => p.row === 2 && p.column === 3 && p.itemId === droppedItemId)).toBe(true);
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

  it('dungon test 1 (20), pc #13: move right, pick up loot, repeat until blocked', () => {
    const dungonId = 20;
    const emptySquare = {
      toTop: null,
      toRight: null,
      toBottom: null,
      toLeft: null,
    };

    component.gridPreviewContext.set({ dungonId, centerRow: 0, centerColumn: 0 } as never);
    component.turnPhase.set('player');
    component.playerHp.set(25);
    component.playerAE.set(50);

    component.cheaterByDungon.set({
      [dungonId]: {
        facingDir: 'right',
        inventory: { keys: [], treshers: [] },
      },
    } as never);
    component.visualFacingByDungon.set({ [dungonId]: 'right' } as never);

    component.filledSquaresByDungon.set({
      [dungonId]: {
        '0:0': true,
        '0:1': true,
        '0:2': true,
        '0:3': true,
        '0:4': true,
        '0:5': true,
      },
    } as never);

    component.squaresByDungon.set({
      [dungonId]: {
        '0:0': { ...emptySquare } as never,
        '0:1': { ...emptySquare } as never,
        '0:2': { ...emptySquare } as never,
        '0:3': { ...emptySquare } as never,
        '0:4': { ...emptySquare } as never,
        '0:5': { ...emptySquare } as never,
      },
    } as never);

    component.floorItemListByDungon.set({
      [dungonId]: [
        {
          id: 1001,
          name: 'Bronze Dagger',
          description: 'test item',
          type: 'Weapon',
          effectValue: 0,
          damage: 2,
          range: 1,
          armorSlot: null,
          effectOn: null,
          isTwoHanded: false,
        },
        {
          id: 1002,
          name: 'Leather Vest',
          description: 'test item',
          type: 'Armor',
          effectValue: 1,
          damage: 0,
          range: 0,
          armorSlot: 'chest',
          effectOn: 'AC',
          isTwoHanded: false,
        },
      ],
    } as never);

    component.floorItemPlacementsByDungon.set({
      [dungonId]: [
        { itemId: 1001, row: 0, column: 2 },
        { itemId: 1002, row: 0, column: 4 },
      ],
    } as never);
    component.collectedFloorItemsByDungon.set({ [dungonId]: [] } as never);

    const drawSpy = vi.spyOn(component as any, 'drawPreviewGridCanvas').mockImplementation(() => {});
    const stepSpy = vi.spyOn(component as any, 'playStepSound').mockImplementation(() => {});

    const pickedItemIds: number[] = [];
    let movementBlocked = false;

    for (let step = 0; step < 10; step++) {
      const beforeMove = component.gridPreviewContext();
      expect(beforeMove).toBeTruthy();
      if (!beforeMove) {
        break;
      }

      component.setFacingDirectionFromPad('right');

      const afterMove = component.gridPreviewContext();
      expect(afterMove).toBeTruthy();
      if (!afterMove) {
        break;
      }

      if (afterMove.centerColumn === beforeMove.centerColumn) {
        movementBlocked = true;
        break;
      }

      if (component.hasCurrentSquarePickupItems()) {
        const beforeCollected = component.collectedFloorItemsByDungon()[dungonId] ?? [];
        component.takeAllFromCurrentSquare();
        const afterCollected = component.collectedFloorItemsByDungon()[dungonId] ?? [];

        expect(afterCollected.length).toBeGreaterThan(beforeCollected.length);

        const newlyCollected = afterCollected.slice(beforeCollected.length);
        const newlyCollectedIds = newlyCollected.map((item) => item.id);
        pickedItemIds.push(...newlyCollectedIds);

        for (const pickedId of newlyCollectedIds) {
          expect(
            (component.floorItemPlacementsByDungon()[dungonId] ?? []).some((p) => p.itemId === pickedId)
          ).toBe(false);
        }
      }
    }

    expect(movementBlocked).toBe(true);
    expect(component.gridPreviewContext()?.centerColumn).toBe(5);
    expect(pickedItemIds).toEqual([1001, 1002]);
    expect((component.collectedFloorItemsByDungon()[dungonId] ?? []).map((item) => item.id)).toEqual([1001, 1002]);

    drawSpy.mockRestore();
    stepSpy.mockRestore();
  });
});
