import { t } from '../../i18n';
import { signInWithGoogle } from '../../supabase';

export class AuthRequiredPage {
  private container: HTMLElement;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'page auth-required-page';
    this.render();
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">${t('auth.requiredTitle')}</h1>
        <p class="page-subtitle">${t('auth.requiredSubtitle')}</p>
      </div>

      <div class="panel" style="max-width: 520px; margin: 0 auto;">
        <div class="panel-title">${t('auth.requiredPanelTitle')}</div>
        <div class="panel-text">${t('auth.requiredPanelText')}</div>
        <div class="panel-actions" style="margin-top: 12px;">
          <button class="btn btn-primary" id="authRequiredGoogleBtn" type="button">${t('profile.signInGoogle')}</button>
        </div>
      </div>
    `;

    this.container
      .querySelector('#authRequiredGoogleBtn')
      ?.addEventListener('click', () => void signInWithGoogle());
  }

  getElement(): HTMLElement {
    return this.container;
  }
}

