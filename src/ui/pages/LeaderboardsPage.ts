import { t, onLocaleChange } from '../../i18n';
import { fetchLeaderboard, getAuthState, isSupabaseConfigured, subscribeAuth, type LeaderboardEntry } from '../../supabase';
import { ParticleBackground } from '../components/ParticleBackground';

export class LeaderboardsPage {
  private container: HTMLElement;
  private unsubscribeLocale: (() => void) | null = null;
  private unsubscribeAuth: (() => void) | null = null;

  private loading: boolean = false;
  private entries: LeaderboardEntry[] = [];
  private particleBg: ParticleBackground | null = null;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'page leaderboards-page';

    this.updateContent();
    this.load();

    this.unsubscribeLocale = onLocaleChange(() => this.updateContent());
    this.unsubscribeAuth = subscribeAuth(() => this.updateContent());
  }

  private async load(): Promise<void> {
    if (!isSupabaseConfigured()) return;
    this.loading = true;
    this.updateContent();

    try {
      this.entries = await fetchLeaderboard(50);
    } finally {
      this.loading = false;
      this.updateContent();
    }
  }

  private updateContent(): void {
    const auth = getAuthState();
    const configured = auth.configured && isSupabaseConfigured();
    const myId = auth.user?.id ?? null;

    this.container.innerHTML = `
      <div class="particle-container" style="position: absolute; inset: 0; overflow: hidden; pointer-events: none;"></div>
      
      <div class="page-header page-header-split" style="position: relative; z-index: 1;">
        <div class="page-header-left">
          <h1 class="page-title">${t('leaderboards.title')}</h1>
          <p class="page-subtitle">${t('leaderboards.subtitle')}</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-secondary btn-small" id="refreshLeaderboardBtn" type="button" ${!configured || this.loading ? 'disabled' : ''}>
            ${this.loading ? t('leaderboards.loading') : t('leaderboards.refresh')}
          </button>
        </div>
      </div>

      ${!configured ? `
        <div class="panel panel-warning">
          <div class="panel-title">${t('leaderboards.notConfiguredTitle')}</div>
          <div class="panel-text">${t('leaderboards.notConfiguredText')}</div>
        </div>
      ` : ''}

      <div class="leaderboard-page-card">
        <div class="leaderboard-page-head">
          <div class="leaderboard-page-col rank">#</div>
          <div class="leaderboard-page-col player">${t('leaderboards.player')}</div>
          <div class="leaderboard-page-col score">${t('leaderboards.score')}</div>
        </div>
        <div class="leaderboard-page-body">
          ${this.entries.length === 0 && configured && !this.loading ? `
            <div class="leaderboard-empty">${t('leaderboards.empty')}</div>
          ` : ''}

          ${this.entries
            .map((e, i) => {
              const isMe = myId && e.userId === myId;
              return `
                <div class="leaderboard-page-row${isMe ? ' me' : ''}">
                  <div class="leaderboard-page-col rank">${i + 1}</div>
                  <div class="leaderboard-page-col player">${this.escapeHtml(e.username)}</div>
                  <div class="leaderboard-page-col score">${e.bestScore}</div>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>
    `;

    const refreshBtn = this.container.querySelector('#refreshLeaderboardBtn');
    refreshBtn?.addEventListener('click', () => void this.load());
    
    // Initialize particles if not already present
    if (!this.particleBg) {
      this.initParticles();
    }
  }

  private initParticles(): void {
    const particleContainer = this.container.querySelector('.particle-container');
    if (particleContainer) {
      this.particleBg = new ParticleBackground(particleContainer as HTMLElement, {
        particleCount: 35,
        speed: 0.2,
        connectParticles: true,
      });
    }
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  getElement(): HTMLElement {
    return this.container;
  }

  destroy(): void {
    this.unsubscribeLocale?.();
    this.unsubscribeAuth?.();
    this.particleBg?.destroy();
  }
}

