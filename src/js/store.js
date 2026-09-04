/* ==========================================================================
   Noise Desktop - State Management & Multi-Team Local/Cloud Store
   ========================================================================== */

class AppStore {
  constructor() {
    this.listeners = [];
    this.initStore();
  }

  initStore() {
    const savedTheme = localStorage.getItem('noise_theme') || 'dark';
    const savedActiveUser = localStorage.getItem('noise_active_user') || 'user_default';
    const savedActiveTeam = localStorage.getItem('noise_active_team') || null;
    const savedTeams = localStorage.getItem('noise_teams');
    const savedMembers = localStorage.getItem('noise_members');
    const savedEvents = localStorage.getItem('noise_events');
    const savedProfileStr = localStorage.getItem('noise_saved_profile');

    let teams = [];
    try { teams = savedTeams ? JSON.parse(savedTeams) : []; } catch(e) {}
    if (!Array.isArray(teams) || teams.length === 0) {
      teams = typeof INITIAL_TEAMS !== 'undefined' && INITIAL_TEAMS.length > 0 ? INITIAL_TEAMS : [{
        id: 'team_default', name: 'My Workspace', code: 'WRK', icon: '🏢'
      }];
    }

    let teamMembers = [];
    try { teamMembers = savedMembers ? JSON.parse(savedMembers) : []; } catch(e) {}
    if (!Array.isArray(teamMembers) || teamMembers.length === 0) {
      teamMembers = typeof INITIAL_TEAM_MEMBERS !== 'undefined' && INITIAL_TEAM_MEMBERS.length > 0 ? INITIAL_TEAM_MEMBERS : [{
        id: 'user_default', name: 'Guest', email: '', avatar: 'G', color: '#52525b'
      }];
    }

    let events = [];
    try { events = savedEvents ? JSON.parse(savedEvents) : []; } catch(e) {}
    if (!Array.isArray(events)) {
      events = typeof INITIAL_EVENTS !== 'undefined' ? INITIAL_EVENTS : [];
    }

    let activeUserId = savedActiveUser;
    if (savedProfileStr) {
      try {
        const profile = JSON.parse(savedProfileStr);
        if (profile && profile.id) {
          activeUserId = profile.id;
          const idx = teamMembers.findIndex(m => m.id === profile.id);
          if (idx !== -1) {
            teamMembers[idx] = { ...teamMembers[idx], ...profile };
          } else {
            teamMembers.push(profile);
          }
        }
      } catch (e) {
        console.warn('Could not parse saved profile:', e);
      }
    }

    this.state = {
      theme: savedTheme,
      activeUserId: activeUserId,
      activeTeamId: savedActiveTeam,
      teams: teams,
      teamMembers: teamMembers,
      events: events,
      visibleMemberIds: new Set(teamMembers.map(m => m.id)),
      currentView: 'month', // 'month' | 'week' | 'day'
      currentDate: new Date(),
      searchQuery: '',
      notificationsEnabled: localStorage.getItem('noise_notifications') !== 'false',
      firebaseUser: null,
      cloudSyncStatus: 'unconfigured', // 'unconfigured' | 'connecting' | 'connected' | 'offline' | 'error'
      lastSyncedAt: null
    };

    // Ensure activeTeamId exists
    if (!this.state.teams.some(t => t.id === this.state.activeTeamId) && this.state.teams.length > 0) {
      this.state.activeTeamId = this.state.teams[0].id;
    }

    // Apply saved theme to HTML root element
    document.documentElement.setAttribute('data-theme', this.state.theme);

    // Wire up Firebase status listener
    if (window.firebaseService) {
      window.firebaseService.onStatusChange((status, details) => {
        this.state.cloudSyncStatus = status;
        if (details && details.user) {
          this.state.firebaseUser = details.user;
        }
        if (status === 'connected') {
          this.state.lastSyncedAt = new Date();
        }
        this.notify();
      });

      // Auto-connect if saved config or central config exists
      const cfg = window.firebaseService.getSavedConfig();
      if (cfg) {
        window.firebaseService.initialize();
      }
    }
  }

  getState() {
    return this.state;
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  notify() {
    if (this._notifyPending) return;
    this._notifyPending = true;
    requestAnimationFrame(() => {
      this._notifyPending = false;
      this.listeners.forEach(listener => listener(this.state));
    });
  }

  // --- Team Workspaces Operations ---
  getTeams() {
    return this.state.teams;
  }

  getActiveTeam() {
    return this.state.teams.find(t => t.id === this.state.activeTeamId) || this.state.teams[0] || null;
  }

  switchTeam(teamId) {
    const teamExists = this.state.teams.some(t => t.id === teamId);
    if (teamExists) {
      this.state.activeTeamId = teamId;
      localStorage.setItem('noise_active_team', teamId);
      
      // Update visibleMemberIds for active team
      const activeMembers = this.getActiveTeamMembers();
      this.state.visibleMemberIds = new Set(activeMembers.map(m => m.id));

      this.notify();
    }
  }

  createTeam({ name, description = '', color = '#8b5cf6', icon = '⚡' }) {
    const id = 'team_' + Date.now();
    // Generate clean 6-8 char uppercase invite code
    const prefix = name.replace(/[^A-Z]/gi, '').slice(0, 3).toUpperCase() || 'TEAM';
    const randNum = Math.floor(1000 + Math.random() * 9000);
    const code = `${prefix}-${randNum}`;

    const newTeam = {
      id,
      name,
      code,
      description,
      color,
      icon,
      ownerId: this.state.activeUserId,
      memberIds: [this.state.activeUserId],
      createdAt: new Date().toISOString()
    };

    this.state.teams.push(newTeam);
    this.state.activeTeamId = id;
    this.saveTeams();
    this.notify();

    // Sync to Firestore if connected
    if (window.firebaseService && window.firebaseService.isInitialized) {
      window.firebaseService.createTeam(newTeam).catch(err => {
        console.warn('Could not sync team to Firebase:', err);
      });
    }

    return newTeam;
  }

  joinTeamByCode(code) {
    const trimmedCode = (code || '').replace(/\s+/g, '').toUpperCase();
    const existingTeam = this.state.teams.find(t => t.code === trimmedCode);

    if (existingTeam) {
      if (!existingTeam.memberIds.includes(this.state.activeUserId)) {
        existingTeam.memberIds.push(this.state.activeUserId);
        
        // Ensure Unique Color Logic
        const activeUser = this.getActiveUser();
        if (activeUser) {
          const existingMembers = this.state.teamMembers.filter(m => existingTeam.memberIds.includes(m.id) && m.id !== activeUser.id);
          const usedColors = existingMembers.map(m => (m.color || '').toLowerCase());
          
          if (activeUser.color && usedColors.includes(activeUser.color.toLowerCase())) {
            const allColors = ['#8b5cf6', '#10b981', '#06b6d4', '#f43f5e', '#f59e0b', '#3b82f6'];
            const availableColors = allColors.filter(c => !usedColors.includes(c));
            const newColor = availableColors.length > 0 ? availableColors[Math.floor(Math.random() * availableColors.length)] : allColors[Math.floor(Math.random() * allColors.length)];
            
            activeUser.color = newColor;
            this.setActiveUserFromFirebase(activeUser, true);
            if (window.firebaseService && window.firebaseService.isInitialized) {
               window.firebaseService.db.collection('team_members').doc(activeUser.id).set({ color: newColor }, { merge: true });
               window.firebaseService.db.collection('users').doc(activeUser.id).set({ color: newColor }, { merge: true });
            }
          }
        }

        this.saveTeams();
      }
      this.switchTeam(existingTeam.id);
      return { success: true, team: existingTeam };
    }

    // Try finding via Firebase
    if (window.firebaseService && window.firebaseService.isInitialized) {
      return window.firebaseService.findTeamByCode(trimmedCode).then(cloudTeam => {
        if (cloudTeam && cloudTeam.error) {
          return { success: false, reason: `Firebase Error: ${cloudTeam.message}` };
        }
        if (cloudTeam) {
          if (!this.state.teams.some(t => t.id === cloudTeam.id)) {
            this.state.teams.push(cloudTeam);
          }
          if (!cloudTeam.memberIds.includes(this.state.activeUserId)) {
            cloudTeam.memberIds.push(this.state.activeUserId);
            
            // Ensure Unique Color Logic
            const activeUser = this.getActiveUser();
            if (activeUser) {
              const existingMembers = this.state.teamMembers.filter(m => cloudTeam.memberIds.includes(m.id) && m.id !== activeUser.id);
              const usedColors = existingMembers.map(m => (m.color || '').toLowerCase());
              
              if (activeUser.color && usedColors.includes(activeUser.color.toLowerCase())) {
                const allColors = ['#8b5cf6', '#10b981', '#06b6d4', '#f43f5e', '#f59e0b', '#3b82f6'];
                const availableColors = allColors.filter(c => !usedColors.includes(c));
                const newColor = availableColors.length > 0 ? availableColors[Math.floor(Math.random() * availableColors.length)] : allColors[Math.floor(Math.random() * allColors.length)];
                
                activeUser.color = newColor;
                this.setActiveUserFromFirebase(activeUser, true);
                if (window.firebaseService && window.firebaseService.isInitialized) {
                   window.firebaseService.db.collection('team_members').doc(activeUser.id).set({ color: newColor }, { merge: true });
                   window.firebaseService.db.collection('users').doc(activeUser.id).set({ color: newColor }, { merge: true });
                }
              }
            }

            window.firebaseService.updateTeam(cloudTeam.id, cloudTeam);
          }
          this.saveTeams();
          this.switchTeam(cloudTeam.id);
          return { success: true, team: cloudTeam };
        }
        return { success: false, reason: 'Invalid team invite code. Team not found.' };
      });
    }

    return Promise.resolve({ success: false, reason: 'Team code not found in current workspace.' });
  }

  leaveTeam(teamId) {
    const teamIndex = this.state.teams.findIndex(t => t.id === teamId);
    if (teamIndex === -1) return { success: false, reason: 'Team not found' };

    const targetTeam = this.state.teams[teamIndex];
    const userId = this.state.activeUserId;

    // Remove user from team memberIds
    targetTeam.memberIds = (targetTeam.memberIds || []).filter(id => id !== userId);

    // If no members left in the team, remove the team
    if (targetTeam.memberIds.length === 0 && this.state.teams.length > 1) {
      this.state.teams.splice(teamIndex, 1);
    } else {
      // If user was owner, assign next member as owner
      if (targetTeam.ownerId === userId && targetTeam.memberIds.length > 0) {
        targetTeam.ownerId = targetTeam.memberIds[0];
      }
      // Update in Firebase if connected
      if (window.firebaseService && window.firebaseService.isInitialized) {
        window.firebaseService.updateTeam(targetTeam.id, targetTeam).catch(console.warn);
      }
    }

    // If this was the active team, switch to another available team or create default
    if (this.state.activeTeamId === teamId) {
      const remainingTeam = this.state.teams.find(t => t.id !== teamId) || this.state.teams[0];
      if (remainingTeam) {
        this.state.activeTeamId = remainingTeam.id;
      } else {
        const activeUser = this.getActiveUser();
        const userName = activeUser && activeUser.name ? activeUser.name.split(' ')[0] : 'My';
        const defaultTeam = {
          id: 'team_' + Date.now(),
          name: `${userName}'s Workspace`,
          code: 'WRK-' + Math.random().toString(36).substr(2, 6).toUpperCase(),
          description: 'Personal private calendar workspace',
          icon: '⚡',
          color: '#52525b',
          ownerId: userId,
          memberIds: [userId],
          isPrivate: true,
          createdAt: new Date().toISOString()
        };
        this.state.teams = [defaultTeam];
        this.state.activeTeamId = defaultTeam.id;
      }
    }

    this.saveTeams();
    this.notify();
    return { success: true, teamName: targetTeam.name };
  }

  saveTeams() {
    localStorage.setItem('noise_teams', JSON.stringify(this.state.teams));
    localStorage.setItem('noise_active_team', this.state.activeTeamId);
  }

  // --- Active Team Scoped Selectors ---
  getActiveTeamMembers() {
    const activeTeam = this.getActiveTeam();
    if (!activeTeam || !activeTeam.memberIds || activeTeam.memberIds.length === 0) {
      return this.state.teamMembers;
    }
    const allowedIds = new Set(activeTeam.memberIds);
    allowedIds.add(this.state.activeUserId);
    return this.state.teamMembers.filter(m => allowedIds.has(m.id));
  }

  isUserOnline(member) {
    if (!member || !member.lastActiveAt) return false;
    let timeMs = 0;
    
    // Handle Firestore Timestamp object directly
    if (member.lastActiveAt.toMillis && typeof member.lastActiveAt.toMillis === 'function') {
      timeMs = member.lastActiveAt.toMillis();
    } else if (member.lastActiveAt.seconds) { // Raw object representation
      timeMs = member.lastActiveAt.seconds * 1000;
    } else if (member.lastActiveAt instanceof Date) {
      timeMs = member.lastActiveAt.getTime();
    } else if (typeof member.lastActiveAt === 'string') {
      timeMs = new Date(member.lastActiveAt).getTime();
    } else if (typeof member.lastActiveAt === 'number') {
      timeMs = member.lastActiveAt;
    }
    
    // Consider online if active in the last 4 minutes (heartbeat is every 2m)
    return (Date.now() - timeMs) < (4 * 60 * 1000);
  }

  getActiveTeamEvents() {
    const activeTeam = this.getActiveTeam();
    const validMemberIds = new Set(this.state.teamMembers.map(m => m.id));
    
    let events = this.state.events.filter(e => validMemberIds.has(e.memberId));
    
    if (activeTeam) {
      events = events.filter(e => !e.teamId || e.teamId === activeTeam.id);
    }
    
    return events.sort((a, b) => new Date(a.start) - new Date(b.start));
  }

  // Ingest external real-time teams from Firestore (Single Source of Truth)
  ingestCloudTeams(cloudTeams) {
    if (!Array.isArray(cloudTeams)) return;

    if (cloudTeams.length === 0) {
      const activeUser = this.getActiveUser();
      const userName = activeUser && activeUser.name ? activeUser.name.split(' ')[0] : 'My';
      const defaultTeam = {
        id: 'team_' + Date.now(),
        name: `${userName}'s Workspace`,
        code: 'WRK-' + Math.random().toString(36).substr(2, 6).toUpperCase(),
        description: 'Personal private calendar workspace',
        icon: '⚡',
        color: '#52525b',
        ownerId: this.state.activeUserId,
        memberIds: [this.state.activeUserId],
        isPrivate: true,
        createdAt: new Date().toISOString()
      };
      this.state.teams = [defaultTeam];
      this.state.activeTeamId = defaultTeam.id;
      if (window.firebaseService && window.firebaseService.isInitialized) {
        window.firebaseService.createTeam(defaultTeam).catch(console.warn);
      }
    } else {
      this.state.teams = [...cloudTeams];
      if (!this.state.teams.some(t => t.id === this.state.activeTeamId)) {
        this.state.activeTeamId = this.state.teams[0]?.id || null;
      }
    }
    
    this.saveTeams();
    this.notify();
  }

  // --- Firebase User & Cloud Status ---
  setFirebaseUser(user) {
    this.state.firebaseUser = user;
    this.notify();
  }

  setActiveUserFromFirebase(profile, rememberMe = true) {
    if (!profile) return;

    // Purge the local dummy user 'Alex Developer' when a real user logs in
    let purgedDummy = false;
    const dummyIndex = this.state.teamMembers.findIndex(m => m.email === 'alex@example.com');
    if (dummyIndex !== -1 && profile.email !== 'alex@example.com') {
      const dummyId = this.state.teamMembers[dummyIndex].id;
      this.state.teamMembers.splice(dummyIndex, 1);
      this.state.visibleMemberIds.delete(dummyId);
      
      this.state.teams.forEach(t => {
        t.memberIds = (t.memberIds || []).filter(id => id !== dummyId);
        if (t.ownerId === dummyId) t.ownerId = profile.id;
        if (window.firebaseService && window.firebaseService.isInitialized) {
          window.firebaseService.updateTeam(t.id, t).catch(console.warn);
        }
      });
      purgedDummy = true;
      this.saveTeams();
    }
    const existingIndex = this.state.teamMembers.findIndex(m => m.id === profile.id || (profile.email && m.email === profile.email));
    if (existingIndex !== -1) {
      this.state.teamMembers[existingIndex] = { ...this.state.teamMembers[existingIndex], ...profile };
      this.state.activeUserId = this.state.teamMembers[existingIndex].id;
    } else {
      this.state.teamMembers.push(profile);
      this.state.visibleMemberIds.add(profile.id);
      this.state.activeUserId = profile.id;
    }

    // Persist full profile and email for seamless auto-resume
    localStorage.setItem('noise_stay_logged_in', rememberMe ? 'true' : 'false');
    if (rememberMe) {
      localStorage.setItem('noise_saved_profile', JSON.stringify(profile));
      if (profile.email) {
        localStorage.setItem('noise_saved_email', profile.email);
      }
    } else {
      localStorage.removeItem('noise_saved_profile');
    }

    localStorage.setItem('noise_active_user', this.state.activeUserId);
    localStorage.setItem('noise_members', JSON.stringify(this.state.teamMembers));

    // Wait for ingestCloudTeams to handle workspace generation.
    this.notify();
  }

  deleteEvent(id) {
    const idx = this.state.events.findIndex(e => e.id === id);
    if (idx !== -1) {
      if (this.state.events[idx].memberId !== this.state.activeUserId) {
        console.warn("Cannot delete an event you don't own.");
        return;
      }
      this.state.events.splice(idx, 1);
      this.saveEvents();
      if (window.firebaseService && window.firebaseService.isInitialized) {
        window.firebaseService.deleteEvent(id).catch(console.warn);
      }
      this.notify();
    }
  }

  setStayLoggedIn(enabled) {
    localStorage.setItem('noise_stay_logged_in', enabled ? 'true' : 'false');
    if (!enabled) {
      localStorage.removeItem('noise_saved_profile');
    } else {
      const user = this.getActiveUser();
      if (user && user.id !== 'user_default') {
        localStorage.setItem('noise_saved_profile', JSON.stringify(user));
      }
    }
    this.notify();
  }

  isStayLoggedIn() {
    return localStorage.getItem('noise_stay_logged_in') !== 'false';
  }

  clearActiveUser() {
    localStorage.removeItem('noise_saved_profile');
    this.state.firebaseUser = null;
    this.state.activeUserId = 'user_default';
    localStorage.setItem('noise_active_user', 'user_default');
    this.notify();
  }



  setCloudStatus(status) {
    this.state.cloudSyncStatus = status;
    this.notify();
  }

  // Ingest external real-time events from Firestore (Single Source of Truth)
  ingestCloudEvents(cloudEvents) {
    if (!Array.isArray(cloudEvents)) return;

    this.state.events = [...cloudEvents];
    this.state.lastSyncedAt = new Date();
    this.saveEvents();
    this.notify();
  }

  // Ingest external real-time team members from Firestore (Single Source of Truth)
  ingestCloudMembers(cloudMembers) {
    if (!Array.isArray(cloudMembers)) return;

    const merged = [...cloudMembers];
    this.state.teamMembers = merged;
    merged.forEach(m => this.state.visibleMemberIds.add(m.id));
    this.state.lastSyncedAt = new Date();
    localStorage.setItem('noise_members', JSON.stringify(merged));
    this.notify();
  }

  // --- Theme Management ---
  setTheme(theme) {
    this.state.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('noise_theme', theme);
    this.notify();
  }

  toggleTheme() {
    const newTheme = this.state.theme === 'dark' ? 'light' : 'dark';
    this.setTheme(newTheme);
  }

  // --- Active User Management ---
  setActiveUser(userId) {
    const userExists = this.state.teamMembers.some(m => m.id === userId);
    if (userExists) {
      this.state.activeUserId = userId;
      localStorage.setItem('noise_active_user', userId);
      this.notify();
    }
  }

  getActiveUser() {
    const saved = localStorage.getItem('noise_saved_profile');
    let localProfile = null;
    if (saved) {
      try { localProfile = JSON.parse(saved); } catch (e) {}
    }

    const member = this.state.teamMembers.find(m => m.id === this.state.activeUserId);
    if (member) return member;
    if (localProfile) return localProfile;

    return {
      id: this.state.activeUserId || 'user_default',
      name: (this.state.firebaseUser && this.state.firebaseUser.displayName) ? this.state.firebaseUser.displayName : 'My Account',
      email: (this.state.firebaseUser && this.state.firebaseUser.email) ? this.state.firebaseUser.email : 'user@company.com',
      role: 'Team Lead',
      avatar: 'ME',
      color: '#52525b',
      workingHours: { start: '09:00', end: '17:00' },
      active: true
    };
  }

  isUserLoggedIn() {
    const saved = localStorage.getItem('noise_saved_profile');
    if (saved) {
      try {
        const p = JSON.parse(saved);
        if (p && (p.email || p.id)) return true;
      } catch (e) {}
    }
    return !!(this.state.firebaseUser && !this.state.firebaseUser.isAnonymous);
  }

  // --- Team Member Filters ---
  toggleMemberVisibility(memberId) {
    if (this.state.visibleMemberIds.has(memberId)) {
      if (this.state.visibleMemberIds.size > 1) {
        this.state.visibleMemberIds.delete(memberId);
      }
    } else {
      this.state.visibleMemberIds.add(memberId);
    }
    this.notify();
  }

  isMemberVisible(memberId) {
    return this.state.visibleMemberIds.has(memberId);
  }

  // --- Member Operations ---
  addMember(memberData, teamId = null) {
    const newMember = {
      id: 'user_' + Date.now(),
      ...memberData
    };
    this.state.teamMembers.push(newMember);
    this.state.visibleMemberIds.add(newMember.id);

    // Attach to active team or specified team
    const targetTeamId = teamId || this.state.activeTeamId;
    const targetTeam = this.state.teams.find(t => t.id === targetTeamId);
    if (targetTeam) {
      if (!targetTeam.memberIds.includes(newMember.id)) {
        targetTeam.memberIds.push(newMember.id);
        this.saveTeams();
      }
    }

    localStorage.setItem('noise_members', JSON.stringify(this.state.teamMembers));
    this.notify();

    if (window.firebaseService && window.firebaseService.isInitialized) {
      window.firebaseService.updateMember(newMember.id, newMember).catch(err => {
        console.warn('Could not sync member to Firebase:', err);
      });
      if (targetTeam) {
        window.firebaseService.updateTeam(targetTeam.id, targetTeam).catch(err => {
          console.warn('Could not sync team members to Firebase:', err);
        });
      }
    }

    return newMember;
  }

  updateMember(memberId, updatedData) {
    const index = this.state.teamMembers.findIndex(m => m.id === memberId);
    if (index !== -1) {
      this.state.teamMembers[index] = { ...this.state.teamMembers[index], ...updatedData };
      localStorage.setItem('noise_members', JSON.stringify(this.state.teamMembers));
      this.notify();

      if (window.firebaseService && window.firebaseService.isInitialized) {
        window.firebaseService.updateMember(memberId, this.state.teamMembers[index]).catch(err => {
          console.warn('Could not sync updated member to Firebase:', err);
        });
      }
    }
  }

  // --- Events Operations ---
  addEvent(eventData) {
    const newEvent = {
      id: 'evt_' + Date.now(),
      teamId: eventData.teamId || this.state.activeTeamId,
      ...eventData
    };
    this.state.events.push(newEvent);
    this.saveEvents();
    this.notify();

    // Async sync to Firebase Firestore if connected
    if (window.firebaseService && window.firebaseService.isInitialized) {
      window.firebaseService.addEvent(newEvent).catch(err => {
        console.warn('Could not sync new event to Firebase:', err);
      });
    }

    // Trigger desktop notification if enabled
    if (this.state.notificationsEnabled && window.electronAPI) {
      const creator = this.state.teamMembers.find(m => m.id === newEvent.memberId);
      window.electronAPI.showNotification({
        title: '🗓️ New Calendar Event Added',
        body: `"${newEvent.title}" planned by ${creator ? creator.name : 'Team Member'}`
      });
    }

    return newEvent;
  }

  updateEvent(eventId, updatedData) {
    const index = this.state.events.findIndex(e => e.id === eventId);
    if (index !== -1) {
      if (this.state.events[index].memberId !== this.state.activeUserId) {
        throw new Error("Cannot update an event you don't own.");
      }
      this.state.events[index] = { ...this.state.events[index], ...updatedData };
      this.saveEvents();
      this.notify();

      // Async sync to Firebase Firestore if connected
      if (window.firebaseService && window.firebaseService.isInitialized) {
        window.firebaseService.updateEvent(eventId, this.state.events[index]).catch(err => {
          console.warn('Could not sync updated event to Firebase:', err);
        });
      }
    }
  }


  factoryReset() {
    localStorage.removeItem('noise_theme');
    localStorage.removeItem('noise_active_user');
    localStorage.removeItem('noise_active_team');
    localStorage.removeItem('noise_teams');
    localStorage.removeItem('noise_members');
    localStorage.removeItem('noise_events');
    localStorage.removeItem('noise_saved_profile');
    localStorage.removeItem('noise_stay_logged_in');
    localStorage.removeItem('noise_saved_email');
    localStorage.removeItem('noise_saved_password');
    
    // Re-initialize state to default
    this.initStore();
    this.notify();
  }

  saveEvents() {
    localStorage.setItem('noise_events', JSON.stringify(this.state.events));
  }

  // --- Calendar Navigation ---
  setCurrentView(view) {
    this.state.currentView = view;
    this.notify();
  }

  setCurrentDate(date) {
    this.state.currentDate = new Date(date);
    this.notify();
  }

  navigateCalendar(direction) {
    const d = new Date(this.state.currentDate);
    if (this.state.currentView === 'month') {
      d.setMonth(d.getMonth() + direction);
    } else if (this.state.currentView === 'week') {
      d.setDate(d.getDate() + (direction * 7));
    } else if (this.state.currentView === 'day') {
      d.setDate(d.getDate() + direction);
    }
    this.state.currentDate = d;
    this.notify();
  }

  setSearchQuery(query) {
    this.state.searchQuery = query;
    this.notify();
  }

  // Reset to Clean Workspace
  resetToCleanWorkspace() {
    this.state.teams = typeof INITIAL_TEAMS !== 'undefined' ? INITIAL_TEAMS : [];
    this.state.activeTeamId = this.state.teams[0]?.id || null;
    this.state.teamMembers = typeof INITIAL_TEAM_MEMBERS !== 'undefined' ? INITIAL_TEAM_MEMBERS : [];
    this.state.events = typeof INITIAL_EVENTS !== 'undefined' ? INITIAL_EVENTS : [];
    this.state.visibleMemberIds = new Set(this.state.teamMembers.map(m => m.id));
    localStorage.removeItem('noise_events');
    localStorage.removeItem('noise_members');
    localStorage.removeItem('noise_teams');
    localStorage.removeItem('noise_active_team');
    this.notify();
  }
}

const store = new AppStore();
window.store = store;
