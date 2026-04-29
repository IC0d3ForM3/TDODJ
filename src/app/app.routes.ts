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
import { PaperAndPencil } from './components/paper-and-pencil/paper-and-pencil';
import { SampleGame } from './components/sample-game/sample-game';
import { Contact } from './components/contact/contact';
import { loggedInGuard } from './guards/logged-in.guard';
import { authGuard } from './guards/auth.guard';
import { adminGuard } from './guards/admin.guard';

export const routes: Routes = [
	{ path: '', component: Home, canActivate: [loggedInGuard] },
	{ path: 'about', component: About },
	{ path: 'how-to-play', component: HowToPlay },
	{ path: 'paper-and-pencil', component: PaperAndPencil },
	{ path: 'sample-game', component: SampleGame },
	{ path: 'login', component: Login, canActivate: [loggedInGuard] },
	{ path: 'signup', component: Signup, canActivate: [loggedInGuard] },
	{ path: 'admin', component: Admin, canActivate: [adminGuard] },
	{ path: 'dashboard', component: Dashboard, canActivate: [authGuard] },
	{ path: 'create', component: Creator, canActivate: [authGuard] },
	{ path: 'game/:gameId', component: Game, canActivate: [authGuard] },
	{ path: 'sample-play', component: Game },
	{ path: 'contact', component: Contact },
	{ path: '**', redirectTo: '' },
];
