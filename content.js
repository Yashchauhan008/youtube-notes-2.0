// Function to get current video ID from YouTube URL
function getVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v');
}

// Function to fetch video title
async function fetchVideoTitle(videoId) {
    try {
        const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
        const text = await response.text();
        const titleMatch = text.match(/<title>([^<]*)<\/title>/);
        if (titleMatch && titleMatch[1]) {
            let title = titleMatch[1];
            // Remove the '- YouTube' suffix if present
            title = title.replace(/\s*-\s*YouTube\s*$/, '');
            return title;
        }
        return 'Untitled Video';
    } catch (error) {
        console.error('Error fetching video title:', error);
        return 'Untitled Video';
    }
}

// Function to create notes list panel
function createNotesListPanel() {
    // Remove existing panel if any
    const existingPanel = document.getElementById('previous-notes-list');
    if (existingPanel) {
        existingPanel.remove();
    }

    // Create the notes list panel
    const notesList = document.createElement('div');
    notesList.id = 'previous-notes-list';
    notesList.className = 'previous-notes-list';
    notesList.style.display = 'none';
    notesList.innerHTML = `
        <div class="notes-list-header">
            <h3>Your Previous Notes</h3>
            <button id="close-notes-list">×</button>
        </div>
        <div id="notes-list-content" class="notes-list-content"></div>
    `;

    // Insert the panel into the secondary sidebar
    const secondaryInner = document.querySelector('#secondary-inner');
    if (secondaryInner && secondaryInner.firstChild) {
        secondaryInner.insertBefore(notesList, secondaryInner.firstChild);
    } else {
        // Fallback to body if secondary-inner is not found
        document.body.appendChild(notesList);
    }

    // Add close button event listener
    const closeBtn = document.getElementById('close-notes-list');
    closeBtn.addEventListener('click', () => {
        notesList.style.display = 'none';
    });

    return notesList;
}

// Function to delete a specific note
function deleteNote(videoId, noteIndex) {
    const key = `yt-notes-${videoId}`;
    chrome.storage.local.get(key, (result) => {
        if (result[key] && Array.isArray(result[key])) {
            const notes = result[key];
            notes.splice(noteIndex, 1); // Remove the note at the specified index
            if (notes.length === 0) {
                // If no notes left, remove the key entirely
                chrome.storage.local.remove(key, () => {
                    loadAllNotes();
                });
            } else {
                // Save the updated notes array
                chrome.storage.local.set({ [key]: notes }, () => {
                    loadAllNotes();
                });
            }
        }
    });
}

// Function to save edited note
function saveEditedNote(videoId, noteIndex, newContent) {
    const key = `yt-notes-${videoId}`;
    chrome.storage.local.get(key, (result) => {
        let notes = result[key] || [];
        if (!Array.isArray(notes)) {
            // Convert old format to array if needed
            notes = [notes];
        }
        notes[noteIndex] = newContent;
        chrome.storage.local.set({ [key]: notes }, () => {
            loadAllNotes();
        });
    });
}

// Function to create edit interface
function createEditInterface(videoId, currentContent) {
    const editContainer = document.createElement('div');
    editContainer.className = 'edit-note-container';
    editContainer.innerHTML = `
        <textarea class="edit-note-textarea">${currentContent}</textarea>
        <div class="edit-note-buttons">
            <button class="save-edit-btn">Save</button>
            <button class="cancel-edit-btn">Cancel</button>
        </div>
    `;

    const saveBtn = editContainer.querySelector('.save-edit-btn');
    const cancelBtn = editContainer.querySelector('.cancel-edit-btn');
    const textarea = editContainer.querySelector('.edit-note-textarea');

    saveBtn.addEventListener('click', () => {
        const newContent = textarea.value.trim();
        if (newContent) {
            saveEditedNote(videoId, newContent);
        }
    });

    cancelBtn.addEventListener('click', () => {
        loadAllNotes(); // Reset to normal view
    });

    return editContainer;
}

// Function to load and display all notes
async function loadAllNotes() {
    const contentDiv = document.getElementById('notes-list-content');
    contentDiv.innerHTML = '<div class="loading">Loading notes...</div>';

    chrome.storage.local.get(null, async (result) => {
        let notesHtml = '';
        let hasNotes = false;

        // Create an array of promises for fetching video titles
        const notePromises = Object.entries(result)
            .filter(([key]) => key.startsWith('yt-notes-'))
            .map(async ([key, notes]) => {
                const videoId = key.replace('yt-notes-', '');
                const videoTitle = await fetchVideoTitle(videoId);
                return {
                    videoId,
                    videoTitle,
                    notes: Array.isArray(notes) ? notes : [notes] // Ensure notes is an array
                };
            });

        // Wait for all titles to be fetched
        const videoNotes = await Promise.all(notePromises);

        if (videoNotes.length === 0) {
            contentDiv.innerHTML = '<div class="no-notes">No notes found</div>';
            return;
        }

        // Build the HTML with video titles and multiple notes per video
        videoNotes.forEach(({ videoId, videoTitle, notes }) => {
            notesHtml += `
                <div class="video-notes-group">
                    <div class="video-title">
                        <a href="https://www.youtube.com/watch?v=${videoId}" target="_blank">
                            🎥 ${videoTitle}
                        </a>
                    </div>
                    ${notes.map((note, index) => `
                        <div class="note-item" data-video-id="${videoId}" data-note-index="${index}">
                            <div class="note-header">
                                <div class="note-number">Note ${index + 1}</div>
                                <div class="note-actions">
                                    <button class="edit-note-btn" title="Edit note">✏️</button>
                                    <button class="delete-note-btn" title="Delete note">🗑️</button>
                                </div>
                            </div>
                            <div class="note-content">${note}</div>
                        </div>
                    `).join('')}
                </div>
            `;
        });

        contentDiv.innerHTML = notesHtml;

        // Add event listeners for edit and delete buttons
        contentDiv.querySelectorAll('.note-item').forEach(noteItem => {
            const videoId = noteItem.dataset.videoId;
            const noteIndex = parseInt(noteItem.dataset.noteIndex);
            const noteContent = noteItem.querySelector('.note-content').textContent;

            // Edit button
            noteItem.querySelector('.edit-note-btn').addEventListener('click', () => {
                const editInterface = createEditInterface(videoId, noteContent);
                const saveBtn = editInterface.querySelector('.save-edit-btn');
                
                // Update save button click handler to include note index
                saveBtn.addEventListener('click', () => {
                    const newContent = editInterface.querySelector('.edit-note-textarea').value.trim();
                    if (newContent) {
                        saveEditedNote(videoId, noteIndex, newContent);
                    }
                });

                noteItem.querySelector('.note-content').replaceWith(editInterface);
            });

            // Delete button
            noteItem.querySelector('.delete-note-btn').addEventListener('click', () => {
                if (confirm('Are you sure you want to delete this note?')) {
                    deleteNote(videoId, noteIndex);
                }
            });
        });
    });
}

// Create and inject the notes buttons
function createNotesButton() {
    // Remove existing buttons if any
    const existingContainer = document.querySelector('.notes-buttons-container');
    if (existingContainer) {
        existingContainer.remove();
    }

    // Create container for both buttons
    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'notes-buttons-container';
    
    // Create Add Notes button
    const addNotesButton = document.createElement('button');
    addNotesButton.id = 'yt-notes-button';
    addNotesButton.innerHTML = '📝 Add Notes';
    addNotesButton.className = 'yt-notes-btn';
    
    // Create Previous Notes button
    const previousNotesButton = document.createElement('button');
    previousNotesButton.id = 'previous-notes-btn';
    previousNotesButton.innerHTML = '📚 View All Notes';
    previousNotesButton.className = 'yt-notes-btn previous-notes-btn';
    
    // Add buttons to container
    buttonsContainer.appendChild(addNotesButton);
    buttonsContainer.appendChild(previousNotesButton);
    
    // Insert container below video
    const menuContainer = document.querySelector('#below');
    if (menuContainer) {
        menuContainer.prepend(buttonsContainer);
    }
    
    // Create notes list panel
    const notesList = createNotesListPanel();
    
    // Add event listener for previous notes button
    previousNotesButton.addEventListener('click', () => {
        notesList.style.display = notesList.style.display === 'none' ? 'block' : 'none';
        if (notesList.style.display === 'block') {
            loadAllNotes();
        }
    });

    return addNotesButton;
}

// Create notes popup
function createNotesPopup() {
    const popup = document.createElement('div');
    popup.id = 'yt-notes-popup';
    popup.className = 'yt-notes-popup';
    
    popup.innerHTML = `
        <div class="yt-notes-popup-content">
            <div class="yt-notes-header">
                <h3>Add Note for this video</h3>
                <button id="yt-notes-close">×</button>
            </div>
            <textarea id="yt-notes-textarea" placeholder="Enter your notes here..."></textarea>
            <button id="yt-notes-save">Add Note</button>
        </div>
    `;
    
    document.body.appendChild(popup);
}

// Handle notes storage and retrieval
async function handleNotes() {
    const videoId = getVideoId();
    const notesKey = `yt-notes-${videoId}`;
    
    // Create UI elements if they don't exist
    if (!document.getElementById('yt-notes-button')) {
        createNotesButton();
    }
    if (!document.getElementById('yt-notes-popup')) {
        createNotesPopup();
    }
    
    const popup = document.getElementById('yt-notes-popup');
    const textarea = document.getElementById('yt-notes-textarea');
    const closeBtn = document.getElementById('yt-notes-close');
    const saveBtn = document.getElementById('yt-notes-save');
    const notesBtn = document.getElementById('yt-notes-button');
    
    // Event listeners
    notesBtn.addEventListener('click', () => {
        popup.style.display = 'block';
        textarea.value = ''; // Clear textarea for new note
    });
    
    closeBtn.addEventListener('click', () => {
        popup.style.display = 'none';
    });
    
    saveBtn.addEventListener('click', () => {
        const newNote = textarea.value.trim();
        if (!newNote) return; // Don't save empty notes

        chrome.storage.local.get(notesKey, (result) => {
            let notes = result[notesKey] || [];
            if (!Array.isArray(notes)) {
                // Convert old format to array if needed
                notes = [notes];
            }
            notes.push(newNote); // Add new note to array

            chrome.storage.local.set({ [notesKey]: notes }, () => {
                // Show save confirmation
                saveBtn.textContent = 'Added!';
                setTimeout(() => {
                    saveBtn.textContent = 'Add Note';
                    popup.style.display = 'none'; // Hide popup after saving
                    textarea.value = ''; // Clear textarea
                }, 1000);
                loadAllNotes(); // Refresh the notes list
            });
        });
    });
}

// Initialize when URL changes (for YouTube's SPA navigation)
let lastUrl = location.href;
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        setTimeout(() => {
            handleNotes();
            createPreviousNotesButton();
        }, 1000); // Wait for YouTube to load content
    }
}).observe(document, { subtree: true, childList: true });

// Initial setup
setTimeout(handleNotes, 1000);
