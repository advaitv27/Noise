/* ==========================================================================
   Noise Desktop - Team Chat System (Real-time Firestore Messaging)
   ========================================================================== */

class ChatManager {
  static _instance = null;
  static _currentTeamId = null;
  static _activeChannelId = 'general';
  static _editingMessageId = null;
  static _messages = [];
  static _unsubscribe = null;
  static _isAtBottom = true;
  static _unreadCount = 0;
  static _lastReadTimestamp = {};
  static _rendered = false;

  /**
   * Main render entry point — called by AppRouter when chat tab is active.
   */
  static render(containerEl) {
    if (!containerEl) return;

    const state = store.getState();
    const activeTeam = store.getActiveTeam();
    const activeUser = store.getActiveUser();
    const members = store.getActiveTeamMembers();
    const isConnected = window.firebaseService && window.firebaseService.isInitialized;
    const isLoggedIn = store.isUserLoggedIn();

    // If not connected to Firebase, show connection required state
    if (!isConnected || !isLoggedIn) {
      containerEl.innerHTML = `
        <div class="chat-container">
          <div class="chat-main">
            <div class="chat-not-connected">
              <div class="chat-not-connected-icon">🔌</div>
              <div class="chat-not-connected-title">Cloud Connection Required</div>
              <div class="chat-not-connected-desc">
                Team Chat requires a Firebase cloud connection and an active login to sync messages in real-time across your team.
              </div>
              <button class="btn btn-primary" id="chat-goto-login" style="margin-top: 8px;">
                🔐 Sign In & Connect
              </button>
            </div>
          </div>
        </div>
      `;
      containerEl.querySelector('#chat-goto-login')?.addEventListener('click', () => {
        AppRouter.switchTab('login');
      });
      return;
    }

    // Default channels if not present or empty
    const channels = (activeTeam.channels && activeTeam.channels.length > 0) ? activeTeam.channels : ['general'];

    // Ensure active channel is valid BEFORE checking if we need a full render
    if (!channels.includes(this._activeChannelId)) {
      this._activeChannelId = channels[0] || 'general';
      this._messages = [];
      this.attachListener(activeTeam.id);
    }

    // If team changed, reset channel to general and trigger a full render
    let teamChanged = false;
    if (this._currentTeamId !== activeTeam.id) {
      this._currentTeamId = activeTeam.id;
      this._activeChannelId = channels.includes('general') ? 'general' : channels[0];
      this._messages = [];
      this._rendered = false;
      teamChanged = true;
      this.attachListener(activeTeam.id);
    }

    // If already rendered for this team, just update the dynamic parts (preventing UI distortion)
    if (this._rendered && !teamChanged) {
      this.updateSidebar(containerEl, activeTeam, members);
      this.updateHeader(containerEl, activeTeam, members);
      return;
    }



    // Build the full chat UI
    containerEl.innerHTML = `
      <div class="chat-container">
        <!-- Channel Sidebar -->
        <div class="chat-sidebar">
          <div class="chat-sidebar-header">
            <div class="chat-sidebar-team">
              <div class="chat-sidebar-team-icon" style="background: ${activeTeam.color ? `${activeTeam.color}22` : 'rgba(139,92,246,0.15)'}; color: ${activeTeam.color || '#8b5cf6'};">
                ${activeTeam.icon || '⚡'}
              </div>
              <div class="chat-sidebar-team-name">${this.escapeHtml(activeTeam.name)}</div>
            </div>
          </div>

          <div class="chat-sidebar-subtitle">
            Channels
            <button class="chat-add-channel-btn" id="chat-add-channel-btn" title="Create channel">+</button>
          </div>
          <div class="chat-channel-list">
            ${channels.map(ch => {
              const isActive = this._activeChannelId === ch ? 'active' : '';
              const isGeneral = ch === 'general';
              const actionsHTML = isGeneral ? '' : `
                <div class="chat-channel-actions">
                  <button class="chat-channel-edit" data-channel="${this.escapeHtml(ch)}" title="Rename channel">✎</button>
                  <button class="chat-channel-delete" data-channel="${this.escapeHtml(ch)}" title="Delete channel">✕</button>
                </div>
              `;
              return `
                <div class="chat-channel-item ${isActive}" data-channel="${this.escapeHtml(ch)}">
                  <div class="chat-channel-content">
                    <span class="chat-channel-hash">#</span>
                    <span class="chat-channel-name">${this.escapeHtml(ch)}</span>
                  </div>
                  ${actionsHTML}
                </div>
              `;
            }).join('')}
          </div>

          <div class="chat-sidebar-subtitle" id="chat-members-subtitle">Members — ${members.length}</div>
          <div class="chat-sidebar-members">
            ${members.map(m => `
              <div class="chat-member-item">
                <div class="chat-member-avatar" style="background: ${m.color || '#52525b'};">
                  ${m.avatarUrl
                    ? `<img src="${m.avatarUrl}" alt="${this.escapeHtml(m.name)}" />`
                    : (m.avatar || m.name.charAt(0).toUpperCase())}
                </div>
                <span class="chat-member-name">${this.escapeHtml(m.name)}${m.id === activeUser.id ? ' (you)' : ''}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Main Chat Area -->
        <div class="chat-main">
          <div class="chat-header">
            <div class="chat-header-left">
              <span class="chat-header-channel"># ${this.escapeHtml(this._activeChannelId)}</span>
              <span class="chat-header-desc">Team conversation for ${this.escapeHtml(activeTeam.name)}</span>
            </div>
            <div class="chat-header-members-count">
              👥 ${members.length} member${members.length !== 1 ? 's' : ''}
            </div>
          </div>

          <!-- Messages -->
          <div class="chat-messages" id="chat-messages-feed">
            ${this._messages.length === 0 ? this.renderEmptyOrSkeleton() : this.renderMessages(activeUser)}
          </div>

          <!-- Scroll to bottom FAB -->
          <div class="chat-scroll-fab" id="chat-scroll-fab">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </div>

          <!-- Compose Bar -->
          <div class="chat-compose">
            <div class="chat-editing-banner" id="chat-editing-banner" style="display: none;">
              <span>Editing message...</span>
              <button id="chat-cancel-edit-btn">Cancel</button>
            </div>
            <div class="chat-compose-inner">
              <textarea class="chat-compose-input" id="chat-input" placeholder="Message #${this.escapeHtml(this._activeChannelId)}..." rows="1"></textarea>
              <button class="chat-send-btn" id="chat-send-btn" disabled title="Send message">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
              </button>
            </div>
            <div class="chat-compose-hint">Press Enter to send · Shift+Enter for new line</div>
          </div>
        </div>
      </div>
    `;

    this.bindEvents(containerEl, activeUser, activeTeam);
    this._rendered = true;

    // Scroll to bottom on initial load
    requestAnimationFrame(() => this.scrollToBottom(true));
  }

  static updateSidebar(containerEl, activeTeam, members) {
    const channels = (activeTeam.channels && activeTeam.channels.length > 0) ? activeTeam.channels : ['general'];
    
    // Update Channel List
    const channelList = containerEl.querySelector('.chat-channel-list');
    if (channelList) {
      channelList.innerHTML = channels.map(ch => {
        const isActive = this._activeChannelId === ch ? 'active' : '';
        const isGeneral = ch === 'general';
        const actionsHTML = isGeneral ? '' : `
          <div class="chat-channel-actions">
            <button class="chat-channel-edit" data-channel="${this.escapeHtml(ch)}" title="Rename channel">✎</button>
            <button class="chat-channel-delete" data-channel="${this.escapeHtml(ch)}" title="Delete channel">✕</button>
          </div>
        `;
        return `
          <div class="chat-channel-item ${isActive}" data-channel="${this.escapeHtml(ch)}">
            <div class="chat-channel-content">
              <span class="chat-channel-hash">#</span>
              <span class="chat-channel-name">${this.escapeHtml(ch)}</span>
            </div>
            ${actionsHTML}
          </div>
        `;
      }).join('');
    }

    // Update Members List
    const membersList = containerEl.querySelector('.chat-sidebar-members');
    const subtitle = containerEl.querySelector('#chat-members-subtitle');
    if (subtitle) subtitle.textContent = `Members — ${members.length}`;
    
    if (membersList) {
      const activeUser = store.getActiveUser();
      membersList.innerHTML = members.map(m => `
        <div class="chat-member-item">
          <div class="chat-member-avatar" style="background: ${m.color || '#52525b'};">
            ${m.avatarUrl
              ? `<img src="${m.avatarUrl}" alt="${this.escapeHtml(m.name)}" />`
              : (m.avatar || m.name.charAt(0).toUpperCase())}
          </div>
          <span class="chat-member-name">${this.escapeHtml(m.name)}${m.id === activeUser.id ? ' (you)' : ''}</span>
        </div>
      `).join('');
    }
  }

  static updateHeader(containerEl, activeTeam, members) {
    const headerChannel = containerEl.querySelector('.chat-header-channel');
    if (headerChannel) headerChannel.textContent = `# ${this._activeChannelId}`;
    
    const countEl = containerEl.querySelector('.chat-header-members-count');
    if (countEl) countEl.textContent = `👥 ${members.length} member${members.length !== 1 ? 's' : ''}`;
    
    const headerDesc = containerEl.querySelector('.chat-header-desc');
    if (headerDesc) headerDesc.textContent = `Team conversation for ${activeTeam.name}`;
    
    const composeInput = containerEl.querySelector('#chat-input');
    if (composeInput) composeInput.placeholder = `Message #${this._activeChannelId}...`;
  }

  /**
   * Render the messages feed with date separators and message grouping.
   */
  static renderMessages(activeUser) {
    if (this._messages.length === 0) return this.renderEmptyState();

    const members = store.getActiveTeamMembers();
    const memberMap = {};
    members.forEach(m => { memberMap[m.id] = m; });

    let html = '';
    let lastDate = '';
    let lastSenderId = '';
    let lastTimestamp = 0;

    for (let i = 0; i < this._messages.length; i++) {
      const msg = this._messages[i];
      const msgDate = this.getDateLabel(msg.createdAt);
      const isOwn = msg.senderId === activeUser.id;
      const sender = memberMap[msg.senderId] || { name: 'Unknown', avatar: '?', color: '#52525b' };
      const actionAttr = isOwn ? `data-msg-id="${msg.id}" data-actionable="true"` : '';
      
      const editedTag = msg.editedAt ? `<span class="chat-msg-edited">(edited)</span>` : '';
      const actionButtons = isOwn ? `
        <div class="chat-msg-actions">
          <button class="chat-msg-edit" title="Edit message">✎</button>
          <button class="chat-msg-delete" title="Delete message">✕</button>
        </div>
      ` : '';

      // Date separator
      if (msgDate !== lastDate) {
        html += `
          <div class="chat-date-separator">
            <span class="chat-date-label">${msgDate}</span>
          </div>
        `;
        lastSenderId = '';
        lastDate = msgDate;
      }

      // Message grouping — if same sender within 3 minutes, collapse
      const timeDiff = msg.createdAt - lastTimestamp;
      const isContinuation = (msg.senderId === lastSenderId && timeDiff < 180000);

      if (isContinuation) {
        html += `
          <div class="chat-message-row ${isOwn ? 'is-own' : ''} is-continuation">
            <div class="chat-msg-avatar-placeholder"></div>
            <div class="chat-msg-content">
              <div class="chat-msg-bubble ${isOwn ? 'is-own' : 'is-other'}" ${actionAttr}>
                <span class="chat-msg-text">${this.escapeHtml(msg.text)}</span> ${editedTag}
                ${actionButtons}
              </div>
            </div>
          </div>
        `;
      } else {
        html += `
          <div class="chat-message-row ${isOwn ? 'is-own' : ''}">
            <div class="avatar-container" onclick="AppRouter.openMemberProfile('${msg.senderId}')" style="align-self: flex-end;">
              <div class="chat-msg-avatar" style="background: ${sender.color || '#52525b'};">
                ${sender.avatarUrl
                  ? `<img src="${sender.avatarUrl}" alt="${this.escapeHtml(sender.name)}" />`
                  : (sender.avatar || sender.name.charAt(0).toUpperCase())}
              </div>
              <div class="user-presence-dot ${store.isUserOnline(sender) ? 'online' : ''}" style="width: 8px; height: 8px; bottom: 0px; right: -2px;"></div>
            </div>
            <div class="chat-msg-content">
              <div class="chat-msg-header">
                <span class="chat-msg-sender">${this.escapeHtml(sender.name)}</span>
                <span class="chat-msg-time">${this.formatTimestamp(msg.createdAt)}</span>
              </div>
              <div class="chat-msg-bubble ${isOwn ? 'is-own' : 'is-other'}" ${actionAttr}>
                <span class="chat-msg-text">${this.escapeHtml(msg.text)}</span> ${editedTag}
                ${actionButtons}
              </div>
            </div>
          </div>
        `;
      }

      lastSenderId = msg.senderId;
      lastTimestamp = msg.createdAt;
    }

    return html;
  }

  /**
   * Render empty state when no messages exist.
   */
  static renderEmptyState() {
    return `
      <div class="chat-empty-state">
        <div class="chat-empty-icon">💬</div>
        <div class="chat-empty-title">No messages yet</div>
        <div class="chat-empty-desc">
          Be the first to send a message in this channel. Start a conversation with your team!
        </div>
      </div>
    `;
  }

  /**
   * Show skeleton while loading, or empty state if loaded.
   */
  static renderEmptyOrSkeleton() {
    if (this._rendered) {
      return this.renderEmptyState();
    }
    // Loading skeleton
    return `
      <div class="chat-skeleton">
        ${[1,2,3,4].map(() => `
          <div class="chat-skeleton-row">
            <div class="chat-skeleton-avatar"></div>
            <div class="chat-skeleton-lines">
              <div class="chat-skeleton-line"></div>
              <div class="chat-skeleton-line"></div>
              <div class="chat-skeleton-line"></div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  /**
   * Bind DOM events for compose input and scroll.
   */
  static bindEvents(containerEl, activeUser, activeTeam) {
    const input = containerEl.querySelector('#chat-input');
    const sendBtn = containerEl.querySelector('#chat-send-btn');
    const messagesFeed = containerEl.querySelector('#chat-messages-feed');
    const scrollFab = containerEl.querySelector('#chat-scroll-fab');
    const addChannelBtn = containerEl.querySelector('#chat-add-channel-btn');
    const cancelEditBtn = containerEl.querySelector('#chat-cancel-edit-btn');
    const editingBanner = containerEl.querySelector('#chat-editing-banner');

    if (!input || !sendBtn || !messagesFeed) return;

    // We use event delegation on containerEl to catch clicks on dynamically updated sidebar elements
    containerEl.addEventListener('click', (e) => {
      // Edit channel
      const editBtn = e.target.closest('.chat-channel-edit');
      if (editBtn) {
        e.stopPropagation();
        const oldName = editBtn.getAttribute('data-channel');
        
        if (typeof AppRouter !== 'undefined') {
          AppRouter.openModal('✨ Rename Channel', (modalBody) => {
            modalBody.innerHTML = `
              <form id="form-edit-channel" style="display: flex; flex-direction: column; gap: 16px;">
                <div class="form-group">
                  <label class="form-label">New Channel Name</label>
                  <input type="text" id="edit-channel-name" class="form-control" value="${this.escapeHtml(oldName)}" required autofocus>
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 8px;">
                  <button type="button" class="btn btn-ghost" id="btn-cancel-edit-ch">Cancel</button>
                  <button type="submit" class="btn btn-primary" id="btn-save-edit-ch">Save</button>
                </div>
              </form>
            `;
            
            modalBody.querySelector('#btn-cancel-edit-ch')?.addEventListener('click', () => AppRouter.closeModal());
            modalBody.querySelector('#form-edit-channel')?.addEventListener('submit', async (ev) => {
              ev.preventDefault();
              const inputEl = modalBody.querySelector('#edit-channel-name');
              const newName = inputEl.value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
              if (!newName || newName === oldName) return;
              
              const saveBtn = modalBody.querySelector('#btn-save-edit-ch');
              saveBtn.disabled = true;
              saveBtn.textContent = 'Saving...';
              
              try {
                await window.firebaseService.editChannel(activeTeam.id, oldName, newName);
                
                // Update local state
                const idx = activeTeam.channels.indexOf(oldName);
                if (idx > -1) activeTeam.channels[idx] = newName;
                if (this._activeChannelId === oldName) this._activeChannelId = newName;
                
                AppRouter.closeModal();
                // Instead of forcing a full render here, let ingestCloudTeams handle it via Firebase listener
              } catch (err) {
                console.error(err);
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save';
                if (typeof ToastNotificationManager !== 'undefined') ToastNotificationManager.show({ title: 'Error', message: 'Failed to rename channel.' });
              }
            });
          });
        }
        return;
      }

      // Delete channel
      const deleteBtn = e.target.closest('.chat-channel-delete');
      if (deleteBtn) {
        e.stopPropagation();
        const chName = deleteBtn.getAttribute('data-channel');
        
        AppRouter.confirm(
          'Delete Channel',
          `Are you sure you want to delete #${chName}?\nThis will permanently delete all messages in this channel.`,
          async () => {
            try {
              await window.firebaseService.deleteChannel(activeTeam.id, chName);
              
              // Update local state
              activeTeam.channels = activeTeam.channels.filter(c => c !== chName);
              if (this._activeChannelId === chName) {
                this._activeChannelId = 'general';
                this._messages = [];
                this.attachListener(activeTeam.id);
              }
              
              this.render(containerEl);
            } catch (err) {
              console.error(err);
              if (typeof ToastNotificationManager !== 'undefined') ToastNotificationManager.show({ title: 'Error', message: 'Failed to delete channel.' });
            }
          }
        );
        return;
      }
      
      // Channel switching
      const channelItem = e.target.closest('.chat-channel-item');
      if (channelItem && channelItem.dataset.channel) {
        const newChannel = channelItem.dataset.channel;
        if (newChannel !== this._activeChannelId) {
          this._activeChannelId = newChannel;
          this.cancelEdit(input, sendBtn, editingBanner);
          this._messages = [];
          this._isAtBottom = true;
          this.attachListener(activeTeam.id);
          this.render(containerEl); 
        }
        return;
      }
    });


    // Auto-resize textarea
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
      sendBtn.disabled = input.value.trim().length === 0;
    });

    // Enter to send, Shift+Enter for newline
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage(input, activeUser, activeTeam);
      }
      if (e.key === 'Escape' && this._editingMessageId) {
        this.cancelEdit(input, sendBtn, editingBanner);
      }
    });

    // Send button click
    sendBtn.addEventListener('click', () => {
      this.sendMessage(input, activeUser, activeTeam);
    });

    // Cancel edit button click
    cancelEditBtn?.addEventListener('click', () => {
      this.cancelEdit(input, sendBtn, editingBanner);
    });

    // Scroll tracking — show/hide FAB
    messagesFeed.addEventListener('scroll', () => {
      const threshold = 100;
      const distFromBottom = messagesFeed.scrollHeight - messagesFeed.scrollTop - messagesFeed.clientHeight;
      this._isAtBottom = distFromBottom < threshold;

      if (scrollFab) {
        scrollFab.classList.toggle('visible', !this._isAtBottom);
      }
    });

    // Message actions (event delegation)
    messagesFeed.addEventListener('click', (e) => {
      const deleteBtn = e.target.closest('.chat-msg-delete');
      if (deleteBtn) {
        const bubble = deleteBtn.closest('.chat-msg-bubble');
        if (bubble && bubble.dataset.msgId) {
          this.deleteMessage(bubble.dataset.msgId);
        }
        return;
      }

      const editBtn = e.target.closest('.chat-msg-edit');
      if (editBtn) {
        const bubble = editBtn.closest('.chat-msg-bubble');
        if (bubble && bubble.dataset.msgId) {
          this.startEdit(bubble.dataset.msgId, input, sendBtn, editingBanner);
        }
        return;
      }
    });



    // Add channel
    addChannelBtn?.addEventListener('click', () => {
      if (typeof AppRouter !== 'undefined') {
        AppRouter.openModal('✨ Create New Channel', (modalBody) => {
          modalBody.innerHTML = `
            <form id="form-create-channel" style="display: flex; flex-direction: column; gap: 16px;">
              <div class="form-group">
                <label class="form-label">Channel Name</label>
                <input type="text" id="new-channel-name" class="form-control" placeholder="e.g. announcements" required autofocus>
              </div>
              <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 8px;">
                <button type="button" class="btn btn-ghost" id="btn-cancel-channel">Cancel</button>
                <button type="submit" class="btn btn-primary" id="btn-create-channel">Create</button>
              </div>
            </form>
          `;
          
          modalBody.querySelector('#btn-cancel-channel')?.addEventListener('click', () => AppRouter.closeModal());
          
          modalBody.querySelector('#form-create-channel')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const inputEl = modalBody.querySelector('#new-channel-name');
            const channelName = inputEl.value.trim();
            if (!channelName) return;
            
            const cleanName = channelName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
            if (cleanName) {
              const btn = modalBody.querySelector('#btn-create-channel');
              btn.disabled = true;
              btn.textContent = 'Creating...';
              try {
                await window.firebaseService.addChannel(activeTeam.id, cleanName);
                if (!activeTeam.channels) activeTeam.channels = [];
                if (!activeTeam.channels.includes(cleanName)) {
                  activeTeam.channels.push(cleanName);
                }
                this._activeChannelId = cleanName;
                this._messages = [];
                AppRouter.closeModal();
                this.attachListener(activeTeam.id);
                this.render(containerEl);
              } catch (err) {
                console.error('Failed to add channel', err);
                if (typeof ToastNotificationManager !== 'undefined') {
                  ToastNotificationManager.show({ title: 'Error', message: 'Could not add channel.' });
                }
                btn.disabled = false;
                btn.textContent = 'Create';
              }
            }
          });
        });
      }
    });

    // Scroll FAB click
    scrollFab?.addEventListener('click', () => {
      this.scrollToBottom(true);
    });

    // Focus input on tab switch
    requestAnimationFrame(() => input.focus());
  }

  static startEdit(messageId, inputEl, sendBtn, bannerEl) {
    const msg = this._messages.find(m => m.id === messageId);
    if (!msg) return;

    this._editingMessageId = messageId;
    inputEl.value = msg.text;
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
    sendBtn.disabled = false;
    
    if (bannerEl) bannerEl.style.display = 'flex';
    inputEl.focus();
  }

  static cancelEdit(inputEl, sendBtn, bannerEl) {
    this._editingMessageId = null;
    inputEl.value = '';
    inputEl.style.height = 'auto';
    sendBtn.disabled = true;
    if (bannerEl) bannerEl.style.display = 'none';
  }

  /**
   * Delete a message from Firestore.
   */
  static async deleteMessage(messageId) {
    if (!messageId || !this._currentTeamId) return;

    try {
      await window.firebaseService.deleteChatMessage(this._currentTeamId, messageId);
    } catch (err) {
      console.error('Failed to delete message:', err);
      if (typeof ToastNotificationManager !== 'undefined') {
        ToastNotificationManager.show({ title: 'Delete Failed', message: 'Could not delete message.' });
      }
    }
  }

  /**
   * Send or update a message to Firestore.
   */
  static async sendMessage(inputEl, activeUser, activeTeam) {
    const text = inputEl.value.trim();
    if (!text) return;

    const sendBtn = document.querySelector('#chat-send-btn');
    const editingBanner = document.querySelector('#chat-editing-banner');
    if (sendBtn) sendBtn.disabled = true;

    inputEl.value = '';
    inputEl.style.height = 'auto';

    const isEditing = !!this._editingMessageId;
    const msgIdToEdit = this._editingMessageId;
    
    // Clear edit state immediately for snappy UX
    this._editingMessageId = null;
    if (editingBanner) editingBanner.style.display = 'none';

    try {
      if (isEditing) {
        await window.firebaseService.editChatMessage(activeTeam.id, msgIdToEdit, text);
      } else {
        await window.firebaseService.sendChatMessage(activeTeam.id, this._activeChannelId, {
          text,
          senderId: activeUser.id,
          senderName: activeUser.name,
          createdAt: Date.now()
        });
        this._isAtBottom = true;
      }
    } catch (err) {
      console.error('Failed to send/edit message:', err);
      // Restore the message in the input on failure
      inputEl.value = text;
      if (sendBtn) sendBtn.disabled = false;
      if (isEditing) {
        this._editingMessageId = msgIdToEdit;
        if (editingBanner) editingBanner.style.display = 'flex';
      }
      if (typeof ToastNotificationManager !== 'undefined') {
        ToastNotificationManager.show({ title: 'Send Failed', message: err.message || 'Check your connection.' });
      } else {
        alert('Send Failed: ' + (err.message || 'Check your connection.'));
      }
    }
  }

  /**
   * Attach real-time Firestore listener for messages in this team.
   */
  static attachListener(teamId) {
    // Detach previous listener
    this.detachListener();

    if (!window.firebaseService || !window.firebaseService.isInitialized || !window.firebaseService.db) return;

    // Failsafe if somehow _activeChannelId is falsy
    if (!this._activeChannelId) {
      this._activeChannelId = 'general';
    }

    try {
      const db = window.firebaseService.db;
      
      // Temporary migration for old messages without a channelId
      if (this._activeChannelId === 'general') {
        db.collection('teams').doc(teamId).collection('messages').get().then(snapshot => {
          let batch = db.batch();
          let count = 0;
          snapshot.forEach(doc => {
            if (!doc.data().channelId) {
              batch.update(doc.ref, { channelId: 'general' });
              count++;
            }
          });
          if (count > 0) batch.commit();
        }).catch(e => console.warn('Migration check skipped', e));
      }

      this._unsubscribe = db.collection('teams').doc(teamId)
        .collection('messages')
        .where('channelId', '==', this._activeChannelId)
        .onSnapshot(
          (snapshot) => {
            const messages = [];
            snapshot.forEach(doc => {
              const data = doc.data();
              messages.push({
                id: doc.id,
                text: data.text || '',
                senderId: data.senderId || '',
                senderName: data.senderName || '',
                createdAt: data.createdAt || 0,
                editedAt: data.editedAt || null
              });
            });

            // Sort locally to bypass Firestore composite index requirement
            messages.sort((a, b) => a.createdAt - b.createdAt);

            // Limit to last 200 locally
            const finalMessages = messages.length > 200 ? messages.slice(messages.length - 200) : messages;

            const hadMessages = this._messages.length > 0;
            const newCount = finalMessages.length - this._messages.length;
            this._messages = finalMessages;

            // Update unread badge
            if (!this._isAtBottom && hadMessages && newCount > 0) {
              this._unreadCount += newCount;
            } else {
              this._unreadCount = 0;
            }
            this.updateNavBadge();

            // Re-render messages in the feed
            this.refreshMessagesFeed();
          },
          (error) => {
            console.error('Chat listener error:', error);
            if (window.require) {
              try {
                window.require('fs').writeFileSync('index-error.txt', error.message || String(error));
              } catch (e) {}
            }
            if (typeof ToastNotificationManager !== 'undefined') {
              ToastNotificationManager.show({ title: 'Chat Sync Error', message: error.message || 'Failed to sync messages.' });
            } else {
              alert('Chat Sync Error: ' + (error.message || 'Failed to sync messages.'));
            }
          }
        );
    } catch (e) {
      console.error('Failed to attach chat listener:', e);
      if (typeof ToastNotificationManager !== 'undefined') {
        ToastNotificationManager.show({ title: 'Chat Sync Error', message: e.message || 'Failed to sync messages.' });
      }
    }
  }

  /**
   * Detach the current Firestore listener.
   */
  static detachListener() {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
  }

  /**
   * Refresh just the messages feed without re-rendering the entire chat UI.
   */
  static refreshMessagesFeed() {
    const feed = document.querySelector('#chat-messages-feed');
    if (!feed) return;

    const activeUser = store.getActiveUser();
    const wasAtBottom = this._isAtBottom;

    feed.innerHTML = this._messages.length === 0
      ? this.renderEmptyState()
      : this.renderMessages(activeUser);

    if (wasAtBottom) {
      requestAnimationFrame(() => this.scrollToBottom(false));
    }
  }

  /**
   * Scroll the messages feed to the bottom.
   */
  static scrollToBottom(smooth = true) {
    const feed = document.querySelector('#chat-messages-feed');
    if (!feed) return;
    
    if (smooth) {
      feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' });
    } else {
      feed.scrollTop = feed.scrollHeight;
    }
    this._isAtBottom = true;

    // Hide FAB
    const fab = document.querySelector('#chat-scroll-fab');
    if (fab) fab.classList.remove('visible');

    // Clear unread
    this._unreadCount = 0;
    this.updateNavBadge();
  }

  /**
   * Update the unread count badge on the Chat nav item.
   */
  static updateNavBadge() {
    const badge = document.querySelector('#chat-nav-badge');
    if (!badge) return;

    if (this._unreadCount > 0) {
      badge.textContent = this._unreadCount > 99 ? '99+' : this._unreadCount;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }

  /**
   * Cleanup — call when leaving the chat tab or closing the app.
   */
  static cleanup() {
    this.detachListener();
    this._currentTeamId = null;
    this._messages = [];
    this._rendered = false;
  }

  // --- Utility Methods ---

  static escapeHtml(str) {
    if (!str) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return str.replace(/[&<>"']/g, c => map[c]);
  }

  static getDateLabel(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const msgDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    if (msgDay.getTime() === today.getTime()) return 'Today';
    if (msgDay.getTime() === yesterday.getTime()) return 'Yesterday';

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  }

  static formatTimestamp(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;

    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const h12 = hours % 12 || 12;
    const mm = minutes.toString().padStart(2, '0');
    return `${h12}:${mm} ${ampm}`;
  }
}

window.ChatManager = ChatManager;
