import { VERSION } from '../../core/version';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';

@Component({ selector: 'app-login', standalone: true, imports: [FormsModule], templateUrl: './login.html', styles: [':host { display: contents; }'] })
export class Login { readonly vm = inject(AuthService); readonly version = VERSION; }

