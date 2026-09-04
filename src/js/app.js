/* ==========================================================================
   Noise Desktop - Application Router & Main Desktop Orchestrator
   ========================================================================== */

class AppRouter {
  static init() {
    this.activeTab = store.isUserLoggedIn() ? 'home' : 'login';
    this.calendarView = new CalendarView(document.querySelector('#page-calendar'));

    this.setupWindowControls();
    this.setupTabNavigation();
    this.setupModal();
    this.setupSearch();
    this.setupSidebarToggle();
    this.setupThemeToggle();
    this.setupAIAssistant();
    this.startNotificationTicker();
    
    if (localStorage.getItem('noise_low_perf_mode') === 'true') {
      document.body.classList.add('low-performance-mode');
    }

    // Force the UI to reflect the active tab on startup
    this.switchTab(this.activeTab);

    // Subscribe to store state changes
    store.subscribe((state) => this.onStateChange(state));

    // Initial render
    this.onStateChange(store.getState());

    // Listen for Google Auth Token from Main Process
    if (window.electronAPI && window.electronAPI.onGoogleAuthToken) {
      window.electronAPI.onGoogleAuthToken(async (token) => {
        try {
          if (window.firebaseService) {
            ToastNotificationManager.show({ title: 'Authenticating...', message: 'Validating secure token.' });
            await window.firebaseService.signInWithGoogleToken(token);
            ToastNotificationManager.show({ title: 'Welcome Back! 🎉', message: 'Signed in with Google.' });
            this.switchTab('calendar');
          }
        } catch (err) {
          console.error('Google Token Auth Error:', err);
          ToastNotificationManager.show({ title: 'Sign In Failed', message: err.message, isConflict: true });
        }
      });
    }
  }

  // Window Controls for Desktop Shell
  static setupWindowControls() {
    if (!window.electronAPI) return;

    document.querySelector('#win-minimize')?.addEventListener('click', () => window.electronAPI.minimize());
    document.querySelector('#win-maximize')?.addEventListener('click', () => window.electronAPI.toggleMaximize());
    document.querySelector('#win-close')?.addEventListener('click', () => window.electronAPI.close());

    window.electronAPI.onMaximizedChange((isMaximized) => {
      const maxBtn = document.querySelector('#win-maximize');
      if (maxBtn) {
        maxBtn.title = isMaximized ? 'Restore' : 'Maximize';
      }
    });
  }

  // Sidebar Tab Navigation
  static setupTabNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const tab = item.getAttribute('data-tab');
        this.switchTab(tab);
      });
    });

    // Header active user pill click -> opens account overview modal
    document.querySelector('#active-user-pill')?.addEventListener('click', () => {
      const activeUser = store.getActiveUser();
      if (!activeUser || activeUser.id === 'user_default') {
        ToastNotificationManager.show({ title: 'Not Signed In', message: 'Please sign in to view account details.' });
        return;
      }
      
      this.openModal('👤 Account Overview', (modalBody) => {
        const renderModal = () => {
          modalBody.innerHTML = `
            <div style="text-align: center; padding: 20px 0;">
              <div class="avatar-upload-wrapper">
                ${activeUser.avatarUrl ? 
                  `<img src="${activeUser.avatarUrl}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;" />` : 
                  `<div style="width: 100%; height: 100%; border-radius: 50%; background: ${activeUser.color || '#52525b'}; color: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 32px; font-weight: 800;">${activeUser.avatar}</div>`
                }
                <label for="avatar-upload" class="avatar-upload-overlay" title="Change Profile Picture">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                  <span>Edit</span>
                </label>
                <input type="file" id="avatar-upload" accept="image/png, image/jpeg, image/jpg" style="display: none;" />
              </div>
              <h2 style="font-size: 24px; color: var(--text-primary); margin-bottom: 4px;">${activeUser.name}</h2>
              <p style="color: var(--text-secondary); margin-bottom: 24px;">${activeUser.email}</p>
              
              <div style="background: var(--bg-body); padding: 16px; border-radius: 12px; border: 1px solid var(--border-light); margin-bottom: 24px; text-align: left;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                  <h3 style="font-size: 14px; margin: 0; color: var(--text-muted); text-transform: uppercase;">Preferences</h3>
                  <button id="btn-save-prefs" class="btn btn-primary btn-sm" style="display: none;">Save Changes</button>
                </div>
                
                <div class="form-group" style="margin-bottom: 12px;">
                  <label class="form-label" style="display: flex; justify-content: space-between;">
                    <span>Working Hours</span>
                  </label>
                  <div style="display: flex; gap: 8px; align-items: center;">
                    <input type="time" id="pref-wh-start" class="form-control" style="width: 120px;" value="${activeUser.workingHours?.start || '09:00'}">
                    <span style="color: var(--text-secondary);">to</span>
                    <input type="time" id="pref-wh-end" class="form-control" style="width: 120px;" value="${activeUser.workingHours?.end || '17:00'}">
                  </div>
                </div>
                <div class="form-group" style="margin-bottom: 0;">
                  <label class="form-label">Role</label>
                  <input type="text" id="pref-role" class="form-control" value="${activeUser.role || ''}" placeholder="e.g. Developer, Designer">
                </div>
              </div>

              <div style="border-top: 1px solid var(--border-color); padding-top: 24px; margin-top: 16px;">
                <h3 style="font-size: 14px; margin-bottom: 12px; color: var(--status-danger); text-transform: uppercase;">Danger Zone</h3>
                <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 16px;">
                  Deleting your account will permanently wipe your profile, personal workspace, and all tasks assigned to you. This action cannot be reversed.
                </p>
                <button class="btn btn-danger" id="btn-delete-account" style="width: 100%;">
                  🗑️ Delete Account Data
                </button>
              </div>
            </div>
          `;

          // Show save button if inputs change
          const showSaveBtn = () => {
            const btn = modalBody.querySelector('#btn-save-prefs');
            if (btn) btn.style.display = 'block';
          };
          modalBody.querySelector('#pref-wh-start').addEventListener('input', showSaveBtn);
          modalBody.querySelector('#pref-wh-end').addEventListener('input', showSaveBtn);
          modalBody.querySelector('#pref-role').addEventListener('input', showSaveBtn);

          modalBody.querySelector('#btn-save-prefs').addEventListener('click', async () => {
            const start = modalBody.querySelector('#pref-wh-start').value;
            const end = modalBody.querySelector('#pref-wh-end').value;
            const role = modalBody.querySelector('#pref-role').value;
            
            const btn = modalBody.querySelector('#btn-save-prefs');
            btn.innerHTML = 'Saving...';
            btn.disabled = true;

            const updatedUser = { ...activeUser, workingHours: { start, end }, role };
            
            try {
              if (window.firebaseService && window.firebaseService.isInitialized) {
                await window.firebaseService.db.collection('users').doc(activeUser.id).set(updatedUser, { merge: true });
                await window.firebaseService.db.collection('team_members').doc(activeUser.id).set(updatedUser, { merge: true });
              }
              store.setActiveUserFromFirebase(updatedUser, true);
              ToastNotificationManager.show({ title: 'Saved', message: 'Preferences updated.' });
              btn.innerHTML = 'Saved!';
              setTimeout(() => { btn.style.display = 'none'; btn.innerHTML = 'Save Changes'; btn.disabled = false; }, 2000);
            } catch(e) {
              btn.innerHTML = 'Save Changes';
              btn.disabled = false;
              ToastNotificationManager.show({ title: 'Error', message: 'Failed to save.' });
            }
          });

          // Avatar Upload
          modalBody.querySelector('#avatar-upload').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // Build temporary crop modal over everything
            const cropModal = document.createElement('div');
            cropModal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;backdrop-filter:blur(8px);';
            cropModal.innerHTML = `
              <h3 style="margin-bottom:20px;font-size:20px;">Adjust Profile Picture</h3>
              <div class="crop-modal-body">
                <div class="crop-container" id="crop-container">
                  <canvas id="crop-canvas" class="crop-canvas"></canvas>
                  <div class="crop-overlay"></div>
                </div>
                <div class="zoom-slider-container">
                  <span style="font-size:12px;">-</span>
                  <input type="range" class="zoom-slider" id="crop-zoom" min="1" max="3" step="0.05" value="1" />
                  <span style="font-size:12px;">+</span>
                </div>
                <div style="display:flex;gap:12px;margin-top:20px;">
                  <button class="btn btn-secondary" id="btn-crop-cancel">Cancel</button>
                  <button class="btn btn-primary" id="btn-crop-save">Save Picture</button>
                </div>
              </div>
            `;
            document.body.appendChild(cropModal);

            const canvas = cropModal.querySelector('#crop-canvas');
            const ctx = canvas.getContext('2d');
            const zoomSlider = cropModal.querySelector('#crop-zoom');
            
            const reader = new FileReader();
            reader.onload = (event) => {
              const img = new Image();
              img.onload = () => {
                let scale = 1;
                let panX = 0;
                let panY = 0;
                const containerSize = 256;
                
                const minScale = Math.max(containerSize / img.width, containerSize / img.height);
                scale = minScale;
                zoomSlider.min = minScale;
                zoomSlider.max = minScale * 3;
                zoomSlider.value = minScale;
                
                panX = (containerSize - img.width * scale) / 2;
                panY = (containerSize - img.height * scale) / 2;

                const draw = () => {
                  canvas.width = containerSize;
                  canvas.height = containerSize;
                  ctx.clearRect(0, 0, canvas.width, canvas.height);
                  ctx.drawImage(img, panX, panY, img.width * scale, img.height * scale);
                };
                
                draw();

                let isDragging = false;
                let startX, startY;
                const container = cropModal.querySelector('#crop-container');
                
                container.addEventListener('mousedown', (ev) => {
                  isDragging = true;
                  startX = ev.clientX - panX;
                  startY = ev.clientY - panY;
                });
                
                window.addEventListener('mousemove', (ev) => {
                  if (!isDragging) return;
                  panX = ev.clientX - startX;
                  panY = ev.clientY - startY;
                  
                  const minPanX = containerSize - img.width * scale;
                  const minPanY = containerSize - img.height * scale;
                  panX = Math.min(Math.max(panX, minPanX), 0);
                  panY = Math.min(Math.max(panY, minPanY), 0);
                  
                  draw();
                });
                
                window.addEventListener('mouseup', () => { isDragging = false; });
                
                zoomSlider.addEventListener('input', (ev) => {
                  const newScale = parseFloat(ev.target.value);
                  const centerX = containerSize / 2;
                  const centerY = containerSize / 2;
                  
                  panX = centerX - (centerX - panX) * (newScale / scale);
                  panY = centerY - (centerY - panY) * (newScale / scale);
                  scale = newScale;
                  
                  const minPanX = containerSize - img.width * scale;
                  const minPanY = containerSize - img.height * scale;
                  panX = Math.min(Math.max(panX, minPanX), 0);
                  panY = Math.min(Math.max(panY, minPanY), 0);
                  
                  draw();
                });

                cropModal.querySelector('#btn-crop-cancel').addEventListener('click', () => {
                  cropModal.remove();
                  e.target.value = '';
                });

                cropModal.querySelector('#btn-crop-save').addEventListener('click', async () => {
                  const btnSave = cropModal.querySelector('#btn-crop-save');
                  btnSave.innerHTML = 'Saving...';
                  btnSave.disabled = true;
                  
                  const outputCanvas = document.createElement('canvas');
                  outputCanvas.width = 200;
                  outputCanvas.height = 200;
                  const outCtx = outputCanvas.getContext('2d');
                  
                  const sourceX = 12;
                  const sourceY = 12;
                  const sourceSize = 232;
                  
                  outCtx.drawImage(canvas, sourceX, sourceY, sourceSize, sourceSize, 0, 0, 200, 200);
                  const url = outputCanvas.toDataURL('image/jpeg', 0.85);
                  
                  try {
                    const updatedUser = { ...activeUser, avatarUrl: url };
                    if (window.firebaseService && window.firebaseService.isInitialized) {
                      await window.firebaseService.db.collection('users').doc(activeUser.id).set({ avatarUrl: url }, { merge: true });
                      await window.firebaseService.db.collection('team_members').doc(activeUser.id).set({ avatarUrl: url }, { merge: true });
                    }
                    store.setActiveUserFromFirebase(updatedUser, true);
                    activeUser.avatarUrl = url;
                    renderModal();
                    ToastNotificationManager.show({ title: 'Success', message: 'Profile picture updated.' });
                  } catch (err) {
                    console.error(err);
                    ToastNotificationManager.show({ title: 'Upload Failed', message: 'Failed to update image.' });
                  }
                  
                  cropModal.remove();
                });
              };
              img.src = event.target.result;
            };
            reader.readAsDataURL(file);
          });

          modalBody.querySelector('#btn-delete-account').addEventListener('click', async () => {
            this.confirm(
              '🚨 CRITICAL WARNING 🚨', 
              'Are you absolutely sure you want to delete your account? All your personal tasks and workspaces will be permanently destroyed. This cannot be undone.', 
              async () => {
                const btn = modalBody.querySelector('#btn-delete-account');
                btn.innerHTML = 'Deleting...';
                btn.disabled = true;

                try {
                  if (window.firebaseService) {
                    await window.firebaseService.deleteAccountData();
                  } else {
                    store.factoryReset();
                  }
                  this.closeModal();
                  ToastNotificationManager.show({ title: 'Account Deleted', message: 'Your account data has been wiped.' });
                  this.switchTab('login');
                } catch(e) {
                  btn.innerHTML = 'Delete Account Data';
                  btn.disabled = false;
                  ToastNotificationManager.show({ title: 'Error', message: 'Failed to delete account.' });
                }
              }
            );
          });
        };
        renderModal();
      });
    });

    // Sidebar team workspace click -> opens team switcher
    document.querySelector('#sidebar-team-switcher')?.addEventListener('click', () => {
      this.openModal('🏢 Switch Team Workspace', (body) => {
        TeamManager.renderTeamSwitcherModal(body);
      });
    });

    // Titlebar sync status click -> navigates to Firebase settings
    document.querySelector('#titlebar-sync-status')?.addEventListener('click', () => {
      this.switchTab('login');
    });
  }

  static switchTab(tabName) {
    this.activeTab = tabName;

    // Update sidebar nav state
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-tab') === tabName);
    });

    // Update page visibility
    document.querySelectorAll('.tab-page').forEach(page => {
      page.classList.remove('active');
    });

    const activePage = document.querySelector(`#page-${tabName}`);
    if (activePage) {
      activePage.classList.add('active');
    }

    this.renderCurrentTab();
  }

  static setupSearch() {
    const searchInput = document.getElementById('global-search-input');
    const searchBox = document.querySelector('.search-box');
    if (!searchInput || !searchBox) return;

    const dropdown = document.createElement('div');
    dropdown.id = 'search-dropdown';
    dropdown.style.cssText = 'position: absolute; top: 40px; left: 0; width: 320px; background: var(--bg-surface-elevated); border: 1px solid var(--border-color); border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); z-index: 1000; display: none; flex-direction: column; max-height: 400px; overflow-y: auto;';
    searchBox.style.position = 'relative';
    searchBox.appendChild(dropdown);

    searchInput.addEventListener('input', (e) => {
      store.setSearchQuery(e.target.value);
      const q = e.target.value.toLowerCase().trim();
      if (!q) {
        dropdown.style.display = 'none';
        return;
      }
      
      const state = store.getState();
      const allEvents = state.events || [];
      const allMembers = state.teamMembers || [];
      const teams = state.teams || [];

      const events = allEvents.filter(ev => (ev.title && ev.title.toLowerCase().includes(q)) || (ev.category && ev.category.toLowerCase().includes(q)));
      const members = allMembers.filter(m => (m.name && m.name.toLowerCase().includes(q)) || (m.role && m.role.toLowerCase().includes(q)));

      dropdown.innerHTML = '';
      if (events.length === 0 && members.length === 0) {
        dropdown.innerHTML = '<div style="padding: 12px; color: var(--text-muted); font-size: 12px; text-align: center;">No results found</div>';
      } else {
        if (events.length > 0) {
          dropdown.innerHTML += '<div style="padding: 8px 12px; font-size: 11px; font-weight: 700; color: var(--text-muted); background: var(--bg-surface); text-transform: uppercase;">Events</div>';
          events.slice(0,5).forEach(ev => {
            const team = teams.find(t => t.id === ev.teamId);
            const teamName = team ? team.name : 'Unknown Workspace';
            const el = document.createElement('div');
            el.className = 'search-result-item';
            el.style.cssText = 'padding: 10px 12px; border-bottom: 1px solid var(--border-color); cursor: pointer; display: flex; flex-direction: column; gap: 4px;';
            el.innerHTML = '<div style="font-size: 13px; font-weight: 600; color: var(--text-primary);">' + ev.title + '</div><div style="font-size: 11px; color: var(--text-secondary);">' + ev.start.replace('T', ' ') + ' • ' + teamName + '</div>';
            el.onclick = () => { 
              if (ev.teamId && state.activeTeamId !== ev.teamId) {
                store.switchTeam(ev.teamId);
              }
              AppRouter.openEventModal(ev.id); 
              dropdown.style.display = 'none'; 
              searchInput.value = ''; 
            };
            dropdown.appendChild(el);
          });
        }
        if (members.length > 0) {
          dropdown.innerHTML += '<div style="padding: 8px 12px; font-size: 11px; font-weight: 700; color: var(--text-muted); background: var(--bg-surface); text-transform: uppercase;">Members</div>';
          members.slice(0,5).forEach(m => {
            const el = document.createElement('div');
            el.className = 'search-result-item';
            el.style.cssText = 'padding: 10px 12px; border-bottom: 1px solid var(--border-color); display: flex; align-items: center; gap: 10px; cursor: pointer;';
            el.innerHTML = '<div style="width: 24px; height: 24px; border-radius: 50%; background: ' + (m.color || '#555') + '; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700;">' + (m.avatarUrl ? '<img src="'+m.avatarUrl+'" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">' : (m.avatar || 'U')) + '</div><div style="display: flex; flex-direction: column;"><span style="font-size: 13px; font-weight: 600; color: var(--text-primary);">' + m.name + '</span><span style="font-size: 11px; color: var(--text-secondary);">' + (m.role || 'Member') + '</span></div>';
            el.onclick = () => {
              const activeTeam = store.getActiveTeam();
              if (!activeTeam || !(activeTeam.memberIds || []).includes(m.id)) {
                const newTeam = teams.find(t => (t.memberIds || []).includes(m.id));
                if (newTeam) store.switchTeam(newTeam.id);
              }
              dropdown.style.display = 'none'; searchInput.value = '';
            };
            dropdown.appendChild(el);
          });
        }
      }
      dropdown.style.display = 'flex';
    });

    document.addEventListener('click', (e) => {
      if (!searchBox.contains(e.target)) dropdown.style.display = 'none';
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (dropdown.style.display === 'flex') {
          const firstResult = dropdown.querySelector('.search-result-item');
          if (firstResult) {
            firstResult.click();
          }
        }
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInput.focus();
      }
    });
  }

  static startNotificationTicker() {
    this.notifiedEvents = new Set();
    
    setInterval(() => {
      if (!window.electronAPI) return;
      const now = new Date();
      const events = store.getActiveTeamEvents();
      
      events.forEach(ev => {
        if (!ev.start || !ev.end) return;
        const start = new Date(ev.start);
        const end = new Date(ev.end);
        
        // Match start within the current minute
        if (Math.abs(start.getTime() - now.getTime()) < 60000 && start.getTime() <= now.getTime()) {
          const key = 'start_' + ev.id;
          if (!this.notifiedEvents.has(key)) {
            this.notifiedEvents.add(key);
            window.electronAPI.showNotification({ title: 'Task Started', body: ev.title + ' has just started.' });
          }
        }
        
        // Match end within the current minute
        if (Math.abs(end.getTime() - now.getTime()) < 60000 && end.getTime() <= now.getTime()) {
          const key = 'end_' + ev.id;
          if (!this.notifiedEvents.has(key)) {
            this.notifiedEvents.add(key);
            window.electronAPI.showNotification({ title: 'Task Ended', body: ev.title + ' has ended.' });
          }
        }
      });
    }, 30000);
  }

  static onStateChange(state) {
    // Update Sidebar Team Workspace Widget
    TeamManager.renderSidebarTeamWidget();

    // Update Header Active User Pill
    const activeUser = store.getActiveUser();
    const pillAvatar = document.querySelector('#header-user-avatar');
    const pillName = document.querySelector('#header-user-name');
    const themeBtn = document.querySelector('#titlebar-theme-toggle');

    if (pillAvatar) {
      if (activeUser.avatarUrl) {
        pillAvatar.innerHTML = `<img src="${activeUser.avatarUrl}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;" />`;
        pillAvatar.style.backgroundColor = 'transparent';
      } else {
        pillAvatar.textContent = activeUser.avatar;
        pillAvatar.style.backgroundColor = activeUser.color;
      }
    }
    if (pillName) {
      pillName.textContent = activeUser.name;
    }
    if (themeBtn) {
      themeBtn.textContent = state.theme === 'dark' ? '🌙' : '☀️';
    }

    // Update Dynamic Firebase Sync Indicator in Desktop Titlebar
    const syncDot = document.querySelector('#sync-indicator-dot');
    const syncText = document.querySelector('#sync-status-text');
    if (syncDot && syncText) {
      syncDot.className = 'status-indicator';

      if (state.cloudSyncStatus === 'connected') {
        syncDot.classList.add('sync-indicator-live');
        const proj = window.firebaseService?.config?.projectId || 'Connected';
        const userEmail = state.firebaseUser?.email ? ` (${state.firebaseUser.email.split('@')[0]})` : '';
        syncText.textContent = `Cloud Live • ${proj}${userEmail}`;
      } else if (state.cloudSyncStatus === 'connecting') {
        syncDot.classList.add('sync-indicator-offline');
        syncText.textContent = 'Connecting to Cloud...';
      } else if (state.cloudSyncStatus === 'error') {
        syncDot.classList.add('sync-indicator-error');
        syncText.textContent = 'Cloud Error (Click to fix)';
      } else {
        syncDot.classList.add('sync-indicator-offline');
        syncText.textContent = 'Local Mode • Offline Storage';
      }
    }

    // Update Nav Login / Account Tab Label
    const navLoginLabel = document.querySelector('#nav-login-label');
    if (navLoginLabel) {
      navLoginLabel.textContent = store.isUserLoggedIn() ? 'Cloud Account' : 'Sign In';
    }

    // Render Sidebar Team Member Filters
    const sidebarFilters = document.querySelector('#team-filters-container');
    if (sidebarFilters) {
      TeamManager.renderSidebarFilters(sidebarFilters);
    }

    // Render Sidebar Mini Calendar
    const miniCalContainer = document.querySelector('#sidebar-mini-calendar');
    if (miniCalContainer) {
      CalendarView.renderSidebarMiniCalendar(miniCalContainer);
    }

    // Update Conflict Badge in Sidebar Nav (for active team)
    const activeEvents = store.getActiveTeamEvents();
    const conflicts = ConflictEngine.detectConflicts(activeEvents);
    const navBadge = document.querySelector('#conflict-nav-badge');
    if (navBadge) {
      if (conflicts.length > 0) {
        navBadge.style.display = 'inline-block';
        navBadge.textContent = `${conflicts.length} alert${conflicts.length > 1 ? 's' : ''}`;
      } else {
        navBadge.style.display = 'none';
      }
    }

    this.renderCurrentTab();
  }

  static renderCurrentTab() {
    const state = store.getState();

    try {
      switch (this.activeTab) {
        case 'home':
          this.renderHomeTab(document.querySelector('#page-home'), state);
          break;
        case 'calendar':
          this.calendarView.render();
          break;
        case 'chat':
          ChatManager.render(document.querySelector('#page-chat'));
          break;
        case 'account':
          TeamManager.renderAccountTabPage(document.querySelector('#page-account'));
          break;
        case 'settings':
          this.renderSettingsTab(document.querySelector('#page-settings'), state);
          break;
        case 'login':
          this.renderLoginTab(document.querySelector('#page-login'), state);
          break;
      }
    } catch (err) {
      console.error('Render Error:', err);
      const activePage = document.querySelector('.tab-page.active');
      if (activePage) {
        activePage.innerHTML = `
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center;">
            <div style="font-size: 48px; margin-bottom: 20px;">⚠️</div>
            <h2 style="color: var(--text-primary); margin-bottom: 10px;">UI Rendering Error</h2>
            <p style="color: var(--text-secondary); max-width: 400px; margin-bottom: 24px;">
              The app encountered an error trying to load this page. This usually happens if you updated the app and your old local data is incompatible.
            </p>
            <div style="padding: 10px; background: rgba(255,0,0,0.1); border-radius: 8px; color: #ff6b6b; font-family: monospace; font-size: 12px; margin-bottom: 24px; max-width: 500px; text-align: left; overflow: hidden; text-overflow: ellipsis;">
              ${err.message}
            </div>
            <button class="btn btn-primary" onclick="localStorage.clear(); location.reload();" style="background: var(--status-conflict); border-color: var(--status-conflict);">
              Wipe Local Storage & Reload
            </button>
          </div>
        `;
      }
    }
  }

  // --- HOME TAB RENDERER ---
  static renderHomeTab(containerEl, state) {
    if (!containerEl) return;

    const activeUser = store.getActiveUser();
    const activeTeam = store.getActiveTeam();
    const activeTeamEvents = store.getActiveTeamEvents();
    const activeTeamMembers = store.getActiveTeamMembers();

    const todayIso = DateUtils.formatLocalDate(new Date());
    const todayEvents = activeTeamEvents.filter(e => e.start.startsWith(todayIso));
    const conflicts = ConflictEngine.detectConflicts(activeTeamEvents);

    containerEl.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 24px;">
        <!-- Welcome Hero Banner with Active Team Pill -->
        <div style="background: linear-gradient(135deg, var(--bg-surface-elevated) 0%, var(--bg-surface) 100%); border: 1px solid var(--border-color); border-radius: 16px; padding: 28px; display: flex; align-items: center; justify-content: space-between;">
          <div>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
              <span class="badge badge-indigo" style="cursor: pointer;" id="home-switch-team-btn" title="Click to switch team">
                ${activeTeam.icon || '⚡'} ${activeTeam.name} (${activeTeam.code}) ▾
              </span>
            </div>
            <h1 style="font-size: 26px; color: var(--text-primary);">Welcome back, ${activeUser.name}! 👋</h1>
            <p style="font-size: 14px; color: var(--text-secondary); margin-top: 6px;">
              Here is what <strong>${activeTeam.name}</strong> is working on today.
            </p>
            <div style="display: flex; gap: 12px; margin-top: 18px;">
              <button class="btn btn-primary" id="home-goto-cal">📅 Open Collaborative Calendar</button>
              <button class="btn btn-secondary" id="home-quick-event">➕ Quick Add Task</button>
            </div>
          </div>
          <div style="width: 72px; height: 72px; border-radius: 50%; background: ${activeUser.avatarUrl ? 'transparent' : activeUser.color}; color: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 800; box-shadow: 0 4px 20px rgba(0,0,0,0.4);">
            ${activeUser.avatarUrl ? `<img src="${activeUser.avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : activeUser.avatar}
          </div>
        </div>

        <!-- Metric Stat Cards -->
        <div class="card-grid">
          <div class="stat-card">
            <div class="stat-card-header">
              <span class="stat-label">Team Events</span>
              <div class="stat-icon">📅</div>
            </div>
            <div class="stat-value">${activeTeamEvents.length}</div>
            <div class="stat-subtitle">In ${activeTeam.name}</div>
          </div>

          <div class="stat-card">
            <div class="stat-card-header">
              <span class="stat-label">Today's Schedule</span>
              <div class="stat-icon">🕒</div>
            </div>
            <div class="stat-value">${todayEvents.length}</div>
            <div class="stat-subtitle">Tasks planned for today</div>
          </div>

          <div class="stat-card">
            <div class="stat-card-header">
              <span class="stat-label">Conflict Warnings</span>
              <div class="stat-icon" style="color: var(--status-conflict);">⚠️</div>
            </div>
            <div class="stat-value" style="color: ${conflicts.length > 0 ? 'var(--status-conflict)' : 'var(--status-success)'};">
              ${conflicts.length}
            </div>
            <div class="stat-subtitle">${conflicts.length > 0 ? 'Overlapping task alerts' : 'No schedule conflicts!'}</div>
          </div>

          <div class="stat-card">
            <div class="stat-card-header">
              <span class="stat-label">Team Roster</span>
              <div class="stat-icon">👥</div>
            </div>
            <div class="stat-value">${activeTeamMembers.length}</div>
            <div class="stat-subtitle">Invite Code: ${activeTeam.code}</div>
          </div>
        </div>

        <!-- Schedule & Conflicts Two Column Layout -->
        <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 20px;">
          <!-- Upcoming Events Feed -->
          <div class="panel">
            <div class="panel-header">
              <h3 class="panel-title">📌 Upcoming Tasks & Events: ${activeTeam.name}</h3>
              <span style="font-size: 12px; color: var(--text-muted);">Real-time team feed</span>
            </div>

            <div style="display: flex; flex-direction: column; gap: 10px;">
              ${activeTeamEvents.length === 0 ? `
                <div style="text-align: center; padding: 24px; color: var(--text-muted);">
                  No tasks scheduled yet for ${activeTeam.name}. Click "+ Quick Add Task" to schedule one!
                </div>
              ` : activeTeamEvents.slice(0, 5).map(e => {
                const member = state.teamMembers.find(m => m.id === e.memberId) || { name: 'Member', color: '#52525b', avatar: '?' };
                const startTime = new Date(e.start).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

                return `
                  <div style="background: var(--bg-surface-elevated); border: 1px solid var(--border-color); border-left: 4px solid ${member.color}; border-radius: 10px; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                      <div style="width: 32px; height: 32px; border-radius: 50%; background: ${member.avatarUrl ? 'transparent' : member.color}; color: #ffffff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 12px;">
                        ${member.avatarUrl ? `<img src="${member.avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : member.avatar}
                      </div>
                      <div>
                        <div style="font-weight: 700; font-size: 14px; color: var(--text-primary);">${e.title}</div>
                        <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
                          Assigned to <strong>${member.name}</strong> • ${startTime}
                        </div>
                      </div>
                    </div>
                    <span class="badge" style="background: ${member.color}20; color: ${member.color};">${e.category || 'Task'}</span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Conflict Alerts & Activity Sidebar Panel -->
          <div class="panel">
            <div class="panel-header">
              <h3 class="panel-title" style="color: ${conflicts.length > 0 ? 'var(--status-conflict)' : 'var(--text-primary)'};">
                ${conflicts.length > 0 ? '⚠️ Schedule Conflicts' : '✅ Team Status'}
              </h3>
            </div>

            ${conflicts.length === 0 ? `
              <div style="text-align: center; padding: 20px; color: var(--text-muted);">
                <div style="font-size: 32px; margin-bottom: 8px;">🎉</div>
                Great transparency! All schedules in ${activeTeam.name} are conflict-free.
              </div>
            ` : `
              <div style="display: flex; flex-direction: column; gap: 10px;">
                ${conflicts.map(c => `
                  <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid var(--status-conflict); border-radius: 8px; padding: 10px; font-size: 12px;">
                    <div style="font-weight: 700; color: var(--status-conflict);">Overlap Warning:</div>
                    <div style="color: var(--text-primary); margin-top: 4px;">• "${c.event1.title}"</div>
                    <div style="color: var(--text-primary);">• "${c.event2.title}"</div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
        </div>
      </div>
    `;

    containerEl.querySelector('#home-switch-team-btn')?.addEventListener('click', () => {
      this.openModal('🏢 Switch Team Workspace', (body) => TeamManager.renderTeamSwitcherModal(body));
    });
    containerEl.querySelector('#home-goto-cal')?.addEventListener('click', () => this.switchTab('calendar'));
    containerEl.querySelector('#home-quick-event')?.addEventListener('click', () => this.openEventModal());
  }

  // --- SETTINGS TAB RENDERER ---
  static renderSettingsTab(containerEl, state) {
    if (!containerEl) return;

    const currentTheme = state.theme;
    const fbConfig = window.firebaseService?.config || {};
    const isConnected = state.cloudSyncStatus === 'connected';

    containerEl.innerHTML = `
      <div style="max-width: 860px; margin: 0 auto; width: 100%; display: flex; flex-direction: column; gap: 24px;">
        
        <!-- 🔥 AUTOMATIC DEFAULT FIREBASE CLOUD STATUS PANEL -->
        <div class="panel" style="border: 1px solid rgba(16, 185, 129, 0.4); background: linear-gradient(135deg, var(--bg-surface-elevated) 0%, var(--bg-surface) 100%);">
          <div class="panel-header" style="justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 36px; height: 36px; border-radius: 10px; background: rgba(16, 185, 129, 0.2); color: #10b981; display: flex; align-items: center; justify-content: center; font-size: 18px;">
                🔥
              </div>
              <div>
                <h3 class="panel-title" style="margin: 0;">Noise Cloud Realtime Synchronization</h3>
                <span style="font-size: 12px; color: var(--text-secondary);">Default cloud infrastructure is active for all team workspaces</span>
              </div>
            </div>
            <span class="badge badge-emerald">
              🟢 Live Cloud Connected
            </span>
          </div>

          <div style="display: flex; flex-direction: column; gap: 16px;">
            <!-- Live Cloud Status Box -->
            <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 12px; padding: 18px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px;">
              <div style="display: flex; flex-direction: column; gap: 4px;">
                <div style="font-weight: 700; color: #10b981; font-size: 14px;">✓ Realtime Cloud Firestore Active</div>
                <div style="font-size: 12.5px; color: var(--text-secondary);">
                  Cloud Project: <strong style="color: var(--text-primary);">teamco-27</strong> • Domain: <strong style="color: var(--text-primary);">teamco-27.firebaseapp.com</strong>
                </div>
                <div style="font-size: 12px; color: var(--text-muted);">
                  Events, team workspaces, and rosters automatically synchronize across all devices.
                </div>
              </div>

              <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                <button class="btn btn-secondary btn-sm" id="btn-test-cloud" title="Run diagnostic read & write ping test">
                  🔍 Test Cloud Connection
                </button>
                <button class="btn btn-secondary btn-sm" id="btn-force-sync" title="Sync now with cloud">
                  🔄 Force Sync
                </button>
                <button class="btn btn-primary btn-sm" id="btn-seed-firestore" title="Push all current local events & team members to Firestore">
                  ⚡ Seed Cloud Database
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 💧 THEME SELECTION PANEL -->
        <div class="panel">
          <div class="panel-header">
            <h3 class="panel-title">💧 Liquid Glass Theme Selection</h3>
          </div>

          <div style="display: flex; flex-direction: column; gap: 16px;">
            <p style="font-size: 13px; color: var(--text-secondary);">
              Select an executive liquid glass visual theme. All themes feature translucent glassmorphism panels, ambient background orbs, and glossy UI chrome.
            </p>

            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;">
              <!-- Liquid Glass Dark Card -->
              <div class="theme-card ${currentTheme === 'dark' ? 'active' : ''}" id="opt-theme-dark"
                   style="border: 2px solid ${currentTheme === 'dark' ? 'var(--accent-primary)' : 'var(--border-color)'}; background: rgba(16,16,22,0.85); backdrop-filter: blur(20px); border-radius: 14px; padding: 18px; cursor: pointer; color: #ffffff; transition: all 0.18s ease;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                  <span style="font-weight: 700; font-size: 14px;">🌌 Liquid Dark</span>
                  ${currentTheme === 'dark' ? '<span class="badge badge-indigo">Active</span>' : ''}
                </div>
                <div style="height: 60px; background: rgba(24,24,32,0.75); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 8px; display: flex; gap: 6px;">
                  <div style="width: 30%; background: rgba(255,255,255,0.2); border-radius: 4px;"></div>
                  <div style="width: 70%; background: rgba(255,255,255,0.2); border: 1px solid #71717a; border-radius: 4px;"></div>
                </div>
                <p style="font-size: 11.5px; color: #cbd5e1; margin-top: 10px;">Deep pitch black obsidian, glowing violet pills & frosted blur.</p>
              </div>

              <!-- Liquid Glass Light Card -->
              <div class="theme-card ${currentTheme === 'light' ? 'active' : ''}" id="opt-theme-light"
                   style="border: 2px solid ${currentTheme === 'light' ? 'var(--accent-primary)' : 'var(--border-color)'}; background: rgba(255,255,255,0.85); backdrop-filter: blur(20px); border-radius: 14px; padding: 18px; cursor: pointer; color: #0f172a; transition: all 0.18s ease;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                  <span style="font-weight: 700; font-size: 14px;">💎 Crystal Light</span>
                  ${currentTheme === 'light' ? '<span class="badge badge-indigo">Active</span>' : ''}
                </div>
                <div style="height: 60px; background: rgba(241,245,249,0.85); border: 1px solid rgba(0,0,0,0.08); border-radius: 8px; padding: 8px; display: flex; gap: 6px;">
                  <div style="width: 30%; background: #e2e8f0; border-radius: 4px;"></div>
                  <div style="width: 70%; background: rgba(255,255,255,0.15); border: 1px solid #3f3f46; border-radius: 4px;"></div>
                </div>
                <p style="font-size: 11.5px; color: #475569; margin-top: 10px;">Pristine slate canvas, soft reflections, high readability.</p>
              </div>

              <!-- Liquid Cyber Neon Card -->
              <div class="theme-card ${currentTheme === 'neon' ? 'active' : ''}" id="opt-theme-neon"
                   style="border: 2px solid ${currentTheme === 'neon' ? '#38bdf8' : 'var(--border-color)'}; background: rgba(15,23,42,0.85); backdrop-filter: blur(20px); border-radius: 14px; padding: 18px; cursor: pointer; color: #f0f9ff; transition: all 0.18s ease;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                  <span style="font-weight: 700; font-size: 14px;">🧪 Cyber Neon</span>
                  ${currentTheme === 'neon' ? '<span class="badge badge-indigo">Active</span>' : ''}
                </div>
                <div style="height: 60px; background: rgba(30,41,59,0.85); border: 1px solid rgba(56,189,248,0.3); border-radius: 8px; padding: 8px; display: flex; gap: 6px;">
                  <div style="width: 30%; background: rgba(2,132,199,0.3); border-radius: 4px;"></div>
                  <div style="width: 70%; background: rgba(56,189,248,0.25); border: 1px solid #38bdf8; border-radius: 4px;"></div>
                </div>
                <p style="font-size: 11.5px; color: #bae6fd; margin-top: 10px;">Vibrant cyan glow, futuristic glass cards & high contrast.</p>
              </div>
            </div>
          </div>
        </div>

        <!-- 🔐 SESSION PERSISTENCE & SECURITY PANEL -->
        <div class="panel">
          <div class="panel-header">
            <h3 class="panel-title">🔐 Session & Security</h3>
          </div>
          <div style="display: flex; flex-direction: column; gap: 14px;">
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; background: var(--bg-surface-elevated); border: 1px solid var(--border-color); border-radius: 12px;">
              <div style="padding-right: 14px;">
                <div style="font-weight: 700; font-size: 13.5px; color: var(--text-primary);">Stay Logged In on this Device</div>
                <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
                  Automatically restore your active cloud profile and team calendars on app startup without asking you to sign in again.
                </div>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" id="setting-toggle-stay-logged-in" ${store.isStayLoggedIn() ? 'checked' : ''} />
                <span class="toggle-slider"></span>
              </label>
            </div>
            
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; background: var(--bg-surface-elevated); border: 1px solid var(--border-color); border-radius: 12px;">
              <div style="padding-right: 14px;">
                <div style="font-weight: 700; font-size: 13.5px; color: var(--text-primary);">Launch App on Startup</div>
                <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
                  Automatically start Noise when you log into your computer.
                </div>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" id="setting-toggle-launch-startup" />
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>
        </div>



        <!-- ⚡ PERFORMANCE PANEL -->
        <div class="panel">
          <div class="panel-header">
            <h3 class="panel-title">⚡ Performance & Graphics</h3>
          </div>
          <div style="display: flex; flex-direction: column; gap: 14px;">
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; background: var(--bg-surface-elevated); border: 1px solid var(--border-color); border-radius: 12px;">
              <div style="padding-right: 14px;">
                <div style="font-weight: 700; font-size: 13.5px; color: var(--text-primary);">Low Performance Mode</div>
                <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
                  Disables heavy graphical effects (like frosted glass blurs) to improve speed on older PCs. This setting is machine-specific.
                </div>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" id="setting-toggle-low-perf" ${localStorage.getItem('noise_low_perf_mode') === 'true' ? 'checked' : ''} />
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>
        </div>

        <!-- 💾 DATA EXPORT & BACKUP PANEL -->
        <div class="panel">
          <div class="panel-header">
            <h3 class="panel-title">💾 Desktop Data & Calendar Export</h3>
          </div>
          <div style="display: flex; flex-direction: column; gap: 12px;">
            <p style="font-size: 13px; color: var(--text-secondary);">
              Export your collaborative calendar data to JSON or clear local workspace cache.
            </p>
            <div style="display: flex; gap: 12px;">
              <button class="btn btn-secondary" id="btn-export-calendar">📤 Export Calendar (.json)</button>
              <button class="btn btn-danger" id="settings-clear-data">🗑️ Clear Local Cache</button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Diagnostic Cloud Connection Test Handler
    containerEl.querySelector('#btn-test-cloud')?.addEventListener('click', async () => {
      const btn = containerEl.querySelector('#btn-test-cloud');
      btn.disabled = true;
      btn.textContent = 'Testing...';
      try {
        const res = await window.firebaseService.testCloudConnection();
        if (res.success) {
          ToastNotificationManager.show({ title: 'Cloud Test: Success! 🟢', message: res.message });
        } else {
          ToastNotificationManager.show({ 
            title: 'Cloud Test Failed ⚠️', 
            message: res.message, 
            isConflict: true 
          });
        }
      } catch (e) {
        ToastNotificationManager.show({ title: 'Cloud Test Error', message: e.message, isConflict: true });
      } finally {
        btn.disabled = false;
        btn.textContent = '🔍 Test Cloud Connection';
      }
    });

    // Stay Logged In Setting Toggle Handler
    containerEl.querySelector('#setting-toggle-stay-logged-in')?.addEventListener('change', (e) => {
      const isEnabled = e.target.checked;
      store.setStayLoggedIn(isEnabled);
      ToastNotificationManager.show({
        title: isEnabled ? 'Stay Logged In: Enabled 🔒' : 'Stay Logged In: Disabled 🔓',
        message: isEnabled 
          ? 'Your cloud session will auto-resume across app restarts.' 
          : 'Your session will be cleared on window close.'
      });
    });

    // Low Performance Mode Setting Toggle Handler
    containerEl.querySelector('#setting-toggle-low-perf')?.addEventListener('change', (e) => {
      const isLowPerf = e.target.checked;
      localStorage.setItem('noise_low_perf_mode', isLowPerf);
      if (isLowPerf) {
        document.body.classList.add('low-performance-mode');
      } else {
        document.body.classList.remove('low-performance-mode');
      }
      ToastNotificationManager.show({
        title: isLowPerf ? 'Low Performance Mode: On ⚡' : 'Low Performance Mode: Off 💎',
        message: isLowPerf 
          ? 'Heavy graphical effects are disabled.' 
          : 'Full visual fidelity restored.'
      });
    });

    // Launch on Startup Setting Toggle Handler
    const startupToggle = containerEl.querySelector('#setting-toggle-launch-startup');
    if (startupToggle && window.electronAPI && window.electronAPI.getLoginItemSettings) {
      window.electronAPI.getLoginItemSettings().then(isOpenAtLogin => {
        startupToggle.checked = isOpenAtLogin;
      });
      startupToggle.addEventListener('change', (e) => {
        const isEnabled = e.target.checked;
        window.electronAPI.setLoginItemSettings(isEnabled);
        ToastNotificationManager.show({
          title: isEnabled ? 'Launch on Startup: Enabled 🚀' : 'Launch on Startup: Disabled 🛑',
          message: isEnabled 
            ? 'Noise will automatically start when you log in.' 
            : 'Noise will no longer start automatically.'
        });
      });
    } else if (startupToggle) {
      startupToggle.disabled = true; // Disable if not in electron
    }



    // Force Cloud Sync Handler
    containerEl.querySelector('#btn-force-sync')?.addEventListener('click', async () => {
      ToastNotificationManager.show({ title: 'Syncing with Cloud...', message: 'Pulling latest team events from Firestore' });
      if (window.firebaseService.isInitialized) {
        window.firebaseService.attachRealtimeListeners();
        ToastNotificationManager.show({ title: 'Cloud Synced 🟢', message: 'Connected to teamco-27' });
      }
    });

    // 1-Click Firestore Database Seeding
    containerEl.querySelector('#btn-seed-firestore')?.addEventListener('click', async () => {
      try {
        ToastNotificationManager.show({ title: 'Seeding Firestore...', message: 'Uploading local calendar schedule to cloud' });
        const res = await window.firebaseService.seedFirestoreFromLocal(state.events, state.teamMembers);
        ToastNotificationManager.show({ title: 'Cloud Database Seeded! 🚀', message: `Uploaded ${res.eventsCount} events and ${res.membersCount} team members to Firestore.` });
      } catch (e) {
        ToastNotificationManager.show({ title: 'Seeding Error', message: e.message, isConflict: true });
      }
    });

    // Themes
    containerEl.querySelector('#opt-theme-dark')?.addEventListener('click', () => store.setTheme('dark'));
    containerEl.querySelector('#opt-theme-light')?.addEventListener('click', () => store.setTheme('light'));
    containerEl.querySelector('#opt-theme-neon')?.addEventListener('click', () => store.setTheme('neon'));

    // Export Calendar
    containerEl.querySelector('#btn-export-calendar')?.addEventListener('click', async () => {
      const content = JSON.stringify(state.events, null, 2);
      if (window.electronAPI) {
        const res = await window.electronAPI.exportFile({
          defaultName: 'noise-team-calendar.json',
          content
        });
        if (res.success) {
          ToastNotificationManager.show({ title: 'Export Successful', message: `Saved calendar to ${res.filePath}` });
        }
      }
    });

    // Clear Cache
    containerEl.querySelector('#settings-clear-data').addEventListener('click', () => {
      this.confirm('Clear Local Data', 'Clear local storage and reload fresh workspace?', () => {
        localStorage.clear();
        location.reload();
      });
    });
  }

  // --- LOGIN / ACCOUNT TAB RENDERER ---
  static renderLoginTab(containerEl, state) {
    if (!containerEl) return;

    const activeUser = store.getActiveUser();
    const fbUser = state.firebaseUser;
    const isLoggedIn = store.isUserLoggedIn();
    const activeTeam = store.getActiveTeam();
    const savedEmail = localStorage.getItem('noise_saved_email') || '';

    let authMode = 'signin'; // 'signin' | 'signup'

    const renderAuthContent = () => {
      const stayLoggedIn = store.isStayLoggedIn();

      containerEl.innerHTML = `
        <div style="max-width: 460px; margin: 20px auto; width: 100%; display: flex; flex-direction: column; gap: 20px;">
          <div class="panel" style="padding: 34px 28px; border-radius: 20px; box-shadow: var(--shadow-lg);">
            
            <!-- Header Branding -->
            <div style="text-align: center; margin-bottom: 22px;">
              <div style="width: 50px; height: 50px; background: linear-gradient(135deg, #52525b 0%, #71717a 100%); border-radius: 14px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 12px; box-shadow: 0 4px 18px rgba(255, 255, 255, 0.4);">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
              </div>
              <h2 style="font-size: 22px; font-weight: 800; color: var(--text-primary);">
                ${isLoggedIn ? 'My Account & Workspace' : (authMode === 'signin' ? 'Sign In to Noise' : 'Create Firebase Account')}
              </h2>
              <p style="font-size: 13px; color: var(--text-secondary); margin-top: 4px;">
                ${isLoggedIn ? 'Your account is active and permanently synced via Cloud Firestore' : (authMode === 'signin' ? 'Enter your Firebase account credentials to sync calendar tasks' : 'Set up your cloud profile to collaborate with your team in real time')}
              </p>
            </div>

            ${isLoggedIn ? `
              <!-- Authenticated Profile View -->
              <div style="background: var(--bg-surface-elevated); border: 1px solid var(--border-color-strong); border-radius: 14px; padding: 20px; margin-bottom: 20px; display: flex; flex-direction: column; gap: 16px;">
                <div style="display: flex; align-items: center; gap: 16px;">
                  <div style="width: 52px; height: 52px; border-radius: 50%; background: ${activeUser.avatarUrl ? 'transparent' : (activeUser.color || '#52525b')}; color: #ffffff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 19px; box-shadow: 0 3px 12px rgba(0,0,0,0.3);">
                    ${activeUser.avatarUrl ? `<img src="${activeUser.avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : (activeUser.avatar || 'US')}
                  </div>
                  <div style="overflow: hidden;">
                    <div style="font-weight: 800; font-size: 16px; color: var(--text-primary);">${activeUser.name}</div>
                    <div style="font-size: 13px; color: var(--text-secondary); margin-top: 2px;">${activeUser.email}</div>
                    <div style="display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap;">
                      <span class="badge badge-emerald">🟢 Cloud Sync Active</span>
                      <span class="badge badge-indigo">${activeTeam.name}</span>
                    </div>
                  </div>
                </div>

                <!-- Stay Logged In Switch in Profile Card -->
                <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.22); padding: 10px 14px; border-radius: 10px; border: 1px solid var(--border-color);">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 14px;">🔒</span>
                    <div>
                      <div style="font-size: 12.5px; font-weight: 700; color: var(--text-primary);">Stay Logged In</div>
                      <div style="font-size: 11px; color: var(--text-secondary);">Auto-resume session on launch</div>
                    </div>
                  </div>
                  <label class="toggle-switch">
                    <input type="checkbox" id="profile-toggle-stay-logged" ${stayLoggedIn ? 'checked' : ''} />
                    <span class="toggle-slider"></span>
                  </label>
                </div>

                <div style="display: flex; gap: 10px; margin-top: 4px;">
                  <button class="btn btn-primary" id="btn-goto-calendar-auth" style="flex: 1;">
                    📅 Open Calendar
                  </button>
                  <button class="btn btn-secondary" id="btn-edit-profile-open">
                    ✏️ Edit
                  </button>
                  <button class="btn btn-danger" id="btn-firebase-signout">
                    Sign Out
                  </button>
                </div>
              </div>
            ` : `
              <!-- Authentication -->
              <div style="text-align: center; margin-top: 10px;">
                <!-- Email Auth -->
                <form id="form-email-auth" style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px;">
                  <input type="email" id="auth-email" placeholder="Email address" class="form-control" required style="padding: 12px; font-size: 14px; background: rgba(0,0,0,0.2);" />
                  <input type="password" id="auth-password" placeholder="Password" class="form-control" required style="padding: 12px; font-size: 14px; background: rgba(0,0,0,0.2);" />
                  <div style="display: flex; gap: 10px; margin-top: 4px;">
                    <button type="button" class="btn btn-primary" id="btn-email-login" style="flex: 1; padding: 12px;">Log In</button>
                    <button type="button" class="btn btn-secondary" id="btn-email-signup" style="flex: 1; padding: 12px;">Sign Up</button>
                  </div>
                </form>
                
                <div style="display: flex; align-items: center; margin: 16px 0; color: var(--text-muted); font-size: 12px;">
                  <div style="flex: 1; height: 1px; background: var(--border-color);"></div>
                  <span style="padding: 0 10px;">OR</span>
                  <div style="flex: 1; height: 1px; background: var(--border-color);"></div>
                </div>

                <!-- Google OAuth Login -->
                <button type="button" class="btn btn-secondary" id="btn-google-login" style="width: 100%; padding: 12px; font-size: 14px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 10px; background: #ffffff; color: #000000; border: 1px solid #e5e7eb;">
                  <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                  Continue with Google
                </button>
              </div>
            `}
          </div>
        </div>
      `;

      // Event Listeners
      
      // Email Login
      containerEl.querySelector('#btn-email-login')?.addEventListener('click', async () => {
        const email = containerEl.querySelector('#auth-email').value.trim();
        const password = containerEl.querySelector('#auth-password').value;
        if (!email || !password) return ToastNotificationManager.show({ title: 'Error', message: 'Email and password required', isError: true });
        try {
          ToastNotificationManager.show({ title: 'Logging in', message: 'Authenticating...' });
          await window.firebaseService.signInWithEmail(email, password);
        } catch (e) {
          ToastNotificationManager.show({ title: 'Login Failed', message: e.message, isError: true, isConflict: true });
        }
      });

      // Email Sign Up
      containerEl.querySelector('#btn-email-signup')?.addEventListener('click', async () => {
        const email = containerEl.querySelector('#auth-email').value.trim();
        const password = containerEl.querySelector('#auth-password').value;
        if (!email || !password) return ToastNotificationManager.show({ title: 'Error', message: 'Email and password required', isError: true });
        try {
          ToastNotificationManager.show({ title: 'Signing up', message: 'Creating account...' });
          await window.firebaseService.signUpWithEmail(email, password);
        } catch (e) {
          ToastNotificationManager.show({ title: 'Signup Failed', message: e.message, isError: true, isConflict: true });
        }
      });
      containerEl.querySelector('#btn-google-login')?.addEventListener('click', async () => {
        if (window.electronAPI && window.electronAPI.openExternalBrowser) {
          ToastNotificationManager.show({ title: 'Opening Browser', message: 'Please complete sign-in in your web browser.' });
          window.electronAPI.openExternalBrowser('http://localhost:42899/google-auth.html');
        } else if (window.firebaseService && window.firebaseService.auth) {
          try {
            ToastNotificationManager.show({ title: 'Authenticating', message: 'Opening Google Sign-In...' });
            const provider = new firebase.auth.GoogleAuthProvider();
            await window.firebaseService.auth.signInWithPopup(provider);
          } catch (e) {
            if (e.code === 'auth/operation-not-supported-in-this-environment') {
               ToastNotificationManager.show({ title: 'Mobile Demo Mode', message: 'Google Auth requires native plugins. Logging in as Mobile Tester.' });
               try {
                 const cred = await window.firebaseService.auth.signInAnonymously();
                 const mockProfile = {
                   id: cred.user.uid,
                   uid: cred.user.uid,
                   name: "Mobile Tester",
                   email: "mobile@demo.com",
                   role: "Mobile App Tester",
                   avatar: "MT",
                   color: "#10b981",
                   active: true
                 };
                 window.store.setActiveUserFromFirebase(mockProfile, true);
                 window.store.setFirebaseUser(cred.user);
                 setTimeout(() => window.location.reload(), 1500);
               } catch (err) {
                 ToastNotificationManager.show({ title: 'Fallback Failed', message: err.message, isError: true });
               }
            } else {
               ToastNotificationManager.show({ title: 'Login Failed', message: e.message, isError: true, isConflict: true });
            }
          }
        } else {
          ToastNotificationManager.show({ title: 'Error', message: 'Authentication routing not available.', isConflict: true });
        }
      });

      // Open Calendar
      containerEl.querySelector('#btn-goto-calendar-auth')?.addEventListener('click', () => {
        this.switchTab('calendar');
      });

      // Edit Profile
      containerEl.querySelector('#btn-edit-profile-open')?.addEventListener('click', () => {
        const user = store.getActiveUser();
        AppRouter.openModal('✏️ Edit User Profile', (modalBody) => {
          modalBody.innerHTML = `
            <form id="form-edit-active-profile" style="display: flex; flex-direction: column; gap: 14px;">
              <div class="form-group">
                <label class="form-label">Full Name *</label>
                <input type="text" id="edit-profile-name" class="form-control" value="${user.name}" required style="font-weight: 600;" />
              </div>
              <div class="form-group">
                <label class="form-label">Email Address *</label>
                <input type="email" id="edit-profile-email" class="form-control" value="${user.email}" required />
              </div>
              <div class="form-group">
                <label class="form-label">Role / Title</label>
                <input type="text" id="edit-profile-role" class="form-control" value="${user.role || 'Team Member'}" />
              </div>
              <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 8px;">
                <button type="button" class="btn btn-ghost" id="btn-cancel-edit-profile">Cancel</button>
                <button type="submit" class="btn btn-primary">Save Changes</button>
              </div>
            </form>
          `;

          modalBody.querySelector('#btn-cancel-edit-profile')?.addEventListener('click', () => AppRouter.closeModal());
          modalBody.querySelector('#form-edit-active-profile')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const name = modalBody.querySelector('#edit-profile-name').value.trim();
            const email = modalBody.querySelector('#edit-profile-email').value.trim();
            const role = modalBody.querySelector('#edit-profile-role').value.trim();
            const avatar = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || user.avatar;

            const updated = { ...user, name, email, role, avatar };
            store.setActiveUserFromFirebase(updated, store.isStayLoggedIn());
            if (window.firebaseService && window.firebaseService.db) {
              window.firebaseService.db.collection('users').doc(updated.id).set(updated, { merge: true }).catch(console.warn);
              window.firebaseService.db.collection('team_members').doc(updated.id).set(updated, { merge: true }).catch(console.warn);
            }

            AppRouter.closeModal();
            ToastNotificationManager.show({ title: 'Profile Updated', message: `Saved profile as ${name}` });
          });
        });
      });

      // Sign Out
      containerEl.querySelector('#btn-firebase-signout')?.addEventListener('click', async () => {
        await window.firebaseService.signOut();
        ToastNotificationManager.show({ title: 'Signed Out', message: 'Signed out of Firebase account.' });
        this.renderAccountView();
      });
    };

    renderAuthContent();
  }

  // --- GLOBAL EXECUTIVE EVENT BUILDER MODAL ---
  static openEventModal(eventId = null, defaultDateIso = null) {
    const state = store.getState();
    const activeTeam = store.getActiveTeam();
    const activeTeamMembers = store.getActiveTeamMembers();
    const activeTeamEvents = store.getActiveTeamEvents();

    const existingEvent = eventId ? state.events.find(e => e.id === eventId) : null;
    const isEdit = !!existingEvent;

    const assignees = activeTeamMembers.length > 0 ? activeTeamMembers : [store.getActiveUser()];
    let selectedMemberId = existingEvent ? existingEvent.memberId : (assignees[0]?.id || state.activeUserId);
    let selectedCategory = existingEvent ? (existingEvent.category || 'Planning') : 'Planning';

    this.openModal(isEdit ? '✏️ Edit Task Schedule' : `✨ Plan New Task (${activeTeam.name})`, (body) => {
      let defaultStart, defaultEnd;
      if (existingEvent) {
        defaultStart = existingEvent.start;
        defaultEnd = existingEvent.end;
      } else if (defaultDateIso) {
        defaultStart = `${defaultDateIso}T10:00`;
        defaultEnd = `${defaultDateIso}T11:00`;
      } else {
        const now = new Date();
        now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0);
        defaultStart = DateUtils.formatLocalDateTime(now);
        defaultEnd = DateUtils.addMinutes(defaultStart, 60);
      }

      body.innerHTML = `
        <form id="modal-event-form" style="display: flex; flex-direction: column; gap: 16px; ${isEdit && existingEvent.memberId !== state.activeUserId ? 'pointer-events: none; opacity: 0.8;' : ''}">
          <!-- Task Title -->
          <div class="form-group">
            <label class="form-label">Task Title *</label>
            <input type="text" id="evt-input-title" class="form-control" value="${existingEvent ? existingEvent.title : ''}" placeholder="e.g. Architecture Security Review" required style="font-size: 15px; font-weight: 600;" />
          </div>

          <!-- Task Author (Locked to Active User) -->
          <div class="form-group">
            <label class="form-label">Task Assignee</label>
            <div class="member-select-card selected" style="color: ${store.getActiveUser().color}; opacity: 0.9; cursor: default; background: var(--bg-surface-elevated);">
              <div style="width: 26px; height: 26px; border-radius: 50%; background: ${store.getActiveUser().color}; color: #ffffff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 11px;">
                ${store.getActiveUser().avatar}
              </div>
              <div style="overflow: hidden;">
                <div style="font-weight: 700; font-size: 12px; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${store.getActiveUser().name.split(' ')[0]} (You)</div>
              </div>
            </div>
            <input type="hidden" id="evt-input-member" value="${store.getActiveUser().id}" />
          </div>

          <!-- Category Chips -->
          <div class="form-group">
            <label class="form-label">Category</label>
            <div class="preset-chips-group" id="category-chips-group">
              ${['Planning', 'Design', 'Engineering', 'Client', 'General'].map(cat => `
                <div class="preset-chip ${cat === selectedCategory ? 'selected' : ''}" data-category="${cat}">${cat}</div>
              `).join('')}
            </div>
            <input type="hidden" id="evt-input-category" value="${selectedCategory}" />
          </div>

          <!-- Start & End Date Time + Duration Presets -->
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Start Time *</label>
              <input type="datetime-local" id="evt-input-start" class="form-control" value="${defaultStart.slice(0, 16)}" required />
            </div>

            <div class="form-group">
              <label class="form-label">End Time *</label>
              <input type="datetime-local" id="evt-input-end" class="form-control" value="${defaultEnd.slice(0, 16)}" required />
            </div>
          </div>

          <!-- Quick Duration Presets -->
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 11px; color: var(--text-muted); font-weight: 600;">Duration Presets:</span>
            <div class="preset-chips-group" id="duration-presets-group">
              <button type="button" class="preset-chip btn-duration-preset" data-mins="30">30m</button>
              <button type="button" class="preset-chip btn-duration-preset" data-mins="60">1h</button>
              <button type="button" class="preset-chip btn-duration-preset" data-mins="90">1.5h</button>
              <button type="button" class="preset-chip btn-duration-preset" data-mins="120">2h</button>
            </div>
          </div>

          <!-- Live Conflict Preview Inspector Box -->
          <div id="conflict-inspector-box" style="display: none;"></div>

          <!-- Location & Description -->
          <div class="form-group">
            <label class="form-label">Location / Video Link</label>
            <input type="text" id="evt-input-location" class="form-control" value="${existingEvent ? existingEvent.location || '' : ''}" placeholder="e.g. Huddle Room B / Google Meet" />
          </div>

          <div class="form-group">
            <label class="form-label">Agenda & Description</label>
            <textarea id="evt-input-desc" class="form-control" rows="2" placeholder="Add task goals or meeting notes...">${existingEvent ? existingEvent.description || '' : ''}</textarea>
          </div>

          </div>
        </form>
        <!-- Action Footer Buttons -->
        <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px;">
          ${isEdit && existingEvent.memberId === state.activeUserId ? `<button type="button" class="btn btn-danger" id="evt-btn-delete">🗑️ Delete</button>` : '<span></span>'}
          <div style="display: flex; gap: 10px;">
            <button type="button" class="btn btn-ghost" id="evt-btn-cancel">${!isEdit || existingEvent.memberId === state.activeUserId ? 'Cancel' : 'Close'}</button>
            ${!isEdit || existingEvent.memberId === state.activeUserId ? `<button type="submit" form="modal-event-form" class="btn btn-primary">${isEdit ? 'Save Task' : 'Create Task'}</button>` : ''}
          </div>
        </div>
      `;


      // Category Chip Click Listener
      body.querySelectorAll('#category-chips-group .preset-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          body.querySelectorAll('#category-chips-group .preset-chip').forEach(c => c.classList.remove('selected'));
          chip.classList.add('selected');
          body.querySelector('#evt-input-category').value = chip.getAttribute('data-category');
        });
      });

      const startInput = body.querySelector('#evt-input-start');
      const endInput = body.querySelector('#evt-input-end');
      const conflictBox = body.querySelector('#conflict-inspector-box');

      // Update active highlight on duration preset chips
      const updatePresetChipsSelection = () => {
        const sVal = startInput.value;
        const eVal = endInput.value;
        if (!sVal || !eVal) return;
        const diffMins = DateUtils.getDurationMinutes(sVal, eVal);
        body.querySelectorAll('.btn-duration-preset').forEach(b => {
          const bMins = parseInt(b.getAttribute('data-mins'), 10);
          if (bMins === diffMins) {
            b.classList.add('selected');
          } else {
            b.classList.remove('selected');
          }
        });
      };

      // Duration Presets Click Handler
      body.querySelectorAll('.btn-duration-preset').forEach(btn => {
        btn.addEventListener('click', () => {
          const mins = parseInt(btn.getAttribute('data-mins'), 10);
          const startVal = startInput.value;
          if (startVal) {
            endInput.value = DateUtils.addMinutes(startVal, mins);
            updatePresetChipsSelection();
            checkLiveConflict();
          }
        });
      });

      const checkLiveConflict = () => {
        const mId = body.querySelector('#evt-input-member').value;
        const sVal = startInput.value;
        const eVal = endInput.value;
        if (!sVal || !eVal) return;

        const sTime = DateUtils.parseLocalDateTime(sVal).getTime();
        const eTime = DateUtils.parseLocalDateTime(eVal).getTime();

        const overlapping = activeTeamEvents.find(ev => {
          if (isEdit && ev.id === eventId) return false;
          if (ev.memberId !== mId) return false;
          const evS = DateUtils.parseLocalDateTime(ev.start).getTime();
          const evE = DateUtils.parseLocalDateTime(ev.end).getTime();
          return (sTime < evE && eTime > evS);
        });

        if (overlapping) {
          const member = state.teamMembers.find(m => m.id === mId);
          conflictBox.style.display = 'flex';
          conflictBox.className = 'conflict-preview-box';
          conflictBox.innerHTML = `
            <span>⚠️</span>
            <div>
              <strong>Schedule Conflict Detected:</strong> ${member ? member.name : 'Assignee'} already has "${overlapping.title}" during this time window!
            </div>
          `;
        } else {
          conflictBox.style.display = 'none';
        }
      };

      startInput.addEventListener('input', () => {
        updatePresetChipsSelection();
        checkLiveConflict();
      });
      startInput.addEventListener('change', () => {
        updatePresetChipsSelection();
        checkLiveConflict();
      });
      endInput.addEventListener('input', () => {
        updatePresetChipsSelection();
        checkLiveConflict();
      });
      endInput.addEventListener('change', () => {
        updatePresetChipsSelection();
        checkLiveConflict();
      });

      // Initial state sync
      updatePresetChipsSelection();
      checkLiveConflict();

      body.querySelector('#evt-btn-cancel')?.addEventListener('click', () => this.closeModal());
      body.querySelector('#evt-btn-delete')?.addEventListener('click', () => {
        this.confirm('Delete Task', 'Delete this task event?', () => {
          if (window.firebaseService && window.firebaseService.isInitialized) {
            window.firebaseService.deleteEvent(eventId).catch(console.warn);
          }
          store.deleteEvent(eventId);
          this.closeModal();
          ToastNotificationManager.show({ title: 'Task Deleted', message: 'The event has been removed.' });
        });
      });

      body.querySelector('#modal-event-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const title = body.querySelector('#evt-input-title').value;
        const memberId = body.querySelector('#evt-input-member').value;
        const category = body.querySelector('#evt-input-category').value;
        const start = body.querySelector('#evt-input-start').value;
        const end = body.querySelector('#evt-input-end').value;
        const location = body.querySelector('#evt-input-location').value;
        const description = body.querySelector('#evt-input-desc').value;

        if (isEdit) {
          store.updateEvent(eventId, { title, memberId, category, start, end, location, description });
          ToastNotificationManager.show({ title: 'Task Saved', message: `"${title}" has been updated.` });
        } else {
          store.addEvent({ 
            teamId: activeTeam.id,
            title, 
            memberId, 
            category, 
            start, 
            end, 
            location, 
            description, 
            attendees: [memberId] 
          });
          ToastNotificationManager.show({ title: 'Task Created', message: `"${title}" scheduled in ${activeTeam.name}.` });
        }
        this.closeModal();
      });
    });
  }

  // --- MODAL UTILS ---
  static setupModal() {
    this.modalOverlay = document.querySelector('#global-modal');
    this.modalOverlay?.querySelector('.modal-close')?.addEventListener('click', () => this.closeModal());
  }

  static openModal(title, renderBodyCallback) {
    if (!this.modalOverlay) return;
    this.modalOverlay.querySelector('.modal-title').textContent = title;
    const body = this.modalOverlay.querySelector('.modal-body');
    renderBodyCallback(body);
    this.modalOverlay.classList.add('active');
  }

  static closeModal() {
    this.modalOverlay?.classList.remove('active');
  }

  static confirm(title, message, onConfirm) {
    this.openModal(title, (body) => {
      body.innerHTML = `
        <div style="margin-bottom: 20px; font-size: 14px; color: var(--text-secondary); white-space: pre-wrap;">${message}</div>
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
          <button class="btn btn-ghost" id="confirm-cancel">Cancel</button>
          <button class="btn btn-primary" id="confirm-ok" style="background: var(--status-error); color: white;">Confirm</button>
        </div>
      `;
      body.querySelector('#confirm-cancel').addEventListener('click', () => this.closeModal());
      body.querySelector('#confirm-ok').addEventListener('click', () => {
        this.closeModal();
        onConfirm();
      });
    });
  }

  static setupThemeToggle() {
    const themeBtn = document.querySelector('#titlebar-theme-toggle');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        if (window.store && typeof window.store.toggleTheme === 'function') {
          window.store.toggleTheme();
          if (window.app && typeof window.app.render === 'function') window.app.render();
        }
      });
    }
  }

  static setupSidebarToggle() {
    const toggleBtn = document.querySelector('#sidebar-toggle-btn');
    const sidebar = document.querySelector('.app-sidebar');
    if (toggleBtn && sidebar) {
      toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
      });
    }
  }

  static setupAIAssistant() {
    const aiBtn = document.querySelector('#ai-topbar-btn');
    const aiWidget = document.querySelector('#ai-chat-widget');
    const closeBtn = document.querySelector('#ai-widget-toggle');
    const sendBtn = document.querySelector('#ai-chat-send');
    const input = document.querySelector('#ai-chat-input');
    const historyContainer = document.querySelector('#ai-chat-history');

    if (!aiBtn || !aiWidget) return;

    const toggleWidget = () => {
      aiWidget.classList.toggle('collapsed');
      if (!aiWidget.classList.contains('collapsed')) {
        input.focus();
      }
    };

    aiBtn.addEventListener('click', toggleWidget);
    closeBtn.addEventListener('click', toggleWidget);

    const appendMessage = (text, role) => {
      const msgDiv = document.createElement('div');
      msgDiv.className = `ai-message ${role}`;
      // Basic markdown parsing for bold and line breaks
      msgDiv.innerHTML = text
        .replace(/\n/g, '<br>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>');
      historyContainer.appendChild(msgDiv);
      historyContainer.scrollTop = historyContainer.scrollHeight;
    };

    const handleSend = async () => {
      const text = input.value.trim();
      if (!text) return;

      input.value = '';
      appendMessage(text, 'user');
      
      const loadingDiv = document.createElement('div');
      loadingDiv.className = 'ai-message model';
      loadingDiv.textContent = 'Thinking...';
      historyContainer.appendChild(loadingDiv);
      historyContainer.scrollTop = historyContainer.scrollHeight;

      try {
        if (!window.aiService) throw new Error('AI Service not loaded.');
        const response = await window.aiService.sendMessage(text);
        loadingDiv.remove();
        appendMessage(response, 'model');
      } catch (err) {
        loadingDiv.remove();
        appendMessage(err.message, 'error');
      }
    };

    sendBtn.addEventListener('click', handleSend);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSend();
      }
    });
  }
  static openMemberProfile(memberId) {
    const member = store.state.teamMembers.find(m => m.id === memberId);
    if (!member) return;

    const isOnline = store.isUserOnline(member);
    const statusText = isOnline ? 'Online' : 'Offline';
    const statusColor = isOnline ? '#10b981' : '#52525b';

    let lastActiveStr = 'Unknown';
    if (member.lastActiveAt) {
      let timeMs = 0;
      if (member.lastActiveAt.toMillis && typeof member.lastActiveAt.toMillis === 'function') {
        timeMs = member.lastActiveAt.toMillis();
      } else if (member.lastActiveAt.seconds) {
        timeMs = member.lastActiveAt.seconds * 1000;
      } else if (member.lastActiveAt instanceof Date) {
        timeMs = member.lastActiveAt.getTime();
      } else if (typeof member.lastActiveAt === 'string') {
        timeMs = new Date(member.lastActiveAt).getTime();
      } else if (typeof member.lastActiveAt === 'number') {
        timeMs = member.lastActiveAt;
      }
      if (timeMs > 0) {
        lastActiveStr = new Date(timeMs).toLocaleString();
      }
    }

    this.openModal(`${member.name}'s Profile`, (modalBody) => {
      modalBody.innerHTML = `
        <div style="text-align: center; margin-bottom: 24px;">
          <div class="avatar-container" style="display: inline-block; margin: 0 auto 16px;">
            <div class="member-profile-modal-avatar" style="background: ${member.avatarUrl ? 'transparent' : member.color || '#52525b'}; position: relative; margin: 0;">
              ${member.avatarUrl ? `<img src="${member.avatarUrl}" style="width:100%;height:100%;border-radius:20px;object-fit:cover;">` : member.avatar}
              <div class="user-presence-dot ${isOnline ? 'online' : ''}" style="width:18px;height:18px;border-width:3px;bottom:-4px;right:-4px;"></div>
            </div>
          </div>
          <h2 style="margin: 0 0 8px; font-size: 24px; color: var(--text-primary);">${this.escapeHtml(member.name)}</h2>
          <div style="font-size: 14px; color: var(--text-secondary); display: flex; align-items: center; justify-content: center; gap: 6px;">
            <div style="width: 8px; height: 8px; border-radius: 50%; background: ${statusColor};"></div>
            ${statusText}
          </div>
        </div>

        <div class="panel" style="margin-bottom: 0;">
          <div class="form-group">
            <label class="form-label">Email</label>
            <div style="font-size: 14px; color: var(--text-primary);">${this.escapeHtml(member.email || 'Not provided')}</div>
          </div>
          <div class="form-group">
            <label class="form-label">Role</label>
            <div style="font-size: 14px; color: var(--text-primary);">${this.escapeHtml(member.role || 'Member')}</div>
          </div>
          <div class="form-group">
            <label class="form-label">Last Active</label>
            <div style="font-size: 14px; color: var(--text-muted);">${lastActiveStr}</div>
          </div>
        </div>
      `;
    });
  }

  static escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}

document.addEventListener('DOMContentLoaded', () => {
  AppRouter.init();
});
