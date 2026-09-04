/* ==========================================================================
   Noise Desktop - Firebase Authentication & Cloud Firestore Service
   ========================================================================== */

class FirebaseService {
  constructor() {
    this.app = null;
    this.auth = null;
    this.db = null;
    this.currentUser = null;
    this.isInitialized = false;
    this.status = 'unconfigured'; // 'unconfigured' | 'connecting' | 'connected' | 'error' | 'offline'
    this.statusListeners = [];
    this.unsubscribeEventsListener = null;
    this.unsubscribeMembersListener = null;
    this.lastError = null;

    // Load saved configuration from localStorage
    this.config = this.getSavedConfig();

    if (window.electronAPI && window.electronAPI.onAppQuitting) {
      window.electronAPI.onAppQuitting(async () => {
        if (this.isInitialized && this.db && this.currentUser && this.currentUser.uid) {
          try {
            await this.db.collection('team_members').doc(this.currentUser.uid).update({
              lastActiveAt: 0 // Instantly set offline (0 timestamp)
            });
          } catch (e) {
            console.error('Failed to set offline status on quit:', e);
          }
        }
      });
    }
  }

  // --- Configuration Management ---
  getSavedConfig() {
    try {
      const saved = localStorage.getItem('noise_firebase_config');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to parse saved Firebase config:', e);
    }

    // Fall back to central app-wide config defined in firebase-config.js
    if (typeof FIREBASE_APP_CONFIG !== 'undefined' && FIREBASE_APP_CONFIG.apiKey && FIREBASE_APP_CONFIG.projectId) {
      return FIREBASE_APP_CONFIG;
    }

    return null;
  }

  saveConfig(configObj) {
    try {
      localStorage.setItem('noise_firebase_config', JSON.stringify(configObj));
      this.config = configObj;
      return true;
    } catch (e) {
      console.error('Failed to save Firebase config:', e);
      return false;
    }
  }

  clearConfig() {
    localStorage.removeItem('noise_firebase_config');
    this.config = null;
    this.disconnect();
    this.setStatus('unconfigured');
  }

  // --- Status & Event Broadcasting ---
  onStatusChange(listener) {
    this.statusListeners.push(listener);
    // Trigger initial status callback
    listener(this.status, { user: this.currentUser, error: this.lastError });
    return () => {
      this.statusListeners = this.statusListeners.filter(l => l !== listener);
    };
  }

  setStatus(newStatus, error = null) {
    this.status = newStatus;
    this.lastError = error;
    this.statusListeners.forEach(listener => listener(this.status, { user: this.currentUser, error }));
  }

  // --- Initialization ---
  async initialize(customConfig = null) {
    const configToUse = customConfig || this.getSavedConfig();

    if (!configToUse || !configToUse.apiKey || !configToUse.projectId) {
      this.setStatus('unconfigured');
      return { success: false, reason: 'No Firebase configuration found.' };
    }

    if (typeof firebase === 'undefined') {
      const err = 'Firebase SDK not loaded in window.';
      console.error(err);
      this.setStatus('error', err);
      return { success: false, reason: err };
    }

    try {
      this.setStatus('connecting');
      this._hasAttemptedAutoLogin = false;

      // Check if Firebase app is already initialized
      if (firebase.apps && firebase.apps.length > 0) {
        this.app = firebase.apps[0];
      } else {
        this.app = firebase.initializeApp(configToUse);
      }

      this.auth = firebase.auth();
      this.db = firebase.firestore();

      // Configure explicit LOCAL auth persistence so user sessions survive reloads & restarts
      try {
        await this.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      } catch (err) {
        console.warn('Auth persistence configuration warning:', err);
      }

      this.isInitialized = true;
      this.config = configToUse;

      // Listen to Auth State Changes with instant non-blocking profile resolution
      this.auth.onAuthStateChanged((user) => {
        this.currentUser = user;
        if (user && !user.isAnonymous) {
          const displayName = user.displayName || (user.email ? user.email.split('@')[0] : 'Noise User');
          const avatar = displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'US';

          const profile = {
            id: user.uid,
            uid: user.uid,
            name: displayName,
            email: user.email || '',
            role: 'Team Member',
            avatar: avatar,
            color: '#52525b',
            active: true
          };

          if (window.store) {
            window.store.setActiveUserFromFirebase(profile, true);
            window.store.setFirebaseUser(user);
          }

          // Re-attach authenticated Firestore real-time listeners
          this.attachRealtimeListeners();
          this.startPresenceHeartbeat();

          // Fetch full profile document asynchronously in background
          if (this.db) {
            this.db.collection('users').doc(user.uid).get().then(doc => {
              if (doc.exists && window.store) {
                window.store.setActiveUserFromFirebase({ id: doc.id, ...doc.data() }, true);
              }
            }).catch(e => console.warn('Background profile fetch notice:', e));
          }
        } else if (!user) {
          if (this._presenceInterval) clearInterval(this._presenceInterval);
          this._presenceInterval = null;
          const stayLoggedIn = localStorage.getItem('noise_stay_logged_in') === 'true';
          const savedEmail = localStorage.getItem('noise_saved_email');
          const savedPassEncoded = localStorage.getItem('noise_saved_password');

          if (stayLoggedIn && savedEmail && savedPassEncoded && !this._hasAttemptedAutoLogin) {
            this._hasAttemptedAutoLogin = true;
            try {
              const pass = atob(savedPassEncoded);
              this.auth.signInWithEmailAndPassword(savedEmail, pass).catch(() => {
                localStorage.removeItem('noise_saved_password');
                if (window.store) window.store.setFirebaseUser(null);
              });
              return; // Early return to let the next auth state change handle success
            } catch (e) {
              localStorage.removeItem('noise_saved_password');
            }
          }

          if (window.store) {
            window.store.setFirebaseUser(null);
          }
          this.attachRealtimeListeners();
        }
        this.setStatus('connected');
      });

      // Start Realtime Firestore Listeners for Calendar Events, Teams & Team Members
      this.attachRealtimeListeners();

      this.setStatus('connected');
      return { success: true };
    } catch (err) {
      console.error('Firebase Initialization Error:', err);
      this.setStatus('error', err.message);
      return { success: false, reason: err.message };
    }
  }

  disconnect() {
    if (this.unsubscribeEventsListener) {
      this.unsubscribeEventsListener();
      this.unsubscribeEventsListener = null;
    }
    if (this.unsubscribeMembersListener) {
      this.unsubscribeMembersListener();
      this.unsubscribeMembersListener = null;
    }
    if (this.unsubscribeTeamsListener) {
      this.unsubscribeTeamsListener();
      this.unsubscribeTeamsListener = null;
    }
    this.isInitialized = false;
    this.currentUser = null;
    this.setStatus('offline');
  }

  // Sanitize data before writing to Firestore (strip undefined fields, convert Dates, guarantee clean JSON)
  sanitizeForFirestore(data) {
    if (data === null || data === undefined) return null;
    if (typeof data !== 'object') return data;
    if (data instanceof Date) return data.toISOString();
    if (Array.isArray(data)) {
      return data.map(item => this.sanitizeForFirestore(item)).filter(item => item !== undefined);
    }
    const clean = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && typeof value !== 'function') {
        clean[key] = this.sanitizeForFirestore(value);
      }
    }
    return clean;
  }

  // --- Real-time Cloud Listeners ---
  attachRealtimeListeners() {
    if (!this.db || !this.currentUser || !this.currentUser.uid) return;

    // 1. Listen to 'teams' collection for authorized teams
    try {
      if (this.unsubscribeTeamsListener) this.unsubscribeTeamsListener();

      const teamsQuery = this.db.collection('teams').where('memberIds', 'array-contains', this.currentUser.uid);

      this.unsubscribeTeamsListener = teamsQuery.onSnapshot(
        (snapshot) => {
          const teams = [];
          const teamIds = new Set();
          const memberIds = new Set();

          snapshot.forEach(doc => {
            const data = doc.data();
            teams.push({ id: doc.id, ...data });
            teamIds.add(doc.id);
            if (data.memberIds && Array.isArray(data.memberIds)) {
              data.memberIds.forEach(id => memberIds.add(id));
            }
          });

          if (window.store) {
            window.store.ingestCloudTeams(teams);
          }

          this.updateCascadingListeners(Array.from(teamIds), Array.from(memberIds));
        },
        (error) => {
          console.error('Firestore teams listener error:', error);
        }
      );
    } catch (e) {
      console.error('Failed to attach teams listener:', e);
    }
  }

  startPresenceHeartbeat() {
    if (!this.db || !this.currentUser || !this.currentUser.uid) return;

    const updatePresence = () => {
      if (!navigator.onLine) return;
      
      // Use set with merge to ensure doc exists and handles offline queueing robustly
      this.db.collection('team_members').doc(this.currentUser.uid).set({
        lastActiveAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true }).catch(() => {}); 
    };

    updatePresence();
    if (this._presenceInterval) clearInterval(this._presenceInterval);
    // Ping presence every 2 minutes
    this._presenceInterval = setInterval(updatePresence, 120000);

    if (!this._presenceListenersAttached) {
      window.addEventListener('online', updatePresence);
      window.addEventListener('focus', updatePresence);
      this._presenceListenersAttached = true;
    }
  }

  updateCascadingListeners(teamIds, memberIds) {
    if (!this.db) return;

    // --- Cleanup Existing Listeners ---
    if (!this.eventListeners) this.eventListeners = [];
    if (!this.memberListeners) this.memberListeners = [];
    
    this.eventListeners.forEach(unsub => unsub());
    this.memberListeners.forEach(unsub => unsub());
    this.eventListeners = [];
    this.memberListeners = [];

    // --- 2. Attach isolated events listeners (1 per team) ---
    if (teamIds.length > 0) {
      if (!this._mergedEventsMap) this._mergedEventsMap = new Map();
      
      const sendMergedEvents = () => {
         if (window.store) {
           window.store.ingestCloudEvents(Array.from(this._mergedEventsMap.values()));
         }
      };

      teamIds.forEach(teamId => {
        try {
          const unsub = this.db.collection('events').where('teamId', '==', teamId).onSnapshot(
            (snapshot) => {
              snapshot.docChanges().forEach(change => {
                if (change.type === 'removed') {
                  this._mergedEventsMap.delete(change.doc.id);
                } else {
                  this._mergedEventsMap.set(change.doc.id, { id: change.doc.id, ...change.doc.data() });
                }
              });
              sendMergedEvents();
              this.setStatus('connected');
            },
            (error) => {
              console.error('Events listener error for team', teamId, error);
            }
          );
          this.eventListeners.push(unsub);
        } catch (e) {
          console.error('Failed to attach events listener for team:', teamId, e);
        }
      });
    } else {
      // Clear events if no teams
      if (this._mergedEventsMap) this._mergedEventsMap.clear();
      if (window.store) window.store.ingestCloudEvents([]);
    }

    // --- 3. Attach chunked members listeners ---
    if (memberIds.length > 0) {
      if (!this._mergedMembersMap) this._mergedMembersMap = new Map();
      const sendMergedMembers = () => {
         if (window.store && this._mergedMembersMap.size > 0) {
           window.store.ingestCloudMembers(Array.from(this._mergedMembersMap.values()));
         }
      };

      // Chunk memberIds into groups of 30 (Firestore 'in' limit is exactly 30)
      const chunkSize = 30;
      for (let i = 0; i < memberIds.length; i += chunkSize) {
        const chunk = memberIds.slice(i, i + chunkSize);
        try {
          // FieldPath is required to query by document ID
          const FieldPath = firebase.firestore.FieldPath;
          const unsub = this.db.collection('team_members')
            .where(FieldPath.documentId(), 'in', chunk)
            .onSnapshot(
            (snapshot) => {
              snapshot.docChanges().forEach(change => {
                if (change.type === 'removed') {
                  this._mergedMembersMap.delete(change.doc.id);
                } else {
                  this._mergedMembersMap.set(change.doc.id, { id: change.doc.id, ...change.doc.data() });
                }
              });
              sendMergedMembers();
            },
            (error) => {
              console.error('Members listener error for chunk', i, error);
            }
          );
          this.memberListeners.push(unsub);
        } catch (e) {
          console.error('Failed to attach members listener for chunk:', i, e);
        }
      }
    } else {
      if (this._mergedMembersMap) this._mergedMembersMap.clear();
      if (window.store) window.store.ingestCloudMembers([]);
    }
  }

  // --- Firestore Realtime CRUD Operations ---
  async addEvent(eventData) {
    if (!this.isInitialized || !this.db) {
      return null;
    }

    try {
      const docRef = eventData.id
        ? this.db.collection('events').doc(eventData.id)
        : this.db.collection('events').doc();

      const cleanData = this.sanitizeForFirestore(eventData);
      const payload = {
        ...cleanData,
        id: docRef.id,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      await docRef.set(payload, { merge: true });
      return payload;
    } catch (e) {
      console.error('Error adding event to Firestore:', e);
      if (e.code === 'permission-denied') {
        this.setStatus('error', 'Firestore permission denied. Check Security Rules.');
      }
      throw e;
    }
  }

  async updateEvent(eventId, updatedFields) {
    if (!this.isInitialized || !this.db) {
      return null;
    }

    try {
      const docRef = this.db.collection('events').doc(eventId);
      const cleanData = this.sanitizeForFirestore(updatedFields);
      await docRef.set({
        ...cleanData,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      return true;
    } catch (e) {
      console.error('Error updating event in Firestore:', e);
      if (e.code === 'permission-denied') {
        this.setStatus('error', 'Firestore permission denied. Check Security Rules.');
      }
      throw e;
    }
  }

  async deleteEvent(eventId) {
    if (!this.isInitialized || !this.db) {
      return null;
    }

    try {
      await this.db.collection('events').doc(eventId).delete();
      return true;
    } catch (e) {
      console.error('Error deleting event in Firestore:', e);
      throw e;
    }
  }

  async updateMember(memberId, memberData) {
    if (!this.isInitialized || !this.db) return null;

    try {
      const cleanData = this.sanitizeForFirestore(memberData);
      await this.db.collection('team_members').doc(memberId).set({
        ...cleanData,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      return true;
    } catch (e) {
      console.error('Error updating member in Firestore:', e);
      throw e;
    }
  }

  // --- Team Cloud Management ---
  async createTeam(teamData) {
    if (!this.isInitialized || !this.db) return null;

    try {
      const cleanData = this.sanitizeForFirestore(teamData);
      const docRef = this.db.collection('teams').doc(teamData.id);
      await docRef.set({
        ...cleanData,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      return true;
    } catch (e) {
      console.error('Error creating team in Firestore:', e);
      throw e;
    }
  }

  async updateTeam(teamId, teamData) {
    if (!this.isInitialized || !this.db) return null;

    try {
      const cleanData = this.sanitizeForFirestore(teamData);
      await this.db.collection('teams').doc(teamId).set({
        ...cleanData,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      return true;
    } catch (e) {
      console.error('Error updating team in Firestore:', e);
      throw e;
    }
  }

  async deleteTeam(teamId) {
    if (!this.isInitialized || !this.db) return null;

    try {
      await this.db.collection('teams').doc(teamId).delete();
      return true;
    } catch (e) {
      console.error('Error deleting team in Firestore:', e);
      throw e;
    }
  }

  async findTeamByCode(code) {
    if (!this.isInitialized || !this.db) return null;

    try {
      const snap = await this.db.collection('teams').where('code', '==', code).limit(1).get();
      if (!snap.empty) {
        const doc = snap.docs[0];
        return { id: doc.id, ...doc.data() };
      }
      return null;
    } catch (e) {
      console.error('Error finding team by code:', e);
      return { error: true, message: e.message };
    }
  }

  // --- Team Chat Messaging ---
  async sendChatMessage(teamId, channelId, messageData) {
    if (!this.isInitialized || !this.db) {
      throw new Error('Firebase is not connected.');
    }

    try {
      const cleanData = this.sanitizeForFirestore(messageData);
      const docRef = this.db.collection('teams').doc(teamId)
        .collection('messages').doc();

      await docRef.set({
        ...cleanData,
        id: docRef.id,
        teamId: teamId,
        channelId: channelId || 'general',
        createdAt: Date.now(),
        serverTimestamp: firebase.firestore.FieldValue.serverTimestamp()
      });

      return { success: true, id: docRef.id };
    } catch (e) {
      console.error('Error sending chat message:', e);
      throw e;
    }
  }

  async deleteChatMessage(teamId, messageId) {
    if (!this.isInitialized || !this.db) {
      throw new Error('Firebase is not connected.');
    }

    try {
      await this.db.collection('teams').doc(teamId)
        .collection('messages').doc(messageId).delete();
      return { success: true };
    } catch (e) {
      console.error('Error deleting chat message:', e);
      throw e;
    }
  }

  async editChatMessage(teamId, messageId, newText) {
    if (!this.isInitialized || !this.db) {
      throw new Error('Firebase is not connected.');
    }

    try {
      await this.db.collection('teams').doc(teamId)
        .collection('messages').doc(messageId).update({
          text: newText,
          editedAt: Date.now()
        });
      return { success: true };
    } catch (e) {
      console.error('Error editing chat message:', e);
      throw e;
    }
  }

  async addChannel(teamId, channel) {
    if (!this.isInitialized || !this.db) {
      throw new Error('Firebase is not connected.');
    }

    try {
      const docRef = this.db.collection('teams').doc(teamId);
      const docSnap = await docRef.get();
      const data = docSnap.data();

      // If channels array doesn't exist, seed it with ['general', channel]
      if (!data.channels || data.channels.length === 0) {
        await docRef.update({
          channels: ['general', channel]
        });
      } else {
        await docRef.update({
          channels: firebase.firestore.FieldValue.arrayUnion(channel)
        });
      }
      return { success: true };
    } catch (e) {
      console.error('Error adding channel:', e);
      throw e;
    }
  }

  async editChannel(teamId, oldName, newName) {
    if (!this.isInitialized || !this.db) {
      throw new Error('Firebase is not connected.');
    }
    if (oldName === 'general') throw new Error('Cannot rename the general channel.');

    try {
      const docRef = this.db.collection('teams').doc(teamId);
      
      // Update the channel name in the array
      await docRef.update({
        channels: firebase.firestore.FieldValue.arrayRemove(oldName)
      });
      await docRef.update({
        channels: firebase.firestore.FieldValue.arrayUnion(newName)
      });

      // Batch update message channelIds
      const messagesRef = docRef.collection('messages');
      const snapshot = await messagesRef.where('channelId', '==', oldName).get();
      
      if (!snapshot.empty) {
        let batch = this.db.batch();
        let count = 0;
        
        snapshot.forEach(doc => {
          batch.update(doc.ref, { channelId: newName });
          count++;
          // Firestore batches max out at 500 operations, but for this app it should be fine.
          // Ideally, we'd chunk this if > 500.
        });
        
        if (count > 0) {
          await batch.commit();
        }
      }

      return { success: true };
    } catch (e) {
      console.error('Error editing channel:', e);
      throw e;
    }
  }

  async deleteChannel(teamId, channelName) {
    if (!this.isInitialized || !this.db) {
      throw new Error('Firebase is not connected.');
    }
    if (channelName === 'general') throw new Error('Cannot delete the general channel.');

    try {
      const docRef = this.db.collection('teams').doc(teamId);
      
      // Remove from array
      await docRef.update({
        channels: firebase.firestore.FieldValue.arrayRemove(channelName)
      });

      // Batch delete messages in the channel
      const messagesRef = docRef.collection('messages');
      const snapshot = await messagesRef.where('channelId', '==', channelName).get();
      
      if (!snapshot.empty) {
        let batch = this.db.batch();
        let count = 0;
        
        snapshot.forEach(doc => {
          batch.delete(doc.ref);
          count++;
        });
        
        if (count > 0) {
          await batch.commit();
        }
      }

      return { success: true };
    } catch (e) {
      console.error('Error deleting channel:', e);
      throw e;
    }
  }

  // --- 1-Click Database Seeding Utility ---
  async seedFirestoreFromLocal(events, members, teams = null) {
    if (!this.isInitialized || !this.db) {
      throw new Error('Firebase is not connected. Please connect first.');
    }

    const batch = this.db.batch();

    // 1. Batch upload teams
    const teamsToUpload = teams || (typeof INITIAL_TEAMS !== 'undefined' ? INITIAL_TEAMS : []);
    teamsToUpload.forEach(team => {
      const cleanTeam = this.sanitizeForFirestore(team);
      const docRef = this.db.collection('teams').doc(team.id);
      batch.set(docRef, cleanTeam, { merge: true });
    });

    // 2. Batch upload team members
    members.forEach(member => {
      const cleanMember = this.sanitizeForFirestore(member);
      const docRef = this.db.collection('team_members').doc(member.id);
      batch.set(docRef, cleanMember, { merge: true });
    });

    // 3. Batch upload events
    events.forEach(evt => {
      const cleanEvt = this.sanitizeForFirestore(evt);
      const docRef = this.db.collection('events').doc(evt.id);
      batch.set(docRef, cleanEvt, { merge: true });
    });

    await batch.commit();
    return { eventsCount: events.length, membersCount: members.length, teamsCount: teamsToUpload.length };
  }

  // --- Authentication Helpers (Linked to Firestore user document) ---
  async signInWithGoogleToken(idToken) {
    if (!this.auth) throw new Error('Firebase Auth is not initialized');
    
    const credential = firebase.auth.GoogleAuthProvider.credential(idToken);
    const cred = await this.auth.signInWithCredential(credential);
    this.currentUser = cred.user;

    const displayName = cred.user.displayName || (cred.user.email ? cred.user.email.split('@')[0] : 'Google User');
    const avatar = displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    const colors = ['#8b5cf6', '#10b981', '#06b6d4', '#f43f5e', '#f59e0b', '#3b82f6'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    let profile = {
      id: cred.user.uid,
      uid: cred.user.uid,
      name: displayName,
      email: cred.user.email || '',
      role: 'Team Member',
      avatar: avatar || 'GU',
      photoURL: cred.user.photoURL || null,
      color: randomColor,
      workingHours: { start: '09:00', end: '17:00' },
      active: true,
      provider: 'google.com',
      lastLoginAt: new Date().toISOString()
    };

    // Check if user document already exists in Firestore
    try {
      if (this.db) {
        const doc = await this.db.collection('users').doc(cred.user.uid).get();
        if (doc.exists) {
          profile = { id: doc.id, ...doc.data(), lastLoginAt: new Date().toISOString() };
          await this.db.collection('users').doc(cred.user.uid).set(profile, { merge: true });
        } else {
          profile.createdAt = new Date().toISOString();
          await this.db.collection('users').doc(cred.user.uid).set(profile);
          await this.db.collection('team_members').doc(cred.user.uid).set(profile);
        }
      }
    } catch (e) {
      console.warn('Could not sync Google user profile to Firestore:', e);
    }

    if (window.store) {
      window.store.setActiveUserFromFirebase(profile, true);
      window.store.setFirebaseUser(cred.user);
    }
    
    return cred.user;
  }

  async uploadProfilePicture(file, userId) {
    if (!this.isInitialized || !firebase.storage) {
      throw new Error('Firebase Storage is not initialized.');
    }
    if (!this.currentUser) {
      throw new Error('Must be logged in to upload a profile picture.');
    }
    try {
      const ext = file.name.split('.').pop() || 'png';
      const storageRef = firebase.storage().ref();
      const avatarRef = storageRef.child(`avatars/${userId}_${Date.now()}.${ext}`);
      await avatarRef.put(file);
      const downloadURL = await avatarRef.getDownloadURL();
      return downloadURL;
    } catch (e) {
      console.error('Failed to upload profile picture:', e);
      throw e;
    }
  }

  async signInAnonymously() {
    if (!this.auth) throw new Error('Firebase Auth is not initialized');
    const cred = await this.auth.signInAnonymously();
    this.currentUser = cred.user;
    return cred.user;
  }

  async testCloudConnection() {
    if (!this.isInitialized || !this.db) {
      return { success: false, message: 'Firebase is not initialized. Please verify your internet connection.' };
    }

    try {
      const pingRef = this.db.collection('_diagnostics').doc('connection_test');
      await pingRef.set({
        pingAt: new Date().toISOString(),
        client: 'Noise Desktop',
        uid: this.auth?.currentUser?.uid || 'unauthenticated'
      }, { merge: true });

      const readSnap = await pingRef.get();
      if (readSnap.exists) {
        return { success: true, message: 'Firestore Read & Write tests passed successfully! 🟢 Real-time sync is active.' };
      } else {
        return { success: false, message: 'Write succeeded but could not read back test document from Firestore.' };
      }
    } catch (err) {
      console.error('Firestore Diagnostic Test Error:', err);
      if (err.code === 'permission-denied') {
        return {
          success: false,
          code: 'permission-denied',
          message: 'Permission Denied: Your Firestore Security Rules are blocking access. Please check Firebase Console > Firestore Database > Rules and allow read/write access.'
        };
      }
      return { success: false, code: err.code, message: err.message };
    }
  }



  async deleteAccountData() {
    if (!this.auth || !this.currentUser || !this.db) {
      throw new Error("Must be logged in to delete account.");
    }

    const uid = this.currentUser.uid;
    const ops = [];

    try {
      // 1. Delete events where memberId == uid
      const eventsSnap = await this.db.collection('events').where('memberId', '==', uid).get();
      eventsSnap.forEach(doc => {
        ops.push(doc.ref.delete());
      });

      // 2. Handle teams
      const teamsSnap = await this.db.collection('teams').where('memberIds', 'array-contains', uid).get();
      teamsSnap.forEach(doc => {
        const team = doc.data();
        if (team.ownerId === uid) {
          // If user owns the team, delete it completely
          ops.push(doc.ref.delete());
        } else {
          // If user is just a member, remove them from the array
          ops.push(doc.ref.update({
            memberIds: firebase.firestore.FieldValue.arrayRemove(uid)
          }));
        }
      });

      // 3. Delete user profiles
      ops.push(this.db.collection('users').doc(uid).delete());
      ops.push(this.db.collection('team_members').doc(uid).delete());

      // Execute all database operations concurrently
      await Promise.all(ops);

      // 4. Delete Firebase Auth User
      await this.currentUser.delete();

      // 5. Sign out locally
      await this.signOut();
      
      // Factory reset state
      if (window.store && typeof window.store.factoryReset === 'function') {
        window.store.factoryReset();
      }

      return true;
    } catch (e) {
      console.error("Error deleting account data:", e);
      throw e;
    }
  }

  // --- AI Activity Tracking (Dynamic Rate Limiting) ---
  async pingAiActivity() {
    if (!this.db || !this.currentUser || !this.currentUser.uid) return;
    try {
      await this.db.collection('ai_activity').doc(this.currentUser.uid).set({
        lastActive: Date.now()
      }, { merge: true });
    } catch (e) {
      console.warn("Failed to ping AI activity:", e);
    }
  }

  async getActiveAiUserCount() {
    if (!this.db) return 1; // Default to 1 to prevent division by zero
    try {
      const windowStart = Date.now() - (15 * 1000); // 15 seconds window
      const snap = await this.db.collection('ai_activity')
        .where('lastActive', '>=', windowStart)
        .get();
      return Math.max(1, snap.size);
    } catch (e) {
      console.warn("Failed to get active AI users:", e);
      return 1;
    }
  }

  async signOut() {
    if (!this.auth) return;
    try {
      await this.auth.signOut();
    } catch (e) {
      console.warn('Sign out notice:', e);
    }
    this.currentUser = null;
    localStorage.removeItem('noise_saved_password');
    if (window.store) {
      window.store.clearActiveUser();
    }
    // Re-authenticate anonymously in background so Firestore sync remains active
    this.auth.signInAnonymously().catch(() => {});
  }
}

// Global Singleton Instance
const firebaseService = new FirebaseService();
window.firebaseService = firebaseService;
