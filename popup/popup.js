document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const exportBtn = document.getElementById('exportBtn');
    const clearBtn = document.getElementById('clearBtn');
    const statusEl = document.getElementById('status');
    const previewEl = document.getElementById('transcriptPreview');
  
    let isTranscribing = false;
  
    // Update UI based on transcription state
    function updateUI() {
      startBtn.disabled = isTranscribing;
      stopBtn.disabled = !isTranscribing;
      exportBtn.disabled = !isTranscribing && !hasTranscript();
    }
  
    function hasTranscript() {
      return previewEl.textContent.trim().length > 0;
    }
  
    // Start transcription
    startBtn.addEventListener('click', () => {
      statusEl.textContent = 'Starting...';
      chrome.runtime.sendMessage({ action: 'startTranscription' }, (response) => {
        if (response.status === 'success') {
          isTranscribing = true;
          statusEl.textContent = 'Listening...';
          updateUI();
          
          // Periodically update transcript preview
          setInterval(() => {
            chrome.runtime.sendMessage(
              { action: 'getTranscript' },
              (response) => {
                if (response.transcript) {
                  previewEl.textContent = response.transcript;
                }
              }
            );
          }, 2000);
        } else {
          statusEl.textContent = `Error: ${response.error || 'Unknown error'}`;
        }
      });
    });
  
    // Stop transcription
    stopBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'stopTranscription' });
      isTranscribing = false;
      statusEl.textContent = 'Stopped';
      updateUI();
    });
  
    // Export transcript
    exportBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'exportTranscript' });
      statusEl.textContent = 'Exporting transcript...';
    });
  
    // Clear transcript
    clearBtn.addEventListener('click', () => {
      if (confirm('Clear current transcript?')) {
        chrome.runtime.sendMessage({ action: 'clearTranscript' });
        previewEl.textContent = '';
        statusEl.textContent = 'Transcript cleared';
        updateUI();
      }
    });
  
    // Load existing transcript
    chrome.runtime.sendMessage(
      { action: 'getTranscript' },
      (response) => {
        if (response.transcript) {
          previewEl.textContent = response.transcript;
          updateUI();
        }
      }
    );
  });