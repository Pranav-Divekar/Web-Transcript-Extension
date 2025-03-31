let recognition;
let transcriptChunks = [];
let audioStream = null;
let isTranscribing = false;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'startTranscription':
      startTranscription(sendResponse);
      return true; // Required for async response
    case 'stopTranscription':
      stopTranscription();
      sendResponse({ status: 'stopped' });
      break;
    case 'getTranscript':
      chrome.storage.local.get(['transcript'], (result) => {
        sendResponse({ transcript: result.transcript || '' });
      });
      return true;
    case 'clearTranscript':
      transcriptChunks = [];
      chrome.storage.local.set({ transcript: '' });
      sendResponse({ status: 'cleared' });
      break;
    case 'exportTranscript':
      exportTranscript(sendResponse);
      return true;
    case 'getTranscriptionStatus':
      sendResponse({ isTranscribing });
      break;
  }
});

async function startTranscription(sendResponse) {
  if (isTranscribing) {
    sendResponse({ status: 'error', error: 'Transcription already in progress' });
    return;
  }

  try {
    // First get the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      throw new Error("No active tab found");
    }

    // Then capture the tab audio
    audioStream = await new Promise((resolve, reject) => {
      chrome.tabCapture.capture(
        {
          audio: true,
          video: false,
          tabId: tab.id
        },
        (stream) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (!stream) {
            reject(new Error("Failed to get audio stream"));
          } else {
            resolve(stream);
          }
        }
      );
    });

    console.log("Audio capture successful", audioStream);
    isTranscribing = true;

    // Initialize speech recognition
    recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      let finalTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + ' ';
        }
      }

      if (finalTranscript) {
        transcriptChunks.push(finalTranscript);
        const fullTranscript = transcriptChunks.join(' ');
        chrome.storage.local.set({ transcript: fullTranscript });
        
        // Send update to popup
        chrome.runtime.sendMessage({
          action: 'transcriptUpdate',
          transcript: fullTranscript
        });
      }
    };

    recognition.onerror = (event) => {
      console.error('Recognition error:', event.error);
      chrome.runtime.sendMessage({
        action: 'transcriptionError',
        error: event.error
      });
      
      // Attempt to restart if error is not fatal
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        setTimeout(() => {
          if (isTranscribing) {
            recognition.start();
          }
        }, 1000);
      }
    };

    recognition.onend = () => {
      if (isTranscribing) {
        recognition.start(); // Restart recognition if still active
      }
    };

    recognition.start();
    sendResponse({ status: 'success' });

  } catch (error) {
    console.error('Transcription failed:', error);
    isTranscribing = false;
    
    // Fallback to microphone if needed
    try {
      console.log('Attempting microphone fallback...');
      audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log("Fell back to microphone capture");
      sendResponse({ status: 'success', usedFallback: true });
    } catch (fallbackError) {
      console.error("Microphone capture also failed:", fallbackError);
      sendResponse({ 
        status: 'error', 
        error: `Tab capture failed: ${error.message}. Microphone failed: ${fallbackError.message}` 
      });
    }
  }
}

function stopTranscription() {
  isTranscribing = false;
  
  if (recognition) {
    recognition.onend = null; // Remove the restart handler
    recognition.stop();
    recognition = null;
  }
  
  if (audioStream) {
    if (audioStream.getTracks) {
      audioStream.getTracks().forEach(track => track.stop());
    } else {
      chrome.tabCapture.stopCapture(audioStream.id);
    }
    audioStream = null;
  }
  
  chrome.storage.local.get(['transcript'], (result) => {
    if (result.transcript) {
      console.log('Final transcript:', result.transcript);
    }
  });
}

function exportTranscript(sendResponse) {
  chrome.storage.local.get(['transcript'], (result) => {
    const transcript = result.transcript || 'No transcript available';
    const blob = new Blob([transcript], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    chrome.downloads.download({
      url: url,
      filename: `transcript_${new Date().toISOString().slice(0,10)}.txt`,
      conflictAction: 'uniquify'
    }, () => {
      if (chrome.runtime.lastError) {
        sendResponse({ status: 'error', error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ status: 'success' });
      }
    });
  });
}