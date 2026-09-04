/* ==========================================================================
   Noise Desktop - Multi-Team Manager & Workspace Orchestrator
   ========================================================================== */

class TeamManager {
  // Render Sidebar Team Member Filters (Scoped to Active Team)
  static renderSidebarFilters(containerEl) {
    const state = store.getState();
    const activeMembers = store.getActiveTeamMembers();
    containerEl.innerHTML = '';

    if (activeMembers.length === 0) {
      containerEl.innerHTML = `
        <div style="font-size: 11.5px; color: var(--text-muted); padding: 8px 4px;">
          No members in this team yet.
        </div>
      `;
      return;
    }

    activeMembers.forEach(member => {
      const isChecked = store.isMemberVisible(member.id);
      
      const chip = document.createElement('div');
      chip.className = `member-chip ${isChecked ? 'checked' : ''}`;
      chip.style.color = member.color;
      chip.setAttribute('data-member-id', member.id);

      chip.innerHTML = `
        <div class="member-chip-checkbox">
          <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </div>
        <div class="member-dot-online" style="background-color: ${member.color}"></div>
        <span style="color: var(--text-primary); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${AppRouter.escapeHtml(member.name)}</span>
        <div class="avatar-container" style="position: relative;" onclick="event.stopPropagation(); AppRouter.openMemberProfile('${member.id}')">
          <span style="font-size: 10px; color: var(--text-muted); font-weight: 600; display: flex; align-items: center; justify-content: center; width: 16px; height: 16px; border-radius: 50%; background: ${member.avatarUrl ? 'transparent' : 'var(--bg-surface)'};">
            ${member.avatarUrl ? `<img src="${member.avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : member.avatar}
          </span>
          <div class="user-presence-dot ${store.isUserOnline(member) ? 'online' : ''}" style="width: 6px; height: 6px; right: -1px; bottom: 0; border-width: 1px;"></div>
        </div>
      `;

      chip.addEventListener('click', () => {
        store.toggleMemberVisibility(member.id);
      });

      containerEl.appendChild(chip);
    });

    // Attach All / Me filter listeners
    document.querySelector('#btn-filter-all')?.addEventListener('click', () => {
      activeMembers.forEach(m => store.state.visibleMemberIds.add(m.id));
      store.notify();
    });

    document.querySelector('#btn-filter-me')?.addEventListener('click', () => {
      const activeId = store.state.activeUserId;
      store.state.visibleMemberIds = new Set([activeId]);
      store.notify();
    });
  }

  // Render Sidebar Team Switcher Widget Header
  static renderSidebarTeamWidget() {
    const activeTeam = store.getActiveTeam();
    const teamIcon = document.querySelector('#sidebar-team-icon');
    const teamName = document.querySelector('#sidebar-team-name');
    const teamCode = document.querySelector('#sidebar-team-code');

    if (teamIcon) {
      teamIcon.textContent = activeTeam.icon || '⚡';
      teamIcon.style.background = `${activeTeam.color || '#52525b'}25`;
      teamIcon.style.color = activeTeam.color || '#52525b';
    }
    if (teamName) {
      teamName.textContent = activeTeam.name;
    }
    if (teamCode) {
      teamCode.textContent = activeTeam.code || 'CODE';
    }
  }

  // --- Modal: Team Switcher & Workspace Picker ---
  static renderTeamSwitcherModal(modalBodyEl) {
    const state = store.getState();
    const activeTeam = store.getActiveTeam();

    modalBodyEl.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 18px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <p style="font-size: 13px; color: var(--text-secondary); margin: 0;">
            Select a team workspace to switch calendar schedule and member views.
          </p>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-secondary btn-sm" id="btn-modal-join-team">🔑 Join by Code</button>
            <button class="btn btn-primary btn-sm" id="btn-modal-create-team">➕ New Team</button>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 10px;">
          ${state.teams.map(team => {
            const isCurrent = team.id === activeTeam.id;
            const memberCount = (team.memberIds || []).length;

            return `
              <div class="team-card-option ${isCurrent ? 'active' : ''}" data-team-id="${team.id}"
                   style="display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border: 1px solid ${isCurrent ? team.color || 'var(--accent-primary)' : 'var(--border-color)'}; border-radius: 12px; background: ${isCurrent ? 'var(--bg-surface-elevated)' : 'var(--bg-surface)'}; cursor: pointer; transition: all 0.16s ease;">
                <div style="display: flex; align-items: center; gap: 14px;">
                  <div style="width: 40px; height: 40px; border-radius: 10px; background: ${team.color || '#52525b'}25; color: ${team.color || '#52525b'}; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 700;">
                    ${team.icon || '⚡'}
                  </div>
                  <div>
                    <div style="font-weight: 700; font-size: 14.5px; color: var(--text-primary);">${team.name}</div>
                    <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
                      ${memberCount} member${memberCount !== 1 ? 's' : ''} • Invite Code: <span style="font-family: monospace; color: var(--accent-primary); font-weight: 600;">${team.code}</span>
                    </div>
                  </div>
                </div>
                ${isCurrent ? `<span class="badge badge-indigo">Active Workspace</span>` : `<button class="btn btn-ghost btn-sm">Switch</button>`}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    modalBodyEl.querySelectorAll('.team-card-option').forEach(card => {
      card.addEventListener('click', () => {
        const teamId = card.getAttribute('data-team-id');
        store.switchTeam(teamId);
        ToastNotificationManager.show({ title: 'Workspace Switched', message: `Switched to ${store.getActiveTeam().name}` });
        AppRouter.closeModal();
      });
    });

    modalBodyEl.querySelector('#btn-modal-create-team')?.addEventListener('click', () => {
      AppRouter.openModal('✨ Create New Team Workspace', (body) => this.renderCreateTeamModal(body));
    });

    modalBodyEl.querySelector('#btn-modal-join-team')?.addEventListener('click', () => {
      AppRouter.openModal('🔑 Join Team with Invite Code', (body) => this.renderJoinTeamModal(body));
    });
  }

  // --- Modal: Create Team ---
  static renderCreateTeamModal(modalBodyEl) {
    let selectedIcon = '⚡';
    let selectedColor = '#8b5cf6';
    const icons = ['⚡', '🎨', '🚀', '💼', '🔬', '🏆', '🎯', '🔥', '🛡️', '🌐'];

    modalBodyEl.innerHTML = `
      <form id="form-create-team" style="display: flex; flex-direction: column; gap: 16px;">
        <div class="form-group">
          <label class="form-label">Team / Workspace Name *</label>
          <input type="text" id="new-team-name" class="form-control" placeholder="e.g. Mobile Engineering Squad" required style="font-size: 15px; font-weight: 600;" />
        </div>

        <div class="form-group">
          <label class="form-label">Description / Mission</label>
          <textarea id="new-team-desc" class="form-control" rows="2" placeholder="What is this team working on?"></textarea>
        </div>

        <div class="form-group">
          <label class="form-label">Team Workspace Icon</label>
          <div class="icon-picker-grid" id="team-icon-picker">
            ${icons.map(ic => `
              <button type="button" class="icon-choice-btn ${ic === selectedIcon ? 'selected' : ''}" data-icon="${ic}">${ic}</button>
            `).join('')}
          </div>
          <input type="hidden" id="new-team-icon" value="${selectedIcon}" />
        </div>

        <div class="form-group">
          <label class="form-label">Workspace Theme Color</label>
          <div style="display: flex; gap: 10px; align-items: center;">
            <input type="color" id="new-team-color" class="form-control" value="${selectedColor}" style="width: 60px; height: 38px; padding: 2px;" />
            <span style="font-size: 12px; color: var(--text-secondary);">Highlights events and badges for this team</span>
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 8px;">
          <button type="button" class="btn btn-ghost" id="btn-cancel-create-team">Cancel</button>
          <button type="submit" class="btn btn-primary">Create Team Workspace</button>
        </div>
      </form>
    `;

    // Icon Picker Handler
    modalBodyEl.querySelectorAll('.icon-choice-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        modalBodyEl.querySelectorAll('.icon-choice-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        modalBodyEl.querySelector('#new-team-icon').value = btn.getAttribute('data-icon');
      });
    });

    modalBodyEl.querySelector('#btn-cancel-create-team')?.addEventListener('click', () => AppRouter.closeModal());

    modalBodyEl.querySelector('#form-create-team')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = modalBodyEl.querySelector('#new-team-name').value.trim();
      const description = modalBodyEl.querySelector('#new-team-desc').value.trim();
      const icon = modalBodyEl.querySelector('#new-team-icon').value;
      const color = modalBodyEl.querySelector('#new-team-color').value;

      const created = store.createTeam({ name, description, icon, color });
      ToastNotificationManager.show({ title: 'Team Created! 🎉', message: `Workspace "${name}" created with code: ${created.code}` });
      AppRouter.closeModal();
    });
  }

  // --- Modal: Join Team with Code ---
  static renderJoinTeamModal(modalBodyEl) {
    modalBodyEl.innerHTML = `
      <form id="form-join-team" style="display: flex; flex-direction: column; gap: 16px;">
        <p style="font-size: 13px; color: var(--text-secondary); margin: 0;">
          Enter the team invite code provided by your team lead (e.g. <code>ENG-8842</code>).
        </p>

        <div class="form-group">
          <label class="form-label">Team Invite Code *</label>
          <input type="text" id="join-team-code" class="form-control" placeholder="ABC-1234" required style="font-family: monospace; font-size: 16px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;" />
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 8px;">
          <button type="button" class="btn btn-ghost" id="btn-cancel-join-team">Cancel</button>
          <button type="submit" class="btn btn-primary">Join Workspace</button>
        </div>
      </form>
    `;

    modalBodyEl.querySelector('#btn-cancel-join-team')?.addEventListener('click', () => AppRouter.closeModal());

    modalBodyEl.querySelector('#form-join-team')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = modalBodyEl.querySelector('#join-team-code').value.trim();

      ToastNotificationManager.show({ title: 'Looking up team...', message: `Searching for invite code ${code}` });
      const res = await store.joinTeamByCode(code);

      if (res.success) {
        ToastNotificationManager.show({ title: 'Joined Team! 🤝', message: `Welcome to "${res.team.name}" workspace.` });
        AppRouter.closeModal();
      } else {
        ToastNotificationManager.show({ title: 'Could Not Join', message: res.reason, isConflict: true });
      }
    });
  }

  // --- Modal: Switch Active User Profile ---
  static renderProfileSwitcherModal(modalBodyEl) {
    const state = store.getState();
    const activeUser = store.getActiveUser();

    modalBodyEl.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <p style="font-size: 13px; color: var(--text-secondary);">
          Select an active profile to test transparent team collaboration. Actions you take will be attributed to this member.
        </p>

        <div style="display: flex; flex-direction: column; gap: 10px;">
          ${state.teamMembers.map(m => `
            <div class="profile-card-option ${m.id === activeUser.id ? 'active' : ''}" 
                 data-user-id="${m.id}"
                 style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border: 1px solid ${m.id === activeUser.id ? m.color : 'var(--border-color)'}; border-radius: 12px; background: ${m.id === activeUser.id ? 'var(--bg-surface-elevated)' : 'var(--bg-surface)'}; cursor: pointer; transition: all 0.15s ease;">
              <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
                <div class="avatar-container" onclick="AppRouter.openMemberProfile('${m.id}')">
                  <div style="width: 36px; height: 36px; border-radius: 50%; background: ${m.avatarUrl ? 'transparent' : m.color}; color: #ffffff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px;">
                    ${m.avatarUrl ? `<img src="${m.avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : m.avatar}
                  </div>
                  <div class="user-presence-dot ${store.isUserOnline(m) ? 'online' : ''}"></div>
                </div>
                <div>
                  <div style="font-weight: 700; font-size: 14px; color: var(--text-primary);">${m.name}</div>
                  <div style="font-size: 12px; color: var(--text-secondary);">${m.role} • ${m.email}</div>
                </div>
              </div>
              ${m.id === activeUser.id ? `<span class="badge badge-indigo">Active Profile</span>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;

    modalBodyEl.querySelectorAll('.profile-card-option').forEach(card => {
      card.addEventListener('click', () => {
        const userId = card.getAttribute('data-user-id');
        store.setActiveUser(userId);
        AppRouter.closeModal();
      });
    });
  }

  // --- Account & Team Management Tab Page ---
  static renderAccountTabPage(containerEl) {
    const state = store.getState();
    const activeUser = store.getActiveUser();
    const activeTeam = store.getActiveTeam();
    const activeMembers = store.getActiveTeamMembers();

    containerEl.innerHTML = `
      <div style="max-width: 880px; margin: 0 auto; width: 100%; display: flex; flex-direction: column; gap: 24px;">
        
        <!-- Active User Profile Banner -->
        <div class="panel">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 20px;">
              <div style="width: 64px; height: 64px; border-radius: 50%; background: ${activeUser.avatarUrl ? 'transparent' : activeUser.color}; color: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 800; box-shadow: 0 4px 16px rgba(0,0,0,0.3);">
                ${activeUser.avatarUrl ? `<img src="${activeUser.avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : activeUser.avatar}
              </div>
              <div>
                <h2 style="font-size: 22px; color: var(--text-primary);">${activeUser.name}</h2>
                <p style="font-size: 14px; color: var(--text-secondary);">${activeTeam.ownerId === activeUser.id ? '👑 Workspace Owner' : activeUser.role} • ${activeUser.email}</p>
                <div style="display: flex; gap: 8px; margin-top: 8px;">
                  <span class="badge badge-indigo">Active User</span>
                  <span class="badge badge-emerald">Hours: ${activeUser.workingHours.start} - ${activeUser.workingHours.end}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ⚡ ACTIVE TEAM WORKSPACE BANNER -->
        <div class="panel" style="border: 1px solid ${activeTeam.color || 'var(--accent-primary)'}; background: linear-gradient(135deg, var(--bg-surface-elevated) 0%, var(--bg-surface) 100%);">
          <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px;">
            <div style="display: flex; align-items: center; gap: 16px;">
              <div style="width: 54px; height: 54px; border-radius: 14px; background: ${activeTeam.color || '#52525b'}30; color: ${activeTeam.color || '#52525b'}; display: flex; align-items: center; justify-content: center; font-size: 26px; font-weight: 800;">
                ${activeTeam.icon || '⚡'}
              </div>
              <div>
                <div style="display: flex; align-items: center; gap: 10px;">
                  <h3 style="font-size: 20px; font-weight: 800; color: var(--text-primary); margin: 0;">${activeTeam.name}</h3>
                  <span class="badge badge-indigo">Active Team Workspace</span>
                </div>
                <p style="font-size: 13px; color: var(--text-secondary); margin-top: 4px;">${activeTeam.description || 'Collaborative team calendar workspace'}</p>
              </div>
            </div>

            <!-- Shareable Team Invite Code Card & Leave/Delete Option -->
            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
              ${!activeTeam.isPrivate ? `
              <div style="display: flex; align-items: center; gap: 10px; background: rgba(0,0,0,0.25); padding: 8px 14px; border-radius: 10px; border: 1px solid var(--border-color);">
                <div>
                  <div style="font-size: 10px; text-transform: uppercase; color: var(--text-muted); font-weight: 700;">Shareable Invite Code</div>
                  <div style="font-family: monospace; font-size: 16px; font-weight: 800; color: var(--accent-primary); letter-spacing: 0.08em;">${activeTeam.code}</div>
                </div>
                <button class="btn btn-secondary btn-sm" id="btn-copy-team-code" title="Copy code to share with teammates">
                  📋 Copy
                </button>
              </div>
              ` : `
              <div style="display: flex; align-items: center; gap: 8px; background: rgba(0,0,0,0.1); padding: 8px 14px; border-radius: 10px; border: 1px solid var(--border-color); color: var(--text-muted); font-size: 13px; font-weight: 600;">
                🔒 Private Workspace
              </div>
              `}
              
              ${activeTeam.ownerId === store.getActiveUser()?.id && !activeTeam.isPrivate ? `
                <button class="btn btn-danger btn-sm" id="btn-delete-team" title="Permanently delete this workspace">
                  🗑️ Delete
                </button>
              ` : state.teams.length > 1 && !activeTeam.isPrivate ? `
                <button class="btn btn-danger btn-sm btn-leave-team" data-team-id="${activeTeam.id}" data-team-name="${activeTeam.name}" title="Leave this team workspace">
                  🚪 Leave
                </button>
              ` : ''}
            </div>
          </div>
        </div>

        <!-- 🏢 ALL TEAMS & WORKSPACES GRID -->
        <div class="panel">
          <div class="panel-header" style="justify-content: space-between;">
            <div>
              <h3 class="panel-title">🏢 Workspaces & Teams (${state.teams.length})</h3>
              <span style="font-size: 12px; color: var(--text-muted);">Create, switch or leave team calendars</span>
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="btn btn-secondary btn-sm" id="btn-account-join-team">🔑 Join by Code</button>
              <button class="btn btn-primary btn-sm" id="btn-account-create-team">➕ Create Team</button>
            </div>
          </div>

          <div class="team-grid">
            ${state.teams.map(team => {
              const isCurrent = team.id === activeTeam.id;
              const count = (team.memberIds || []).length;

              return `
                <div class="team-card-box ${isCurrent ? 'active' : ''}">
                  <div style="display: flex; align-items: center; justify-content: space-between;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                      <span style="font-size: 22px;">${team.icon || '⚡'}</span>
                      <span style="font-weight: 700; font-size: 15px; color: var(--text-primary);">${team.name}</span>
                    </div>
                    ${isCurrent ? `<span class="badge badge-indigo">Active</span>` : ''}
                  </div>
                  
                  <p style="font-size: 12px; color: var(--text-secondary); line-height: 1.4; min-height: 34px;">
                    ${team.description || 'Collaborative team calendar workspace'}
                  </p>

                  <div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--border-color); padding-top: 10px; margin-top: auto;">
                    ${team.isPrivate ? `
                      <span style="font-size: 11.5px; color: var(--text-muted); font-weight: 600;">🔒 Private</span>
                    ` : `
                      <span style="font-size: 11.5px; color: var(--text-muted);">${count} member${count !== 1 ? 's' : ''}</span>
                    `}
                    <div style="display: flex; align-items: center; gap: 6px;">
                      ${!isCurrent ? `
                        <button class="btn btn-secondary btn-sm btn-switch-to-team" data-team-id="${team.id}">
                          Open
                        </button>
                        ${!team.isPrivate ? `
                        <button class="btn btn-ghost btn-sm btn-leave-team" data-team-id="${team.id}" data-team-name="${team.name}" title="Leave team">
                          🚪
                        </button>
                        ` : ''}
                      ` : `
                        <span style="font-size: 11px; color: var(--status-success); font-weight: 600;">✓ Active</span>
                      `}
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- 👥 ACTIVE TEAM MEMBER ROSTER -->
        <div class="panel">
          <div class="panel-header" style="justify-content: space-between;">
            <div>
              <h3 class="panel-title">👥 Team Roster: ${activeTeam.name} (${activeMembers.length})</h3>
              <span style="font-size: 12px; color: var(--text-muted);">Assigned color codes highlight each member on the calendar</span>
            </div>
            ${!activeTeam.isPrivate ? `
            <button class="btn btn-secondary btn-sm" id="btn-add-team-member">
              ➕ Add Member to Team
            </button>
            ` : ''}
          </div>

          <div style="display: flex; flex-direction: column; gap: 10px;">
            ${activeMembers.length === 0 ? `
              <div style="text-align: center; padding: 24px; color: var(--text-muted); border: 2px dashed var(--border-color); border-radius: 10px;">
                No members in this roster yet. Click "+ Add Member to Team" to invite teammates!
              </div>
            ` : activeMembers.map(member => `
              <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: var(--bg-surface-elevated); border: 1px solid var(--border-color); border-radius: 10px;">
                <div style="display: flex; align-items: center; gap: 14px;">
                  <div style="width: 34px; height: 34px; border-radius: 50%; background: ${member.avatarUrl ? 'transparent' : member.color}; color: #ffffff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px;">
                    ${member.avatarUrl ? `<img src="${member.avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : member.avatar}
                  </div>
                  <div>
                    <div style="font-weight: 600; font-size: 14px; color: var(--text-primary);">${member.name}</div>
                    <div style="font-size: 12px; color: var(--text-secondary);">${member.id === activeTeam.ownerId ? '👑 Workspace Owner' : member.role} • ${member.email}</div>
                  </div>
                </div>

                <div style="display: flex; align-items: center; gap: 12px;">
                  <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-secondary);">
                    ${member.id === store.getActiveUser()?.id ? `
                      <div style="position: relative; width: 14px; height: 14px; border-radius: 50%; background: ${member.color}; overflow: hidden; cursor: pointer; border: 1px solid rgba(255,255,255,0.2);" title="Change your color">
                        <input type="color" class="color-picker-input" data-member-id="${member.id}" value="${member.color}" style="position: absolute; opacity: 0; top: -10px; left: -10px; width: 40px; height: 40px; cursor: pointer;">
                      </div>
                    ` : `
                      <div style="width: 12px; height: 12px; border-radius: 50%; background: ${member.color}"></div>
                    `}
                    ${member.color}
                  </div>
                  ${activeTeam.ownerId === store.getActiveUser()?.id && member.id !== activeTeam.ownerId ? `
                    <button class="btn btn-ghost btn-sm btn-remove-member" data-member-id="${member.id}" data-member-name="${member.name}" title="Remove member from workspace">
                      ❌
                    </button>
                  ` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    // Copy Invite Code to Clipboard
    containerEl.querySelector('#btn-copy-team-code')?.addEventListener('click', () => {
      navigator.clipboard.writeText(activeTeam.code).then(() => {
        ToastNotificationManager.show({ title: 'Code Copied! 📋', message: `Copied "${activeTeam.code}" to clipboard. Share with your team!` });
      });
    });

    // Leave Team Handlers
    containerEl.querySelectorAll('.btn-leave-team').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const teamId = btn.getAttribute('data-team-id');
        const teamName = btn.getAttribute('data-team-name') || 'this team';

        AppRouter.confirm(
          'Leave Team',
          `Are you sure you want to leave "${teamName}"?`,
          () => {
            const res = store.leaveTeam(teamId);
            if (res.success) {
              ToastNotificationManager.show({ title: 'Left Team 🚪', message: `You have left "${res.teamName}".` });
            }
          }
        );
      });
    });

    // Delete Team Handler
    containerEl.querySelector('#btn-delete-team')?.addEventListener('click', () => {
      AppRouter.confirm(
        'Delete Workspace',
        `🚨 WARNING: Are you sure you want to permanently delete "${activeTeam.name}"?\nThis action cannot be undone.`,
        () => {
          if (window.firebaseService && window.firebaseService.isInitialized) {
            window.firebaseService.deleteTeam(activeTeam.id).catch(console.warn);
          }
          
          // Force local deletion
          activeTeam.memberIds = [];
          store.leaveTeam(activeTeam.id);
          
          ToastNotificationManager.show({ title: 'Workspace Deleted 🗑️', message: `"${activeTeam.name}" was permanently deleted.` });
          AppRouter.switchTab('home');
        }
      );
    });


    // Create Team Button
    containerEl.querySelector('#btn-account-create-team')?.addEventListener('click', () => {
      AppRouter.openModal('✨ Create New Team Workspace', (body) => this.renderCreateTeamModal(body));
    });

    // Join Team Button
    containerEl.querySelector('#btn-account-join-team')?.addEventListener('click', () => {
      AppRouter.openModal('🔑 Join Team with Invite Code', (body) => this.renderJoinTeamModal(body));
    });

    // Switch Team Buttons in Grid
    containerEl.querySelectorAll('.btn-switch-to-team').forEach(btn => {
      btn.addEventListener('click', () => {
        const teamId = btn.getAttribute('data-team-id');
        store.switchTeam(teamId);
        ToastNotificationManager.show({ title: 'Workspace Switched', message: `Active: ${store.getActiveTeam().name}` });
      });
    });

    // Invite Member to Current Team
    containerEl.querySelector('#btn-add-team-member')?.addEventListener('click', () => {
      AppRouter.openModal(`✉️ Invite to ${activeTeam.name}`, (modalBody) => {
        modalBody.innerHTML = `
          <div style="text-align: center; padding: 20px 0;">
            <p style="color: var(--text-secondary); margin-bottom: 24px; font-size: 14px;">
              Share this secure invite code with your colleagues. They can use it to join your workspace from their account.
            </p>
            <div style="background: var(--bg-body); padding: 16px; border-radius: 12px; border: 1px solid var(--border-light); margin-bottom: 24px;">
              <code style="font-size: 28px; font-weight: 800; color: var(--accent-primary); letter-spacing: 2px;">${activeTeam.code}</code>
            </div>
            <div style="display: flex; justify-content: center; gap: 10px;">
              <button class="btn btn-ghost" id="btn-modal-close-invite">Close</button>
              <button class="btn btn-primary" id="btn-modal-copy-invite">📋 Copy Code</button>
            </div>
          </div>
        `;

        modalBody.querySelector('#btn-modal-close-invite')?.addEventListener('click', () => AppRouter.closeModal());
        modalBody.querySelector('#btn-modal-copy-invite')?.addEventListener('click', () => {
          navigator.clipboard.writeText(activeTeam.code).then(() => {
            ToastNotificationManager.show({ title: 'Copied!', message: 'Invite code copied to clipboard.' });
            AppRouter.closeModal();
          });
        });
      });
    });

    // Color Picker Handler
    containerEl.querySelectorAll('.color-picker-input').forEach(picker => {
      picker.addEventListener('change', async (e) => {
        const newColor = e.target.value;
        const memberId = picker.getAttribute('data-member-id');
        
        // Update locally
        const member = store.state.teamMembers.find(m => m.id === memberId);
        if (member) {
           member.color = newColor;
           if (memberId === store.getActiveUser()?.id) {
             const activeUser = store.getActiveUser();
             activeUser.color = newColor;
             store.setActiveUserFromFirebase(activeUser, true);
           }
        }
        
        // Update in Firebase
        if (window.firebaseService && window.firebaseService.isInitialized) {
          try {
             await window.firebaseService.db.collection('team_members').doc(memberId).set({ color: newColor }, { merge: true });
             await window.firebaseService.db.collection('users').doc(memberId).set({ color: newColor }, { merge: true });
             if (window.app && typeof window.app.render === 'function') window.app.render();
          } catch(err) {
             console.warn("Failed to update color:", err);
          }
        }
      });
    });

    // Remove Member Handlers
    containerEl.querySelectorAll('.btn-remove-member').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const memberId = btn.getAttribute('data-member-id');
        const memberName = btn.getAttribute('data-member-name');

        if (confirm(`Are you sure you want to remove ${memberName} from this workspace?`)) {
          activeTeam.memberIds = (activeTeam.memberIds || []).filter(id => id !== memberId);
          store.saveTeams();
          
          if (window.firebaseService && window.firebaseService.isInitialized) {
            window.firebaseService.updateTeam(activeTeam.id, activeTeam).catch(console.warn);
          }
          
          store.notify(); // re-render UI
          ToastNotificationManager.show({ title: 'Member Removed', message: `${memberName} has been removed from the workspace.` });
        }
      });
    });
  }
}
