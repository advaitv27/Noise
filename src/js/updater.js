/* ==========================================================================
   Auto-Update Controller — Renderer-Side UI Logic
   Listens for update-status events from the main process via preload bridge
   and drives the toast notification UI.
   ========================================================================== */

(function () {
  'use strict';

  // Bail out gracefully in web/browser environments
  if (!window.electronAPI || !window.electronAPI.onUpdateStatus) return;

  const toast       = document.getElementById('update-toast');
  const title       = document.getElementById('update-toast-title');
  const subtitle    = document.getElementById('update-toast-subtitle');
  const progressWrap = document.getElementById('update-toast-progress-wrap');
  const progressBar = document.getElementById('update-toast-progress-bar');
  const actionBtn   = document.getElementById('update-toast-action');
  const dismissBtn  = document.getElementById('update-toast-dismiss');

  let updateVersion = '';
  let dismissed     = false;

  // ---- Show / Hide helpers ----
  function showToast() {
    if (dismissed) return;
    toast.classList.add('visible');
  }

  function hideToast() {
    toast.classList.remove('visible');
  }

  // ---- State transitions ----
  function setDownloading(percent) {
    toast.className = 'update-toast visible downloading';
    title.textContent = `Downloading update${updateVersion ? ' v' + updateVersion : ''}...`;
    subtitle.textContent = percent + '% complete';
    progressWrap.style.display = '';
    progressBar.style.width = percent + '%';
    actionBtn.style.display = 'none';
    dismissed = false;
    showToast();
  }

  function setDownloaded() {
    toast.className = 'update-toast visible downloaded';
    title.textContent = `Update v${updateVersion} ready`;
    subtitle.textContent = 'Restart to apply the update';
    progressWrap.style.display = 'none';
    actionBtn.style.display = '';
    dismissed = false;
    showToast();
  }

  function setAvailable(version) {
    updateVersion = version || '';
    toast.className = 'update-toast visible downloading';
    title.textContent = `Update v${updateVersion} found`;
    subtitle.textContent = 'Starting download...';
    progressWrap.style.display = '';
    progressBar.style.width = '0%';
    actionBtn.style.display = 'none';
    dismissed = false;
    showToast();
  }

  // ---- Event listener from main process ----
  window.electronAPI.onUpdateStatus((data) => {
    switch (data.status) {
      case 'available':
        setAvailable(data.version);
        break;

      case 'downloading':
        setDownloading(data.percent || 0);
        break;

      case 'downloaded':
        updateVersion = data.version || updateVersion;
        setDownloaded();
        break;

      case 'not-available':
        // Silently do nothing — user doesn't need to know they're up-to-date
        break;

      case 'error':
        // Log but don't annoy the user
        console.warn('[Update] Error:', data.message);
        hideToast();
        break;

      case 'checking':
        // Silently checking — no UI needed
        break;
    }
  });

  // ---- User actions ----
  actionBtn.addEventListener('click', () => {
    actionBtn.textContent = 'Restarting...';
    actionBtn.disabled = true;
    window.electronAPI.restartToUpdate();
  });

  dismissBtn.addEventListener('click', () => {
    dismissed = true;
    hideToast();
  });

  // ---- Display current version in console ----
  window.electronAPI.getAppVersion().then((v) => {
    console.log(`[Noise] Running v${v}`);
  });

})();
