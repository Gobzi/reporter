// Store findings data
let findings = [];
let selectedFindings = new Set();
let selectedForExport = new Set();
let expandedFindings = new Set();
let editedFindings = new Map(); 

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
        updateUserInfo(); // Add this line here
        loadSavedState();
        await loadFindings();
        setupEventListeners();
        initializeTagInputs();
        console.log('App initialized successfully');
    } catch (error) {
        console.error('Failed to initialize app:', error);
    }
}

// Load saved state
function loadSavedState() {
    const storedSelectedFindings = localStorage.getItem('selectedFindings');
    if (storedSelectedFindings) {
        try {
            selectedForExport = new Set(JSON.parse(storedSelectedFindings));
        } catch (e) {
            console.error('Error parsing stored findings:', e);
        }
    }
    
    // Load edited findings from localStorage
    const stored = localStorage.getItem('editedFindings');
    if (stored) {
        try {
            editedFindings = new Map(JSON.parse(stored));
        } catch (e) {
            console.error('Error parsing edited findings:', e);
        }
    }
}

// Save edited findings to localStorage
function saveEditedFindings() {
    localStorage.setItem('editedFindings', JSON.stringify(Array.from(editedFindings.entries())));
}

// Get the correct version of a finding (edited or original)
function getFinding(id) {
    id = parseInt(id);
    const editedVersion = editedFindings.get(id);
    if (editedVersion) {
        return editedVersion;
    }
    return findings.find(f => f.id === id);
}

// Update the user info in the sidebar
function updateUserInfo() {
    const userInfoElement = document.getElementById('user-info-display');
    if (userInfoElement && currentUser) {
        userInfoElement.textContent = `${currentUser.username}`;
    }
}

// Check authentication status
async function checkAuth() {
    try {
        const response = await fetch('/api/check-auth');
        if (response.ok) {
            const data = await response.json();
            if (data.authenticated) {
                currentUser = data.user;
                console.log('User authenticated:', currentUser.username);
                return true;
            } else {
                window.location.href = '/login';
                return false;
            }
        } else {
            window.location.href = '/login';
            return false;
        }
    } catch (error) {
        console.error('Auth check error:', error);
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
    document.getElementById('importJSON')?.addEventListener('click', importJSON);
    document.getElementById('exportJsonBtn')?.addEventListener('click', exportFindingsJson);
    document.getElementById('exportCsvBtn')?.addEventListener('click', exportFindingsCsv);
    document.getElementById('deleteSelected')?.addEventListener('click', deleteSelectedFindings);
    document.getElementById('confirmDeleteAll')?.addEventListener('click', deleteAllFindings);
    document.getElementById('logoutButton')?.addEventListener('click', handleLogout);
    
    // Selected findings management buttons
    document.getElementById('addToSelected')?.addEventListener('click', function() {
        selectedFindings.forEach(id => {
            selectedForExport.add(id);
        });
        selectedFindings.clear();
        localStorage.setItem('selectedFindings', JSON.stringify(Array.from(selectedForExport)));
        displayFindings();
        displaySelectedFindings();
        updateRiskChart();
    });
    
    document.getElementById('removeSelected')?.addEventListener('click', function() {
        selectedFindings.forEach(id => {
            selectedForExport.delete(id);
            editedFindings.delete(id);
            localStorage.removeItem(`resources_${id}`);
            localStorage.removeItem(`evidence_${id}`);
        });
        saveEditedFindings();
        localStorage.setItem('selectedFindings', JSON.stringify(Array.from(selectedForExport)));
        selectedFindings.clear();
        displayFindings();
        displaySelectedFindings();
        updateRiskChart();
    });
    
    document.getElementById('removeAll')?.addEventListener('click', function() {
        selectedForExport.forEach(id => {
            localStorage.removeItem(`resources_${id}`);
            localStorage.removeItem(`evidence_${id}`);
        });
        selectedForExport.clear();
        editedFindings.clear();
        saveEditedFindings();
        localStorage.removeItem('selectedFindings');
        displayFindings();
        displaySelectedFindings();
        updateRiskChart();
    });
    
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
                return;
            }
            
            const id = parseInt(this.dataset.id);
            toggleExpand(id);
        });
    });
}

// Display selected findings
function displaySelectedFindings() {
    const container = document.getElementById('selectedFindings');
    if (!container) return;
    
    const selectedFindingsList = findings.filter(f => selectedForExport.has(f.id));
    
    // Show empty state if no findings are selected
    if (selectedFindingsList.length === 0) {
        container.innerHTML = '<div class="alert alert-info">No findings selected</div>';
        return;
    }
    
    // Render selected findings
    container.innerHTML = selectedFindingsList
        .map(finding => {
            // Get edited version if it exists
            const displayFinding = getFinding(finding.id);
            const resourcesAffected = localStorage.getItem(`resources_${finding.id}`) || '';
            const evidence = localStorage.getItem(`evidence_${finding.id}`) || '';
            
            return `
                <div class="card finding-card ${selectedFindings.has(finding.id) ? 'selected' : ''}" 
                     data-id="${finding.id}">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-center">
                            <div class="d-flex align-items-center">
                                <span class="badge bg-${getRiskBadgeColor(displayFinding.risk_rating)}">${displayFinding.risk_rating}</span>
                                <h5 class="card-title mb-0 ms-2">${displayFinding.title}</h5>
                            </div>
                            <div class="d-flex align-items-center">
                                <button class="btn btn-sm btn-danger me-1" onclick="removeFromSelected(${finding.id}); event.stopPropagation();">← Remove</button>
                                <button class="btn btn-sm btn-outline-secondary me-1" onclick="toggleFindingSelection(${finding.id}); event.stopPropagation();">Select</button>
                                <button class="btn btn-sm btn-outline-primary" onclick="openSelectedEditModal(${finding.id}); event.stopPropagation();">Edit</button>
                            </div>
                        </div>
                        <div class="finding-details ${expandedFindings.has(finding.id) ? 'show' : ''}">
                            <div class="detail-label">Description:</div>
                            <p class="mb-3">${displayFinding.description}</p>
                            <div class="detail-label">Impact:</div>
                            <p class="mb-3">${displayFinding.impact}</p>
                            <div class="detail-label">Resolution:</div>
                            <p class="mb-3">${displayFinding.resolution}</p>
                            ${displayFinding.category ? `
                            <div class="detail-label">Categories:</div>
                            <div class="tags-display">
                                ${displayFinding.category.split(',').filter(tag => tag.trim()).map(tag => 
                                    `<span class="category-tag">${tag.trim()}</span>`
                                ).join('')}
                            </div>
                            ` : ''}
                            <div class="detail-label">Resources Affected:</div>
                            <textarea class="form-control mb-3" id="resources_${finding.id}" rows="2">${resourcesAffected}</textarea>
                            <div class="detail-label">Evidence and Reproduction Steps:</div>
                            <textarea class="form-control mb-3" id="evidence_${finding.id}" rows="4">${evidence}</textarea>
                            <button class="btn btn-sm btn-primary mt-2" onclick="saveAdditionalFields(${finding.id}); event.stopPropagation();">Save</button>
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
                event.target.closest('button')
            ) {
                return;
            }
            
            const id = parseInt(this.dataset.id);
            toggleExpand(id);
        });
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

// Add finding to selected
function addToSelected(id) {
    id = parseInt(id);
    selectedForExport.add(id);
    localStorage.setItem('selectedFindings', JSON.stringify(Array.from(selectedForExport)));
    displayFindings();
    displaySelectedFindings();
    updateRiskChart();
}

// Remove from selected
function removeFromSelected(id, event) {
    if (event) {
        event.stopPropagation();
    }
    id = parseInt(id);
    selectedForExport.delete(id);
    editedFindings.delete(id);
    saveEditedFindings();
    localStorage.removeItem(`resources_${id}`);
    localStorage.removeItem(`evidence_${id}`);
    localStorage.setItem('selectedFindings', JSON.stringify(Array.from(selectedForExport)));
    displayFindings();
    displaySelectedFindings();
    updateRiskChart();
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

// Open edit modal for selected findings
function openSelectedEditModal(id) {
    id = parseInt(id);
    const finding = getFinding(id);
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
        saveButton.onclick = saveSelectedFinding;
        
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

// Save selected finding (locally only)
function saveSelectedFinding() {
    const id = parseInt(document.getElementById('editFindingId').value);
    const editedFinding = {
        id: id,
        title: document.getElementById('editTitle').value,
        risk_rating: document.getElementById('editRiskRating').value,
        description: document.getElementById('editDescription').value,
        impact: document.getElementById('editImpact').value,
        resolution: document.getElementById('editResolution').value,
        category: document.getElementById('editCategoryTags').value,
        created_at: getFinding(id).created_at
    };
    
    editedFindings.set(id, editedFinding);
    saveEditedFindings();
    displaySelectedFindings();
    updateRiskChart();
    
    // Close modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('editFindingModal'));
    modal.hide();
}

// Save additional fields (Resources Affected and Evidence)
function saveAdditionalFields(id) {
    id = parseInt(id);
    const resources = document.getElementById(`resources_${id}`).value;
    const evidence = document.getElementById(`evidence_${id}`).value;
    
    localStorage.setItem(`resources_${id}`, resources);
    localStorage.setItem(`evidence_${id}`, evidence);
    
    // Show save confirmation
    const saveButton = document.querySelector(`#resources_${id}`).closest('.finding-details').querySelector('button');
    const originalText = saveButton.textContent;
    
    saveButton.textContent = 'Saved!';
    saveButton.classList.add('btn-success');
    saveButton.classList.remove('btn-primary');
    
    setTimeout(() => {
        saveButton.textContent = originalText;
        saveButton.classList.remove('btn-success');
        saveButton.classList.add('btn-primary');
    }, 1500);
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
    Array.from(selectedForExport).forEach(id => {
        const finding = getFinding(id);
        if (finding) {
            distribution[finding.risk_rating]++;
        }
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

// Also modify the category search listener to correctly handle when input is cleared
document.getElementById('categorySearch')?.addEventListener('input', function() {
    updateCategoryFilters();
});

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
    const findingsToExport = Array.from(selectedForExport);
    if (findingsToExport.length === 0) {
        alert('Please select findings to export');
        return;
    }
    
    // Prepare export data
    const exportData = {
        findings: findingsToExport,
        resources: {},
        evidence: {},
        edited_findings: {}
    };
    
    // Add resources, evidence, and edited findings
    findingsToExport.forEach(id => {
        const strId = id.toString();
        exportData.resources[strId] = localStorage.getItem(`resources_${id}`) || '';
        exportData.evidence[strId] = localStorage.getItem(`evidence_${id}`) || '';
        
        // Add edited versions if they exist
        const editedVersion = editedFindings.get(id);
        if (editedVersion) {
            exportData.edited_findings[strId] = editedVersion;
        }
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
                selectedForExport.clear();
                editedFindings.clear();
                
                saveEditedFindings();
                localStorage.removeItem('selectedFindings');
                
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

// Helper for finding buttons by text when regular ID selectors aren't working
function findButtonByText(buttonText) {
    const buttons = document.querySelectorAll('button');
    for (const button of buttons) {
        if (button.textContent.trim() === buttonText) {
            return button;
        }
    }
    return null;
}

// Export findings to JSON file
async function exportFindingsJson() {
    const findingsToExport = Array.from(selectedForExport);
    if (findingsToExport.length === 0) {
        alert('Please select findings to export');
        return;
    }
    
    // Prepare export data
    const exportData = [];
    
    // Collect all findings data
    findingsToExport.forEach(id => {
        const finding = getFinding(id);
        if (finding) {
            // Collect additional data
            const resourcesAffected = localStorage.getItem(`resources_${id}`) || '';
            const evidence = localStorage.getItem(`evidence_${id}`) || '';
            
            // Create complete finding object
            const findingData = {
                id: finding.id,
                title: finding.title,
                risk_rating: finding.risk_rating,
                description: finding.description,
                impact: finding.impact,
                resolution: finding.resolution,
                category: finding.category || '',
                resources_affected: resourcesAffected,
                evidence: evidence
            };
            
            exportData.push(findingData);
        }
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
    const findingsToExport = Array.from(selectedForExport);
    if (findingsToExport.length === 0) {
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
    findingsToExport.forEach(id => {
        const finding = getFinding(id);
        if (finding) {
            const resourcesAffected = localStorage.getItem(`resources_${id}`) || '';
            const evidence = localStorage.getItem(`evidence_${id}`) || '';
            
            // Create array of values for this row
            const rowData = [
                finding.id,
                escapeCsvField(finding.title),
                escapeCsvField(finding.risk_rating),
                escapeCsvField(finding.description),
                escapeCsvField(finding.impact),
                escapeCsvField(finding.resolution),
                escapeCsvField(finding.category || ''),
                escapeCsvField(resourcesAffected),
                escapeCsvField(evidence)
            ];
            
            // Add row to CSV content
            csvContent += rowData.join(',') + '\n';
        }
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




// Start everything once DOM is loaded
console.log('Script loaded, waiting for DOM...');
