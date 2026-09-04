/* ==========================================================================
   Noise Desktop - Conflict Engine & Group Availability Calculator
   ========================================================================== */

class ConflictEngine {
  /**
   * Detects schedule conflicts across all events or for a specific member.
   * Two events conflict if they share at least one attendee or member AND overlap in time.
   */
  static detectConflicts(events) {
    const conflicts = [];
    const n = events.length;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const e1 = events[i];
        const e2 = events[j];

        const start1 = new Date(e1.start).getTime();
        const end1 = new Date(e1.end).getTime();
        const start2 = new Date(e2.start).getTime();
        const end2 = new Date(e2.end).getTime();

        // Check time overlap: (start1 < end2) && (start2 < end1)
        if (start1 < end2 && start2 < end1) {
          // Check if same creator member or shared attendees
          const sharedPeople = (e1.attendees || [e1.memberId]).filter(id => 
            (e2.attendees || [e2.memberId]).includes(id) || e2.memberId === id
          );

          if (e1.memberId === e2.memberId || sharedPeople.length > 0) {
            conflicts.push({
              event1: e1,
              event2: e2,
              overlappingPeople: Array.from(new Set([e1.memberId, e2.memberId, ...sharedPeople]))
            });
          }
        }
      }
    }

    return conflicts;
  }

  /**
   * Returns set of event IDs that are involved in a conflict.
   */
  static getConflictingEventIds(events) {
    const conflicts = this.detectConflicts(events);
    const set = new Set();
    conflicts.forEach(c => {
      set.add(c.event1.id);
      set.add(c.event2.id);
    });
    return set;
  }

  /**
   * Calculates team availability for a given day.
   * Finds 30-min window slots where ALL active team members are free.
   */
  static getTeamAvailabilityForDay(events, teamMembers, targetDateStr) {
    // Full 24-hour day (0 to 24)
    const slots = [];
    const dateObj = DateUtils.parseLocalDateTime(targetDateStr);
    const dayYear = dateObj.getFullYear();
    const dayMonth = dateObj.getMonth();
    const dayDate = dateObj.getDate();

    for (let hour = 6; hour < 28; hour++) {
      for (let min = 0; min < 60; min += 30) {
        const slotStart = new Date(dayYear, dayMonth, dayDate, hour, min).getTime();
        const slotEnd = slotStart + (30 * 60 * 1000);

        // Check how many team members are busy during this slot
        const busyMembers = new Set();

        events.forEach(e => {
          const eStart = new Date(e.start).getTime();
          const eEnd = new Date(e.end).getTime();

          if (slotStart < eEnd && slotEnd > eStart) {
            busyMembers.add(e.memberId);
            if (e.attendees) {
              e.attendees.forEach(att => busyMembers.add(att));
            }
          }
        });

        const freeMembersCount = teamMembers.length - busyMembers.size;
        const isAllFree = busyMembers.size === 0;

        const currentDayHour = hour % 24;
        const ampm = currentDayHour >= 12 ? 'PM' : 'AM';
        const displayHour = currentDayHour % 12 || 12;

        const endHour = min === 30 ? hour + 1 : hour;
        const endMin = min === 30 ? 0 : 30;
        const endDayHour = endHour % 24;
        const endAmpm = endDayHour >= 12 ? 'PM' : 'AM';
        const endDisplayHour = endDayHour % 12 || 12;

        slots.push({
          hour,
          min: min === 0 ? '00' : '30',
          timeStr: `${displayHour}:${min === 0 ? '00' : '30'} ${ampm}`,
          endTimeStr: `${endDisplayHour}:${endMin === 0 ? '00' : '30'} ${endAmpm}`,
          busyCount: busyMembers.size,
          freeCount: freeMembersCount,
          isAllFree
        });
      }
    }

    return slots;
  }

  /**
   * Generates continuous windows of free time for the team on a given day.
   */
  static getTeamFreeWindowsForDay(events, teamMembers, dateIso) {
    const slots = this.getTeamAvailabilityForDay(events, teamMembers, dateIso);
    
    const freeWindows = [];
    let currentWindow = null;

    slots.forEach((slot, index) => {
      if (slot.isAllFree) {
        if (!currentWindow) {
          currentWindow = { startStr: slot.timeStr, endStr: slot.endTimeStr };
        } else {
          currentWindow.endStr = slot.endTimeStr;
        }
      } else {
        if (currentWindow) {
          freeWindows.push(currentWindow);
          currentWindow = null;
        }
      }
    });

    if (currentWindow) {
      freeWindows.push(currentWindow);
    }

    return freeWindows;
  }
}
