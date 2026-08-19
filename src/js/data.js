/* ==========================================================================
   CollabCal Desktop - Date Utilities, Data Definitions & Initial Schema
   ========================================================================== */

const DateUtils = {
  // Format a Date object (or timestamp / date string) to local "YYYY-MM-DDTHH:mm" for <input type="datetime-local">
  formatLocalDateTime(d) {
    if (!d) return '';
    const date = (d instanceof Date) ? d : new Date(d);
    if (isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  },

  // Format a Date object (or timestamp / date string) to local "YYYY-MM-DD" for calendar cells and day keys
  formatLocalDate(d) {
    if (!d) return '';
    const date = (d instanceof Date) ? d : new Date(d);
    if (isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  // Parse a local "YYYY-MM-DDTHH:mm" or "YYYY-MM-DD" string safely into a Date object in local time
  parseLocalDateTime(str) {
    if (!str) return new Date();
    if (typeof str === 'string' && str.includes('T')) {
      const [datePart, timePart] = str.split('T');
      const [y, m, d] = datePart.split('-').map(Number);
      const [h, min] = (timePart || '00:00').split(':').map(Number);
      return new Date(y, m - 1, d, h || 0, min || 0, 0);
    } else if (typeof str === 'string' && str.includes('-') && str.length === 10) {
      const [y, m, d] = str.split('-').map(Number);
      return new Date(y, m - 1, d, 0, 0, 0);
    }
    const parsed = new Date(str);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  },

  // Add minutes to a local datetime string and return local "YYYY-MM-DDTHH:mm"
  addMinutes(localDateTimeStr, minutes) {
    const d = this.parseLocalDateTime(localDateTimeStr);
    d.setMinutes(d.getMinutes() + minutes);
    return this.formatLocalDateTime(d);
  },

  // Calculate duration in minutes between two local datetime strings
  getDurationMinutes(startStr, endStr) {
    if (!startStr || !endStr) return 0;
    const s = this.parseLocalDateTime(startStr);
    const e = this.parseLocalDateTime(endStr);
    return Math.round((e.getTime() - s.getTime()) / (60 * 1000));
  }
};

window.DateUtils = DateUtils;

const INITIAL_TEAM_MEMBERS = [];

const INITIAL_TEAMS = [
  {
    id: 'team_general',
    name: 'My Workspace',
    code: 'WRK-' + Math.random().toString(36).substr(2, 6).toUpperCase(),
    description: 'Personal private calendar workspace',
    icon: '⚡',
    color: '#52525b',
    ownerId: 'user_default',
    memberIds: [],
    isPrivate: true,
    createdAt: new Date().toISOString()
  }
];

const INITIAL_EVENTS = [];

