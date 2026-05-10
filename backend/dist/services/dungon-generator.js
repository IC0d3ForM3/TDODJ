"use strict";
/**
 * AI-powered dungeon generator.
 *
 * Flow:
 *   1. generateLayout()   — algorithmic maze (recursive DFS) of rooms
 *   2. fetchPublicContent() — monsters / items / potions / spells from DB
 *   3. callOpenAI()        — AI picks names, descriptions, monster IDs, loot, corridor types
 *   4. validateBlueprint() — fix any invalid references / missing constraints
 *   5. buildDungonPayload() — convert layout + AI blueprint → full DungonJsonPayload
 *
 * Requires OPENAI_API_KEY in the backend .env file.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDungonPayload = buildDungonPayload;
exports.generateDungon = generateDungon;
const openai_1 = __importDefault(require("openai"));
const db_1 = __importDefault(require("../db"));
// ── Layout constants ──────────────────────────────────────────────────────────
const GAP_SIZE = 1; // 1-square gap between rooms (the corridor square)
const PADDING = 1; // 1-square border around the whole dungeon
const GRID_SIZES = { small: 3, medium: 4, large: 5 };
// ── Layout Generator (recursive DFS maze) ────────────────────────────────────
// ── Layout Generator — variable-size rooms ─────────────────────────────────
//
// Each grid ROW gets a random height and each grid COLUMN gets a random width,
// so adjacent rooms in the same row always share the exact same row range and
// adjacent rooms in the same column always share the exact same column range.
// This guarantees every inter-room corridor is exactly 1 square long while
// producing a rich mix of room shapes (2×4, 4×2, 5×3, etc.).
//
// After the DFS spanning tree a few "loop" corridors are added so the map
// isn't a pure tree.
function generateLayout(gridSize) {
    // ── 1. Choose per-row heights and per-column widths ──────────────────────
    const DIM_OPTIONS = [2, 3, 3, 3, 4, 4, 5]; // 3 is most common, 5 is rare
    const rowHeights = Array.from({ length: gridSize }, () => DIM_OPTIONS[Math.floor(Math.random() * DIM_OPTIONS.length)]);
    const colWidths = Array.from({ length: gridSize }, () => DIM_OPTIONS[Math.floor(Math.random() * DIM_OPTIONS.length)]);
    // ── 2. Compute cumulative row/col starts ─────────────────────────────────
    const rowStarts = [PADDING];
    for (let gi = 0; gi < gridSize - 1; gi++)
        rowStarts.push(rowStarts[gi] + rowHeights[gi] + GAP_SIZE);
    const colStarts = [PADDING];
    for (let gj = 0; gj < gridSize - 1; gj++)
        colStarts.push(colStarts[gj] + colWidths[gj] + GAP_SIZE);
    // ── 3. Build rooms ───────────────────────────────────────────────────────
    const roomGrid = [];
    const rooms = [];
    for (let gi = 0; gi < gridSize; gi++) {
        roomGrid[gi] = [];
        for (let gj = 0; gj < gridSize; gj++) {
            const rowStart = rowStarts[gi];
            const colStart = colStarts[gj];
            const room = {
                id: `r${gi}_${gj}`, gi, gj,
                rowStart, rowEnd: rowStart + rowHeights[gi] - 1,
                colStart, colEnd: colStart + colWidths[gj] - 1,
            };
            roomGrid[gi][gj] = room;
            rooms.push(room);
        }
    }
    // ── 4. DFS spanning tree ─────────────────────────────────────────────────
    const visited = new Set();
    const corridors = [];
    const connectedPairs = new Set(); // track existing connections
    function makeCorridor(roomA, roomB, gi, gj, ni, nj) {
        let corridorRow, corridorCol, direction;
        if (ni === gi) {
            // horizontal — same row, so row ranges are identical
            direction = 'horizontal';
            const leftRoom = gj < nj ? roomA : roomB;
            corridorCol = leftRoom.colEnd + 1;
            // corridor row = random position within the shared row range
            corridorRow = leftRoom.rowStart + Math.floor(Math.random() * rowHeights[gi]);
        }
        else {
            // vertical — same column, so col ranges are identical
            direction = 'vertical';
            const topRoom = gi < ni ? roomA : roomB;
            corridorRow = topRoom.rowEnd + 1;
            // corridor col = random position within the shared column range
            corridorCol = topRoom.colStart + Math.floor(Math.random() * colWidths[gj]);
        }
        corridors.push({ roomAId: roomA.id, roomBId: roomB.id, direction, corridorRow, corridorCol, connectionType: 'open' });
        const pairKey = [roomA.id, roomB.id].sort().join('|');
        connectedPairs.add(pairKey);
    }
    function dfs(gi, gj) {
        visited.add(`${gi}_${gj}`);
        const neighbors = [[gi - 1, gj], [gi + 1, gj], [gi, gj - 1], [gi, gj + 1]]
            .filter(([r, c]) => r >= 0 && r < gridSize && c >= 0 && c < gridSize);
        for (let i = neighbors.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [neighbors[i], neighbors[j]] = [neighbors[j], neighbors[i]];
        }
        for (const [ni, nj] of neighbors) {
            if (visited.has(`${ni}_${nj}`))
                continue;
            makeCorridor(roomGrid[gi][gj], roomGrid[ni][nj], gi, gj, ni, nj);
            dfs(ni, nj);
        }
    }
    dfs(0, 0);
    // ── 5. Add loop corridors (~25% of remaining adjacent pairs) ────────────
    for (let gi = 0; gi < gridSize; gi++) {
        for (let gj = 0; gj < gridSize; gj++) {
            const neighbors = [[gi, gj + 1], [gi + 1, gj]]
                .filter(([r, c]) => r < gridSize && c < gridSize);
            for (const [ni, nj] of neighbors) {
                const pairKey = [roomGrid[gi][gj].id, roomGrid[ni][nj].id].sort().join('|');
                if (!connectedPairs.has(pairKey) && Math.random() < 0.25) {
                    makeCorridor(roomGrid[gi][gj], roomGrid[ni][nj], gi, gj, ni, nj);
                }
            }
        }
    }
    return { rooms, corridors };
}
// ── Helpers ───────────────────────────────────────────────────────────────────
function makeWall(id) {
    return { id, name: 'Stone Wall', description: '', HP: 20, state: 'intact' };
}
function makeDoor(id, name, isLocked, keyLock) {
    return { id, name, description: '', keyLock, isLocked, isTrapped: false, toPick: isLocked ? 3 : null, trap: null, HP: 10, state: 'closed', isHidden: false, toFind: 1, isFound: false, spReward: null, itemRequirement: null };
}
function squareKey(r, c) { return `${r}:${c}`; }
// ── DB Fetchers ───────────────────────────────────────────────────────────────
async function fetchPublicMonsters() {
    const { rows } = await db_1.default.query(`
    SELECT id, name, type, description, hp, ac,
      movmenteconomy AS "movementEconomy", runat AS "runAt", numberofattacks AS "numberOfAttacks",
      COALESCE(attacks, '[]'::jsonb) AS attacks,
      COALESCE(spreward, 0) AS "spReward", COALESCE(magic, 0) AS magic,
      COALESCE(magicresistance, 0) AS "magicResistance",
      COALESCE(callsreinforcements, false) AS "callsReinforcements",
      COALESCE(reinforcementcount, 0) AS "reinforcementCount",
      reinforcementmonstername AS "reinforcementMonsterName",
      COALESCE(tohitplusneeded, 0) AS "toHitPlusNeeded",
      imageid AS "imageId", soundid AS "soundId",
      COALESCE(tresherids, '[]'::jsonb) AS "tresherIds",
      COALESCE(keyids, '[]'::jsonb) AS "keyIds",
      npc_greeting AS "npcGreeting", npc_info_1 AS "npcInfo1",
      npc_info_2 AS "npcInfo2", npc_info_3 AS "npcInfo3",
      COALESCE(npc_only_attack_when_attacked, false) AS "npcOnlyAttackWhenAttacked",
      COALESCE(npc_gives_info_after_damaged, false) AS "npcGivesInfoAfterDamaged",
      COALESCE(npc_attacks_after_info, false) AS "npcAttacksAfterInfo",
      COALESCE(npc_can_trade, false) AS "npcCanTrade",
      COALESCE(awareness, 5) AS awareness
    FROM monsters WHERE ispublic = true ORDER BY LOWER(name) LIMIT 40
  `);
    return rows;
}
async function fetchPublicItems() {
    const { rows } = await db_1.default.query(`
    SELECT id, name, type, description,
      COALESCE(NULLIF(range, '')::int, 0) AS range,
      COALESCE(effectvalue, 0) AS "effectValue", COALESCE(damage, 0) AS damage,
      armorslot AS "armorSlot", effecton AS "effectOn",
      COALESCE(weaponeffecttype, 'Blood') AS "weaponEffectType",
      COALESCE(weaponeffectcolor, '#cc0000') AS "weaponEffectColor",
      imageid AS "imageId", COALESCE(istwohanded, false) AS "isTwoHanded"
    FROM items WHERE ispublic = true ORDER BY LOWER(name) LIMIT 30
  `);
    return rows;
}
async function fetchPublicPotions() {
    const { rows } = await db_1.default.query(`
    SELECT id, name, description,
      effectto AS "effectTo", effectnumber AS "effectAmount", effecttime AS "lastFor"
    FROM potions WHERE ispublic = true ORDER BY LOWER(name) LIMIT 20
  `);
    return rows;
}
async function fetchPublicSpells() {
    const { rows } = await db_1.default.query(`
    SELECT id, name, description,
      COALESCE(range1, range, 0) AS range, effecton AS "effectOn",
      COALESCE(damage, 0) AS "effectAmount",
      COALESCE(successtestvalue, 0) AS "successTestValue",
      COALESCE(sp, 0) AS sp,
      COALESCE(lastfor1, lastfor, 0) AS "lastFor",
      COALESCE(numberoftargets, 1) AS "numberOfTargets",
      COALESCE(magiccost, 1) AS "magicCost"
    FROM spells WHERE ispublic = true ORDER BY LOWER(name) LIMIT 20
  `);
    return rows;
}
// ── OpenAI Call ───────────────────────────────────────────────────────────────
async function callOpenAI(layout, params, monsters, items, potions, spells) {
    const apiKey = process.env['OPENAI_API_KEY'];
    if (!apiKey)
        throw new Error('OPENAI_API_KEY is not configured in the backend .env file.');
    const openai = new openai_1.default({ apiKey });
    const roomList = layout.rooms.map(r => r.id).join(', ');
    const corridorList = layout.corridors.map(c => `${c.roomAId}↔${c.roomBId}`).join(', ');
    const monsterList = monsters.length
        ? monsters.map(m => `  {id:${m.id}, name:"${m.name}", type:"${m.type}", hp:${m.hp}, ac:${m.ac}, spReward:${m.spReward}}`).join('\n')
        : '  (none available)';
    const itemList = items.length
        ? items.map(i => `  {id:${i.id}, name:"${i.name}", type:"${i.type}"}`).join('\n')
        : '  (none available)';
    const potionList = potions.length
        ? potions.map(p => `  {id:${p.id}, name:"${p.name}", effectTo:"${p.effectTo}"}`).join('\n')
        : '  (none available)';
    const spellList = spells.length
        ? spells.map(s => `  {id:${s.id}, name:"${s.name}", effectOn:"${s.effectOn}"}`).join('\n')
        : '  (none available)';
    const systemPrompt = `You are an expert dungeon master creating immersive content for a fantasy RPG dungeon. Return ONLY valid JSON — no markdown, no code fences, no commentary.`;
    const userPrompt = `Create dungeon content for: "${params.name}"
Story / theme: ${params.story}
Minimum player level (SP): ${params.level}
Dungeon size: ${params.size} (${layout.rooms.length} rooms connected by ${layout.corridors.length} corridors)

ROOMS (you must provide content for EVERY room listed):
${roomList}

CORRIDORS (connection between room pairs — decide if each is open / door / locked):
${corridorList}

AVAILABLE MONSTERS — use ONLY these DB IDs (empty array [] if none fit):
${monsterList}

AVAILABLE ITEMS (floor placement) — use ONLY these DB IDs:
${itemList}

AVAILABLE POTIONS — use ONLY these DB IDs:
${potionList}

AVAILABLE SPELLS — use ONLY these DB IDs:
${spellList}

RULES:
1. Exactly ONE room must have "isStartRoom": true (include "startFacing": "right").
2. Exactly ONE room must have "hasExit": true (include "exitType": "stairsDown").
3. Start and exit rooms should NOT be the same room.
4. If a corridor type is "locked" you MUST provide "keyName" AND either "keyInRoom" (a room ID from the list) OR "keyOnFirstMonsterInRoom" (a room ID that has ≥1 monster). The key must be accessible before the locked door.
5. Scale difficulty to SP level ${params.level}: low SP (< 20) = easy monsters; mid SP (20–60) = medium; high SP (> 60) = tough.
6. Not every room needs monsters. Empty rooms are fine for atmosphere.
7. Only reference DB IDs that appear in the lists above.
8. portals[] is optional — omit or set to [] if not needed.
9. signText should be short — a one-sentence inscription on the wall.
10. obstacleDescription is a short name for an obstacle (altar, statue, barrel, etc.) or null.

Return this exact JSON schema (fill in ALL ${layout.rooms.length} rooms):
{
  "rooms": [
    {
      "id": "r0_0",
      "name": "Room Name",
      "description": "One or two sentences — what the player sees on entering.",
      "isStartRoom": false,
      "startFacing": "right",
      "hasExit": false,
      "exitType": "stairsDown",
      "monsterDbIds": [],
      "treasureGold": 0,
      "treasureSilver": 0,
      "treasureCopper": 0,
      "hasLoot": false,
      "lootDescription": "",
      "floorItemDbIds": [],
      "floorPotionDbIds": [],
      "floorSpellDbIds": [],
      "obstacleDescription": null,
      "signText": null
    }
  ],
  "corridors": [
    {
      "roomAId": "r0_0",
      "roomBId": "r0_1",
      "type": "open",
      "doorName": "Wooden Door",
      "keyName": "",
      "keyInRoom": null,
      "keyOnFirstMonsterInRoom": null
    }
  ],
  "portals": []
}`;
    const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ],
        temperature: 0.85,
        max_tokens: 16000,
    });
    const choice = response.choices[0];
    const content = choice?.message?.content ?? '';
    if (!content)
        throw new Error('OpenAI returned an empty response.');
    if (choice?.finish_reason === 'length') {
        throw new Error('OpenAI response was truncated (too long). Try a smaller dungeon size.');
    }
    return JSON.parse(content);
}
// ── Blueprint Validation ──────────────────────────────────────────────────────
function validateAndRepair(blueprint, layout, monsters, items, potions, spells) {
    const layoutRoomIds = new Set(layout.rooms.map(r => r.id));
    const validMonsterIds = new Set(monsters.map(m => m.id));
    const validItemIds = new Set(items.map(i => i.id));
    const validPotionIds = new Set(potions.map(p => p.id));
    const validSpellIds = new Set(spells.map(s => s.id));
    // Ensure blueprint has an entry for every layout room
    const bpRoomMap = new Map(blueprint.rooms.map(r => [r.id, r]));
    for (const lr of layout.rooms) {
        if (!bpRoomMap.has(lr.id)) {
            blueprint.rooms.push({ id: lr.id, name: 'Abandoned Room', description: 'Dust and silence fill this forgotten chamber.', isStartRoom: false, hasExit: false, monsterDbIds: [], treasureGold: 0, treasureSilver: 0, treasureCopper: 0, hasLoot: false, lootDescription: '', floorItemDbIds: [], floorPotionDbIds: [], floorSpellDbIds: [], obstacleDescription: null, signText: null });
        }
    }
    // Ensure exactly one start room
    const startRooms = blueprint.rooms.filter(r => r.isStartRoom);
    if (startRooms.length === 0) {
        blueprint.rooms[0].isStartRoom = true;
        blueprint.rooms[0].startFacing = 'right';
    }
    else if (startRooms.length > 1) {
        startRooms.slice(1).forEach(r => { r.isStartRoom = false; });
    }
    // Ensure exactly one exit room (not the same as start)
    const exitRooms = blueprint.rooms.filter(r => r.hasExit);
    if (exitRooms.length === 0) {
        const lastNonStart = [...blueprint.rooms].reverse().find(r => !r.isStartRoom) ?? blueprint.rooms[blueprint.rooms.length - 1];
        lastNonStart.hasExit = true;
        lastNonStart.exitType = 'stairsDown';
    }
    else if (exitRooms.length > 1) {
        exitRooms.slice(1).forEach(r => { r.hasExit = false; });
    }
    // Strip invalid DB IDs
    for (const r of blueprint.rooms) {
        r.monsterDbIds = (r.monsterDbIds ?? []).filter(id => validMonsterIds.has(id));
        r.floorItemDbIds = (r.floorItemDbIds ?? []).filter(id => validItemIds.has(id));
        r.floorPotionDbIds = (r.floorPotionDbIds ?? []).filter(id => validPotionIds.has(id));
        r.floorSpellDbIds = (r.floorSpellDbIds ?? []).filter(id => validSpellIds.has(id));
    }
    // Validate corridors match layout
    const layoutCorridorSet = new Set(layout.corridors.flatMap(c => [`${c.roomAId}|${c.roomBId}`, `${c.roomBId}|${c.roomAId}`]));
    blueprint.corridors = (blueprint.corridors ?? []).filter(c => layoutCorridorSet.has(`${c.roomAId}|${c.roomBId}`) || layoutCorridorSet.has(`${c.roomBId}|${c.roomAId}`));
    // Fix locked corridors missing key info
    for (const c of blueprint.corridors) {
        if (c.type === 'locked') {
            if (!c.keyName)
                c.keyName = 'Iron Key';
            if (!c.keyInRoom && !c.keyOnFirstMonsterInRoom) {
                const startRoom = blueprint.rooms.find(r => r.isStartRoom);
                c.keyInRoom = startRoom?.id ?? blueprint.rooms[0]?.id ?? null;
            }
        }
    }
    // Validate portals reference existing rooms
    blueprint.portals = (blueprint.portals ?? []).filter(p => layoutRoomIds.has(p.fromRoomId) && layoutRoomIds.has(p.toRoomId));
}
// ── Payload Builder ────────────────────────────────────────────────────────────
function buildDungonPayload(layout, blueprint, monsters, items, potions, spells) {
    const monsterDbMap = new Map(monsters.map(m => [m.id, m]));
    const itemDbMap = new Map(items.map(i => [i.id, i]));
    const potionDbMap = new Map(potions.map(p => [p.id, p]));
    const spellDbMap = new Map(spells.map(s => [s.id, s]));
    const roomMap = new Map(layout.rooms.map(r => [r.id, r]));
    const bpRoomMap = new Map(blueprint.rooms.map(r => [r.id, r]));
    // Build AI corridor lookup
    const aiCorridorMap = new Map();
    for (const ac of blueprint.corridors) {
        aiCorridorMap.set(`${ac.roomAId}|${ac.roomBId}`, ac);
        aiCorridorMap.set(`${ac.roomBId}|${ac.roomAId}`, ac);
    }
    const filledSquares = {};
    const squares = {};
    let nextWallId = 1, nextDoorId = 1, nextKeyId = 1, nextSquareId = 1;
    let nextTresherId = 1, nextMonsterId = 1, nextExitId = 1, nextObstacleId = 1, nextPortalId = 1, nextSquareTextId = 1;
    // ── Fill rooms ──────────────────────────────────────────────────────────────
    for (const room of layout.rooms) {
        for (let r = room.rowStart; r <= room.rowEnd; r++) {
            for (let c = room.colStart; c <= room.colEnd; c++) {
                const key = squareKey(r, c);
                filledSquares[key] = true;
                squares[key] = {
                    id: nextSquareId++, row: r, column: c, description: '', isTrapped: false,
                    toTop: r === room.rowStart ? makeWall(nextWallId++) : null,
                    toBottom: r === room.rowEnd ? makeWall(nextWallId++) : null,
                    toLeft: c === room.colStart ? makeWall(nextWallId++) : null,
                    toRight: c === room.colEnd ? makeWall(nextWallId++) : null,
                };
            }
        }
    }
    // ── Corridors: create squares + open/door/lock room boundaries ──────────────
    const keyList = [];
    // Map: corridorPairKey → Key (for locked corridors)
    const corridorKeyMap = new Map();
    for (const corridor of layout.corridors) {
        const aiKey = `${corridor.roomAId}|${corridor.roomBId}`;
        const aiCorridor = aiCorridorMap.get(aiKey);
        const connType = aiCorridor?.type ?? 'open';
        corridor.connectionType = connType;
        // Build door/key for this corridor if needed
        let door = null;
        if (connType === 'door' || connType === 'locked') {
            let keyLock = null;
            if (connType === 'locked') {
                const keyName = aiCorridor?.keyName ?? 'Bronze Key';
                const key = { id: nextKeyId++, name: keyName, description: `Opens the passage between ${corridor.roomAId} and ${corridor.roomBId}`, doorId: null, rownId: null, columnId: null };
                keyList.push(key);
                corridorKeyMap.set(aiKey, key);
                corridorKeyMap.set(`${corridor.roomBId}|${corridor.roomAId}`, key);
                keyLock = key;
            }
            door = makeDoor(nextDoorId++, aiCorridor?.doorName ?? 'Wooden Door', connType === 'locked', keyLock);
            if (keyLock)
                keyLock.doorId = door.id;
        }
        const { corridorRow: corRow, corridorCol: corCol, direction } = corridor;
        const roomA = roomMap.get(corridor.roomAId);
        const roomB = roomMap.get(corridor.roomBId);
        const cKey = squareKey(corRow, corCol);
        let corSquare;
        if (direction === 'horizontal') {
            const leftRoom = roomA.colStart < roomB.colStart ? roomA : roomB;
            const rightRoom = leftRoom === roomA ? roomB : roomA;
            corSquare = { id: nextSquareId++, row: corRow, column: corCol, description: '', isTrapped: false, toTop: makeWall(nextWallId++), toBottom: makeWall(nextWallId++), toLeft: null, toRight: null };
            // Door placed at the entry from the left room (left boundary of corridor)
            const leftSq = squares[squareKey(corRow, leftRoom.colEnd)];
            if (leftSq) {
                leftSq.toRight = door;
            } // left room → corridor
            corSquare.toLeft = door; // corridor ← left room (shared door obj)
            // Right side is open
            const rightSq = squares[squareKey(corRow, rightRoom.colStart)];
            if (rightSq) {
                rightSq.toLeft = null;
            } // right room ← corridor open
            corSquare.toRight = null; // corridor → right room open
        }
        else {
            const topRoom = roomA.rowStart < roomB.rowStart ? roomA : roomB;
            const bottomRoom = topRoom === roomA ? roomB : roomA;
            corSquare = { id: nextSquareId++, row: corRow, column: corCol, description: '', isTrapped: false, toTop: null, toBottom: null, toLeft: makeWall(nextWallId++), toRight: makeWall(nextWallId++) };
            // Door placed at the entry from the top room
            const topSq = squares[squareKey(topRoom.rowEnd, corCol)];
            if (topSq) {
                topSq.toBottom = door;
            }
            corSquare.toTop = door;
            const botSq = squares[squareKey(bottomRoom.rowStart, corCol)];
            if (botSq) {
                botSq.toTop = null;
            }
            corSquare.toBottom = null;
        }
        filledSquares[cKey] = true;
        squares[cKey] = corSquare;
    }
    // ── Key placement (floor keys) ───────────────────────────────────────────────
    for (const corridor of layout.corridors) {
        if (corridor.connectionType !== 'locked')
            continue;
        const aiKey = `${corridor.roomAId}|${corridor.roomBId}`;
        const aiCorridor = aiCorridorMap.get(aiKey);
        const key = corridorKeyMap.get(aiKey);
        if (!key || !aiCorridor)
            continue;
        const targetRoomId = aiCorridor.keyInRoom ?? null;
        if (targetRoomId) {
            const room = roomMap.get(targetRoomId);
            if (room) {
                key.rownId = room.rowStart;
                key.columnId = room.colStart;
            }
        }
        // If keyOnFirstMonsterInRoom: key stays on the monster (rownId null), handled in monster section
    }
    // ── Monsters ─────────────────────────────────────────────────────────────────
    const monsterList = [];
    const monsterPlacements = [];
    const dbIdToLocalId = new Map();
    const allUsedDbIds = new Set(blueprint.rooms.flatMap(r => r.monsterDbIds ?? []));
    for (const dbId of allUsedDbIds) {
        const dbM = monsterDbMap.get(dbId);
        if (!dbM)
            continue;
        const localId = nextMonsterId++;
        dbIdToLocalId.set(dbId, localId);
        monsterList.push({ id: localId, imageId: dbM.imageId, soundId: dbM.soundId, tresherIds: dbM.tresherIds ?? [], keyIds: [], name: dbM.name, type: dbM.type, description: dbM.description ?? '', hp: dbM.hp, movementEconomy: dbM.movementEconomy, ac: dbM.ac, runAt: dbM.runAt, numberOfAttacks: dbM.numberOfAttacks, attacks: dbM.attacks ?? [], spReward: dbM.spReward, magic: dbM.magic, magicResistance: dbM.magicResistance, callsReinforcements: dbM.callsReinforcements, reinforcementCount: dbM.reinforcementCount, reinforcementMonsterName: dbM.reinforcementMonsterName, toHitPlusNeeded: dbM.toHitPlusNeeded, npcGreeting: dbM.npcGreeting, npcInfo1: dbM.npcInfo1, npcInfo2: dbM.npcInfo2, npcInfo3: dbM.npcInfo3, npcOnlyAttackWhenAttacked: dbM.npcOnlyAttackWhenAttacked, npcGivesInfoAfterDamaged: dbM.npcGivesInfoAfterDamaged, npcAttacksAfterInfo: dbM.npcAttacksAfterInfo, npcCanTrade: dbM.npcCanTrade, awareness: dbM.awareness });
    }
    // Determine which rooms should give their first monster a key
    const roomMonsterKeyMap = new Map();
    for (const corridor of layout.corridors) {
        if (corridor.connectionType !== 'locked')
            continue;
        const aiKey = `${corridor.roomAId}|${corridor.roomBId}`;
        const aiCorridor = aiCorridorMap.get(aiKey);
        const key = corridorKeyMap.get(aiKey);
        if (!key || !aiCorridor?.keyOnFirstMonsterInRoom || aiCorridor.keyInRoom)
            continue;
        const existing = roomMonsterKeyMap.get(aiCorridor.keyOnFirstMonsterInRoom) ?? [];
        existing.push(key.id);
        roomMonsterKeyMap.set(aiCorridor.keyOnFirstMonsterInRoom, existing);
    }
    const placedMonsterPositions = new Set();
    for (const aiRoom of blueprint.rooms) {
        const room = roomMap.get(aiRoom.id);
        if (!room)
            continue;
        const monsterDbIds = aiRoom.monsterDbIds ?? [];
        const keyIdsForRoom = roomMonsterKeyMap.get(aiRoom.id) ?? [];
        let placedInRoom = 0;
        for (let idx = 0; idx < monsterDbIds.length; idx++) {
            const dbId = monsterDbIds[idx];
            const localId = dbIdToLocalId.get(dbId);
            if (localId === undefined)
                continue;
            // Pick a position in the room, avoiding overlaps
            let placeRow = -1, placeCol = -1;
            for (let r = room.rowStart; r <= room.rowEnd && placeRow === -1; r++) {
                for (let c = room.colStart; c <= room.colEnd && placeRow === -1; c++) {
                    if (!placedMonsterPositions.has(squareKey(r, c))) {
                        placeRow = r;
                        placeCol = c;
                    }
                }
            }
            if (placeRow === -1)
                continue;
            placedMonsterPositions.add(squareKey(placeRow, placeCol));
            // First monster in room may carry keys
            const assignedKeys = placedInRoom === 0 ? keyIdsForRoom : [];
            if (assignedKeys.length > 0) {
                const monEntry = monsterList.find(m => m.id === localId);
                if (monEntry)
                    monEntry.keyIds = [...(monEntry.keyIds ?? []), ...assignedKeys];
                // Remove floor coordinates from those keys (they're on the monster now)
                for (const kid of assignedKeys) {
                    const k = keyList.find(k => k.id === kid);
                    if (k) {
                        k.rownId = null;
                        k.columnId = null;
                    }
                }
            }
            monsterPlacements.push({ monsterId: localId, row: placeRow, column: placeCol, roam: false });
            placedInRoom++;
        }
    }
    // ── Treshers ─────────────────────────────────────────────────────────────────
    const tresherList = [];
    const tresherPlacements = [];
    for (const aiRoom of blueprint.rooms) {
        if (!aiRoom.hasLoot)
            continue;
        const room = roomMap.get(aiRoom.id);
        if (!room)
            continue;
        const tid = nextTresherId++;
        tresherList.push({ id: tid, name: aiRoom.lootDescription || 'Treasure Chest', description: '', gold: aiRoom.treasureGold ?? 0, silver: aiRoom.treasureSilver ?? 0, copper: aiRoom.treasureCopper ?? 0, zinc: 0, item1Id: null, item2Id: null, item3Id: null, item4Id: null, spell1Id: null, spell2Id: null, spell3Id: null, spell4Id: null, curse1Id: null, curse2Id: null, potion1Id: null, potion2Id: null, potion3Id: null, imageId: null, soundId: null, spReward: 0, trap: null });
        // Place chest at bottom-right corner of room, avoiding monster overlap
        let tRow = room.rowEnd, tCol = room.colEnd;
        if (placedMonsterPositions.has(squareKey(tRow, tCol)))
            tCol = room.colStart;
        tresherPlacements.push({ tresherId: tid, row: tRow, column: tCol });
    }
    // ── Floor items / potions / spells ────────────────────────────────────────────
    const itemPlacements = [];
    const potionPlacements = [];
    const spellPlacements = [];
    const floorItemList = [];
    const floorPotionList = [];
    const floorSpellList = [];
    const seenItemIds = new Set(), seenPotionIds = new Set(), seenSpellIds = new Set();
    for (const aiRoom of blueprint.rooms) {
        const room = roomMap.get(aiRoom.id);
        if (!room)
            continue;
        let offset = 0;
        for (const itemId of (aiRoom.floorItemDbIds ?? [])) {
            const dbI = itemDbMap.get(itemId);
            if (!dbI)
                continue;
            const r = room.rowStart, c = room.colStart + Math.min(offset, room.colEnd - room.colStart);
            itemPlacements.push({ itemId, row: r, column: c });
            if (!seenItemIds.has(itemId)) {
                seenItemIds.add(itemId);
                floorItemList.push({ id: dbI.id, name: dbI.name, description: dbI.description, type: dbI.type, imageId: dbI.imageId, effectValue: dbI.effectValue, damage: dbI.damage, range: dbI.range, armorSlot: dbI.armorSlot, effectOn: dbI.effectOn, weaponEffectType: dbI.weaponEffectType, weaponEffectColor: dbI.weaponEffectColor, isTwoHanded: dbI.isTwoHanded });
            }
            offset++;
        }
        offset = 0;
        for (const potionId of (aiRoom.floorPotionDbIds ?? [])) {
            const dbP = potionDbMap.get(potionId);
            if (!dbP)
                continue;
            const r = room.rowStart + Math.min(1, room.rowEnd - room.rowStart), c = room.colStart + Math.min(offset, room.colEnd - room.colStart);
            potionPlacements.push({ potionId, row: r, column: c });
            if (!seenPotionIds.has(potionId)) {
                seenPotionIds.add(potionId);
                floorPotionList.push({ id: dbP.id, name: dbP.name, description: dbP.description, effectTo: dbP.effectTo, effectAmount: dbP.effectAmount, lastFor: dbP.lastFor });
            }
            offset++;
        }
        offset = 0;
        for (const spellId of (aiRoom.floorSpellDbIds ?? [])) {
            const dbS = spellDbMap.get(spellId);
            if (!dbS)
                continue;
            const r = room.rowStart + Math.min(2, room.rowEnd - room.rowStart), c = room.colStart + Math.min(offset, room.colEnd - room.colStart);
            spellPlacements.push({ spellId, row: r, column: c });
            if (!seenSpellIds.has(spellId)) {
                seenSpellIds.add(spellId);
                floorSpellList.push({ id: dbS.id, name: dbS.name, description: dbS.description, range: dbS.range, effectOn: dbS.effectOn, effectAmount: dbS.effectAmount, successTestValue: dbS.successTestValue, sp: dbS.sp, lastFor: dbS.lastFor, numberOfTargets: dbS.numberOfTargets, magicCost: dbS.magicCost });
            }
            offset++;
        }
    }
    // ── Obstacles ─────────────────────────────────────────────────────────────────
    const obstaclePlacements = [];
    for (const aiRoom of blueprint.rooms) {
        if (!aiRoom.obstacleDescription)
            continue;
        const room = roomMap.get(aiRoom.id);
        if (!room)
            continue;
        // Place at top-left corner if not occupied
        const obsRow = room.rowStart, obsCol = room.colEnd;
        if (!placedMonsterPositions.has(squareKey(obsRow, obsCol))) {
            obstaclePlacements.push({ id: nextObstacleId++, row: obsRow, column: obsCol, name: aiRoom.obstacleDescription, note: '', imageId: null, hp: 20, isIndestructible: false, containsItemId: null, shape: 'square', heightPercent: 80, heightAnchor: 'floor', widthPercent: 70, widthAnchor: 'center', color: null });
        }
    }
    // ── Portals ────────────────────────────────────────────────────────────────────
    const portalPlacements = [];
    for (const aiPortal of (blueprint.portals ?? [])) {
        const fromRoom = roomMap.get(aiPortal.fromRoomId);
        const toRoom = roomMap.get(aiPortal.toRoomId);
        if (!fromRoom || !toRoom)
            continue;
        portalPlacements.push({ id: nextPortalId++, name: aiPortal.name || 'Magic Portal', description: '', look: aiPortal.look || 'magicDoor', isTwoWay: aiPortal.isTwoWay, startRow: fromRoom.rowEnd, startColumn: fromRoom.colEnd, endRow: toRoom.rowStart, endColumn: toRoom.colStart });
    }
    // ── Square texts / room descriptions ─────────────────────────────────────────
    const squareTexts = [];
    for (const aiRoom of blueprint.rooms) {
        if (!aiRoom.signText)
            continue;
        const room = roomMap.get(aiRoom.id);
        if (!room)
            continue;
        squareTexts.push({ id: nextSquareTextId++, row: room.rowStart, column: room.colStart, text: aiRoom.signText, wallSide: null });
    }
    // Apply room descriptions to center squares
    for (const aiRoom of blueprint.rooms) {
        const room = roomMap.get(aiRoom.id);
        if (!room)
            continue;
        const cRow = room.rowStart + Math.floor((room.rowEnd - room.rowStart) / 2);
        const cCol = room.colStart + Math.floor((room.colEnd - room.colStart) / 2);
        const sq = squares[squareKey(cRow, cCol)];
        if (sq)
            sq.description = `${aiRoom.name}: ${aiRoom.description}`;
    }
    // ── Start point & exit ─────────────────────────────────────────────────────────
    const startAiRoom = blueprint.rooms.find(r => r.isStartRoom);
    const startRoom = startAiRoom ? roomMap.get(startAiRoom.id) : null;
    const startpoint = startRoom ? { row: startRoom.rowStart, col: startRoom.colStart, description: startAiRoom.description, playerSees: startAiRoom.name } : null;
    const exitAiRoom = blueprint.rooms.find(r => r.hasExit);
    const exitRoom = exitAiRoom ? roomMap.get(exitAiRoom.id) : null;
    const exits = exitRoom ? [{ id: nextExitId++, row: exitRoom.rowEnd, column: exitRoom.colEnd, destinationType: 'outside', destinationDungonId: null, transitionType: exitAiRoom.exitType ?? 'stairsDown', itemRequirement: null }] : [];
    const cheater = { name: 'Adventurer', rangeOfSight: 5, facingDir: startAiRoom?.startFacing ?? 'right', inventory: { keys: [], treshers: [] } };
    return {
        filledSquares, squares, keyList, cheater, startpoint,
        exits, exitList: exits,
        tresherList, tresherPlacements, tresherPlacementList: tresherPlacements, trasherPlacements: tresherPlacements,
        monsterList, monsters: monsterList, monsterPlacements, monsterPlacementList: monsterPlacements,
        squareTexts, floorTrapPlacements: [], obstaclePlacements, portalPlacements,
        itemPlacements, potionPlacements, spellPlacements,
        floorItemList, floorPotionList, floorSpellList, spellList: floorSpellList,
    };
}
function asObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : {};
}
function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
}
function promptSafe(value) {
    return value.replace(/"/g, "'").replace(/\s+/g, ' ').trim();
}
function parseFilledSquares(source, squares) {
    const filledSquaresSource = asObject(source['filledSquares']);
    const filledSquares = Object.keys(filledSquaresSource).reduce((accumulator, key) => {
        if (filledSquaresSource[key]) {
            accumulator[key] = true;
        }
        return accumulator;
    }, {});
    if (Object.keys(filledSquares).length === 0) {
        for (const key of Object.keys(squares)) {
            filledSquares[key] = true;
        }
    }
    return filledSquares;
}
function parseExistingDungonPayload(rawDungonJson) {
    const parsedSource = typeof rawDungonJson === 'string'
        ? JSON.parse(rawDungonJson)
        : rawDungonJson;
    const basePayload = asObject(parsedSource);
    const rawSquares = asObject(basePayload['squares']);
    const squares = Object.entries(rawSquares).reduce((accumulator, [key, value]) => {
        const square = asObject(value);
        const row = Number(square['row']);
        const column = Number(square['column']);
        if (Number.isFinite(row) && Number.isFinite(column)) {
            accumulator[key] = {
                ...square,
                row,
                column,
                description: typeof square['description'] === 'string' ? square['description'] : '',
            };
        }
        return accumulator;
    }, {});
    const filledSquares = parseFilledSquares(basePayload, squares);
    if (Object.keys(filledSquares).length === 0 || Object.keys(squares).length === 0) {
        throw new Error('Import or draw your dungeon tiles before generating content.');
    }
    const rawStartpoint = asObject(basePayload['startpoint'] ?? basePayload['startPoint']);
    const startRow = Number(rawStartpoint['row']);
    const startCol = Number(rawStartpoint['col']);
    if (!Number.isFinite(startRow) || !Number.isFinite(startCol)) {
        throw new Error('Set a start point before generating content.');
    }
    const startpoint = {
        row: startRow,
        col: startCol,
        description: typeof rawStartpoint['description'] === 'string' ? rawStartpoint['description'] : '',
        playerSees: typeof rawStartpoint['playerSees'] === 'string' ? rawStartpoint['playerSees'] : '',
    };
    const rawExits = Array.isArray(basePayload['exits'])
        ? basePayload['exits']
        : Array.isArray(basePayload['exitList'])
            ? basePayload['exitList']
            : [];
    const exits = rawExits.reduce((accumulator, value, index) => {
        const exit = asObject(value);
        const row = Number(exit['row']);
        const column = Number(exit['column']);
        if (!Number.isFinite(row) || !Number.isFinite(column)) {
            return accumulator;
        }
        accumulator.push({
            id: Number.isFinite(Number(exit['id'])) ? Number(exit['id']) : index + 1,
            row,
            column,
            destinationType: typeof exit['destinationType'] === 'string' ? exit['destinationType'] : 'outside',
            destinationDungonId: Number.isFinite(Number(exit['destinationDungonId'])) ? Number(exit['destinationDungonId']) : null,
            transitionType: typeof exit['transitionType'] === 'string' ? exit['transitionType'] : 'open',
            itemRequirement: exit['itemRequirement'] ?? null,
        });
        return accumulator;
    }, []);
    if (exits.length === 0) {
        throw new Error('Set an exit point before generating content.');
    }
    return {
        basePayload,
        filledSquares,
        squares,
        startpoint,
        exits,
        keyList: Array.isArray(basePayload['keyList']) ? deepClone(basePayload['keyList']) : [],
        cheater: Object.keys(asObject(basePayload['cheater'])).length > 0
            ? deepClone(asObject(basePayload['cheater']))
            : { name: 'Adventurer', rangeOfSight: 5, facingDir: 'right', inventory: { keys: [], treshers: [] } },
        portalPlacements: Array.isArray(basePayload['portalPlacements']) ? deepClone(basePayload['portalPlacements']) : [],
    };
}
const DIRECTION_STEPS = [
    { dr: -1, dc: 0, side: 'toTop', opposite: 'toBottom' },
    { dr: 0, dc: 1, side: 'toRight', opposite: 'toLeft' },
    { dr: 1, dc: 0, side: 'toBottom', opposite: 'toTop' },
    { dr: 0, dc: -1, side: 'toLeft', opposite: 'toRight' },
];
function isBarrier(side, includeDoors) {
    if (!side || typeof side !== 'object') {
        return false;
    }
    const sideRecord = side;
    const isDoor = 'isLocked' in sideRecord;
    if (isDoor) {
        return includeDoors;
    }
    return true;
}
function getNeighborKeys(square, squares, options) {
    const includeDoorsAsBarriers = options?.includeDoorsAsBarriers ?? false;
    const neighbors = [];
    for (const step of DIRECTION_STEPS) {
        const neighborKey = squareKey(square.row + step.dr, square.column + step.dc);
        const neighbor = squares[neighborKey];
        if (!neighbor) {
            continue;
        }
        if (isBarrier(square[step.side], includeDoorsAsBarriers)
            || isBarrier(neighbor[step.opposite], includeDoorsAsBarriers)) {
            continue;
        }
        neighbors.push(neighborKey);
    }
    return neighbors;
}
function buildDistanceMap(payload, originKey, options) {
    if (!payload.squares[originKey]) {
        return new Map();
    }
    const distanceMap = new Map([[originKey, 0]]);
    const queue = [originKey];
    while (queue.length > 0) {
        const currentKey = queue.shift();
        if (!currentKey) {
            continue;
        }
        const square = payload.squares[currentKey];
        if (!square) {
            continue;
        }
        const currentDistance = distanceMap.get(currentKey) ?? 0;
        for (const neighborKey of getNeighborKeys(square, payload.squares, options)) {
            if (distanceMap.has(neighborKey)) {
                continue;
            }
            distanceMap.set(neighborKey, currentDistance + 1);
            queue.push(neighborKey);
        }
    }
    return distanceMap;
}
function buildConnectedOpenAreaKeys(payload, anchorKey) {
    const distanceMap = buildDistanceMap(payload, anchorKey, { includeDoorsAsBarriers: true });
    return new Set(distanceMap.keys());
}
function buildPlacementCandidates(payload, options) {
    const distanceOriginKey = options?.distanceOriginKey ?? squareKey(payload.startpoint.row, payload.startpoint.col);
    const distanceMap = buildDistanceMap(payload, distanceOriginKey);
    const exitKeys = new Set(payload.exits.map((exit) => squareKey(exit.row, exit.column)));
    const startKey = squareKey(payload.startpoint.row, payload.startpoint.col);
    const finiteDistances = Array.from(distanceMap.values()).filter((value) => Number.isFinite(value));
    const furthestDistance = finiteDistances.length > 0 ? Math.max(...finiteDistances) : 0;
    const allowedSquareKeys = options?.allowedSquareKeys;
    const blockedSquareKeys = options?.blockedSquareKeys;
    return Object.entries(payload.squares)
        .filter(([key]) => (key !== startKey
        && !exitKeys.has(key)
        && (!allowedSquareKeys || allowedSquareKeys.has(key))
        && (!blockedSquareKeys || !blockedSquareKeys.has(key))))
        .map(([key, square]) => {
        const openness = getNeighborKeys(square, payload.squares).length;
        const distanceFromStart = distanceMap.get(key) ?? furthestDistance + 3;
        const tags = [];
        if (openness >= 3)
            tags.push('chamber');
        if (openness === 1)
            tags.push('dead-end');
        if (distanceFromStart <= 3)
            tags.push('near-start');
        if (distanceFromStart >= Math.max(4, furthestDistance - 2))
            tags.push('late-area');
        if (openness <= 2)
            tags.push('corridor');
        return { key, row: square.row, column: square.column, openness, distanceFromStart, tags };
    })
        .sort((left, right) => left.distanceFromStart - right.distanceFromStart || right.openness - left.openness);
}
function collectOccupiedSquareKeys(basePayload) {
    const occupied = new Set();
    const collections = [
        basePayload['monsterPlacements'],
        basePayload['monsterPlacementList'],
        basePayload['itemPlacements'],
        basePayload['potionPlacements'],
        basePayload['spellPlacements'],
        basePayload['tresherPlacements'],
        basePayload['tresherPlacementList'],
        basePayload['trasherPlacements'],
        basePayload['obstaclePlacements'],
        basePayload['floorTrapPlacements'],
    ];
    for (const collection of collections) {
        if (!Array.isArray(collection)) {
            continue;
        }
        for (const entry of collection) {
            const record = asObject(entry);
            const row = Number(record['row']);
            const column = Number(record['column']);
            if (Number.isFinite(row) && Number.isFinite(column)) {
                occupied.add(squareKey(row, column));
            }
        }
    }
    return occupied;
}
function clampCount(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function trimCandidates(candidates) {
    if (candidates.length <= 120) {
        return candidates;
    }
    const trimmed = [];
    const step = candidates.length / 120;
    for (let index = 0; index < 120; index++) {
        trimmed.push(candidates[Math.floor(index * step)]);
    }
    return trimmed;
}
async function callOpenAIToFillExistingDungon(payload, params, monsters, candidates, monsterCandidates) {
    const apiKey = process.env['OPENAI_API_KEY'];
    if (!apiKey)
        throw new Error('OPENAI_API_KEY is not configured in the backend .env file.');
    const openai = new openai_1.default({ apiKey });
    const monsterList = monsters.length
        ? monsters.map((monster) => `  {id:${monster.id}, name:"${promptSafe(monster.name)}", type:"${promptSafe(monster.type)}", hp:${monster.hp}, ac:${monster.ac}, spReward:${monster.spReward}}`).join('\n')
        : '  (none available)';
    const candidateList = trimCandidates(candidates)
        .map((candidate) => `  {square:"${candidate.key}", distance:${candidate.distanceFromStart}, openness:${candidate.openness}, tags:[${candidate.tags.map((tag) => `"${tag}"`).join(', ')}]}`)
        .join('\n');
    const monsterCandidateList = trimCandidates(monsterCandidates)
        .map((candidate) => `  {square:"${candidate.key}", distance:${candidate.distanceFromStart}, openness:${candidate.openness}, tags:[${candidate.tags.map((tag) => `"${tag}"`).join(', ')}]}`)
        .join('\n');
    const systemPrompt = 'You are an expert dungeon master filling an existing imported dungeon. Return ONLY valid JSON.';
    const userPrompt = `Fill the existing dungeon "${promptSafe(params.name)}".
Theme / story: ${promptSafe(params.story)}
What lives here: ${promptSafe(params.inhabitants)}
Minimum player level (SP): ${params.level}

The map geometry already exists. Do NOT create or move walls, exits, portals, or start/end positions.
Keep the start square (${payload.startpoint.row}:${payload.startpoint.col}) safe-ish and build difficulty farther from the start.

Candidate placement squares (use ONLY these square keys):
${candidateList}

Monster zone squares (monsterPlacements MUST use ONLY these square keys):
${monsterCandidateList}

Available monsters (use ONLY DB ids from this list):
${monsterList}

Rules:
1. Keep placements varied and sensible for the map theme.
2. Prefer 3-10 monster placements depending on dungeon size.
3. Use no more than one placement per square.
4. Use only the exact square keys and DB ids provided.
5. Keep startDescription and startPlayerSees short and atmospheric.
6. monsterPlacements squares must come from the Monster zone list.

Return this exact JSON schema:
{
  "startDescription": "Short text for the start point description.",
  "startPlayerSees": "Short text for what the player sees first.",
  "monsterPlacements": [
    { "square": "0:0", "monsterDbId": 1 }
  ]
}`;
    const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ],
        temperature: 0.8,
        max_tokens: 8000,
    });
    const choice = response.choices[0];
    const content = choice?.message?.content ?? '';
    if (!content) {
        throw new Error('OpenAI returned an empty response.');
    }
    if (choice?.finish_reason === 'length') {
        throw new Error('OpenAI response was truncated while filling the dungeon.');
    }
    return JSON.parse(content);
}
function buildFallbackFillBlueprint(payload, params, monsters, candidates, monsterCandidates) {
    const sortedMonsterCandidates = [...monsterCandidates].sort((left, right) => left.distanceFromStart - right.distanceFromStart || right.openness - left.openness);
    const monsterCount = monsters.length > 0 ? clampCount(Math.round(monsterCandidates.length / 16), 2, 6) : 0;
    const monsterPlacements = [];
    const usedSquares = new Set();
    for (let index = 0; index < monsterCount; index++) {
        const candidateIndex = Math.min(sortedMonsterCandidates.length - 1, Math.floor((index + 1) * sortedMonsterCandidates.length / (monsterCount + 1)));
        const candidate = sortedMonsterCandidates[candidateIndex];
        if (!candidate || usedSquares.has(candidate.key)) {
            continue;
        }
        const monster = monsters[Math.min(monsters.length - 1, index % monsters.length)];
        monsterPlacements.push({ square: candidate.key, monsterDbId: monster.id });
        usedSquares.add(candidate.key);
    }
    return {
        startDescription: payload.startpoint.description || `You enter ${params.name}. ${params.story}`,
        startPlayerSees: payload.startpoint.playerSees || 'Shadows, worn stone, and the promise of danger.',
        monsterPlacements,
        treasures: [],
        obstacles: [],
        notes: [],
    };
}
function validateFillBlueprint(blueprint, monsterCandidates, monsters) {
    const validMonsterSquares = new Set(monsterCandidates.map((candidate) => candidate.key));
    const validMonsterIds = new Set(monsters.map((monster) => monster.id));
    const usedSquares = new Set();
    const monsterPlacements = Array.isArray(blueprint.monsterPlacements)
        ? blueprint.monsterPlacements.filter((placement) => (validMonsterSquares.has(placement.square)
            && validMonsterIds.has(placement.monsterDbId)
            && !usedSquares.has(placement.square)
            && usedSquares.add(placement.square))).slice(0, 12)
        : [];
    return {
        startDescription: typeof blueprint.startDescription === 'string' ? blueprint.startDescription.trim() : '',
        startPlayerSees: typeof blueprint.startPlayerSees === 'string' ? blueprint.startPlayerSees.trim() : '',
        monsterPlacements,
        treasures: [],
        obstacles: [],
        notes: [],
    };
}
function buildFilledDungonPayload(payload, params, blueprint, monsters) {
    const output = deepClone(payload.basePayload);
    const squares = deepClone(payload.squares);
    const monsterDbMap = new Map(monsters.map((monster) => [monster.id, monster]));
    const monsterList = [];
    const monsterPlacements = [];
    const tresherList = [];
    const tresherPlacements = [];
    const obstaclePlacements = [];
    const squareTexts = [];
    let nextMonsterId = 1;
    let nextTresherId = 1;
    let nextObstacleId = 1;
    let nextSquareTextId = 1;
    for (const placement of blueprint.monsterPlacements) {
        const monster = monsterDbMap.get(placement.monsterDbId);
        if (!monster) {
            continue;
        }
        const localMonsterId = nextMonsterId++;
        monsterList.push({
            id: localMonsterId,
            imageId: monster.imageId,
            soundId: monster.soundId,
            tresherIds: [],
            keyIds: [],
            name: monster.name,
            type: monster.type,
            description: monster.description ?? '',
            hp: monster.hp,
            movementEconomy: monster.movementEconomy,
            ac: monster.ac,
            runAt: monster.runAt,
            numberOfAttacks: monster.numberOfAttacks,
            attacks: monster.attacks ?? [],
            spReward: monster.spReward,
            magic: monster.magic,
            magicResistance: monster.magicResistance,
            callsReinforcements: monster.callsReinforcements,
            reinforcementCount: monster.reinforcementCount,
            reinforcementMonsterName: monster.reinforcementMonsterName,
            toHitPlusNeeded: monster.toHitPlusNeeded,
            npcGreeting: monster.npcGreeting,
            npcInfo1: monster.npcInfo1,
            npcInfo2: monster.npcInfo2,
            npcInfo3: monster.npcInfo3,
            npcOnlyAttackWhenAttacked: monster.npcOnlyAttackWhenAttacked,
            npcGivesInfoAfterDamaged: monster.npcGivesInfoAfterDamaged,
            npcAttacksAfterInfo: monster.npcAttacksAfterInfo,
            npcCanTrade: monster.npcCanTrade,
            awareness: monster.awareness,
        });
        const [row, column] = placement.square.split(':').map(Number);
        monsterPlacements.push({ monsterId: localMonsterId, row, column, roam: false });
        if (squares[placement.square] && !String(squares[placement.square].description ?? '').trim()) {
            squares[placement.square].description = `${monster.name}: ${monster.description ?? 'Something dangerous watches this space.'}`;
        }
    }
    for (const treasure of blueprint.treasures) {
        const [row, column] = treasure.square.split(':').map(Number);
        const tresherId = nextTresherId++;
        tresherList.push({
            id: tresherId,
            type: 'box',
            name: treasure.name || 'Loot Cache',
            description: treasure.description || 'A stash of supplies and valuables.',
            gold: treasure.gold,
            silver: treasure.silver,
            copper: treasure.copper,
            zinc: 0,
            item1Id: treasure.itemDbIds[0] ?? null,
            item2Id: treasure.itemDbIds[1] ?? null,
            item3Id: treasure.itemDbIds[2] ?? null,
            item4Id: treasure.itemDbIds[3] ?? null,
            spell1Id: treasure.spellDbIds[0] ?? null,
            spell2Id: treasure.spellDbIds[1] ?? null,
            spell3Id: treasure.spellDbIds[2] ?? null,
            spell4Id: treasure.spellDbIds[3] ?? null,
            curse1Id: null,
            curse2Id: null,
            potion1Id: treasure.potionDbIds[0] ?? null,
            potion2Id: treasure.potionDbIds[1] ?? null,
            potion3Id: treasure.potionDbIds[2] ?? null,
            imageId: null,
            soundId: null,
            spReward: 0,
            trap: null,
        });
        tresherPlacements.push({ tresherId, row, column });
        if (squares[treasure.square]) {
            squares[treasure.square].description = `${treasure.name}: ${treasure.description}`;
        }
    }
    for (const obstacle of blueprint.obstacles) {
        const [row, column] = obstacle.square.split(':').map(Number);
        obstaclePlacements.push({
            id: nextObstacleId++,
            row,
            column,
            name: obstacle.name || 'Stone debris',
            note: obstacle.note ?? '',
            imageId: null,
            hp: 20,
            isIndestructible: false,
            containsItemId: null,
            shape: 'square',
            heightPercent: 80,
            heightAnchor: 'floor',
            widthPercent: 70,
            widthAnchor: 'center',
            color: null,
        });
    }
    for (const note of blueprint.notes) {
        const [row, column] = note.square.split(':').map(Number);
        squareTexts.push({ id: nextSquareTextId++, row, column, text: note.text, wallSide: null });
    }
    const startDescription = blueprint.startDescription || payload.startpoint.description || `You enter ${params.name}.`;
    const startPlayerSees = blueprint.startPlayerSees || payload.startpoint.playerSees || 'A dangerous path lies ahead.';
    const startKey = squareKey(payload.startpoint.row, payload.startpoint.col);
    if (squares[startKey]) {
        squares[startKey].description = startDescription;
    }
    return {
        ...output,
        filledSquares: deepClone(payload.filledSquares),
        squares,
        keyList: payload.keyList,
        cheater: payload.cheater,
        startpoint: {
            ...payload.startpoint,
            description: startDescription,
            playerSees: startPlayerSees,
        },
        exits: deepClone(payload.exits),
        exitList: deepClone(payload.exits),
        tresherList,
        tresherPlacements,
        tresherPlacementList: tresherPlacements,
        trasherPlacements: tresherPlacements,
        monsterList,
        monsters: monsterList,
        monsterPlacements,
        monsterPlacementList: monsterPlacements,
        squareTexts,
        floorTrapPlacements: [],
        obstaclePlacements,
        portalPlacements: payload.portalPlacements,
        itemPlacements: [],
        potionPlacements: [],
        spellPlacements: [],
        floorItemList: [],
        floorPotionList: [],
        floorSpellList: [],
        spellList: [],
    };
}
function buildManualFillBlueprint(payload, params, monsterCandidates, itemCandidates, validMonsterIds, validItemIds) {
    const usedSquares = new Set();
    const manualMonsters = Array.isArray(params.monsterRequests)
        ? params.monsterRequests
            .filter((request) => validMonsterIds.has(request.monsterDbId))
            .flatMap((request) => Array.from({ length: clampCount(request.count, 1, 200) }, () => request.monsterDbId))
        : [];
    const manualItems = Array.isArray(params.itemRequests)
        ? params.itemRequests
            .filter((request) => validItemIds.has(request.itemDbId))
            .flatMap((request) => Array.from({ length: clampCount(request.count, 1, 200) }, () => request.itemDbId))
        : [];
    const monsterPlacements = [];
    const itemPlacements = [];
    for (const monsterDbId of manualMonsters) {
        const candidate = monsterCandidates.find((entry) => !usedSquares.has(entry.key));
        if (!candidate) {
            break;
        }
        usedSquares.add(candidate.key);
        monsterPlacements.push({ square: candidate.key, monsterDbId });
    }
    for (const itemDbId of manualItems) {
        const candidate = itemCandidates.find((entry) => !usedSquares.has(entry.key));
        if (!candidate) {
            break;
        }
        usedSquares.add(candidate.key);
        itemPlacements.push({ square: candidate.key, itemDbId });
    }
    return {
        startDescription: payload.startpoint.description || `You enter ${params.name}.`,
        startPlayerSees: payload.startpoint.playerSees || 'Shadows, worn stone, and the promise of danger.',
        monsterPlacements,
        itemPlacements,
    };
}
function buildManualFilledDungonPayload(payload, params, blueprint, monsters, items) {
    const output = deepClone(payload.basePayload);
    const squares = deepClone(payload.squares);
    const monsterDbMap = new Map(monsters.map((monster) => [monster.id, monster]));
    const itemDbMap = new Map(items.map((item) => [item.id, item]));
    const existingMonsterList = Array.isArray(output['monsterList'])
        ? deepClone(output['monsterList'])
        : Array.isArray(output['monsters'])
            ? deepClone(output['monsters'])
            : [];
    const existingMonsterPlacements = Array.isArray(output['monsterPlacements'])
        ? deepClone(output['monsterPlacements'])
        : Array.isArray(output['monsterPlacementList'])
            ? deepClone(output['monsterPlacementList'])
            : [];
    const existingItemPlacements = Array.isArray(output['itemPlacements'])
        ? deepClone(output['itemPlacements'])
        : [];
    const monsterList = [...existingMonsterList];
    const monsterPlacements = [...existingMonsterPlacements];
    const itemPlacements = [...existingItemPlacements];
    const existingMonsterIds = monsterList
        .map((entry) => Number(asObject(entry)['id']))
        .filter((value) => Number.isInteger(value) && value > 0);
    let nextMonsterId = existingMonsterIds.length > 0 ? Math.max(...existingMonsterIds) + 1 : 1;
    for (const placement of blueprint.monsterPlacements) {
        const monster = monsterDbMap.get(placement.monsterDbId);
        if (!monster) {
            continue;
        }
        const localMonsterId = nextMonsterId++;
        monsterList.push({
            id: localMonsterId,
            imageId: monster.imageId,
            soundId: monster.soundId,
            tresherIds: [],
            keyIds: [],
            name: monster.name,
            type: monster.type,
            description: monster.description ?? '',
            hp: monster.hp,
            movementEconomy: monster.movementEconomy,
            ac: monster.ac,
            runAt: monster.runAt,
            numberOfAttacks: monster.numberOfAttacks,
            attacks: monster.attacks ?? [],
            spReward: monster.spReward,
            magic: monster.magic,
            magicResistance: monster.magicResistance,
            callsReinforcements: monster.callsReinforcements,
            reinforcementCount: monster.reinforcementCount,
            reinforcementMonsterName: monster.reinforcementMonsterName,
            toHitPlusNeeded: monster.toHitPlusNeeded,
            npcGreeting: monster.npcGreeting,
            npcInfo1: monster.npcInfo1,
            npcInfo2: monster.npcInfo2,
            npcInfo3: monster.npcInfo3,
            npcOnlyAttackWhenAttacked: monster.npcOnlyAttackWhenAttacked,
            npcGivesInfoAfterDamaged: monster.npcGivesInfoAfterDamaged,
            npcAttacksAfterInfo: monster.npcAttacksAfterInfo,
            npcCanTrade: monster.npcCanTrade,
            awareness: monster.awareness,
        });
        const [row, column] = placement.square.split(':').map(Number);
        monsterPlacements.push({ monsterId: localMonsterId, row, column, roam: false });
        if (squares[placement.square] && !String(squares[placement.square].description ?? '').trim()) {
            squares[placement.square].description = `${monster.name}: ${monster.description ?? 'Something dangerous watches this space.'}`;
        }
    }
    for (const placement of blueprint.itemPlacements) {
        const item = itemDbMap.get(placement.itemDbId);
        if (!item) {
            continue;
        }
        const [row, column] = placement.square.split(':').map(Number);
        itemPlacements.push({ itemId: item.id, row, column });
        if (squares[placement.square] && !String(squares[placement.square].description ?? '').trim()) {
            squares[placement.square].description = `${item.name}: ${item.description ?? 'A useful item rests here.'}`;
        }
    }
    const startDescription = blueprint.startDescription || payload.startpoint.description || `You enter ${params.name}.`;
    const startPlayerSees = blueprint.startPlayerSees || payload.startpoint.playerSees || 'A dangerous path lies ahead.';
    const placedItemIds = new Set(itemPlacements.map((placement) => {
        const record = placement;
        return record.itemId;
    }));
    const floorItemList = items
        .filter((item) => placedItemIds.has(item.id))
        .map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        type: item.type,
        imageId: item.imageId,
        effectValue: item.effectValue,
        damage: item.damage,
        range: item.range,
        armorSlot: item.armorSlot,
        effectOn: item.effectOn,
        weaponEffectType: item.weaponEffectType,
        weaponEffectColor: item.weaponEffectColor,
        isTwoHanded: item.isTwoHanded,
    }));
    return {
        ...output,
        filledSquares: deepClone(payload.filledSquares),
        squares,
        keyList: payload.keyList,
        cheater: payload.cheater,
        startpoint: {
            ...payload.startpoint,
            description: startDescription,
            playerSees: startPlayerSees,
        },
        exits: deepClone(payload.exits),
        exitList: deepClone(payload.exits),
        tresherList: Array.isArray(output['tresherList']) ? deepClone(output['tresherList']) : [],
        tresherPlacements: Array.isArray(output['tresherPlacements']) ? deepClone(output['tresherPlacements']) : [],
        tresherPlacementList: Array.isArray(output['tresherPlacementList']) ? deepClone(output['tresherPlacementList']) : [],
        trasherPlacements: Array.isArray(output['trasherPlacements']) ? deepClone(output['trasherPlacements']) : [],
        monsterList,
        monsters: monsterList,
        monsterPlacements,
        monsterPlacementList: monsterPlacements,
        squareTexts: Array.isArray(output['squareTexts']) ? deepClone(output['squareTexts']) : [],
        floorTrapPlacements: Array.isArray(output['floorTrapPlacements']) ? deepClone(output['floorTrapPlacements']) : [],
        obstaclePlacements: Array.isArray(output['obstaclePlacements']) ? deepClone(output['obstaclePlacements']) : [],
        portalPlacements: payload.portalPlacements,
        itemPlacements,
        potionPlacements: Array.isArray(output['potionPlacements']) ? deepClone(output['potionPlacements']) : [],
        spellPlacements: Array.isArray(output['spellPlacements']) ? deepClone(output['spellPlacements']) : [],
        floorItemList,
        floorPotionList: Array.isArray(output['floorPotionList']) ? deepClone(output['floorPotionList']) : [],
        floorSpellList: Array.isArray(output['floorSpellList']) ? deepClone(output['floorSpellList']) : [],
        spellList: Array.isArray(output['spellList']) ? deepClone(output['spellList']) : [],
    };
}
// ── Main Export ────────────────────────────────────────────────────────────────
async function generateDungon(params, rawDungonJson) {
    const existingPayload = parseExistingDungonPayload(rawDungonJson);
    const anchorRow = Number.isInteger(params.anchorRow) ? params.anchorRow : existingPayload.startpoint.row;
    const anchorColumn = Number.isInteger(params.anchorColumn) ? params.anchorColumn : existingPayload.startpoint.col;
    const anchorSquareKey = squareKey(anchorRow, anchorColumn);
    if (!existingPayload.squares[anchorSquareKey]) {
        throw new Error('Selected anchor square is not a valid open tile in this dungeon.');
    }
    const monsterZoneKeys = buildConnectedOpenAreaKeys(existingPayload, anchorSquareKey);
    if (monsterZoneKeys.size === 0) {
        throw new Error('No connected open area found from the selected anchor square.');
    }
    const monsters = await fetchPublicMonsters();
    const items = await fetchPublicItems();
    const blockedSquareKeys = collectOccupiedSquareKeys(existingPayload.basePayload);
    const candidates = buildPlacementCandidates(existingPayload, { distanceOriginKey: anchorSquareKey, blockedSquareKeys });
    const monsterCandidates = buildPlacementCandidates(existingPayload, {
        distanceOriginKey: anchorSquareKey,
        allowedSquareKeys: monsterZoneKeys,
        blockedSquareKeys,
    });
    if (candidates.length === 0) {
        throw new Error('This dungeon has no open floor squares available for generated content.');
    }
    if (monsterCandidates.length === 0) {
        throw new Error('No valid monster placement squares were found in the selected connected area.');
    }
    const itemCandidates = buildPlacementCandidates(existingPayload, {
        distanceOriginKey: anchorSquareKey,
        allowedSquareKeys: monsterZoneKeys,
        blockedSquareKeys,
    });
    const blueprint = buildManualFillBlueprint(existingPayload, params, monsterCandidates, itemCandidates, new Set(monsters.map((monster) => monster.id)), new Set(items.map((item) => item.id)));
    if (blueprint.monsterPlacements.length === 0 && blueprint.itemPlacements.length === 0) {
        throw new Error('No valid monster or item placements were created. Check your batch selections and available area.');
    }
    return buildManualFilledDungonPayload(existingPayload, params, blueprint, monsters, items);
}
