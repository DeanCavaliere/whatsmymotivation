import { isDevMode, provideZoneChangeDetection, Type } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideServiceWorker } from '@angular/service-worker';

import { AppComponent } from './app/app.component';
import { devLauncher } from './dev/launcher';
import { seedDevSave } from './dev/seed';

function start(root: Type<unknown>) {
  bootstrapApplication(root, {
    providers: [
      provideZoneChangeDetection(),
      // Caches the app and dice assets so it works offline and can be installed.
      provideServiceWorker('ngsw-worker.js', {
        enabled: !isDevMode(),
        registrationStrategy: 'registerWhenStable:30000',
      }),
    ],
  }).catch(err => console.error(err));
}

// Dev builds only: /?launcher opens the dev launcher instead of the table (see src/dev/launcher.ts).
const launcher = devLauncher();
if (launcher) {
  launcher.then(start);
} else {
  // Dev builds only: ?save=month loads a preset save before the app reads it (see src/dev/seed.ts).
  seedDevSave();
  start(AppComponent);
}
