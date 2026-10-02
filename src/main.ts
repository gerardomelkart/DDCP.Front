import { bootstrapApplication } from '@angular/platform-browser';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { App } from './app/app';

bootstrapApplication(App, { providers: [provideZonelessChangeDetection(), provideHttpClient()] }).catch(error => console.error(error));
