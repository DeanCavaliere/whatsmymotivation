import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppComponent } from './app.component';
import { ConfettiComponent } from './components/confetti/confetti.component';

@NgModule({
  declarations: [
    AppComponent,
    ConfettiComponent
  ],
  imports: [
    BrowserModule,
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
