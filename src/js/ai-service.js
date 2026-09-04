class AIService {
  constructor() {
    this.apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent';
    this.chatHistory = [];
    this.usageHistory = [];
    this.deadKeys = new Map(); // Track rate-limited keys
  }

  async sendMessage(userMessage) {
    let apiKey = '';
    if (window.electronAPI && window.electronAPI.getAIKey) {
      apiKey = await window.electronAPI.getAIKey();
    } else {
      apiKey = window.FIREBASE_APP_CONFIG?.geminiApiKey;
    }

    if (!apiKey || apiKey === "PASTE_YOUR_GEMINI_API_KEY_HERE") {
      throw new Error("No Gemini API key found. Please ensure the backend .env is configured.");
    }

    const keyList = apiKey.includes(',') ? apiKey.split(',').map(k => k.trim()) : [apiKey];

    // --- Dynamic Rate Limiting Logic ---
    if (window.firebaseService) {
      try {
        const activeUsers = await window.firebaseService.getActiveAiUserCount();
        const now = Date.now();
        // Clean up expired dead keys
        for (const [key, unbanTime] of this.deadKeys.entries()) {
           if (now >= unbanTime) this.deadKeys.delete(key);
        }
        const activeKeysCount = Math.max(1, keyList.length - this.deadKeys.size);

        // Global free tier limit is ~15 RPM per key. Distribute this evenly among active users.
        const totalGlobalLimit = 15 * activeKeysCount;
        const dynamicLimit = Math.max(1, Math.floor(totalGlobalLimit / activeUsers));
        // Clean up old local history (older than 60s)
        this.usageHistory = this.usageHistory.filter(timestamp => now - timestamp < 60000);

        if (this.usageHistory.length >= dynamicLimit) {
          throw new Error(`The AI network is currently busy (${activeUsers} active user${activeUsers > 1 ? 's' : ''}). Your dynamic limit is ${dynamicLimit} request${dynamicLimit > 1 ? 's' : ''} per minute. Please wait a moment.`);
        }

        // Record this successful attempt
        this.usageHistory.push(now);
        window.firebaseService.pingAiActivity(); // Broadcast our activity to Firestore
      } catch (e) {
        if (e.message.includes('busy')) throw e; // Re-throw the rate limit error
        console.warn("Failed to check dynamic rate limits:", e);
      }
    }

    const state = store.getState();
    const activeTeam = store.getActiveTeam();
    const events = store.getActiveTeamEvents();
    
    const contextStr = `
You are Decibel, a helpful, concise AI personal assistant built into Noise (a collaborative team calendar app).
Today's date and time is: ${new Date().toLocaleString()}.
Active Team Workspace: ${activeTeam ? activeTeam.name : 'None'}

Current Tasks & Events for this workspace:
${events.length > 0 ? events.map(e => `- ID: ${e.id} | [${new Date(e.start).toLocaleString()}] ${e.title} (Assigned to: ${store.state.teamMembers.find(m => m.id === e.memberId)?.name || 'Unknown'})`).join('\n') : 'No events scheduled.'}

Please answer the user's questions based primarily on the calendar data above. Keep your responses short, friendly, and formatted in markdown.
If the user asks you to reschedule a task, use the rescheduleTask tool with the correct ID.
If the user asks you to send a message to a chat channel (like #general), use the sendChatMessage tool.
CRITICAL: When formatting times for the tool, you MUST use 24-hour local time format (YYYY-MM-DDTHH:mm). For example, 6:30 AM is '06:30', and 6:30 PM is '18:30'. Never use 'Z' or UTC. If they don't specify the new end time, make it 1 hour after the new start time.
    `.trim();

    this.chatHistory.push({ role: "user", parts: [{ text: userMessage }] });

    const tools = [{
      function_declarations: [{
        name: "rescheduleTask",
        description: "Reschedule an existing task or event to a new start and end time.",
        parameters: {
          type: "OBJECT",
          properties: {
            eventId: { type: "STRING", description: "The internal ID of the event to reschedule." },
            newStartIso: { type: "STRING", description: "The new start time in local datetime format (YYYY-MM-DDTHH:mm). Example: '2026-08-24T06:30'. Do NOT include timezone or 'Z'." },
            newEndIso: { type: "STRING", description: "The new end time in local datetime format (YYYY-MM-DDTHH:mm)." }
          },
          required: ["eventId", "newStartIso", "newEndIso"]
        }
      },
      {
        name: "sendChatMessage",
        description: "Send a message directly to a team chat channel.",
        parameters: {
          type: "OBJECT",
          properties: {
            channel: { type: "STRING", description: "The name of the channel (e.g. 'general')." },
            message: { type: "STRING", description: "The text message to send to the channel." }
          },
          required: ["channel", "message"]
        }
      }]
    }];

    while (true) {
      const payload = {
        system_instruction: { parts: [{ text: contextStr }] },
        contents: this.chatHistory,
        tools: tools
      };

      const attemptFetch = async (model) => {
        let lastResponse = null;

        for (const key of keyList) {
          if (!key) continue;
          
          // Skip keys that are currently in their 60-second timeout penalty
          if (this.deadKeys.has(key) && Date.now() < this.deadKeys.get(key)) continue;

          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
          lastResponse = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (lastResponse.ok) {
            this.deadKeys.delete(key); // Instantly revive if successful
            return lastResponse;
          }

          const clonedResponse = lastResponse.clone();
          const errData = await clonedResponse.json().catch(() => ({}));
          const isQuotaError = lastResponse.status === 429 || errData.error?.message?.toLowerCase().includes("quota");

          if (isQuotaError) {
             // Temporarily ban this key for 60 seconds so it doesn't inflate our token bucket capacity
             this.deadKeys.set(key, Date.now() + 60000);
             continue; 
          }

          // If it's a non-quota error (like 400 Bad Request), return it immediately
          return lastResponse;
        }
        return lastResponse;
      };

      try {
        let response = await attemptFetch('gemini-3.6-flash');
        
        if (!response.ok) {
          let errData = await response.json();
          let errMsg = errData.error?.message || "";
          let status = response.status;
          
          const isQuota = status === 429 || errMsg.toLowerCase().includes("quota");
          
          if (isQuota) {
             throw new Error("I am currently rate limited. Please wait about a minute before trying again.");
          }
          
          // If the model is deprecated, not found, or not supported, use dynamic fallback
          if (errMsg.includes("not found") || errMsg.includes("not supported") || errMsg.includes("deprecated")) {
             console.warn("Model unavailable, dynamically fetching available models...");
             const firstValidKey = apiKey.includes(',') ? apiKey.split(',')[0].trim() : apiKey;
             const modelsResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${firstValidKey}`);
             const modelsData = await modelsResponse.json();
             
             const validModel = modelsData.models?.find(m => m.supportedGenerationMethods?.includes('generateContent'));
             if (!validModel) throw new Error("No fallback models available.");
             
             const modelName = validModel.name.replace('models/', '');
             console.log("Dynamically resolved model:", modelName);
             response = await attemptFetch(modelName);
             
             if (!response.ok) {
               const finalErr = await response.json();
               const finalErrMsg = finalErr.error?.message || "";
               const suggestionMatch = finalErrMsg.match(/use models\/([^\s]+) for the latest/);
               
               if (suggestionMatch && suggestionMatch[1]) {
                   console.warn("Model deprecated. Following API suggestion to use:", suggestionMatch[1]);
                   response = await attemptFetch(suggestionMatch[1]);
                   if (!response.ok) {
                     const deepestErr = (await response.json()).error?.message || "";
                     if (deepestErr.toLowerCase().includes("quota") || response.status === 429) throw new Error("I am currently rate limited. Please wait about a minute before trying again.");
                     throw new Error(deepestErr || "Failed to communicate with AI.");
                   }
               } else {
                   if (finalErrMsg.toLowerCase().includes("quota") || response.status === 429) throw new Error("I am currently rate limited. Please wait about a minute before trying again.");
                   throw new Error(finalErrMsg || "Failed to communicate with AI.");
               }
             }
          } else {
             throw new Error(errMsg || "Failed to communicate with AI.");
          }
        }

        const data = await response.json();
        const parts = data.candidates?.[0]?.content?.parts || [];
        const funcCallParts = parts.filter(p => p.functionCall);
        
        if (funcCallParts.length > 0) {
          this.chatHistory.push({ role: "model", parts: parts });
          
          const functionResponses = [];

          for (const funcCallPart of funcCallParts) {
            const funcCall = funcCallPart.functionCall;
            
            if (funcCall.name === "rescheduleTask") {
              let { eventId, newStartIso, newEndIso } = funcCall.args;
              
              // Bulletproof: Force strip any trailing seconds or timezones (Z, +05:30) the AI stubbornly includes
              if (newStartIso && newStartIso.length >= 16) newStartIso = newStartIso.substring(0, 16);
              if (newEndIso && newEndIso.length >= 16) newEndIso = newEndIso.substring(0, 16);

              try {
                store.updateEvent(eventId, { start: newStartIso, end: newEndIso });
                functionResponses.push({ functionResponse: { name: funcCall.name, response: { name: funcCall.name, content: { status: "success" } } } });
              } catch (e) {
                functionResponses.push({ functionResponse: { name: funcCall.name, response: { name: funcCall.name, content: { error: e.message } } } });
              }
            } else if (funcCall.name === "sendChatMessage") {
              const { channel, message } = funcCall.args;
              try {
                if (!window.firebaseService) throw new Error("Firebase service not initialized");
                const activeTeam = store.getActiveTeam();
                if (!activeTeam) throw new Error("No active team");
                const state = store.getState();
                
                await window.firebaseService.sendChatMessage(activeTeam.id, channel, {
                  text: message,
                  senderId: state.activeUserId,
                  createdAt: Date.now()
                });
                
                functionResponses.push({ functionResponse: { name: funcCall.name, response: { name: funcCall.name, content: { status: "success" } } } });
              } catch (e) {
                functionResponses.push({ functionResponse: { name: funcCall.name, response: { name: funcCall.name, content: { error: e.message } } } });
              }
            }
          }
          
          if (window.app && typeof window.app.render === 'function') window.app.render();

          this.chatHistory.push({
            role: "user",
            parts: functionResponses
          });
          // Loop continues back to the top of while(true)
        } else {
          const textPart = parts.find(p => p.text);
          const aiText = textPart?.text || "I couldn't process that.";
          this.chatHistory.push({ role: "model", parts: parts });
          return aiText;
        }
      } catch (err) {
        this.chatHistory.pop();
        console.error("AI Error:", err);
        throw err;
      }
    }
  }

  clearHistory() {
    this.chatHistory = [];
  }
}

window.aiService = new AIService();
