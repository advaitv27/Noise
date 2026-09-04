/* ==========================================================================
   Noise Desktop - Core Calendar View Component (Month / Week / Day)
   ========================================================================== */

class CalendarView {
  constructor(containerEl) {
    this.container = containerEl;
  }

  render() {
    const state = store.getState();
    const { currentView, currentDate } = state;

    this.container.innerHTML = `
      <div class="calendar-wrapper">
        <!-- Control Header -->
        <div class="calendar-controls">
          <div class="calendar-nav-group">
            <button class="btn btn-secondary btn-sm" id="cal-prev-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <button class="btn btn-secondary btn-sm" id="cal-today-btn">Today</button>
            <button class="btn btn-secondary btn-sm" id="cal-next-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
            <h2 class="calendar-current-title">${this.getFormattedTitle(currentDate, currentView)}</h2>
          </div>

          <div style="display: flex; align-items: center; gap: 12px;">
            <div class="view-switcher">
              <button class="view-btn ${currentView === 'month' ? 'active' : ''}" data-view="month">Month</button>
              <button class="view-btn ${currentView === 'week' ? 'active' : ''}" data-view="week">Week</button>
              <button class="view-btn ${currentView === 'day' ? 'active' : ''}" data-view="day">Day</button>
            </div>

            <button class="btn btn-primary" id="btn-add-event">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              Add Event
            </button>
          </div>
        </div>

        <!-- Main Grid -->
        <div class="calendar-grid-container" id="calendar-grid-body">
          ${this.renderGridBody(currentView, currentDate, state)}
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  getFormattedTitle(date, view) {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    if (view === 'month') {
      return `${months[date.getMonth()]} ${date.getFullYear()}`;
    } else if (view === 'week') {
      const startOfWeek = new Date(date);
      startOfWeek.setDate(date.getDate() - date.getDay());
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      return `${months[startOfWeek.getMonth()]} ${startOfWeek.getDate()} - ${months[endOfWeek.getMonth()]} ${endOfWeek.getDate()}, ${date.getFullYear()}`;
    } else {
      return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    }
  }

  renderGridBody(view, currentDate, state) {
    if (view === 'month') {
      return this.renderMonthView(currentDate, state);
    } else if (view === 'week') {
      return this.renderWeekView(currentDate, state);
    } else {
      return this.renderDayView(currentDate, state);
    }
  }

  // --- MONTH VIEW ---
  renderMonthView(currentDate, state) {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const teamEvents = store.getActiveTeamEvents();
    const visibleEvents = teamEvents.filter(e => state.visibleMemberIds.has(e.memberId));
    const conflictingIds = ConflictEngine.getConflictingEventIds(teamEvents);

    let html = `
      <div class="calendar-weekday-header">
        <div class="weekday-cell">Sun</div>
        <div class="weekday-cell">Mon</div>
        <div class="weekday-cell">Tue</div>
        <div class="weekday-cell">Wed</div>
        <div class="weekday-cell">Thu</div>
        <div class="weekday-cell">Fri</div>
        <div class="weekday-cell">Sat</div>
      </div>
      <div class="month-grid">
    `;

    const totalCells = 35; // 5 weeks x 7 days
    const today = new Date();

    for (let i = 0; i < totalCells; i++) {
      let dayNumber, isOtherMonth = false, cellDate;

      if (i < firstDay) {
        dayNumber = daysInPrevMonth - firstDay + i + 1;
        isOtherMonth = true;
        cellDate = new Date(year, month - 1, dayNumber);
      } else if (i >= firstDay + daysInMonth) {
        dayNumber = i - (firstDay + daysInMonth) + 1;
        isOtherMonth = true;
        cellDate = new Date(year, month + 1, dayNumber);
      } else {
        dayNumber = i - firstDay + 1;
        cellDate = new Date(year, month, dayNumber);
      }

      const isToday = cellDate.toDateString() === today.toDateString();
      const dateIso = DateUtils.formatLocalDate(cellDate);

      // Get events on this date
      const dayEvents = visibleEvents.filter(e => e.start.startsWith(dateIso));

      html += `
        <div class="day-cell ${isOtherMonth ? 'other-month' : ''} ${isToday ? 'today' : ''}" data-date="${dateIso}">
          <div class="day-header-row">
            <span class="day-number">${dayNumber}</span>
            ${dayEvents.length > 0 ? `<span class="day-count-badge">${dayEvents.length}</span>` : ''}
          </div>
          <div class="day-events-container">
            ${dayEvents.slice(0, 3).map(e => {
              const member = state.teamMembers.find(m => m.id === e.memberId) || { color: '#52525b', avatar: '?' };
              const hasConflict = conflictingIds.has(e.id);
              const timeStr = new Date(e.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).replace(' ', '');

              return `
                <div class="event-pill ${hasConflict ? 'has-conflict' : ''}" 
                     ${e.memberId === state.activeUserId ? 'draggable="true"' : ''}
                     style="background: linear-gradient(90deg, ${member.color}35 0%, ${member.color}12 100%); border: 1px solid ${member.color}45; border-left: 3.5px solid ${member.color}; color: var(--text-primary);"
                     data-event-id="${e.id}"
                     data-tooltip-title="${e.title}"
                     data-tooltip-member="${member.name}"
                     data-tooltip-time="${timeStr}">
                  ${member.avatarUrl ? `<img src="${member.avatarUrl}" class="event-pill-avatar" style="object-fit:cover; background:transparent;">` : `<span class="event-pill-avatar" style="background-color: ${member.color};">${member.avatar}</span>`}
                  <span class="event-pill-time">${timeStr}</span>
                  <span class="event-pill-title">${e.title}</span>
                  ${hasConflict ? `<span class="event-conflict-icon" title="Schedule Conflict Alert">⚠️</span>` : ''}
                </div>
              `;
            }).join('')}
            ${dayEvents.length > 3 ? `<div class="more-events-tag">+${dayEvents.length - 3} more</div>` : ''}
          </div>
        </div>
      `;
    }

    html += `</div>`;
    return html;
  }

  // --- WEEK VIEW ---
  renderWeekView(currentDate, state) {
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      days.push(d);
    }

    const todayStr = new Date().toDateString();
    const teamEvents = store.getActiveTeamEvents();
    const visibleEvents = teamEvents.filter(e => state.visibleMemberIds.has(e.memberId));
    const conflictingIds = ConflictEngine.getConflictingEventIds(teamEvents);

    let html = `
      <div class="week-view-wrapper">
        <div class="week-grid-header">
          <div class="time-header-cell">GMT</div>
          ${days.map(d => `
            <div class="week-day-header ${d.toDateString() === todayStr ? 'today' : ''}">
              <div style="font-size: 11px; text-transform: uppercase;">${d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
              <div style="font-size: 16px; font-weight: 700;">${d.getDate()}</div>
            </div>
          `).join('')}
        </div>

        <div class="week-time-body">
          ${[9, 10, 11, 12, 13, 14, 15, 16, 17].map(hour => `
            <div class="time-row">
              <div class="time-label">${hour}:00</div>
              ${days.map(d => {
                const dateIso = DateUtils.formatLocalDate(d);
                const hourEvents = visibleEvents.filter(e => {
                  if (!e.start.startsWith(dateIso)) return false;
                  const eHour = new Date(e.start).getHours();
                  return eHour === hour;
                });

                return `
                  <div class="time-slot-cell" data-date="${dateIso}" data-hour="${hour}">
                    ${hourEvents.map(e => {
                      const member = state.teamMembers.find(m => m.id === e.memberId) || { color: '#52525b', avatar: '?' };
                      const hasConflict = conflictingIds.has(e.id);
                      return `
                        <div class="event-pill ${hasConflict ? 'has-conflict' : ''}" 
                             style="background-color: ${member.color}30; border-left: 3px solid ${member.color}; color: var(--text-primary); margin-bottom: 2px;"
                             data-event-id="${e.id}">
                          <span class="event-pill-title">${e.title}</span>
                        </div>
                      `;
                    }).join('')}
                  </div>
                `;
              }).join('')}
            </div>
          `).join('')}
        </div>
      </div>
    `;

    return html;
  }

  // --- DAY VIEW ---
  renderDayView(currentDate, state) {
    const dateIso = DateUtils.formatLocalDate(currentDate);
    const teamEvents = store.getActiveTeamEvents();
    const teamMembers = store.getActiveTeamMembers();
    const dayEvents = teamEvents.filter(e => state.visibleMemberIds.has(e.memberId) && e.start.startsWith(dateIso));
    const conflictingIds = ConflictEngine.getConflictingEventIds(teamEvents);
    const freeWindows = ConflictEngine.getTeamFreeWindowsForDay(teamEvents, teamMembers, dateIso);

    let html = `
      <div style="padding: 20px; display: flex; flex-direction: column; gap: 20px; height: 100%; overflow-y: auto;">
        <!-- Availability Bar -->
        <div style="background: var(--bg-surface-elevated); border: 1px solid var(--border-color); border-radius: 12px; padding: 14px 18px;">
          <div style="font-weight: 700; font-size: 13px; color: var(--text-primary); margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between;">
            <span>🤝 Team Free Windows (${currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })})</span>
            <span style="font-size: 11px; color: var(--text-secondary);">When all members are available</span>
          </div>

          <div style="display: flex; flex-wrap: wrap; gap: 8px;">
            ${freeWindows.length > 0 ? freeWindows.map(w => `
              <div style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 8px; padding: 8px 12px; display: flex; align-items: center; gap: 6px;">
                <span style="font-size: 12px; font-weight: 700; color: var(--status-success);">${w.startStr.replace(' ', '')}</span>
                <span style="font-size: 12px; font-weight: 600; color: var(--text-secondary); opacity: 0.8;">to</span>
                <span style="font-size: 12px; font-weight: 700; color: var(--status-success);">${w.endStr.replace(' ', '')}</span>
              </div>
            `).join('') : `
              <div style="font-size: 12px; color: var(--text-secondary); font-style: italic;">No common free time available today.</div>
            `}
          </div>
        </div>

        <!-- Hourly Schedule -->
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <h3 style="font-size: 15px; font-weight: 700; color: var(--text-primary);">Scheduled Tasks (${dayEvents.length})</h3>

          ${dayEvents.length === 0 ? `
            <div style="text-align: center; padding: 40px; color: var(--text-muted); border: 2px dashed var(--border-color); border-radius: 12px;">
              No events scheduled for this day. Click "+ Add Event" to create one!
            </div>
          ` : dayEvents.map(e => {
            const member = state.teamMembers.find(m => m.id === e.memberId) || { name: 'Member', color: '#52525b', avatar: '?' };
            const hasConflict = conflictingIds.has(e.id);
            const startTimeStr = new Date(e.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const endTimeStr = new Date(e.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            return `
              <div style="background: var(--bg-surface-elevated); border: 1px solid ${hasConflict ? 'var(--status-conflict)' : 'var(--border-color)'}; border-left: 4px solid ${member.color}; border-radius: 12px; padding: 16px; display: flex; align-items: center; justify-content: space-between; cursor: pointer;" data-event-id="${e.id}">
                <div style="display: flex; align-items: center; gap: 16px;">
                  <div style="width: 26px; height: 26px; border-radius: 50%; background: ${member.avatarUrl ? 'transparent' : member.color}; color: #ffffff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 10px;">
                    ${member.avatarUrl ? `<img src="${member.avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : member.avatar}
                  </div>
                  <div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <h4 style="font-size: 16px; font-weight: 700; color: var(--text-primary);">${e.title}</h4>
                      ${hasConflict ? `<span class="badge badge-rose">⚠️ Conflict Alert</span>` : ''}
                      <span class="badge" style="background: ${member.color}20; color: ${member.color};">${e.category || 'Task'}</span>
                    </div>
                    <p style="font-size: 13px; color: var(--text-secondary); margin-top: 4px;">${e.description || 'No description'}</p>
                    <div style="font-size: 12px; color: var(--text-muted); margin-top: 6px;">
                      🕒 ${startTimeStr} - ${endTimeStr} • 📍 ${e.location || 'Remote'} • Lead: <strong>${member.name}</strong>
                    </div>
                  </div>
                </div>

                ${e.memberId === state.activeUserId ? `
                <button class="btn btn-ghost btn-sm btn-delete-event" data-event-id="${e.id}">
                  🗑️
                </button>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    return html;
  }

  attachEventListeners() {
    const wrapper = this.container.querySelector('.calendar-wrapper');
    if (!wrapper) return;

    wrapper.querySelector('#cal-prev-btn')?.addEventListener('click', () => store.navigateCalendar(-1));
    wrapper.querySelector('#cal-next-btn')?.addEventListener('click', () => store.navigateCalendar(1));
    wrapper.querySelector('#cal-today-btn')?.addEventListener('click', () => store.setCurrentDate(new Date()));

    wrapper.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        store.setCurrentView(e.target.getAttribute('data-view'));
      });
    });

    wrapper.querySelector('#btn-add-event')?.addEventListener('click', () => {
      AppRouter.openEventModal();
    });

    // Event Pill Click to view/edit
    wrapper.querySelectorAll('.event-pill, [data-event-id]').forEach(pill => {
      pill.addEventListener('click', (e) => {
        e.stopPropagation();
        if (e.target.classList.contains('btn-delete-event')) {
          const eventId = e.target.getAttribute('data-event-id');
          AppRouter.confirm('Delete Event', 'Delete this event?', () => {
            if (window.firebaseService && window.firebaseService.isInitialized) {
              window.firebaseService.deleteEvent(eventId).catch(console.warn);
            }
            store.deleteEvent(eventId);
          });
          return;
        }

        const eventId = pill.getAttribute('data-event-id');
        if (eventId) {
          AppRouter.openEventModal(eventId);
        }
      });
    });

    // Day cell click to add event on date
    wrapper.querySelectorAll('.day-cell[data-date]').forEach(cell => {
      cell.addEventListener('click', (e) => {
        if (e.target.closest('.event-pill') || e.target.closest('.more-events-tag')) return;
        const dateIso = cell.getAttribute('data-date');
        AppRouter.openEventModal(null, dateIso);
      });
    });

    // +X More Tasks click -> Opens Day Schedule Detail Modal!
    wrapper.querySelectorAll('.more-events-tag').forEach(tag => {
      tag.addEventListener('click', (e) => {
        e.stopPropagation();
        const dayCell = tag.closest('.day-cell');
        const dateIso = dayCell.getAttribute('data-date');
        this.openDayDetailModal(dateIso);
      });
    });

    // Attach Drag and Drop handlers
    this.attachDragAndDropHandlers(wrapper);
  }

  attachDragAndDropHandlers(wrapper) {
    let draggedEventId = null;

    wrapper.querySelectorAll('.event-pill[draggable="true"]').forEach(pill => {
      pill.addEventListener('dragstart', (e) => {
        draggedEventId = pill.getAttribute('data-event-id');
        e.dataTransfer.setData('text/plain', draggedEventId);
        pill.classList.add('is-dragging');
      });

      pill.addEventListener('dragend', () => {
        pill.classList.remove('is-dragging');
      });
    });

    wrapper.querySelectorAll('.day-cell[data-date]').forEach(cell => {
      cell.addEventListener('dragover', (e) => {
        e.preventDefault();
        cell.classList.add('drag-over');
      });

      cell.addEventListener('dragleave', () => {
        cell.classList.remove('drag-over');
      });

      cell.addEventListener('drop', (e) => {
        e.preventDefault();
        cell.classList.remove('drag-over');
        if (!draggedEventId) return;

        const targetDateIso = cell.getAttribute('data-date');
        const state = store.getState();
        const eventToMove = state.events.find(ev => ev.id === draggedEventId);

        if (eventToMove) {
          const oldStart = DateUtils.parseLocalDateTime(eventToMove.start);
          const oldEnd = DateUtils.parseLocalDateTime(eventToMove.end);
          const durationMs = oldEnd.getTime() - oldStart.getTime();

          const oldHours = String(oldStart.getHours()).padStart(2, '0');
          const oldMinutes = String(oldStart.getMinutes()).padStart(2, '0');
          const targetStart = DateUtils.parseLocalDateTime(`${targetDateIso}T${oldHours}:${oldMinutes}`);
          const targetEnd = new Date(targetStart.getTime() + durationMs);

          const newStartIso = DateUtils.formatLocalDateTime(targetStart);
          const newEndIso = DateUtils.formatLocalDateTime(targetEnd);

          store.updateEvent(draggedEventId, { start: newStartIso, end: newEndIso });

          ToastNotificationManager.show({
            title: '📅 Task Shifted',
            message: `"${eventToMove.title}" moved to ${new Date(targetDateIso).toLocaleDateString([], { month: 'short', day: 'numeric' })}`
          });
        }
        draggedEventId = null;
      });
    });
  }

  // --- DAY SCHEDULE DETAIL MODAL (For +X More click) ---
  openDayDetailModal(dateIso) {
    const state = store.getState();
    const dateObj = new Date(dateIso);
    const formattedDateStr = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const dayEvents = state.events.filter(e => e.start.startsWith(dateIso));
    const conflictingIds = ConflictEngine.getConflictingEventIds(state.events);

    AppRouter.openModal(`📅 Team Schedule — ${formattedDateStr}`, (body) => {
      body.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 16px;">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <p style="font-size: 13px; color: var(--text-secondary);">
              Showing all ${dayEvents.length} team events scheduled for this day.
            </p>
            <div style="display: flex; gap: 8px;">
              <button class="btn btn-secondary btn-sm" id="modal-day-view-jump">View Hourly Grid</button>
              <button class="btn btn-primary btn-sm" id="modal-day-add-event">➕ Add Task</button>
            </div>
          </div>

          <div style="display: flex; flex-direction: column; gap: 10px; max-height: 50vh; overflow-y: auto;">
            ${dayEvents.length === 0 ? `
              <div style="text-align: center; padding: 24px; color: var(--text-muted);">No events scheduled on this date.</div>
            ` : dayEvents.map(e => {
              const member = state.teamMembers.find(m => m.id === e.memberId) || { name: 'Member', color: '#52525b', avatar: '?' };
              const hasConflict = conflictingIds.has(e.id);
              const startStr = new Date(e.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              const endStr = new Date(e.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

              return `
                <div style="background: var(--bg-surface-elevated); border: 1px solid ${hasConflict ? 'var(--status-conflict)' : 'var(--border-color)'}; border-left: 4px solid ${member.color}; border-radius: 10px; padding: 12px 14px; display: flex; align-items: center; justify-content: space-between;">
                  <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 26px; height: 26px; border-radius: 50%; background: ${member.avatarUrl ? 'transparent' : member.color}; color: #ffffff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 10px; margin-right: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.2);">
                      ${member.avatarUrl ? `<img src="${member.avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : member.avatar}
                    </div>
                    <div>
                      <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-weight: 700; font-size: 14px; color: var(--text-primary);">${e.title}</span>
                        ${hasConflict ? `<span class="badge badge-rose">⚠️ Conflict</span>` : ''}
                      </div>
                      <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
                        🕒 ${startStr} - ${endStr} • Assigned to <strong>${member.name}</strong>
                      </div>
                    </div>
                  </div>

                  <div style="display: flex; gap: 6px;">
                    <button class="btn btn-secondary btn-sm btn-modal-edit-evt" data-event-id="${e.id}">${e.memberId === state.activeUserId ? 'Edit' : 'View'}</button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;

      body.querySelector('#modal-day-add-event')?.addEventListener('click', () => {
        AppRouter.closeModal();
        AppRouter.openEventModal(null, dateIso);
      });

      body.querySelector('#modal-day-view-jump')?.addEventListener('click', () => {
        AppRouter.closeModal();
        store.setCurrentDate(dateObj);
        store.setCurrentView('day');
      });

      body.querySelectorAll('.btn-modal-edit-evt').forEach(btn => {
        btn.addEventListener('click', () => {
          const eventId = btn.getAttribute('data-event-id');
          AppRouter.closeModal();
          AppRouter.openEventModal(eventId);
        });
      });
    });
  }

  static renderSidebarMiniCalendar(containerEl) {
    if (!containerEl) return;
    const state = store.getState();
    const date = state.currentDate;
    const year = date.getFullYear();
    const month = date.getMonth();

    const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();

    let html = `
      <div class="mini-cal-header">
        <span>${monthsShort[month]} ${year}</span>
        <div class="mini-cal-nav">
          <button class="mini-cal-btn" id="mini-prev">‹</button>
          <button class="mini-cal-btn" id="mini-next">›</button>
        </div>
      </div>
      <div class="mini-cal-grid">
        <div class="mini-cal-day-label">S</div>
        <div class="mini-cal-day-label">M</div>
        <div class="mini-cal-day-label">T</div>
        <div class="mini-cal-day-label">W</div>
        <div class="mini-cal-day-label">T</div>
        <div class="mini-cal-day-label">F</div>
        <div class="mini-cal-day-label">S</div>
    `;

    // Fill blank cells before month starts
    for (let i = 0; i < firstDay; i++) {
      html += `<div class="mini-cal-cell other"></div>`;
    }

    const todayDate = new Date().getDate();
    const isCurrentMonth = new Date().getMonth() === month && new Date().getFullYear() === year;

    for (let d = 1; d <= daysInMonth; d++) {
      const isToday = isCurrentMonth && d === todayDate;
      html += `<div class="mini-cal-cell ${isToday ? 'today' : ''}" data-day="${d}">${d}</div>`;
    }

    html += `</div>`;
    containerEl.innerHTML = html;

    containerEl.querySelector('#mini-prev')?.addEventListener('click', () => store.navigateCalendar(-1));
    containerEl.querySelector('#mini-next')?.addEventListener('click', () => store.navigateCalendar(1));

    containerEl.querySelectorAll('.mini-cal-cell[data-day]').forEach(cell => {
      cell.addEventListener('click', () => {
        const day = parseInt(cell.getAttribute('data-day'), 10);
        const targetDate = new Date(year, month, day);
        store.setCurrentDate(targetDate);
      });
    });
  }
}
