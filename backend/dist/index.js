"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const cors_1 = __importDefault(require("cors"));
const node_path_1 = __importDefault(require("node:path"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
dotenv_1.default.config({ path: node_path_1.default.resolve(__dirname, '../.env') });
const app = (0, express_1.default)();
app.set('trust proxy', 1); // Trust Caddy reverse proxy for rate limiting + IP detection
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '10mb' }));
// Protect login and register from brute force: max 20 attempts per 15 minutes per IP
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts, please try again later.' },
});
const userController = __importStar(require("./controllers/userController"));
const dungonController = __importStar(require("./controllers/dungonController"));
const tresherController = __importStar(require("./controllers/tresherController"));
const monsterController = __importStar(require("./controllers/monsterController"));
const imageController = __importStar(require("./controllers/imageController"));
const pcController = __importStar(require("./controllers/pcController"));
const friendController = __importStar(require("./controllers/friendController"));
const spellController = __importStar(require("./controllers/spellController"));
const potionController = __importStar(require("./controllers/potionController"));
const curseController = __importStar(require("./controllers/curseController"));
const itemController = __importStar(require("./controllers/itemController"));
const soundController = __importStar(require("./controllers/soundController"));
const tavernStashController = __importStar(require("./controllers/tavernStashController"));
const contactController = __importStar(require("./controllers/contactController"));
const dailyHitsController = __importStar(require("./controllers/dailyHitsController"));
app.get('/users/:id', userController.getUser);
app.post('/users', authLimiter, userController.createUser);
app.post('/login', authLimiter, userController.loginUser);
app.get('/users', userController.getAllUsers);
app.put('/users/:id', userController.updateUserFlags);
app.get('/dungons', dungonController.getDungons);
app.get('/dungons/published', dungonController.getPublishedDungons);
app.get('/dungons/sample', dungonController.getSampleDungon);
app.get('/dungons/admin-published', dungonController.getAdminPublishedDungons);
app.get('/dungons/:id', dungonController.getDungonById);
app.post('/dungons', dungonController.createDungon);
app.put('/dungons/:id/metadata', dungonController.updateDungonMetadata);
app.put('/dungons/:id/dungonjson', dungonController.updateDungonJson);
app.put('/dungons/:id/publish', dungonController.publishDungon);
app.post('/dungons/:id/generate', dungonController.generateDungonContent);
app.put('/dungons/:id/approve', dungonController.approveDungon);
app.put('/dungons/:id/set-sample', dungonController.setSampleDungon);
app.delete('/dungons/:id', dungonController.deleteDungon);
app.post('/dungons/:id/start', dungonController.startGameFromPublishedDungon);
app.get('/games', dungonController.getGamesForUser);
app.get('/games/sample-session', dungonController.getSampleGameSession);
app.get('/games/:id', dungonController.getGameById);
app.put('/games/:id/save', dungonController.saveGame);
app.delete('/games/:id', dungonController.deleteGame);
app.get('/treshers', tresherController.getTreshers);
app.post('/treshers', tresherController.createTresher);
app.put('/treshers/:id', tresherController.updateTresher);
app.delete('/treshers/:id', tresherController.deleteTresher);
app.get('/monsters', monsterController.getMonsters);
app.post('/monsters', monsterController.createMonster);
app.put('/monsters/:id', monsterController.updateMonster);
app.get('/images/by-ids', imageController.getPublicImagesByIds);
app.get('/images', imageController.getImages);
app.post('/images', imageController.uploadImageMiddleware, imageController.createImage);
app.put('/images/:id', imageController.updateImage);
app.delete('/images/:id', imageController.deleteImage);
app.get('/pcs', pcController.getPcs);
app.post('/pcs', pcController.createPc);
app.get('/pcs/sample', pcController.getSamplePcs);
app.get('/pcs/admin-all', pcController.getAdminPcs);
app.put('/pcs/:id', pcController.updatePc);
app.delete('/pcs/:id', pcController.deletePc);
app.put('/pcs/:id/set-sample', pcController.setSamplePc);
app.put('/pcs/:id/set-maingame', pcController.setIsMainGamePc);
app.patch('/pcs/:id/award-sp', pcController.awardSpToPc);
app.patch('/pcs/:id/complete-dungon-reward', pcController.completeDungonReward);
app.patch('/pcs/:id/upgrade-noa', pcController.upgradeNoa);
app.patch('/pcs/:id/upgrade-nod', pcController.upgradeNod);
app.patch('/pcs/:id/upgrade-stat', pcController.upgradeStatController);
app.post('/pcs/:id/tavern-turnin', pcController.tavernTurnIn);
app.get('/tavern-stash', tavernStashController.getStash);
app.post('/tavern-stash/deposit', tavernStashController.depositToStash);
app.post('/tavern-stash/withdraw', tavernStashController.withdrawFromStash);
app.get('/friends', friendController.getFriends);
app.post('/friends/invite', friendController.createFriendInvite);
app.post('/friends/accept', friendController.acceptFriendInvite);
app.get('/spells', spellController.getSpells);
app.post('/spells', spellController.createSpell);
app.put('/spells/:id', spellController.updateSpell);
app.get('/potions', potionController.getPotions);
app.post('/potions', potionController.createPotion);
app.put('/potions/:id', potionController.updatePotion);
app.get('/curses', curseController.getCurses);
app.post('/curses', curseController.createCurse);
app.put('/curses/:id', curseController.updateCurse);
app.get('/items', itemController.getItems);
app.post('/items', itemController.createItem);
app.put('/items/:id', itemController.updateItem);
app.delete('/items/:id', itemController.deleteItem);
app.get('/sounds', soundController.getSounds);
app.post('/sounds', soundController.uploadSoundMiddleware, soundController.createSound);
app.put('/sounds/:id', soundController.updateSound);
app.delete('/sounds/:id', soundController.deleteSound);
app.post('/contact', contactController.submitContact);
app.get('/contact', contactController.getContacts);
app.put('/contact/:id', contactController.updateContactFlags);
app.post('/stats/home-hit', dailyHitsController.recordHomeHit);
app.get('/stats/daily-hits', dailyHitsController.getDailyHits);
const PUBLIC_DIR = process.env['PUBLIC_DIR'] ?? node_path_1.default.resolve(__dirname, '../../public');
app.use('/images', express_1.default.static(node_path_1.default.join(PUBLIC_DIR, 'images')));
app.use('/sounds', express_1.default.static(node_path_1.default.join(PUBLIC_DIR, 'sounds')));
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
