import { Routes } from '@angular/router';
import { Home } from './components/home/home';
import { About } from './components/about/about';
import { Login } from './components/login/login';
import { Signup } from './components/signup/signup';
import { Admin } from './components/admin/admin';
import { Dashboard } from './components/dashboard';
import { Creator } from './components/creator/creator';
import { Game } from './components/game/game';
import { HowToPlay } from './components/how-to-play/how-to-play';
import { SampleGame } from './components/sample-game/sample-game';

export const routes: Routes = [
	{ path: '', component: Home },
	{ path: 'home', component: Home },
	{ path: 'about', component: About },
	{ path: 'how-to-play', component: HowToPlay },
	{ path: 'sample-game', component: SampleGame },
	{ path: 'login', component: Login },
	{ path: 'signup', component: Signup },
	{ path: 'admin', component: Admin },
	{ path: 'dashboard', component: Dashboard },
	{ path: 'create', component: Creator },
	{ path: 'game/:gameId', component: Game },
	{ path: 'sample-play', component: Game },
];
