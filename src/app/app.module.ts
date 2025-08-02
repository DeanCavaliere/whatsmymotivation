import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppComponent } from './app.component';
import {ConfettiComponent} from "./components/confetti/confetti.component";
import {NgOptimizedImage} from "@angular/common";
import {ConfettiService} from "./components/confetti/confetti.service";

@NgModule({
  declarations: [
    AppComponent,
    ConfettiComponent
  ],
  imports: [
    BrowserModule,
    NgOptimizedImage,
  ],
  providers: [ConfettiService],
  bootstrap: [AppComponent]
})
export class AppModule { }
