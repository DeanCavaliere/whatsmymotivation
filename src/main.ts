import { isDevMode, provideZoneChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideServiceWorker } from '@angular/service-worker';

import { AppComponent } from './app/app.component';
import { seedDevSave } from './dev/seed';

// Dev builds only: ?save=month loads a preset save before the app reads it (see src/dev/seed.ts).
seedDevSave();

bootstrapApplication(AppComponent, {
  providers: [
    provideZoneChangeDetection(),
    // Caches the app and dice assets so it works offline and can be installed.
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
}).catch(err => console.error(err));
