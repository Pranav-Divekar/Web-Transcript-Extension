// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'checkTabCaptureSupport') {
      // Simple check for tab capture support
      sendResponse({ supported: true });
    }
  });
  
  // Inform background script when tab is updated
  chrome.runtime.sendMessage({ action: 'tabUpdated' });