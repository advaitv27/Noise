/* ==========================================================================
   Noise Desktop - Notification & Toast Alert Manager
   ========================================================================== */

class ToastNotificationManager {
  static init() {
    this.container = document.createElement('div');
    this.container.className = 'toast-container';
    document.body.appendChild(this.container);
  }

  static show({ title, message, isConflict = false, duration = 4000 }) {
    if (!this.container) this.init();

    const toast = document.createElement('div');
    toast.className = `toast ${isConflict ? 'toast-conflict' : ''}`;
    
    toast.innerHTML = `
      <div class="toast-icon">
        ${isConflict ? '⚠️' : '🔔'}
      </div>
      <div class="toast-content">
        <span class="toast-title">${title}</span>
        <span class="toast-desc">${message}</span>
      </div>
    `;

    this.container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(30px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, duration);
  }
}
