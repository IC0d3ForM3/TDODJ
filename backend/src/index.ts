import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'node:path';
import rateLimit from 'express-rate-limit';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
app.set('trust proxy', 1); // Trust Caddy reverse proxy for rate limiting + IP detection
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Protect login and register from brute force: max 20 attempts per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later.' },
});


import * as userController from './controllers/userController';
import * as dungonController from './controllers/dungonController';
import * as tresherController from './controllers/tresherController';
import * as monsterController from './controllers/monsterController';
import * as imageController from './controllers/imageController';
import * as pcController from './controllers/pcController';
import * as friendController from './controllers/friendController';
import * as spellController from './controllers/spellController';
import * as potionController from './controllers/potionController';
import * as curseController from './controllers/curseController';
import * as itemController from './controllers/itemController';
import * as soundController from './controllers/soundController';
import * as tavernStashController from './controllers/tavernStashController';
import * as contactController from './controllers/contactController';
import * as dailyHitsController from './controllers/dailyHitsController';
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
const PUBLIC_DIR = process.env['PUBLIC_DIR'] ?? path.resolve(__dirname, '../../public');
app.use('/images', express.static(path.join(PUBLIC_DIR, 'images')));
app.use('/sounds', express.static(path.join(PUBLIC_DIR, 'sounds')));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
