// Get configuration
const config = window.CONFIG?.getBrowserConfig() || {
  FRONTEND_URL: 'http://localhost:3000',
  AGENT_URL: 'http://localhost:3001',
  AGENT_EMBEDDED_URL: 'http://localhost:3001/embedded'
};

let frontendIframe = null;
let agentIframe = null;
let currentFrontendUrl = config.FRONTEND_URL;
let lastKnownUrl = null;
let urlCheckInterval = null;
// Removed extractedUrls Set - now extract on every URL change
let agentVisible = false;
let count = 0;
let pendingDomRequest = null;
let lastExtractRequest = 0;

// State persistence for container
const CONTAINER_STATE_KEY = 'iframe_container_state';

// Save container state
function saveContainerState() {
  try {
    const state = {
      currentFrontendUrl: currentFrontendUrl,
      lastKnownUrl: lastKnownUrl,
      agentVisible: agentVisible,
      timestamp: Date.now()
    };
    sessionStorage.setItem(CONTAINER_STATE_KEY, JSON.stringify(state));
    console.log('💾 Container state saved:', state);
  } catch (error) {
    console.warn('Failed to save container state:', error);
  }
}

// Restore container state
function restoreContainerState() {
  try {
    const stored = sessionStorage.getItem(CONTAINER_STATE_KEY);
    if (!stored) return false;

    const state = JSON.parse(stored);
    
    // Only restore if recent (within 30 seconds)
    if (Date.now() - state.timestamp > 30000) {
      sessionStorage.removeItem(CONTAINER_STATE_KEY);
      return false;
    }

    console.log('🔄 Restoring container state:', state);
    
    // Restore URLs
    if (state.currentFrontendUrl && state.currentFrontendUrl !== config.FRONTEND_URL) {
      currentFrontendUrl = state.currentFrontendUrl;
      lastKnownUrl = state.lastKnownUrl;
    }
    
    // Restore agent visibility
    if (state.agentVisible) {
      agentVisible = state.agentVisible;
    }

    return true;
  } catch (error) {
    console.warn('Failed to restore container state:', error);
    return false;
  }
}

function toggleAgent() {
  const toggleButton = document.getElementById("toggle-button");
  const container = document.getElementById("container");

  agentVisible = !agentVisible;

  if (agentVisible) {
    agentIframe.classList.remove("hidden");
    toggleButton.classList.remove("hidden");
    container.classList.add("agent-open");
    toggleButton.innerHTML = `<svg viewBox="0 0 24 24">
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
    </svg>`;
  } else {
    agentIframe.classList.add("hidden");
    toggleButton.classList.add("hidden");
    container.classList.remove("agent-open");
    toggleButton.innerHTML = `<svg viewBox="0 0 24 24">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
    </svg>`;
  }

  // Save state when agent visibility changes
  saveContainerState();
  
  // Sync URL to reflect agent state
  if (currentFrontendUrl) {
    syncContainerUrl(currentFrontendUrl);
  }
}

function initializeIframes() {
  frontendIframe = document.getElementById("frontend-iframe");
  agentIframe = document.getElementById("agent-iframe");

  // Check if current URL is a frontend URL (from previous navigation)
  const currentUrl = window.location.href;
  const historyState = window.history.state;
  const urlParams = new URLSearchParams(window.location.search);
  
  let frontendUrl = config.FRONTEND_URL;
  let shouldRestoreAgent = false;
  
  console.log("🔄 Initializing with URL:", currentUrl);
  console.log("🔄 History state:", historyState);
  console.log("🔄 URL params:", Object.fromEntries(urlParams));
  
  // Check for frontend parameter in URL (old format support)
  const frontendParam = urlParams.get('frontend');
  const agentParam = urlParams.get('agent');
  
  if (frontendParam) {
    frontendUrl = config.FRONTEND_URL + decodeURIComponent(frontendParam);
    shouldRestoreAgent = agentParam === 'open';
    console.log("🔄 Found frontend URL in parameters:", frontendUrl, "agent:", shouldRestoreAgent);
  }
  // If we have container state in history, this was a frontend URL navigation
  else if (historyState && historyState.isContainerPage) {
    frontendUrl = historyState.frontendUrl || currentUrl;
    shouldRestoreAgent = historyState.agentVisible;
    console.log("🔄 Restored from history state:", frontendUrl, "agent:", shouldRestoreAgent);
  } 
  // If current URL looks like a frontend URL (not container), use it
  else if (!currentUrl.includes('iframe-container.html') && !currentUrl.includes('127.0.0.1:5500')) {
    frontendUrl = currentUrl;
    console.log("🔄 Using current URL as frontend URL:", frontendUrl);
  }
  // Otherwise try to restore from sessionStorage
  else {
    const stateRestored = restoreContainerState();
    if (stateRestored && currentFrontendUrl !== config.FRONTEND_URL) {
      frontendUrl = currentFrontendUrl;
      shouldRestoreAgent = agentVisible;
      console.log("🔄 Restored from session storage:", frontendUrl);
    }
  }
  
  // Set up the frontend iframe
  currentFrontendUrl = frontendUrl;
  frontendIframe.src = frontendUrl;
  updateUrlDisplay(frontendUrl);
  lastKnownUrl = frontendUrl;
  
  // Sync browser URL immediately on load
  syncContainerUrl(frontendUrl);
  
  // Update agent visibility from restored state
  if (shouldRestoreAgent) {
    agentVisible = shouldRestoreAgent;
  }

  // Initialize toggle button
  const toggleButton = document.getElementById("toggle-button");
  toggleButton.addEventListener("click", toggleAgent);

  // Hide loading when both iframes are loaded
  let loadedCount = 0;
  const onLoad = () => {
    loadedCount++;
    if (loadedCount >= 2) {
      document.getElementById("loading").style.display = "none";
      document.getElementById("container").style.display = "flex";
      
      // Restore agent visibility state
      if (shouldRestoreAgent) {
        setTimeout(() => {
          console.log("🔄 Restoring agent visibility - shouldRestoreAgent:", shouldRestoreAgent);
          // Force the agent to be visible by directly setting UI state
          // Reset agentVisible to false first, then toggle to make it true
          agentVisible = false;
          toggleAgent(); // This will make agentVisible = true and show the agent
        }, 500);
      }

      // Start URL monitoring after both iframes are loaded
      startUrlMonitoring();
    }
  };

  frontendIframe.addEventListener("load", () => {
    onLoad();
    // Set up click monitoring after frontend loads
    setTimeout(() => setupClickMonitoring(), 1000);
    // Extract initial HTML after a delay to ensure page is loaded
    setTimeout(() => {
      console.log("🔄 Extracting initial HTML after frontend load");
      extractAndForwardHtml();
    }, 2000);
  });

  agentIframe.addEventListener("load", onLoad);

}

function updateUrlDisplay(url) {
  // Update page title to reflect current frontend page
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname;
    const pageName = path === '/' ? 'Home' : path.split('/').filter(p => p).join(' > ');
    document.title = `${pageName} - Lenskart`;
  } catch (error) {
    document.title = "Lenskart";
  }
}

function reloadFrontendIframe(newPath) {
  if (frontendIframe) {
    const baseUrl = config.FRONTEND_URL;
    const newUrl = newPath.startsWith("/") ? baseUrl + newPath : newPath;
    console.log("🔄 Reloading frontend iframe with:", newUrl);
    currentFrontendUrl = newUrl;
    frontendIframe.src = newUrl;
    updateUrlDisplay(newUrl);
    // HTML will be extracted when URL change is detected
  }
}

function extractAndForwardHtml() {
  if (!frontendIframe || !agentIframe) {
    console.log("⚠️ Iframes not ready for HTML extraction");
    return;
  }

  // Debounce extraction requests in container
  const now = Date.now();
  if (now - lastExtractRequest < 2000) {
    console.log("🚫 Container debouncing HTML extraction - too frequent (", (now - lastExtractRequest), "ms ago)");
    return;
  }
  
  // Only extract if URL actually changed
  try {
    const currentUrl = frontendIframe.contentWindow?.location?.href || frontendIframe.src;
    if (currentUrl === lastKnownUrl) {
      console.log("🚫 Container skipping extraction - URL unchanged:", currentUrl);
      return;
    }
  } catch (e) {
    // Cross-origin access - proceed with extraction
  }
  
  lastExtractRequest = now;

  console.log("📄 Requesting HTML from frontend iframe...");
  console.log("📍 Called from:", new Error().stack?.split('\n')[2]?.trim());
  console.log("Container origin:", window.location.origin);
  console.log("Frontend iframe src:", frontendIframe.src);

  // Request HTML from frontend via message
  frontendIframe.contentWindow.postMessage(
    {
      type: "REQUEST_BODY_HTML",
      requestId: Date.now(),
    },
    config.FRONTEND_URL
  );
  console.log("📤 Sent REQUEST_BODY_HTML to frontend");

}

function handleAgentDomRequest(payload) {
  if (!frontendIframe || !agentIframe) {
    console.log("⚠️ Iframes not ready for DOM request");
    return;
  }

  // console.log("🔄 Processing agent DOM request:", payload);
  
  // Store the request payload for later response
  pendingDomRequest = payload;
  
  // Request HTML from frontend
  // console.log("📤 Requesting HTML from frontend for DOM response");
  frontendIframe.contentWindow.postMessage(
    {
      type: "REQUEST_BODY_HTML",
      requestId: Date.now(),
    },
    config.FRONTEND_URL
  );
}

function setupClickMonitoring() {
  if (!frontendIframe) {
    console.log("⚠️ Frontend iframe not ready for click monitoring");
    return;
  }

  // console.log("🖱️ Setting up click monitoring for frontend iframe");
  
  // Send setup message to frontend
  frontendIframe.contentWindow.postMessage(
    {
      type: "SETUP_CLICK_MONITORING",
      requestId: Date.now(),
    },
    config.FRONTEND_URL
  );
}

function handleClickEvent(clickData) {
  if (!agentIframe) {
    console.log("⚠️ Agent iframe not ready for click data");
    return;
  }

  // console.log("🖱️ Click event received:", clickData);
  
  // Forward click data to agent iframe
  const clickMessage = {
    type: "USER_CLICK_EVENT",
    payload: {
      element: clickData.element,
      domPath: clickData.domPath,
      attributes: clickData.attributes,
      text: clickData.text,
      timestamp: clickData.timestamp,
      coordinates: clickData.coordinates
    }
  };
  
  agentIframe.contentWindow.postMessage(clickMessage, config.AGENT_URL);
  // console.log("📤 Click data sent to agent:", clickMessage.type);
}

function handleHtmlResponse(htmlData) {
  if (!agentIframe) {
    console.log("⚠️ Agent iframe not ready");
    return;
  }

  if (!htmlData) {
    console.log("⚠️ No HTML data received");
    return;
  }

  console.log("✅ HTML received from frontend:", {
    url: htmlData.url,
    title: htmlData.title,
    htmlLength: htmlData.html?.length || 0,
  });

  // Check if this is a response to an agent DOM request
  if (pendingDomRequest !== null) {
    console.log("📤 Processing DOM request:", pendingDomRequest.requestId);
    const currentRequest = pendingDomRequest;
    const domResponse = {
      type: "DOM_DATA_RESPONSE",
      payload: {
        requestId: currentRequest.requestId,
        action: currentRequest.action,
        isContextUpdate: currentRequest.isContextUpdate,
        result: htmlData.html
      }
    };
    
    // Clear the pending request immediately to prevent duplicates
    pendingDomRequest = null;
    
    // Send DOM response immediately
    console.log("✅ Sending DOM response:", currentRequest.requestId);
    agentIframe.contentWindow.postMessage(domResponse, config.AGENT_URL);
    
    return;
  }

  // Regular HOST_PAGE_DATA message
  const pageData = {
    type: "HOST_PAGE_DATA",
    payload: {
      url: htmlData.url,
      title: htmlData.title,
      html: htmlData.html,
      timestamp: new Date().toISOString(),
      extractedAt: Date.now(),
    },
  };
  
  agentIframe.contentWindow.postMessage(
    pageData,
    config.AGENT_URL
  );
  console.log("📤 HOST_PAGE_DATA sent to agent:", pageData.type);
}

function requestUrlCheck(source = "unknown") {
  if (!frontendIframe) {
    console.log("⚠️ Frontend iframe not ready for URL check");
    return;
  }

  console.log("📋 Requesting URL check from:", source);

  // Request URL from frontend iframe via message
  frontendIframe.contentWindow.postMessage(
    {
      type: "REQUEST_CURRENT_URL",
      requestId: Date.now(),
    },
    config.FRONTEND_URL
  );
}

function handleUrlResponse(url) {
  console.log("🔍 URL check result:", {
    received: url,
    lastKnown: lastKnownUrl,
    changed: url !== lastKnownUrl,
  });

  // Update URL display whenever URL changes
  if (url !== lastKnownUrl) {
    updateUrlDisplay(url);
    console.log("🔄 URL changed - extracting HTML for:", url);
    lastKnownUrl = url;
    currentFrontendUrl = url;
    
    // Sync container URL with frontend URL for proper browser history
    syncContainerUrl(url);
    
    // Save state when URL changes
    saveContainerState();
    
    extractAndForwardHtml();
  } else {
    console.log("✅ URL unchanged, skipping extraction");
  }
}

function syncContainerUrl(frontendUrl) {
  try {
    const currentBrowserUrl = window.location.href;
    console.log("🔗 Syncing browser URL...");
    console.log("  Current browser URL:", currentBrowserUrl);
    console.log("  Target frontend URL:", frontendUrl);
    console.log("  Agent visible:", agentVisible);
    
    // Store container state in history state for restoration
    const state = {
      isContainerPage: true,
      frontendUrl: frontendUrl,
      agentVisible: agentVisible,
      containerUrl: window.location.origin + window.location.pathname,
      timestamp: Date.now()
    };
    
    // Only sync if URLs are different
    if (currentBrowserUrl !== frontendUrl) {
      console.log("🔄 Replacing browser URL with frontend URL:", frontendUrl);
      window.history.replaceState(state, '', frontendUrl);
      console.log("✅ Browser URL synced. New URL:", window.location.href);
    } else {
      console.log("✅ Browser URL already matches frontend URL");
    }
    
  } catch (error) {
    console.warn("❌ Failed to sync container URL:", error);
  }
}

function executeActionOnFrontend(actionPayload) {
  if (!frontendIframe) {
    console.log("⚠️ Frontend iframe not ready for action execution");
    return;
  }

  // console.log("🎯 Executing action on frontend:", actionPayload);
  
  // Forward action command to frontend iframe
  frontendIframe.contentWindow.postMessage(
    {
      type: "EXECUTE_WEBSITE_ACTION",
      payload: actionPayload,
    },
    config.FRONTEND_URL
  );
}

function startUrlMonitoring() {
  // No polling - only event-driven URL change detection
  // console.log("⏱️ Event-driven URL monitoring initialized");
}

// Listen for navigation messages from agent iframe
window.addEventListener("message", (event) => {
  if (event.origin !== config.AGENT_URL) {
    return;
  }

  // console.log("📨 Container received message:", event.data.type);

  switch (event.data.type) {
    case "NAVIGATE":
      if (event.data.payload && event.data.payload.path) {
        // console.log(
        //   "🧭 Navigating frontend to:",
        //   event.data.payload.path
        // );
        reloadFrontendIframe(event.data.payload.path);
      }
      break;

    case "UPDATE_URL":
      if (event.data.payload && event.data.payload.url) {
        // console.log(
        //   "🧭 Updating frontend URL to:",
        //   event.data.payload.url
        // );
        reloadFrontendIframe(event.data.payload.url);
      }
      break;

    case "FETCH_DOM_DATA":
      // Handle DOM data requests - extract HTML and send back as DOM_DATA_RESPONSE
      // console.log("🔄 Agent requested DOM data - extracting HTML");
      handleAgentDomRequest(event.data.payload);
      break;

    case "REQUEST_HTML_EXTRACTION":
      // Agent requesting immediate HTML extraction
      // console.log("🔄 Agent requested HTML extraction");
      extractAndForwardHtml();
      break;

    case "EXECUTE_ACTION":
      // Agent requesting to execute an action on frontend
      // console.log("🎯 Agent requested action execution:", event.data.payload);
      executeActionOnFrontend(event.data.payload);
      break;
  }
});

// Forward messages from frontend to agent
window.addEventListener("message", (event) => {
  console.log("📨 Container received message:", event.data?.type, "from:", event.origin);
  
  if (event.origin === config.FRONTEND_URL && agentIframe) {
    // Handle URL change notifications from frontend
    if (event.data?.type === "URL_CHANGED_NOTIFICATION") {
      console.log("🔔 Frontend notified URL change:", event.data.url);
      handleUrlResponse(event.data.url);
      return;
    }

    // Handle URL response from frontend
    if (event.data?.type === "CURRENT_URL_RESPONSE") {
      console.log("📍 Received URL from frontend:", event.data.url);
      handleUrlResponse(event.data.url);
      return;
    }

    // Handle HTML response from frontend
    if (event.data?.type === "BODY_HTML_RESPONSE") {
      console.log("📄 Received body HTML from frontend");
      handleHtmlResponse(event.data);
      return;
    }

    // Handle click events from frontend
    if (event.data?.type === "CLICK_EVENT") {
      // console.log("🖱️ Received click event from frontend");
      handleClickEvent(event.data);
      return;
    }

    // Forward other frontend messages to agent
    // console.log("📤 Forwarding message to agent:", event.data.type);
    agentIframe.contentWindow.postMessage(
      event.data,
      config.AGENT_URL
    );

    // Don't automatically extract HTML on every message forward
  }
});

// Clean up on page unload
window.addEventListener("beforeunload", () => {
  // Save state before page unloads
  saveContainerState();
  
  if (urlCheckInterval) {
    clearInterval(urlCheckInterval);
    urlCheckInterval = null;
    // console.log("⏹️ URL monitoring stopped");
  }
});

// Also save state when page becomes hidden (mobile/tab switching)
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    saveContainerState();
  }
});

// Handle browser back/forward navigation
window.addEventListener('popstate', (event) => {
  console.log('🔄 Popstate event:', event.state);
  
  if (event.state && event.state.isContainerPage) {
    // Restore state from history
    const frontendUrl = event.state.frontendUrl;
    const shouldShowAgent = event.state.agentVisible;
    
    if (frontendUrl && frontendIframe) {
      console.log('🔄 Restoring frontend URL from popstate:', frontendUrl);
      currentFrontendUrl = frontendUrl;
      frontendIframe.src = frontendUrl;
      updateUrlDisplay(frontendUrl);
      lastKnownUrl = frontendUrl;
      
      // Restore agent state
      if (shouldShowAgent !== agentVisible) {
        if (shouldShowAgent && !agentVisible) {
          toggleAgent();
        } else if (!shouldShowAgent && agentVisible) {
          toggleAgent();
        }
      }
    }
  }
});

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", initializeIframes);