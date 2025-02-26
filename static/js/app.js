// Store findings data
let findings = [];
let selectedFindings = new Set();
let selectedForExport = new Set();
let expandedFindings = new Set();
let userFindings = []; // Store user's selected findings from the server

// User info
let currentUser = null;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing app...');
    initializeApp();
});

// Main initialization function
async function initializeApp() {
    try {
        await checkAuth();
        updateUserInfo();
        await loadUserFindings(); // Load user findings from server instead of localStorage
        await loadFindings();
        setupEventListeners();
        initializeTagInputs();
        console.log('App initialized successfully');
    } catch (error) {
        console.error('Failed to initialize app:', error);
    }
}

// Update the user info in the sidebar
function updateUserInfo() {
    const userInfoElement = document.getElementById('user-info-display');
    if (userInfoElement && currentUser) {
        userInfoElement.textContent = `Logged in as ${currentUser.username}`;
    }
}

// Load user findings from server instead of local storage
async function loadUserFindings() {
    try {
        const response = await fetch('/api/user-findings');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        userFindings = await response.json();
        console.log('User findings loaded:', userFindings.length);
        
        // Create a set of finding IDs for quick lookup
        selectedForExport = new Set(userFindings.map(f => f.finding_id));
        
        return userFindings;
    } catch (error) {
        console.error('Error loading user findings:', error);
        return [];
    }
}

// Check authentication status
async function checkAuth() {
    try {
        const response = await fetch('/api/check-auth');
        const data = await response.json();
        
        if (data.authenticated) {
            currentUser = data.user;
            console.log('User authenticated:', currentUser.username);
            return true;
        } else {
            window.location.href = '/login';
            return false;
        }
    } catch (error) {
        console.error('Auth check error:', error);
        window.location.href = '/login';
        return false;
    }
}

// Load all findings from the server
async function loadFindings() {
    try {
        const response = await fetch('/api/findings');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        findings = await response.json();
        console.log('Findings loaded:', findings.length);
        
        // Define severity order
        const severityOrder = ['Critical', 'High', 'Medium', 'Low', 'Informational'];
        // Sort findings by severity
        findings.sort((a, b) => 
            severityOrder.indexOf(a.risk_rating) - severityOrder.indexOf(b.risk_rating)
        );
        
        displayFindings();
        displaySelectedFindings();
        updateCategoryFilters();
        updateRiskChart();
        return findings;
    } catch (error) {
        console.error('Error loading findings:', error);
        return [];
    }
}

// Setup event listeners for all interactive elements
function setupEventListeners() {
    console.log('Setting up event listeners...');
    
    // Search listeners
    const searchInput = document.getElementById('findingsSearch');
    if (searchInput) {
        searchInput.addEventListener('input', displayFindings);
    }
    
    // Category search listener
    const categorySearch = document.getElementById('categorySearch');
    if (categorySearch) {
        categorySearch.addEventListener('input', updateCategoryFilters);
    }
    
    // Risk filter listeners
    const filterIds = ['filterCritical', 'filterHigh', 'filterMedium', 'filterLow', 'filterInformational'];
    filterIds.forEach(id => {
        const checkbox = document.getElementById(id);
        if (checkbox) {
            checkbox.addEventListener('change', displayFindings);
        }
    });
    
    // Button event listeners
    document.getElementById('submitFinding')?.addEventListener('click', submitFinding);
    document.getElementById('exportBtn')?.addEventListener('click', exportFindings);
    document.getElementById('exportJsonBtn')?.addEventListener('click', exportFindingsJson);
    document.getElementById('exportCsvBtn')?.addEventListener('click', exportFindingsCsv);
    document.getElementById('importJSON')?.addEventListener('click', importJSON);
    document.getElementById('deleteSelected')?.addEventListener('click', deleteSelectedFindings);
    document.getElementById('confirmDeleteAll')?.addEventListener('click', deleteAllFindings);
    document.getElementById('logoutButton')?.addEventListener('click', handleLogout);
    
    // Selected findings management buttons
    document.getElementById('addToSelected')?.addEventListener('click', function() {
        const addPromises = [];
        selectedFindings.forEach(id => {
            addPromises.push(addToSelected(id));
        });
        
        Promise.all(addPromises)
            .then(() => {
                selectedFindings.clear();
                displayFindings();
                displaySelectedFindings();
            })
            .catch(error => {
                console.error('Error adding selected findings:', error);
            });
    });
    
    document.getElementById('removeSelected')?.addEventListener('click', function() {
        const removePromises = [];
        
        selectedFindings.forEach(id => {
            const userFinding = userFindings.find(uf => uf.id === id);
            if (userFinding) {
                removePromises.push(removeFromSelected(userFinding.finding_id, userFinding.id));
            }
        });
        
        Promise.all(removePromises)
            .then(() => {
                selectedFindings.clear();
                displayFindings();
                displaySelectedFindings();
            })
            .catch(error => {
                console.error('Error removing selected findings:', error);
            });
    });
    
    document.getElementById('removeAll')?.addEventListener('click', removeAllUserFindings);
    
    // PIN modal
    document.getElementById('deleteAll')?.addEventListener('click', function() {
        const pinModal = new bootstrap.Modal(document.getElementById('pinModal'));
        pinModal.show();
    });
    
    // Reset PIN input when modal is closed
    document.getElementById('pinModal')?.addEventListener('hidden.bs.modal', function() {
        document.getElementById('pinInput').value = '';
    });
    
    // Listen for findings updated event
    document.addEventListener('findingsUpdated', updateCategoryFilters);
    
    console.log('Event listeners set up');
}

// Initialize tag inputs for category fields
function initializeTagInputs() {
    const addTagInput = document.getElementById('category');
    if (addTagInput) {
        const addTagContainer = addTagInput.closest('.tag-container');
        const addHiddenInput = document.getElementById('categoryTags');
        window.addFindingTags = initializeTagInput(addTagInput, addTagContainer, addHiddenInput);
    }
    
    const editTagInput = document.getElementById('editCategory');
    if (editTagInput) {
        const editTagContainer = editTagInput.closest('.tag-container');
        const editHiddenInput = document.getElementById('editCategoryTags');
        window.editFindingTags = initializeTagInput(editTagInput, editTagContainer, editHiddenInput);
    }
}

// Display findings in the all findings panel
function displayFindings() {
    const container = document.getElementById('allFindings');
    if (!container) return;
    
    const searchTerm = document.getElementById('findingsSearch')?.value.toLowerCase() || '';
    
    // Get the state of filter checkboxes
    const riskFilters = {
        'Critical': document.getElementById('filterCritical')?.checked ?? true,
        'High': document.getElementById('filterHigh')?.checked ?? true,
        'Medium': document.getElementById('filterMedium')?.checked ?? true,
        'Low': document.getElementById('filterLow')?.checked ?? true,
        'Informational': document.getElementById('filterInformational')?.checked ?? true
    };
    
    // Get selected categories
    const selectedCategoriesElements = document.querySelectorAll('#categoryFilters .form-check-input:checked');
    const selectedCategories = new Set(
        Array.from(selectedCategoriesElements)
            .map(checkbox => checkbox.getAttribute('data-category'))
    );
    
    // Filter findings based on criteria
    const filteredFindings = findings.filter(f => {
        // Skip if already in selected findings
        if (selectedForExport.has(f.id)) return false;
        
        // Skip if risk rating is filtered out
        if (!riskFilters[f.risk_rating]) return false;
        
        // Check category filters
        if (selectedCategories.size > 0) {
            const findingCategories = f.category ? f.category.split(',').map(c => c.trim()) : [];
            if (!findingCategories.some(cat => selectedCategories.has(cat))) {
                return false;
            }
        }
        
        // Check search term
        if (searchTerm) {
            const title = f.title.toLowerCase();
            const description = f.description.toLowerCase();
            const impact = f.impact.toLowerCase();
            const resolution = f.resolution.toLowerCase();
            const category = (f.category || '').toLowerCase();
            
            return (
                title.includes(searchTerm) || 
                description.includes(searchTerm) || 
                impact.includes(searchTerm) || 
                resolution.includes(searchTerm) ||
                category.includes(searchTerm)
            );
        }
        
        return true;
    });
    
    // Show empty state if no findings match
    if (filteredFindings.length === 0) {
        container.innerHTML = '<div class="alert alert-info">No findings match the current filters</div>';
        return;
    }
    
    // Render filtered findings
    container.innerHTML = filteredFindings
        .map(finding => `
            <div class="card finding-card ${selectedFindings.has(finding.id) ? 'selected' : ''}" 
                 data-id="${finding.id}">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-center">
                        <div class="d-flex align-items-center">
                            <span class="badge bg-${getRiskBadgeColor(finding.risk_rating)}">${finding.risk_rating}</span>
                            <h5 class="card-title mb-0 ms-2">${finding.title}</h5>
                        </div>
                        <div class="d-flex align-items-center">
                            <button class="btn btn-sm btn-success me-1" onclick="addToSelected(${finding.id}); event.stopPropagation();">Add →</button>
                            <button class="btn btn-sm btn-outline-secondary me-1" onclick="toggleFindingSelection(${finding.id}); event.stopPropagation();">Select</button>
                            <button class="btn btn-sm btn-outline-primary" onclick="openEditModal(${finding.id}); event.stopPropagation();">Edit</button>
                        </div>
                    </div>
                    <div class="finding-details ${expandedFindings.has(finding.id) ? 'show' : ''}">
                        <div class="detail-label">Description:</div>
                        <p class="mb-3">${finding.description}</p>
                        <div class="detail-label">Impact:</div>
                        <p class="mb-3">${finding.impact}</p>
                        <div class="detail-label">Resolution:</div>
                        <p class="mb-3">${finding.resolution}</p>
                        ${finding.category ? `
                        <div class="detail-label">Categories:</div>
                        <div class="tags-display">
                            ${finding.category.split(',').filter(tag => tag.trim()).map(tag => 
                                `<span class="category-tag">${tag.trim()}</span>`
                            ).join('')}
                        </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `).join('');
    
    // Add click listeners to the cards for toggling expansion
    document.querySelectorAll('#allFindings .finding-card').forEach(card => {
        card.addEventListener('click', function(event) {
            // Ignore clicks on buttons and form elements
            if (
                event.target.tagName === 'BUTTON' || 
                event.target.tagName === 'INPUT' || 
                event.target.tagName === 'TEXTAREA' ||
                event.target.closest('button')
            ) {
                event.stopPropagation();
                return;
            }
            
            const id = parseInt(this.dataset.id);
            toggleExpand(id);
        });
    });
}

function displaySelectedFindings() {
    const container = document.getElementById('selectedFindings');
    if (!container) return;
    
    // Show empty state if no findings are selected
    if (userFindings.length === 0) {
        container.innerHTML = '<div class="alert alert-info">No findings selected</div>';
        return;
    }
    
    // Render selected findings
    container.innerHTML = userFindings
        .map(userFinding => {
            return `
                <div class="card finding-card ${selectedFindings.has(userFinding.id) ? 'selected' : ''}" 
                     data-id="${userFinding.id}">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-center">
                            <div class="d-flex align-items-center">
                                <span class="badge bg-${getRiskBadgeColor(userFinding.risk_rating)}">${userFinding.risk_rating}</span>
                                <h5 class="card-title mb-0 ms-2">${userFinding.title}</h5>
                            </div>
                            <div class="d-flex align-items-center">
                                <button class="btn btn-sm btn-danger me-1" onclick="removeFromSelected(${userFinding.finding_id}, ${userFinding.id}); event.stopPropagation();">← Remove</button>
                                <button class="btn btn-sm btn-outline-secondary me-1" onclick="toggleFindingSelection(${userFinding.id}); event.stopPropagation();">Select</button>
                                <button class="btn btn-sm btn-outline-primary" onclick="openUserFindingEditModal(${userFinding.id}); event.stopPropagation();">Edit</button>
                            </div>
                        </div>
                        <div class="finding-details ${expandedFindings.has(userFinding.id) ? 'show' : ''}">
                            <div class="detail-label">Description:</div>
                            <p class="mb-3">${userFinding.description}</p>
                            <div class="detail-label">Impact:</div>
                            <p class="mb-3">${userFinding.impact}</p>
                            <div class="detail-label">Resolution:</div>
                            <p class="mb-3">${userFinding.resolution}</p>
                            ${userFinding.category ? `
                            <div class="detail-label">Categories:</div>
                            <div class="tags-display">
                                ${userFinding.category.split(',').filter(tag => tag.trim()).map(tag => 
                                    `<span class="category-tag">${tag.trim()}</span>`
                                ).join('')}
                            </div>
                            ` : ''}
                            <div class="detail-label">Resources Affected:</div>
                            <textarea class="form-control mb-3" id="resources_${userFinding.id}" rows="2">${userFinding.resources_affected || ''}</textarea>
                            <div class="detail-label">Evidence and Reproduction Steps:</div>
                            <div id="evidence_container_${userFinding.id}">
                                <textarea class="form-control mb-3" id="evidence_${userFinding.id}" rows="4">${userFinding.evidence || ''}</textarea>
                            </div>
                            <button class="btn btn-sm btn-primary mt-2" onclick="saveAdditionalFields(${userFinding.id}); event.stopPropagation();">Save</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    
    // Add click listeners to the cards for toggling expansion
    document.querySelectorAll('#selectedFindings .finding-card').forEach(card => {
        card.addEventListener('click', function(event) {
            // Ignore clicks on buttons and form elements
            if (
                event.target.tagName === 'BUTTON' || 
                event.target.tagName === 'INPUT' || 
                event.target.tagName === 'TEXTAREA' ||
                event.target.closest('button') ||
                event.target.closest('.ck') ||          // CKEditor container
                event.target.closest('.ck-editor') ||   // CKEditor wrapper
                event.target.closest('.ck-content')     // CKEditor editable area
            ) {
                return;
            }
            
            const id = parseInt(this.dataset.id);
            toggleExpand(id);
        });
    });

    // Initialize CKEditors after rendering
    initializeCKEditors();
}

// Initialization function for CKEditors
function initializeCKEditors() {
    // Destroy any existing CKEditor instances to prevent memory leaks
    if (ClassicEditor.instances) {
        Object.keys(ClassicEditor.instances).forEach(key => {
            const editor = ClassicEditor.instances[key];
            if (editor && editor.destroy) {
                editor.destroy();
            }
        });
    } else {
        ClassicEditor.instances = {};
    }

    // Initialize CKEditor for each evidence textarea
    userFindings.forEach(userFinding => {
        const containerId = `evidence_container_${userFinding.id}`;
        const textareaId = `evidence_${userFinding.id}`;
        
        // Check if the container exists before creating CKEditor
        const container = document.getElementById(containerId);
        if (container) {
            // Replace textarea with CKEditor
            const textarea = document.getElementById(textareaId);
            textarea.setAttribute('data-finding-id', userFinding.id);
            
            ClassicEditor
                .create(textarea, {
                    toolbar: [
                        'heading', '|',
                        'bold', 'italic', 'underline', 'strikethrough', '|',
                        'bulletedList', 'numberedList', '|',
                        'insertTable', 'tableColumn', 'tableRow', 'mergeTableCells', '|',
                        'code', 'codeBlock', '|',
                        'undo', 'redo'
                    ]
                })
                .then(editor => {
                    ClassicEditor.instances[textareaId] = editor;
                })
                .catch(error => {
                    console.error('Error creating CKEditor:', error);
                });
        }
    });
}



// Get risk badge color
function getRiskBadgeColor(risk) {
    const colors = {
        'Critical': 'critical',
        'High': 'high',
        'Medium': 'medium',
        'Low': 'low',
        'Informational': 'informational'
    };
    return colors[risk] || 'secondary';
}

async function checkSessionValid() {
    try {
        const response = await fetch('/api/check-auth');
        const data = await response.json();
        return data.authenticated;
    } catch (error) {
        console.error('Session check failed:', error);
        return false;
    }
}


// Updated addToSelected function with improved error handling
async function addToSelected(id) {
    try {
        const finding = findings.find(f => f.id === id);
        if (!finding) {
            throw new Error('Finding not found');
        }
        
        const response = await fetch('/api/user-findings', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                finding_id: id
            })
        });
        
        // Log full response details
        console.log('Response status:', response.status);
        console.log('Response headers:', Object.fromEntries(response.headers.entries()));
        
        // Get response text for detailed logging
        const responseText = await response.text();
        console.log('Full response text:', responseText);
        
        // Check if response is ok before parsing
        if (!response.ok) {
            let errorMessage = 'Unknown error occurred';
            try {
                const errorJson = JSON.parse(responseText);
                errorMessage = errorJson.error || errorMessage;
            } catch {
                errorMessage = responseText || `HTTP error! status: ${response.status}`;
            }
            throw new Error(errorMessage);
        }
        
        // Try to parse JSON
        let userFinding;
        try {
            userFinding = JSON.parse(responseText);
        } catch (parseError) {
            console.error('JSON parse error:', parseError);
            throw new Error('Failed to parse server response');
        }
        
        // Add the new user finding to our array
        userFindings.push(userFinding);
        selectedForExport.add(id);
        
        displayFindings();
        displaySelectedFindings();
        updateRiskChart();
    } catch (error) {
        console.error('Error adding finding:', error);
        alert('Failed to add finding: ' + error.message);
    }
}
// Remove from selected
async function removeFromSelected(findingId, userFindingId) {
    if (!userFindingId) {
        // Find the user finding ID based on the finding ID
        const userFinding = userFindings.find(uf => uf.finding_id === findingId);
        if (userFinding) {
            userFindingId = userFinding.id;
        } else {
            console.error('User finding not found for removal');
            return;
        }
    }
    
    try {
        const response = await fetch(`/api/user-findings/${userFindingId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error('Failed to remove finding');
        }
        
        // Remove from local data
        userFindings = userFindings.filter(uf => uf.id !== userFindingId);
        selectedForExport.delete(findingId);
        
        displayFindings();
        displaySelectedFindings();
        updateRiskChart();
    } catch (error) {
        console.error('Error removing finding:', error);
        alert('Failed to remove finding: ' + error.message);
    }
}

// Remove all user findings
async function removeAllUserFindings() {
    if (confirm('Are you sure you want to remove all findings? This cannot be undone.')) {
        try {
            const response = await fetch('/api/user-findings/delete-all', {
                method: 'POST'
            });
            
            if (!response.ok) {
                throw new Error('Failed to remove all findings');
            }
            
            // Clear local data
            userFindings = [];
            selectedForExport.clear();
            
            displayFindings();
            displaySelectedFindings();
            updateRiskChart();
        } catch (error) {
            console.error('Error removing all findings:', error);
            alert('Failed to remove all findings: ' + error.message);
        }
    }
}

// Toggle finding expansion
function toggleExpand(id) {
    id = parseInt(id);
    if (expandedFindings.has(id)) {
        expandedFindings.delete(id);
    } else {
        expandedFindings.add(id);
    }
    displayFindings();
    displaySelectedFindings();
}

// Toggle finding selection
function toggleFindingSelection(id) {
    id = parseInt(id);
    if (selectedFindings.has(id)) {
        selectedFindings.delete(id);
    } else {
        selectedFindings.add(id);
    }
    displayFindings();
    displaySelectedFindings();
}

// Open edit modal for database findings
function openEditModal(id) {
    id = parseInt(id);
    const finding = findings.find(f => f.id === id);
    if (finding) {
        document.getElementById('editTitle').value = finding.title;
        document.getElementById('editRiskRating').value = finding.risk_rating;
        document.getElementById('editDescription').value = finding.description;
        document.getElementById('editImpact').value = finding.impact;
        document.getElementById('editResolution').value = finding.resolution;
        document.getElementById('editFindingId').value = finding.id;
        
        // Set tags
        if (window.editFindingTags) {
            window.editFindingTags.setTags(finding.category ? finding.category.split(',').map(tag => tag.trim()) : []);
        }
        
        // Set save button action
        const saveButton = document.getElementById('saveEditedFinding');
        saveButton.onclick = saveEditedFinding;
        
        // Show modal
        const editModal = new bootstrap.Modal(document.getElementById('editFindingModal'));
        editModal.show();
    }
}

// Open edit modal for user findings
function openUserFindingEditModal(id) {
    const userFinding = userFindings.find(uf => uf.id === id);
    if (userFinding) {
        document.getElementById('editTitle').value = userFinding.title;
        document.getElementById('editRiskRating').value = userFinding.risk_rating;
        document.getElementById('editDescription').value = userFinding.description;
        document.getElementById('editImpact').value = userFinding.impact;
        document.getElementById('editResolution').value = userFinding.resolution;
        document.getElementById('editFindingId').value = userFinding.id;
        
        // Set tags
        if (window.editFindingTags) {
            window.editFindingTags.setTags(userFinding.category ? userFinding.category.split(',').map(tag => tag.trim()) : []);
        }
        
        // Set save button action
        const saveButton = document.getElementById('saveEditedFinding');
        saveButton.onclick = saveUserFinding;
        
        // Show modal
        const editModal = new bootstrap.Modal(document.getElementById('editFindingModal'));
        editModal.show();
    }
}

// Save edited database finding
async function saveEditedFinding() {
    const id = document.getElementById('editFindingId').value;
    const formData = {
        id: id,
        title: document.getElementById('editTitle').value,
        risk_rating: document.getElementById('editRiskRating').value,
        description: document.getElementById('editDescription').value,
        impact: document.getElementById('editImpact').value,
        resolution: document.getElementById('editResolution').value,
        category: document.getElementById('editCategoryTags').value
    };
    
    try {
        const response = await fetch(`/api/findings/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        
        if (response.ok) {
            const updatedFinding = await response.json();
            const index = findings.findIndex(f => f.id === parseInt(id));
            if (index !== -1) {
                findings[index] = updatedFinding;
            }
            
            notifyFindingsUpdated();
            displayFindings();
            displaySelectedFindings();
            
            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('editFindingModal'));
            modal.hide();
        } else {
            throw new Error('Failed to update finding');
        }
    } catch (error) {
        console.error('Error updating finding:', error);
        alert('Failed to update finding: ' + error.message);
    }
}

// Save user finding (edited selected finding)
async function saveUserFinding() {
    const id = parseInt(document.getElementById('editFindingId').value);
    const formData = {
        title: document.getElementById('editTitle').value,
        risk_rating: document.getElementById('editRiskRating').value,
        description: document.getElementById('editDescription').value,
        impact: document.getElementById('editImpact').value,
        resolution: document.getElementById('editResolution').value,
        category: document.getElementById('editCategoryTags').value
    };
    
    try {
        const response = await fetch(`/api/user-findings/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        
        if (!response.ok) {
            throw new Error('Failed to update finding');
        }
        
        const updatedFinding = await response.json();
        
        // Update local data
        const index = userFindings.findIndex(uf => uf.id === id);
        if (index !== -1) {
            userFindings[index] = updatedFinding;
        }
        
        displaySelectedFindings();
        updateRiskChart();
        
        // Close modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('editFindingModal'));
        modal.hide();
    } catch (error) {
        console.error('Error updating finding:', error);
        alert('Failed to update finding: ' + error.message);
    }
}

async function saveAdditionalFields(userFindingId) {
    const userFinding = userFindings.find(uf => uf.id === userFindingId);
    if (!userFinding) {
        console.error('User finding not found');
        return;
    }
    
    const resourcesTextarea = document.getElementById(`resources_${userFindingId}`);
    const resources = resourcesTextarea.value;

    // Get the CKEditor instance for evidence
    const evidenceEditor = ClassicEditor.instances[`evidence_${userFindingId}`];
    let evidence = '';
    
    if (evidenceEditor) {
        evidence = evidenceEditor.getData();
        console.log(`CKEditor data for evidence_${userFindingId}:`, evidence);
    } else {
        console.error(`CKEditor instance not found for evidence_${userFindingId}`);
        return;
    }
    
    try {
        const response = await fetch(`/api/user-findings/${userFindingId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                resources_affected: resources,
                evidence: evidence
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to save additional fields');
        }
        
        // Update the user finding object directly
        userFinding.resources_affected = resources;
        userFinding.evidence = evidence;
        
        displaySelectedFindings();
        
        // Show save confirmation
        const saveButton = document.querySelector(`#resources_${userFindingId}`).closest('.finding-details').querySelector('button');
        const originalText = saveButton.textContent;
        
        saveButton.textContent = 'Saved!';
        saveButton.classList.add('btn-success');
        saveButton.classList.remove('btn-primary');
        
        setTimeout(() => {
            saveButton.textContent = originalText;
            saveButton.classList.remove('btn-success');
            saveButton.classList.add('btn-primary');
        }, 1500);
    } catch (error) {
        console.error('Error saving fields:', error);
        alert('Failed to save: ' + error.message);
    }
}


// Calculate risk distribution
function calculateRiskDistribution() {
    const distribution = {
        'Critical': 0,
        'High': 0,
        'Medium': 0,
        'Low': 0,
        'Informational': 0
    };
    
    // Count findings for each risk level
    userFindings.forEach(userFinding => {
        distribution[userFinding.risk_rating]++;
    });
    
    return distribution;
}

// Update risk distribution chart
function updateRiskChart() {
    const chartContainer = document.getElementById('riskChart');
    if (!chartContainer) return;
    
    const distribution = calculateRiskDistribution();
    const total = Object.values(distribution).reduce((a, b) => a + b, 0);
    
    if (total === 0) {
        chartContainer.innerHTML = '<div class="text-muted small">No findings selected</div>';
        return;
    }
    
    // Create chart data
    const chartData = Object.entries(distribution)
        .filter(([_, count]) => count > 0)
        .map(([risk, count]) => {
            const percentage = Math.round((count / total) * 100);
            return { risk, count, percentage };
        });
    
    // Sort chart data by severity
    const riskOrder = ['Critical', 'High', 'Medium', 'Low', 'Informational'];
    chartData.sort((a, b) => riskOrder.indexOf(a.risk) - riskOrder.indexOf(b.risk));
    
    // Create HTML for the chart
    const chartHtml = chartData.map(item => {
        const colorClass = `bg-${getRiskBadgeColor(item.risk)}`;
        return `
            <div class="mb-2">
                <div class="d-flex justify-content-between align-items-center mb-1">
                    <span class="small text-light">${item.risk}</span>
                    <span class="small text-light">${item.percentage}% (${item.count})</span>
                </div>
                <div class="progress" style="height: 8px">
                    <div class="progress-bar ${colorClass}" role="progressbar" 
                         style="width: ${item.percentage}%" 
                         aria-valuenow="${item.percentage}" 
                         aria-valuemin="0" 
                         aria-valuemax="100"></div>
                </div>
            </div>
        `;
    }).join('');
    
    chartContainer.innerHTML = chartHtml;
}

// Get all unique categories from findings
function getAllCategories() {
    const categories = new Set();
    findings.forEach(finding => {
        if (finding.category) {
            finding.category.split(',').forEach(cat => {
                const trimmedCat = cat.trim();
                if (trimmedCat) {
                    categories.add(trimmedCat);
                }
            });
        }
    });
    return Array.from(categories).sort();
}

// Update category filters
function updateCategoryFilters() {
    const container = document.getElementById('categoryFilters');
    if (!container) return;
    
    const categories = getAllCategories();
    const searchTerm = document.getElementById('categorySearch')?.value.toLowerCase() || '';
    
    // Get category counts
    const categoryCounts = {};
    findings.forEach(finding => {
        if (finding.category) {
            finding.category.split(',').forEach(cat => {
                const trimmedCat = cat.trim();
                if (trimmedCat) {
                    categoryCounts[trimmedCat] = (categoryCounts[trimmedCat] || 0) + 1;
                }
            });
        }
    });
    
    // Get currently checked categories
    const checkedCategories = new Set(
        Array.from(container.querySelectorAll('.form-check-input:checked'))
            .map(checkbox => checkbox.getAttribute('data-category'))
    );
    
    // Filter categories based on rules:
    // 1. Always show checked/selected categories regardless of search term
    // 2. Show unchecked categories only if they match the search term
    const filteredCategories = categories.filter(cat => 
        checkedCategories.has(cat) || // Always show checked categories
        (searchTerm && cat.toLowerCase().includes(searchTerm)) // Show others only if they match search
    );
    
    // Handle empty states based on search context
    if (filteredCategories.length === 0) {
        // Only show "No categories found" when actively searching
        if (searchTerm) {
            container.innerHTML = '<div class="text-muted small">No categories found</div>';
        } else {
            container.innerHTML = ''; // Empty container when no search term
        }
        return;
    }
    
    // Generate HTML for category filters
    container.innerHTML = filteredCategories.map(category => `
        <div class="category-filter-item">
            <div class="form-check">
                <input class="form-check-input" type="checkbox" 
                       id="filterCategory_${category.replace(/\s+/g, '_')}" 
                       data-category="${category}"
                       ${checkedCategories.has(category) ? 'checked' : ''}>
                <label class="form-check-label" for="filterCategory_${category.replace(/\s+/g, '_')}">
                    ${category}
                </label>
            </div>
            <span class="category-filter-count">${categoryCounts[category] || 0}</span>
        </div>
    `).join('');
    
    // Add event listeners to new checkboxes
    container.querySelectorAll('.form-check-input').forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            // When checkbox state changes, update both the filters and findings
            displayFindings();
            updateCategoryFilters(); // Re-filter the categories based on new selection state
        });
    });
}

// Trigger findings updated event
function notifyFindingsUpdated() {
    document.dispatchEvent(new Event('findingsUpdated'));
}

// Initialize tag input
function initializeTagInput(inputElement, containerElement, hiddenInput) {
    if (!inputElement || !containerElement || !hiddenInput) return null;
    
    const tags = new Set();
    
    function addTag(tag) {
        tag = tag.trim();
        if (tag && !tags.has(tag)) {
            tags.add(tag);
            const tagElement = document.createElement('span');
            tagElement.className = 'tag';
            tagElement.innerHTML = `
                ${tag}
                <span class="remove-tag" data-tag="${tag}">&times;</span>
            `;
            containerElement.insertBefore(tagElement, inputElement);
            updateHiddenInput();
        }
        inputElement.value = '';
    }
    
    function removeTag(tag) {
        tags.delete(tag);
        const tagElements = containerElement.querySelectorAll('.tag');
        tagElements.forEach(el => {
            if (el.textContent.trim().replace('×', '').trim() === tag) {
                el.remove();
            }
        });
        updateHiddenInput();
    }
    
    function updateHiddenInput() {
        hiddenInput.value = Array.from(tags).join(',');
    }
    
    // Add event listeners
    inputElement.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            if (inputElement.value.trim()) {
                addTag(inputElement.value);
            }
        }
    });
    
    containerElement.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-tag')) {
            e.preventDefault();
            e.stopPropagation();
            const tag = e.target.getAttribute('data-tag');
            removeTag(tag);
        }
    });
    
    inputElement.addEventListener('blur', () => {
        if (inputElement.value.trim()) {
            addTag(inputElement.value);
        }
    });
    
    return {
        addTag,
        removeTag,
        getTags: () => Array.from(tags),
        setTags: (tagArray) => {
            tags.clear();
            containerElement.querySelectorAll('.tag').forEach(el => el.remove());
            if (tagArray && tagArray.length > 0) {
                tagArray.forEach(tag => addTag(tag));
            }
        }
    };
}

// Add a new finding
async function submitFinding() {
    const formData = {
        title: document.getElementById('title').value,
        risk_rating: document.getElementById('risk_rating').value,
        description: document.getElementById('description').value,
        impact: document.getElementById('impact').value,
        resolution: document.getElementById('resolution').value,
        category: document.getElementById('categoryTags').value
    };
    
    try {
        const response = await fetch('/api/findings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        
        if (response.ok) {
            const newFinding = await response.json();
            findings.push(newFinding);
            notifyFindingsUpdated();
            displayFindings();
            
            // Close modal and reset form
            const modal = bootstrap.Modal.getInstance(document.getElementById('addFindingModal'));
            modal.hide();
            document.getElementById('findingForm').reset();
            
            // Clear any tags
            if (window.addFindingTags) {
                window.addFindingTags.setTags([]);
            }
        } else {
            throw new Error('Failed to add finding');
        }
    } catch (error) {
        console.error('Error adding finding:', error);
        alert('Failed to add finding: ' + error.message);
    }
}

// Export findings to Word document
async function exportFindings() {
    if (userFindings.length === 0) {
        alert('Please select findings to export');
        return;
    }
    
    // Prepare export data using userFindings
    const exportData = {
        findings: userFindings.map(uf => uf.id),
        resources: {},
        evidence: {},
        edited_findings: {}
    };
    
    // Add resources, evidence, and edited findings from userFindings
    userFindings.forEach(uf => {
        const strId = uf.finding_id.toString();
        exportData.resources[strId] = uf.resources_affected || '';
        exportData.evidence[strId] = uf.evidence || '';
        
        // Add edited versions
        exportData.edited_findings[strId] = {
            id: uf.finding_id,
            title: uf.title,
            risk_rating: uf.risk_rating,
            description: uf.description,
            impact: uf.impact,
            resolution: uf.resolution,
            category: uf.category,
            created_at: uf.created_at
        };
    });
    
    try {
        const response = await fetch('/api/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(exportData)
        });
        
        if (response.ok) {
            // Download the file
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'security_findings.docx';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } else {
            throw new Error('Export failed');
        }
    } catch (error) {
        console.error('Error exporting findings:', error);
        alert('Failed to export findings: ' + error.message);
    }
}

// Export findings to JSON file
async function exportFindingsJson() {
    if (userFindings.length === 0) {
        alert('Please select findings to export');
        return;
    }
    
    // Prepare export data from userFindings
    const exportData = userFindings.map(userFinding => {
        return {
            id: userFinding.finding_id,
            title: userFinding.title,
            risk_rating: userFinding.risk_rating,
            description: userFinding.description,
            impact: userFinding.impact,
            resolution: userFinding.resolution,
            category: userFinding.category || '',
            resources_affected: userFinding.resources_affected || '',
            evidence: userFinding.evidence || ''
        };
    });
    
    // Create and download JSON file
    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'security_findings.json';
    document.body.appendChild(a);
    a.click();
    
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
}

// Export findings to CSV file
async function exportFindingsCsv() {
    if (userFindings.length === 0) {
        alert('Please select findings to export');
        return;
    }
    
    // Define CSV columns
    const columns = [
        'ID', 
        'Title', 
        'Risk Rating', 
        'Description', 
        'Impact', 
        'Resolution', 
        'Category',
        'Resources Affected',
        'Evidence'
    ];
    
    // Create CSV header row
    let csvContent = columns.join(',') + '\n';
    
    // Process each finding
    userFindings.forEach(userFinding => {
        // Create array of values for this row
        const rowData = [
            userFinding.finding_id,
            escapeCsvField(userFinding.title),
            escapeCsvField(userFinding.risk_rating),
            escapeCsvField(userFinding.description),
            escapeCsvField(userFinding.impact),
            escapeCsvField(userFinding.resolution),
            escapeCsvField(userFinding.category || ''),
            escapeCsvField(userFinding.resources_affected || ''),
            escapeCsvField(userFinding.evidence || '')
        ];
        
        // Add row to CSV content
        csvContent += rowData.join(',') + '\n';
    });
    
    // Create and download CSV file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'security_findings.csv';
    document.body.appendChild(a);
    a.click();
    
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
}

// Helper function to escape CSV fields
function escapeCsvField(field) {
    // Convert to string
    const str = String(field);
    
    // Check if we need to escape this field
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        // Escape quotes by doubling them and surround with quotes
        return '"' + str.replace(/"/g, '""') + '"';
    }
    
    return str;
}

// Import findings from JSON file
function importJSON() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.style.display = 'none';
    
    fileInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        
        try {
            const text = await file.text();
            const importedFindings = JSON.parse(text);
            let successCount = 0;
            
            for (const finding of importedFindings) {
                // Map fields based on possible formats
                const formattedFinding = {
                    title: finding.Title || finding.title || '',
                    description: finding.Description || finding.description || '',
                    impact: finding.Impact || finding.impact || '',
                    resolution: finding.Resolution || finding.resolution || '',
                    risk_rating: finding.Severity || finding.risk_rating || 'Medium',
                    category: finding.Category || finding.category || ''
                };
                
                // Skip if missing required fields
                if (!formattedFinding.title || !formattedFinding.description) {
                    console.warn('Skipping finding due to missing required fields:', finding);
                    continue;
                }
                
                try {
                    const response = await fetch('/api/findings', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(formattedFinding)
                    });
                    
                    if (response.ok) {
                        successCount++;
                    } else {
                        console.error('Failed to add finding:', formattedFinding.title);
                    }
                } catch (error) {
                    console.error('Error adding finding:', error);
                }
            }
            
            // Reload findings and show success message
            await loadFindings();
            alert(`Successfully imported ${successCount} findings`);
            
            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('addFindingModal'));
            if (modal) modal.hide();
        } catch (error) {
            console.error('Error parsing JSON:', error);
            alert('Error importing findings. Please check the file format.');
        }
    });
    
    document.body.appendChild(fileInput);
    fileInput.click();
    document.body.removeChild(fileInput);
}

// Delete selected findings
async function deleteSelectedFindings() {
    const findingsToDelete = Array.from(selectedFindings);
    if (findingsToDelete.length === 0) {
        alert('Please select findings to delete');
        return;
    }
    
    if (confirm('Are you sure you want to delete the selected findings?')) {
        try {
            const response = await fetch('/api/findings/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ findings: findingsToDelete })
            });
            
            if (response.ok) {
                // Remove deleted findings from the local array
                findings = findings.filter(f => !findingsToDelete.includes(f.id));
                selectedFindings.clear();
                
                notifyFindingsUpdated();
                displayFindings();
                displaySelectedFindings();
                
                alert('Findings deleted successfully');
            } else {
                throw new Error('Delete failed');
            }
        } catch (error) {
            console.error('Error deleting findings:', error);
            alert('Failed to delete findings: ' + error.message);
        }
    }
}

// Delete all findings (with PIN verification)
async function deleteAllFindings() {
    const pin = document.getElementById('pinInput').value;
    if (pin !== '12345') {
        alert('Incorrect PIN');
        return;
    }
    
    if (confirm('Are you sure you want to delete ALL findings? This cannot be undone.')) {
        try {
            const allIds = findings.map(f => f.id);
            const response = await fetch('/api/findings/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ findings: allIds })
            });
            
            if (response.ok) {
                // Clear all local data
                findings = [];
                selectedFindings.clear();
                
                // Also clear user findings if we delete all templates
                await removeAllUserFindings();
                
                displayFindings();
                displaySelectedFindings();
                updateRiskChart();
                
                // Close modal and reset PIN
                const pinModal = bootstrap.Modal.getInstance(document.getElementById('pinModal'));
                pinModal.hide();
                document.getElementById('pinInput').value = '';
                
                alert('All findings deleted successfully');
            } else {
                throw new Error('Delete failed');
            }
        } catch (error) {
            console.error('Error deleting findings:', error);
            alert('Failed to delete findings: ' + error.message);
        }
    }
}

// Handle logout
async function handleLogout() {
    try {
        const response = await fetch('/api/logout', { method: 'POST' });
        if (response.ok) {
            window.location.href = '/login';
        } else {
            throw new Error('Logout failed');
        }
    } catch (error) {
        console.error('Logout error:', error);
        alert('Failed to logout: ' + error.message);
    }
}

// Start everything once DOM is loaded
console.log('Script loaded, waiting for DOM...');
