let userApiKey = "";

document.addEventListener('DOMContentLoaded', () => {
    loadTitles();
});

function saveApiKey() {
    const input = document.getElementById('apiKeyInput');
    if (input.value.trim() !== "") {
        userApiKey = input.value.trim();
        document.getElementById('apiKeyOverlay').classList.add('hidden');
    } else {
        alert("Please enter a valid API Key.");
    }
}

function toggleSidebar() {
    document.getElementById('appSidebar').classList.toggle('closed');
}

// ============================================
// KATEX AUTO-RENDER CONFIGURATION
// ============================================
const katexOptions = {
    delimiters: [
        {left: "$$", right: "$$", display: true}, // Block Math
        {left: "$", right: "$", display: false},  // Inline Math (Standard LaTeX)
        {left: "`", right: "`", display: false}   // Inline Math (Gemini/Markdown style)
    ],
    throwOnError: false,
    output: 'html'
};

// Helper function to render math in a specific element
function renderMath(element) {
    if (element && window.renderMathInElement) {
        renderMathInElement(element, katexOptions);
    }
}

// ============================================
// THE PARSER ENGINE (Text Formatting & Citations)
// ============================================
function formatRichText(text) {
    if (!text) return "";

    // 1. Sanitize Basic HTML
    let safeText = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // 2. Formatting Markdown
    safeText = safeText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    safeText = safeText.replace(/\*(.*?)\*/g, '<em>$1</em>');
    safeText = safeText.replace(/\n/g, '<br>');

    // 3. CITATION FEATURE [Ref: ID] -> Clickable Link
    // Uses flexible regex to catch [Ref: 1] or [Ref:1]
    safeText = safeText.replace(/\[Ref:\s*(\d+)\]/g, (match, id) => {
        return `<a class="citation-link" onclick="focusSource(${id})">Ref: ${id}</a>`;
    });

    return safeText;
}

// ============================================
// DATA LOADING
// ============================================

async function saveContent() {
    const title = document.getElementById('contentTitle').value;
    const text = document.getElementById('contentInput').value;
    if(!text || !title) return alert("Title and Text required.");

    try {
        const res = await fetch('/save_content', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({title, text})
        });
        const data = await res.json();
        if(data.status === 'success') {
            document.getElementById('saveStatus').innerText = "✅ Saved!";
            document.getElementById('contentInput').value = "";
            document.getElementById('contentTitle').value = "";
            loadTitles();
            setTimeout(() => document.getElementById('saveStatus').innerText = "", 3000);
        }
    } catch (e) { alert("Error saving."); }
}

async function deleteItem(id, event) {
    event.stopPropagation();
    if(!confirm("Delete this item?")) return;
    try {
        await fetch(`/delete_content/${id}`, { method: 'DELETE' });
        loadTitles();
    } catch (e) { alert("Error deleting."); }
}

// --- KNOWLEDGE BASE: LOAD ITEMS ---
async function loadTitles() {
    try {
        const response = await fetch('/get_titles');
        const data = await response.json();
        const list = document.getElementById('savedList');
        list.innerHTML = "";

        if (data.titles) {
            data.titles.forEach(item => {
                const div = document.createElement('div');
                div.className = 'saved-item';
                
                const titleSpan = document.createElement('span');
                titleSpan.className = 'item-title';
                
                // 1. Set HTML with Formatting
                titleSpan.innerHTML = formatRichText(item.title);
                
                // 2. Render Math
                renderMath(titleSpan);

                titleSpan.onclick = () => openContentModal(item.id);

                const delBtn = document.createElement('button');
                delBtn.className = 'delete-btn';
                delBtn.innerHTML = '✖';
                delBtn.onclick = (e) => deleteItem(item.id, e);

                div.appendChild(titleSpan);
                div.appendChild(delBtn);
                list.appendChild(div);
            });
        }
    } catch (e) { console.error(e); }
}

// --- KNOWLEDGE BASE: SEARCH FEATURE (RESTORED) ---
function filterTitles() {
    const input = document.getElementById('searchInput');
    const filter = input.value.toLowerCase();
    const list = document.getElementById('savedList');
    const items = list.getElementsByClassName('saved-item');

    for (let i = 0; i < items.length; i++) {
        const titleSpan = items[i].getElementsByClassName('item-title')[0];
        if (titleSpan) {
            const txtValue = titleSpan.textContent || titleSpan.innerText;
            if (txtValue.toLowerCase().indexOf(filter) > -1) {
                items[i].style.display = "";
            } else {
                items[i].style.display = "none";
            }
        }
    }
}

async function openContentModal(id) {
    const response = await fetch(`/get_content/${id}`);
    const data = await response.json();
    if(data.status === "success") {
        const modalTitle = document.getElementById('modalTitle');
        const modalBody = document.getElementById('modalBody');

        modalTitle.innerHTML = formatRichText(data.title);
        modalBody.innerHTML = formatRichText(data.text);

        renderMath(modalTitle);
        renderMath(modalBody);
        
        document.getElementById('contentModal').classList.remove('hidden');
    }
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}

// ============================================
// GEMINI & CITATION LOGIC
// ============================================

async function askGemini() {
    const question = document.getElementById('questionInput').value;
    const responseDiv = document.getElementById('geminiResponse');
    const sourcesDiv = document.getElementById('sourcesContainer');
    const resultArea = document.getElementById('resultArea');

    if(!question) return;

    responseDiv.innerHTML = "<i>Gemini is thinking...</i>";
    sourcesDiv.innerHTML = "";
    resultArea.classList.remove('hidden');

    try {
        const response = await fetch('/ask_gemini', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                api_key: userApiKey,
                question: question
            })
        });

        const data = await response.json();

        if(data.error) {
            responseDiv.innerHTML = `<span style="color:red">API Error: ${data.error}</span>`;
            return;
        }

        // 1. Render Gemini Answer (Text + Citations)
        responseDiv.innerHTML = formatRichText(data.answer);
        renderMath(responseDiv);

        // 2. Render Referenced Sources
        data.sources.forEach((src) => {
            const card = document.createElement('div');
            card.className = 'card glass-panel source-card';
            card.id = `source-card-${src.id}`; // Crucial for focusSource()
            card.onclick = () => zoomSource(src.title, src.text);

            // Build Card HTML
            card.innerHTML = `<strong>${formatRichText(src.title)}</strong> [ID: ${src.id}]<br><hr style="border-color:#444">` + formatRichText(src.text);
            
            sourcesDiv.appendChild(card);
            
            // Render Math on Card
            renderMath(card);
        });

    } catch (e) {
        responseDiv.innerHTML = `<span style="color:red">Error: ${e.message}</span>`;
    }
}

// --- CITATION CLICK HANDLER ---
function focusSource(id) {
    const card = document.getElementById(`source-card-${id}`);
    if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('highlight-card');
        setTimeout(() => card.classList.remove('highlight-card'), 2000);
    } else {
        alert(`Source [Ref: ${id}] is cited but not found in the source list.`);
    }
}

function zoomSource(title, text) {
    const zoomTitle = document.getElementById('zoomTitle');
    const zoomBody = document.getElementById('zoomBody');

    zoomTitle.innerHTML = formatRichText(title);
    zoomBody.innerHTML = formatRichText(text);

    renderMath(zoomTitle);
    renderMath(zoomBody);

    document.getElementById('zoomModal').classList.remove('hidden');
}