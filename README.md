# ⚡ Noise

> **Next-Gen Collaborative Desktop Calendar & AI Assistant**

Noise is a professional, Electron-based desktop application designed for teams. It seamlessly integrates real-time calendar scheduling, team collaboration (chat), and an intelligent AI assistant named **Decibel** into a sleek, customized desktop experience.

---

## 🌟 Key Features

### 🤖 Decibel AI Assistant
Powered by the Google Gemini API, Decibel is a context-aware personal assistant that lives right in your calendar workspace.
- **Context-Aware:** Knows about your active team, events, and schedules.
- **Automated Actions:** Ask Decibel to reschedule tasks or send updates directly to team chat channels.
- **Smart Rate Limiting:** Built-in dynamic rate-limiting system that optimally distributes Gemini API usage among active team members.

### 📅 Advanced Calendar & Scheduling
- **Real-Time Sync:** Powered by Firebase, changes update instantly across all team members' screens.
- **Task Management:** Create, assign, and track tasks/events across different team workspaces.
- **Conflict Resolution:** Built-in tools to manage schedule conflicts.
- **Data Export:** Export your calendar data easily into `.json` or `.ics` formats.

### 💬 Team Collaboration
- **Workspaces & Channels:** Organize your projects with distinct teams and dedicated chat channels.
- **Real-Time Chat:** Integrated messaging to keep the conversation tied to your schedule.

### 💻 Desktop-First Experience
- **Custom UI:** A completely frameless, professional window design tailored for desktop environments.
- **System Tray Integration:** Run in the background and access Noise quickly from your system tray.
- **Native Notifications:** Get native desktop alerts for upcoming events and messages.
- **Auto-Updates:** Built-in automatic updates via `electron-updater` so you always have the latest version.
- **Launch on Startup:** Configurable settings to start Noise right when your computer boots up.

---

## 🛠️ Tech Stack

Noise is built with performance and simplicity in mind:

- **Frontend:** Vanilla JavaScript, HTML5, CSS3 (No heavy UI frameworks)
- **Desktop Framework:** Electron
- **Backend & Database:** Firebase (Firestore, Authentication, Storage, Hosting)
- **AI Integration:** Google Gemini API (Gemini 3.6 Flash)
- **Build Tools:** Electron-Builder

---

## 📁 Project Structure

```
Noise/
├── main.js                 # Electron main process (Window management, IPC, Auto-updater)
├── preload.js              # Secure IPC bridge between Main and Renderer
├── firebase.json           # Firebase configuration
├── firestore.rules         # Security rules for the Firestore database
├── package.json            # App configuration and dependencies
└── src/                    # Frontend source code
    ├── assets/             # Icons, images, and fonts
    ├── html/               # UI components and templates
    ├── index.html          # Main application entry point
    ├── js/                 # Vanilla JS controllers and services
    │   ├── ai-service.js   # Gemini AI integration and rate-limiting
    │   ├── app.js          # Core application logic
    │   ├── calendar.js     # Calendar rendering and logic
    │   ├── chat.js         # Chat interface and messaging logic
    │   ├── firebase-*      # Firebase initialization and services
    │   ├── store.js        # State management
    │   └── team.js         # Workspace and team management
    └── styles/             # Application stylesheets
```

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v16 or higher recommended)
- A Firebase project
- A Google Gemini API Key

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/noise-desktop.git
   cd noise-desktop
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   Create a `.env` file in the root directory and add your Gemini API key:
   ```env
   GEMINI_API_KEY=your_api_key_here
   ```
   *(Note: The app also supports fetching the API key securely via Firebase config).*

4. **Run the App in Development Mode**
   ```bash
   npm start
   ```

### Building for Production

To build the executable for Windows:
```bash
# Build standard installer
npm run dist

# Build portable executable
npm run dist:portable

# Build unpacked directory
npm run dist:dir
```
*The compiled app will be placed in the `dist` folder.*

---

## 🛡️ License & Credits

- **Author:** Broklyn Studios
- **License:** MIT

---
*Noise — Work together, beautifully.*
