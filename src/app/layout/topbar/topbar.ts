import { Component, inject } from '@angular/core';
import { SessionService } from '../../core/services/session.service';

@Component({ selector: 'app-topbar', standalone: true, templateUrl: './topbar.html', styles: [':host { display: contents; }'] })
export class Topbar
{
    readonly vm = inject(SessionService);
}
