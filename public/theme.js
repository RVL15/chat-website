// Advanced Theme System
const colors = {
    'ocean': { primary: '#2563EB', hover: '#1D4ED8' },
    'purple': { primary: '#7C3AED', hover: '#6D28D9' },
    'emerald': { primary: '#10B981', hover: '#059669' },
    'ruby': { primary: '#EF4444', hover: '#DC2626' },
    'orange': { primary: '#F97316', hover: '#EA580C' },
    'pink': { primary: '#EC4899', hover: '#DB2777' },
    'cyan': { primary: '#06B6D4', hover: '#0891B2' },
    'teal': { primary: '#14B8A6', hover: '#0F766E' },
    'indigo': { primary: '#4F46E5', hover: '#4338CA' },
    'amber': { primary: '#F59E0B', hover: '#D97706' },
    'lime': { primary: '#84CC16', hover: '#65A30D' },
    'violet': { primary: '#8B5CF6', hover: '#7C3AED' },
    'slate': { primary: '#64748B', hover: '#475569' },
    'gold': { primary: '#EAB308', hover: '#CA8A04' },
    'crimson': { primary: '#DC2626', hover: '#B91C1C' }
};

let currentSystemMediaQuery = null;

function applyThemeMode(mode) {
    const root = document.documentElement;
    let actualMode = mode;
    
    if (mode === 'system') {
        actualMode = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    
    if (actualMode === 'light') {
        root.classList.add('light-mode');
    } else {
        root.classList.remove('light-mode');
    }
    
    // Update active color variant for chat bubbles
    const savedColor = localStorage.getItem("themeColor");
    if (savedColor && colors[savedColor]) {
        applyColor(savedColor);
    }
    
    updateSettingsPanelUI();
}

function handleSystemThemeChange(e) {
    if (localStorage.getItem("themeMode") === "system") {
        applyThemeMode('system');
    }
}

function setThemeMode(mode) {
    localStorage.setItem("themeMode", mode);
    
    if (currentSystemMediaQuery) {
        currentSystemMediaQuery.removeEventListener('change', handleSystemThemeChange);
    }
    
    if (mode === 'system') {
        currentSystemMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        currentSystemMediaQuery.addEventListener('change', handleSystemThemeChange);
    }
    
    applyThemeMode(mode);
}

function applyColor(colorKey) {
    const colorTheme = colors[colorKey];
    if (!colorTheme) return;
    const root = document.documentElement;
    
    root.style.setProperty('--primary', colorTheme.primary);
    root.style.setProperty('--primary-hover', colorTheme.hover);
    root.style.setProperty('--wa-green', colorTheme.primary);
    
    localStorage.setItem("themePrimary", colorTheme.primary);
    localStorage.setItem("themeHover", colorTheme.hover);
    localStorage.setItem("themeColor", colorKey);
    
    updateSettingsPanelUI();
}

function setThemeColor(colorKey) {
    applyColor(colorKey);
    if (typeof showToast === "function") {
        showToast("Theme color updated", "success");
    }
}

function setFontSize(size) {
    const sizes = { 'small': '12px', 'medium': '14px', 'large': '16px' };
    if (!sizes[size]) return;
    document.documentElement.style.setProperty('--base-font-size', sizes[size]);
    localStorage.setItem("themeFontSize", size);
    updateSettingsPanelUI();
}

function setLayoutCompactness(isCompact) {
    const factor = isCompact ? '0.75' : '1';
    document.documentElement.style.setProperty('--compact-factor', factor);
    localStorage.setItem("themeCompact", isCompact ? "true" : "false");
    updateSettingsPanelUI();
}

function setAnimationsEnabled(enabled) {
    if (!enabled) {
        document.documentElement.classList.add('no-animations');
    } else {
        document.documentElement.classList.remove('no-animations');
    }
    localStorage.setItem("themeAnimations", enabled ? "true" : "false");
    updateSettingsPanelUI();
}

function initTheme() {
    // Mode
    const mode = localStorage.getItem("themeMode") || "light";
    setThemeMode(mode);
    
    // Color
    const color = localStorage.getItem("themeColor");
    if (color && colors[color]) applyColor(color);
    else applyColor('purple'); // default
    
    // Font Size
    const fontSize = localStorage.getItem("themeFontSize") || "medium";
    setFontSize(fontSize);
    
    // Layout
    const isCompact = localStorage.getItem("themeCompact") === "true";
    setLayoutCompactness(isCompact);
    
    // Animations
    const animationsEnabled = localStorage.getItem("themeAnimations") !== "false";
    setAnimationsEnabled(animationsEnabled);
    
    injectCustomizationPanel();
}

function updateSettingsPanelUI() {
    // Mode
    const mode = localStorage.getItem("themeMode") || "light";
    document.querySelectorAll('.theme-mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    
    // Color
    const color = localStorage.getItem("themeColor") || "purple";
    document.querySelectorAll('.theme-color-btn').forEach(btn => {
        btn.style.boxShadow = btn.dataset.color === color ? '0 0 0 2px var(--bg-panel), 0 0 0 4px var(--primary)' : 'none';
    });
    
    // Font
    const font = localStorage.getItem("themeFontSize") || "medium";
    document.querySelectorAll('.theme-font-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.size === font);
    });
    
    // Toggles
    const compactToggle = document.getElementById('compactLayoutToggle');
    if (compactToggle) compactToggle.checked = localStorage.getItem("themeCompact") === "true";
    
    const animToggle = document.getElementById('animationsToggle');
    if (animToggle) animToggle.checked = localStorage.getItem("themeAnimations") !== "false";
}

function injectCustomizationPanel() {
    if (document.getElementById('advancedSettingsPanel')) return;
    
    const panelHTML = `
        <div id="advancedSettingsOverlay" class="settings-overlay" onclick="closeCustomizationPanel()"></div>
        <div id="advancedSettingsPanel" class="settings-panel">
            <div class="settings-header">
                <h2>Appearance</h2>
                <button class="btn-icon" onclick="closeCustomizationPanel()">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
            
            <div class="settings-content">
                <!-- Theme Mode -->
                <div class="settings-section">
                    <h3>Theme</h3>
                    <div class="segmented-control">
                        <button class="theme-mode-btn" data-mode="light" onclick="setThemeMode('light')">Light</button>
                        <button class="theme-mode-btn" data-mode="dark" onclick="setThemeMode('dark')">Dark</button>
                        <button class="theme-mode-btn" data-mode="system" onclick="setThemeMode('system')">System</button>
                    </div>
                </div>

                <!-- Accent Color -->
                <div class="settings-section">
                    <h3>Accent Color</h3>
                    <div class="color-grid">
                        ${Object.keys(colors).map(key => `
                            <button class="theme-color-btn" data-color="${key}" onclick="setThemeColor('${key}')" 
                                style="background: ${colors[key].primary};" title="${key.charAt(0).toUpperCase() + key.slice(1)}"></button>
                        `).join('')}
                    </div>
                </div>

                <!-- Font Size -->
                <div class="settings-section">
                    <h3>Font Size</h3>
                    <div class="segmented-control">
                        <button class="theme-font-btn" data-size="small" onclick="setFontSize('small')">Small</button>
                        <button class="theme-font-btn" data-size="medium" onclick="setFontSize('medium')">Medium</button>
                        <button class="theme-font-btn" data-size="large" onclick="setFontSize('large')">Large</button>
                    </div>
                </div>

                <!-- Layout -->
                <div class="settings-section">
                    <h3>Layout & Animations</h3>
                    <label class="toggle-row">
                        <span>Compact Layout</span>
                        <input type="checkbox" id="compactLayoutToggle" class="ios-toggle" onchange="setLayoutCompactness(this.checked)">
                    </label>
                    <label class="toggle-row">
                        <span>Enable Animations</span>
                        <input type="checkbox" id="animationsToggle" class="ios-toggle" onchange="setAnimationsEnabled(this.checked)">
                    </label>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', panelHTML);
    updateSettingsPanelUI();
}

function openCustomizationPanel() {
    const overlay = document.getElementById('advancedSettingsOverlay');
    const panel = document.getElementById('advancedSettingsPanel');
    if (overlay && panel) {
        overlay.classList.add('active');
        panel.classList.add('active');
    }
}

function closeCustomizationPanel() {
    const overlay = document.getElementById('advancedSettingsOverlay');
    const panel = document.getElementById('advancedSettingsPanel');
    if (overlay && panel) {
        overlay.classList.remove('active');
        panel.classList.remove('active');
    }
}

window.setThemeMode = setThemeMode;
window.setThemeColor = setThemeColor;
window.setFontSize = setFontSize;
window.setLayoutCompactness = setLayoutCompactness;
window.setAnimationsEnabled = setAnimationsEnabled;
window.openCustomizationPanel = openCustomizationPanel;
window.closeCustomizationPanel = closeCustomizationPanel;

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTheme);
} else {
    initTheme();
}

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(registration => {
            console.log('ServiceWorker registration successful with scope: ', registration.scope);
        }).catch(err => {
            console.log('ServiceWorker registration failed: ', err);
        });
    });
}
