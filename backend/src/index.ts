import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'node:path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
app.use(cors());
app.use(express.json());


import * as userController from './controllers/userController';
import * as dungonController from './controllers/dungonController';
import * as tresherController from './controllers/tresherController';
import * as monsterController from './controllers/monsterController';
import * as imageController from './controllers/imageController';
import * as pcController from './controllers/pcController';
import * as friendController from './controllers/friendController';
app.get('/users/:id', userController.getUser);
app.post('/users', userController.createUser);
app.post('/login', userController.loginUser);
app.get('/users', userController.getAllUsers);
app.put('/users/:id', userController.updateUserFlags);
app.get('/dungons', dungonController.getDungons);
app.get('/dungons/published', dungonController.getPublishedDungons);
app.get('/dungons/:id', dungonController.getDungonById);
app.post('/dungons', dungonController.createDungon);
app.put('/dungons/:id/metadata', dungonController.updateDungonMetadata);
app.put('/dungons/:id/dungonjson', dungonController.updateDungonJson);
app.put('/dungons/:id/publish', dungonController.publishDungon);
app.post('/dungons/:id/start', dungonController.startGameFromPublishedDungon);
app.get('/games', dungonController.getGamesForUser);
app.get('/games/:id', dungonController.getGameById);
app.put('/games/:id/save', dungonController.saveGame);
app.delete('/games/:id', dungonController.deleteGame);
app.get('/treshers', tresherController.getTreshers);
app.post('/treshers', tresherController.createTresher);
app.put('/treshers/:id', tresherController.updateTresher);
app.get('/monsters', monsterController.getMonsters);
app.post('/monsters', monsterController.createMonster);
app.put('/monsters/:id', monsterController.updateMonster);
app.get('/images', imageController.getImages);
app.post('/images', imageController.uploadImageMiddleware, imageController.createImage);
app.put('/images/:id', imageController.updateImage);
app.get('/pcs', pcController.getPcs);
app.post('/pcs', pcController.createPc);
app.put('/pcs/:id', pcController.updatePc);
app.get('/friends', friendController.getFriends);
app.post('/friends', friendController.createFriend);
app.use('/images', express.static(path.resolve(__dirname, '../../public/images')));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
