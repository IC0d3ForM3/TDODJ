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
dotenv_1.default.config({ path: node_path_1.default.resolve(__dirname, '../.env') });
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const userController = __importStar(require("./controllers/userController"));
const dungonController = __importStar(require("./controllers/dungonController"));
const tresherController = __importStar(require("./controllers/tresherController"));
const monsterController = __importStar(require("./controllers/monsterController"));
const imageController = __importStar(require("./controllers/imageController"));
const pcController = __importStar(require("./controllers/pcController"));
const friendController = __importStar(require("./controllers/friendController"));
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
app.use('/images', express_1.default.static(node_path_1.default.resolve(__dirname, '../../public/images')));
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
