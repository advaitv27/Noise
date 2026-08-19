/* ==========================================================================
   CollabCal Desktop - Firebase Authentication & Cloud Firestore Service
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
  }

  // --- Configuration Management ---
  getSavedConfig() {
    try {
      const saved = localStorage.getItem('collabcal_firebase_config');
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
      localStorage.setItem('collabcal_firebase_config', JSON.stringify(configObj));
      this.config = configObj;
      return true;
    } catch (e) {
      console.error('Failed to save Firebase config:', e);
      return false;
    }
  }

  clearConfig() {
    localStorage.removeItem('collabcal_firebase_config');
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
          const displayName = user.displayName || (user.email ? user.email.split('@')[0] : 'CollabCal User');
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

          // Fetch full profile document asynchronously in background
          if (this.db) {
            this.db.collection('users').doc(user.uid).get().then(doc => {
              if (doc.exists && window.store) {
                window.store.setActiveUserFromFirebase({ id: doc.id, ...doc.data() }, true);
              }
            }).catch(e => console.warn('Background profile fetch notice:', e));
          }
        } else if (!user) {
          const stayLoggedIn = localStorage.getItem('collabcal_stay_logged_in') === 'true';
          const savedEmail = localStorage.getItem('collabcal_saved_email');
          const savedPassEncoded = localStorage.getItem('collabcal_saved_password');

          if (stayLoggedIn && savedEmail && savedPassEncoded && !this._hasAttemptedAutoLogin) {
            this._hasAttemptedAutoLogin = true;
            try {
              const pass = atob(savedPassEncoded);
              this.auth.signInWithEmailAndPassword(savedEmail, pass).catch(() => {
                localStorage.removeItem('collabcal_saved_password');
                if (window.store) window.store.setFirebaseUser(null);
              });
              return; // Early return to let the next auth state change handle success
            } catch (e) {
              localStorage.removeItem('collabcal_saved_password');
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
    if (!this.db) return;

    // 1. Listen to 'events' collection
    try {
      if (this.unsubscribeEventsListener) this.unsubscribeEventsListener();

      this.unsubscribeEventsListener = this.db.collection('events').onSnapshot(
        (snapshot) => {
          const events = [];
          snapshot.forEach(doc => {
            events.push({ id: doc.id, ...doc.data() });
          });

          // Sync into store if store exists
          if (window.store) {
            window.store.ingestCloudEvents(events);
          }
          this.setStatus('connected');
        },
        (error) => {
          console.error('Firestore events listener error:', error);
          if (error.code === 'permission-denied') {
            this.setStatus('error', 'Firestore permission denied. Please verify your Firestore rules allow read/write.');
          } else {
            this.setStatus('error', error.message);
          }
        }
      );
    } catch (e) {
      console.error('Failed to attach events listener:', e);
    }

    // 2. Listen to 'team_members' collection
    try {
      if (this.unsubscribeMembersListener) this.unsubscribeMembersListener();

      this.unsubscribeMembersListener = this.db.collection('team_members').onSnapshot(
        (snapshot) => {
          const members = [];
          snapshot.forEach(doc => {
            members.push({ id: doc.id, ...doc.data() });
          });

          if (members.length > 0 && window.store) {
            window.store.ingestCloudMembers(members);
          }
        },
        (error) => {
          console.error('Firestore members listener error:', error);
        }
      );
    } catch (e) {
      console.error('Failed to attach members listener:', e);
    }

    // 3. Listen to 'teams' collection
    try {
      if (this.unsubscribeTeamsListener) this.unsubscribeTeamsListener();

      let teamsQuery = this.db.collection('teams');
      if (this.currentUser && this.currentUser.uid) {
        teamsQuery = teamsQuery.where('memberIds', 'array-contains', this.currentUser.uid);
      }

      this.unsubscribeTeamsListener = teamsQuery.onSnapshot(
        (snapshot) => {
          const teams = [];
          snapshot.forEach(doc => {
            teams.push({ id: doc.id, ...doc.data() });
          });

          if (window.store) {
            window.store.ingestCloudTeams(teams);
          }
        },
        (error) => {
          console.error('Firestore teams listener error:', error);
        }
      );
    } catch (e) {
      console.error('Failed to attach teams listener:', e);
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
  async signUp(email, password, displayName, rememberMe = true) {
    if (!this.auth) throw new Error('Firebase Auth is not initialized');

    try {
      const persistenceType = rememberMe ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION;
      await this.auth.setPersistence(persistenceType);
    } catch (e) {}

    const cred = await this.auth.createUserWithEmailAndPassword(email, password);
    const name = displayName || email.split('@')[0];
    if (cred.user) {
      cred.user.updateProfile({ displayName: name }).catch(() => {});
    }
    this.currentUser = cred.user;

    const avatar = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'US';
    const colors = ['#8b5cf6', '#10b981', '#06b6d4', '#f43f5e', '#f59e0b', '#3b82f6'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    const userProfile = {
      id: cred.user.uid,
      uid: cred.user.uid,
      name: name,
      email: email,
      role: 'Team Member',
      avatar: avatar,
      color: randomColor,
      workingHours: { start: '09:00', end: '17:00' },
      active: true,
      stayLoggedIn: rememberMe,
      createdAt: new Date().toISOString()
    };

    if (window.store) {
      window.store.setActiveUserFromFirebase(userProfile, rememberMe);
      window.store.setFirebaseUser(cred.user);
    }
    
    if (rememberMe) {
      localStorage.setItem('collabcal_saved_email', email);
      localStorage.setItem('collabcal_saved_password', btoa(password));
    } else {
      localStorage.removeItem('collabcal_saved_email');
      localStorage.removeItem('collabcal_saved_password');
    }

    // Background asynchronous Firestore profile document creation
    if (this.db) {
      this.db.collection('users').doc(cred.user.uid).set(userProfile, { merge: true }).catch(console.warn);
      this.db.collection('team_members').doc(cred.user.uid).set(userProfile, { merge: true }).catch(console.warn);
    }

    return cred.user;
  }

  async signIn(email, password, rememberMe = true) {
    if (!this.auth) throw new Error('Firebase Auth is not initialized');

    try {
      const persistenceType = rememberMe ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION;
      await this.auth.setPersistence(persistenceType);
    } catch (e) {}

    const cred = await this.auth.signInWithEmailAndPassword(email, password);
    this.currentUser = cred.user;

    const displayName = cred.user.displayName || email.split('@')[0];
    const avatar = displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'US';

    const userProfile = {
      id: cred.user.uid,
      uid: cred.user.uid,
      name: displayName,
      email: email,
      role: 'Team Member',
      avatar: avatar,
      color: '#52525b',
      workingHours: { start: '09:00', end: '17:00' },
      active: true,
      stayLoggedIn: rememberMe
    };

    if (window.store) {
      window.store.setActiveUserFromFirebase(userProfile, rememberMe);
      window.store.setFirebaseUser(cred.user);
    }
    
    if (rememberMe) {
      localStorage.setItem('collabcal_saved_email', email);
      localStorage.setItem('collabcal_saved_password', btoa(password));
    } else {
      localStorage.removeItem('collabcal_saved_email');
      localStorage.removeItem('collabcal_saved_password');
    }

    // Fetch and merge remote profile asynchronously without blocking
    if (this.db) {
      this.db.collection('users').doc(cred.user.uid).get().then(doc => {
        if (doc.exists && window.store) {
          window.store.setActiveUserFromFirebase({ id: doc.id, ...doc.data() }, rememberMe);
        } else {
          this.db.collection('users').doc(cred.user.uid).set(userProfile, { merge: true }).catch(console.warn);
          this.db.collection('team_members').doc(cred.user.uid).set(userProfile, { merge: true }).catch(console.warn);
        }
      }).catch(console.warn);
    }

    return cred.user;
  }

  async signInWithGoogle() {
    if (!this.auth) throw new Error('Firebase Auth is not initialized');
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope('profile');
    provider.addScope('email');

    // Create a timeout promise to prevent indefinite hanging in desktop Electron
    const popupPromise = this.auth.signInWithPopup(provider);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Google Sign-In popup timed out or is not supported in this desktop container. Please enter your name & Google email below for instant access.')), 10000);
    });

    const cred = await Promise.race([popupPromise, timeoutPromise]);
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
      window.store.setActiveUserFromFirebase(profile);
    }

    return cred.user;
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
        client: 'CollabCal Desktop',
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

  async signOut() {
    if (!this.auth) return;
    try {
      await this.auth.signOut();
    } catch (e) {
      console.warn('Sign out notice:', e);
    }
    this.currentUser = null;
    localStorage.removeItem('collabcal_saved_password');
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
