import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('#app/features/main/anien-main.component').then((m) => m.AnienMainComponent),
  },
];
