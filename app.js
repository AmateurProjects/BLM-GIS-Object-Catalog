// app.js

// ====== UI FX HELPERS ======
function animatePanel(el, durationMs = 650) {
  if (!el) return;

  // Hide scrollbars globally during the animation (prevents transient page scrollbars)
  document.documentElement.classList.add('fx-no-scroll');
  document.body.classList.add('fx-no-scroll');
  el.classList.add('fx-animating');

  // Re-trigger CSS animation by toggling a class
  el.classList.remove('fx-enter');
  void el.offsetWidth; // Force reflow so the browser restarts the animation
  el.classList.add('fx-enter');

  // Always clean up (animationend may fire on child cards, not on the panel itself)
  window.setTimeout(() => {
    el.classList.remove('fx-animating');
    document.documentElement.classList.remove('fx-no-scroll');
    document.body.classList.remove('fx-no-scroll');
  }, durationMs);
}

// Adds stagger classes to the first N cards inside a panel
function staggerCards(panelEl, maxCards = 9) {
  if (!panelEl) return;
  const cards = panelEl.querySelectorAll('.card, .detail-section');
  // clear old delay classes
  cards.forEach((c) => {
    for (let i = 1; i <= 9; i++) c.classList.remove(`fx-d${i}`);
  });
  // assign new delay classes
  cards.forEach((c, idx) => {
    const n = Math.min(idx + 1, maxCards);
    c.classList.add(`fx-d${n}`);
  });
}

function setActiveListButton(listRootEl, predicateFn) {
  if (!listRootEl) return;
  const btns = listRootEl.querySelectorAll('button.list-item-button');
  btns.forEach((b) => {
    const isActive = predicateFn(b);
    b.classList.toggle('is-active', isActive);
  });
}

// ====== CONFIG ======
const CATALOG_URL = 'data/catalog.json';
// Repo layout: /index.html, /app.js, /styles.css, /data/catalog.json

// >>>>> SET THIS to your GitHub repo's "new issue" URL base
const GITHUB_NEW_ISSUE_BASE =
  'https://github.com/AmateurProjects/Public-Lands-Data-Catalog/issues/new';

// ====== CATALOG MODULE (shared loader + indexes) ======
const Catalog = (function () {
  let cache = null;
  let indexesBuilt = false;

  let attributeById = {};
  let objectById = {};
  let objectsByAttributeId = {};

  async function loadCatalog() {
    if (cache) return cache;
    const resp = await fetch(CATALOG_URL);
    if (!resp.ok) {
      throw new Error(`Failed to load catalog.json: ${resp.status}`);
    }

    const raw = await resp.json();

    // Normalize: allow legacy JSON keys while keeping app terminology clean.
    // Canonical app keys:
    // - raw.objects (preferred) or raw.datasets (legacy)
    // - raw.attributes (preferred)
    const normalized = {
      ...raw,
      objects: Array.isArray(raw.objects) ? raw.objects : Array.isArray(raw.datasets) ? raw.datasets : [],
      attributes: Array.isArray(raw.attributes) ? raw.attributes : [],
    };

    cache = normalized;
    buildIndexes();
    return cache;
  }

  function buildIndexes() {
    if (!cache || indexesBuilt) return;

    attributeById = {};
    objectById = {};
    objectsByAttributeId = {};

    // Attributes index
    (cache.attributes || []).forEach((a) => {
      if (a && a.id) attributeById[a.id] = a;
    });

    // Objects index + reverse index attribute -> objects
    (cache.objects || []).forEach((obj) => {
      if (obj && obj.id) objectById[obj.id] = obj;

      (obj.attribute_ids || []).forEach((attrId) => {
        if (!objectsByAttributeId[attrId]) objectsByAttributeId[attrId] = [];
        objectsByAttributeId[attrId].push(obj);
      });
    });

    indexesBuilt = true;
  }

  function getAttributeById(id) {
    return attributeById[id] || null;
  }

  function getObjectById(id) {
    return objectById[id] || null;
  }

  function getAttributesForObject(obj) {
    if (!obj || !obj.attribute_ids) return [];
    return obj.attribute_ids.map((id) => attributeById[id]).filter(Boolean);
  }

  function getObjectsForAttribute(attrId) {
    return objectsByAttributeId[attrId] || [];
  }

  function buildGithubIssueUrlForObject(obj) {
    const title = encodeURIComponent(`Object change request: ${obj.id}`);
    const bodyLines = [
      `Please describe the requested change for object \`${obj.id}\` (\`${obj.title || ''}\`).`,
      '',
      '---',
      '',
      'Current object JSON:',
      '```json',
      JSON.stringify(obj, null, 2),
      '```',
    ];
    const body = encodeURIComponent(bodyLines.join('\n'));
    return `${GITHUB_NEW_ISSUE_BASE}?title=${title}&body=${body}`;
  }

  function buildGithubIssueUrlForAttribute(attribute) {
    const title = encodeURIComponent(`Attribute change request: ${attribute.id}`);
    const bodyLines = [
      `Please describe the requested change for attribute \`${attribute.id}\` (\`${attribute.label || ''}\`).`,
      '',
      '---',
      '',
      'Current attribute JSON:',
      '```json',
      JSON.stringify(attribute, null, 2),
      '```',
    ];
    const body = encodeURIComponent(bodyLines.join('\n'));
    return `${GITHUB_NEW_ISSUE_BASE}?title=${title}&body=${body}`;
  }

  return {
    loadCatalog,
    getAttributeById,
    getObjectById,
    getAttributesForObject,
    getObjectsForAttribute,
    buildGithubIssueUrlForObject,
    buildGithubIssueUrlForAttribute,
  };
})();

// ====== MAIN APP (tabs, lists, detail panels) ======
document.addEventListener('DOMContentLoaded', async () => {
  // --- Elements ---
  const objectsTabBtn = document.getElementById('objectsTab');
  const attributesTabBtn = document.getElementById('attributesTab');
  const objectsView = document.getElementById('objectsView');
  const attributesView = document.getElementById('attributesView');

  const objectSearchInput = document.getElementById('objectSearchInput');
  const attributeSearchInput = document.getElementById('attributeSearchInput');

  const objectListEl = document.getElementById('objectList');
  const attributeListEl = document.getElementById('attributeList');

  const objectDetailEl = document.getElementById('objectDetail');
  const attributeDetailEl = document.getElementById('attributeDetail');

  // Track last viewed object so "Cancel" can return you to where you were.
  let lastSelectedObjectId = null;

  // Track last viewed attribute so list highlight + "Cancel" behave predictably.
  let lastSelectedAttributeId = null;

  // --- Edit Fields for Suggest Object Change functionality ---
  // NOTE: OBJECT_EDIT_FIELDS drives BOTH "Suggest change" and "Submit new object" pages
  const OBJECT_EDIT_FIELDS = [
    { key: 'title', label: 'Title', type: 'text' },
    { key: 'description', label: 'Description', type: 'textarea' },

    { key: 'objname', label: 'Database Object Name', type: 'text' },
    { key: 'topics', label: 'Topics (comma-separated)', type: 'csv' },

    { key: 'agency_owner', label: 'Agency Owner', type: 'text' },
    { key: 'office_owner', label: 'Office Owner', type: 'text' },
    { key: 'contact_email', label: 'Contact Email', type: 'text' },

    { key: 'geometry_type', label: 'Geometry Type', type: 'text' },
    { key: 'update_frequency', label: 'Update Frequency', type: 'text' },

    { key: 'status', label: 'Status', type: 'text' },
    { key: 'access_level', label: 'Access Level', type: 'text' },

    // Change 4 applies to Object *page*; we keep these fields in edit/create forms for now.
    { key: 'public_web_service', label: 'Public Web Service', type: 'text' },
    { key: 'internal_web_service', label: 'Internal Web Service', type: 'text' },
    { key: 'data_standard', label: 'Data Standard', type: 'text' },

    { key: 'notes', label: 'Notes', type: 'textarea' },
  ];

  // --- Edit Fields for Suggest Attribute Change functionality ---
const ATTRIBUTE_EDIT_FIELDS = [
  { key: 'label', label: 'Field Name', type: 'text' }, // was "Attribute Label"
  { key: 'definition', label: 'Definition', type: 'textarea' }, // moved up + renamed
  { key: 'type', label: 'Attribute Type', type: 'text' }, // no change
  { key: 'expected_value', label: 'Expected Input', type: 'text' }, // was "Example Expected Value"

  // Enumerations
  { key: 'values', label: 'Allowed values (JSON array) — for enumerated types', type: 'json' },

  // New fields
  { key: 'status', label: 'Status', type: 'text' },
  { key: 'data_standard', label: 'Data Standard', type: 'text' },
  { key: 'notes', label: 'Notes', type: 'textarea' },
];

  // --- Helpers (shared) ---
  function compactObject(obj) {
    const out = {};
    Object.keys(obj || {}).forEach((k) => {
      const v = obj[k];
      if (v === undefined || v === null) return;
      if (Array.isArray(v) && v.length === 0) return;
      if (typeof v === 'string' && v.trim() === '') return;
      out[k] = v;
    });
    return out;
  }

  function parseCsvList(str) {
    return String(str || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function tryParseJson(text) {
    const t = String(text || '').trim();
    if (!t) return null;
    try {
      return JSON.parse(t);
    } catch (e) {
      return { __parse_error__: e.message };
    }
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function goBackToLastObjectOrList() {
    showObjectsView();
    if (lastSelectedObjectId && Catalog.getObjectById(lastSelectedObjectId)) {
      renderObjectDetail(lastSelectedObjectId);
      return;
    }
    if (allObjects && allObjects.length) {
      renderObjectDetail(allObjects[0].id);
      return;
    }
    objectDetailEl && objectDetailEl.classList.add('hidden');
  }

  function goBackToAttributesListOrFirst() {
    showAttributesView();
    if (allAttributes && allAttributes.length) {
      renderAttributeDetail(allAttributes[0].id);
      return;
    }
    attributeDetailEl && attributeDetailEl.classList.add('hidden');
  }

  function computeChanges(original, updated) {
    const keys = new Set([...Object.keys(original || {}), ...Object.keys(updated || {})]);
    const changes = [];
    keys.forEach((k) => {
      const a = original ? original[k] : undefined;
      const b = updated ? updated[k] : undefined;
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        changes.push({ key: k, from: a, to: b });
      }
    });
    return changes;
  }

  function buildGithubIssueUrlForEditedObject(objectId, original, updated, changes) {
    const title = encodeURIComponent(`Object change request: ${objectId}`);

    const bodyLines = [
      `## Suggested changes for object: \`${objectId}\``,
      '',
      '### Summary of changes',
    ];

    if (!changes.length) {
      bodyLines.push('- No changes detected.');
    } else {
      changes.forEach((c) => {
        bodyLines.push(`- **${c.key}**: \`${JSON.stringify(c.from)}\` → \`${JSON.stringify(c.to)}\``);
      });
    }

    bodyLines.push(
      '',
      '---',
      '',
      '### Original object JSON',
      '```json',
      JSON.stringify(original, null, 2),
      '```',
      '',
      '### Updated object JSON',
      '```json',
      JSON.stringify(updated, null, 2),
      '```'
    );

    const body = encodeURIComponent(bodyLines.join('\n'));
    return `${GITHUB_NEW_ISSUE_BASE}?title=${title}&body=${body}`;
  }

  function buildGithubIssueUrlForNewObject(objectObj, newAttributes = []) {
    const titleBase = objectObj.id || objectObj.title || 'New object request';
    const title = encodeURIComponent(`New object request: ${titleBase}`);

    const bodyLines = [
      '## New object submission',
      '',
      'Please review the object proposal below. If approved, add it to `data/catalog.json` under `objects` (or legacy `datasets`).',
      '',
      '### Review checklist',
      '- [ ] ID is unique and follows naming conventions',
      '- [ ] Title/description are clear',
      '- [ ] Owner/contact info is present',
      '- [ ] Geometry type is correct (if applicable)',
      '- [ ] Attribute IDs are valid (existing or proposed below)',
      '- [ ] Services/standards links are valid (if provided)',
      '',
      '---',
      '',
      '### Proposed object JSON',
      '```json',
      JSON.stringify(objectObj, null, 2),
      '```',
    ];

    if (Array.isArray(newAttributes) && newAttributes.length) {
      bodyLines.push(
        '',
        '---',
        '',
        '### Proposed NEW attributes JSON (add under `attributes`)',
        '```json',
        JSON.stringify(newAttributes, null, 2),
        '```'
      );
    }

    const body = encodeURIComponent(bodyLines.join('\n'));
    return `${GITHUB_NEW_ISSUE_BASE}?title=${title}&body=${body}`;
  }

  function buildGithubIssueUrlForEditedAttribute(attrId, original, updated, changes) {
    const title = encodeURIComponent(`Attribute change request: ${attrId}`);

    const bodyLines = [
      `## Suggested changes for attribute: \`${attrId}\``,
      '',
      '### Summary of changes',
    ];

    if (!changes.length) {
      bodyLines.push('- No changes detected.');
    } else {
      changes.forEach((c) => {
        bodyLines.push(`- **${c.key}**: \`${JSON.stringify(c.from)}\` → \`${JSON.stringify(c.to)}\``);
      });
    }

    bodyLines.push(
      '',
      '---',
      '',
      '### Original attribute JSON',
      '```json',
      JSON.stringify(original, null, 2),
      '```',
      '',
      '### Updated attribute JSON',
      '```json',
      JSON.stringify(updated, null, 2),
      '```'
    );

    const body = encodeURIComponent(bodyLines.join('\n'));
    return `${GITHUB_NEW_ISSUE_BASE}?title=${title}&body=${body}`;
  }

  function buildGithubIssueUrlForNewAttributes(payload) {
    const title = encodeURIComponent(payload.title || 'New attribute(s) request');

    const bodyLines = [
      '## New attribute(s) submission',
      '',
      'Please review the attribute proposal below. If approved, add it to `data/catalog.json` under `attributes`.',
      '',
      '### Review checklist',
      '- [ ] ID(s) are unique and follow naming conventions',
      '- [ ] Type/definition are clear',
      '- [ ] Enumerations are complete (if applicable)',
      '',
      '---',
      '',
      '### Proposed attributes JSON',
      '```json',
      JSON.stringify(payload.attributes, null, 2),
      '```',
    ];

    if (payload.notes) {
      bodyLines.push('', '### Notes / context', payload.notes);
    }

    const body = encodeURIComponent(bodyLines.join('\n'));
    return `${GITHUB_NEW_ISSUE_BASE}?title=${title}&body=${body}`;
  }

  // ===========================
  // TAB SWITCHING
  // ===========================
  function showObjectsView() {
    objectsView.classList.remove('hidden');
    attributesView.classList.add('hidden');
    objectsTabBtn.classList.add('active');
    attributesTabBtn.classList.remove('active');
  }

  function showAttributesView() {
    attributesView.classList.remove('hidden');
    objectsView.classList.add('hidden');
    attributesTabBtn.classList.add('active');
    objectsTabBtn.classList.remove('active');
  }

  if (objectsTabBtn) objectsTabBtn.addEventListener('click', showObjectsView);
  if (attributesTabBtn) attributesTabBtn.addEventListener('click', showAttributesView);

  // --- Edit mode renderer ---
  function renderObjectEditForm(objectId) {
    if (!objectDetailEl) return;

    const obj = Catalog.getObjectById(objectId);
    if (!obj) return;

    const original = deepClone(obj);
    const draft = deepClone(obj);
    const attrs = Catalog.getAttributesForObject(obj);

    let html = '';

    html += `<h2>Editing: ${escapeHtml(obj.title || obj.id)}</h2>`;
    if (obj.description) html += `<p>${escapeHtml(obj.description)}</p>`;

    html += `<div class="card card-meta" id="objectEditCard">`;
    html += `<div class="object-edit-actions">
      <button type="button" class="btn" data-edit-cancel>Cancel</button>
      <button type="button" class="btn primary" data-edit-submit>Submit suggestion</button>
    </div>`;

    OBJECT_EDIT_FIELDS.forEach((f) => {
      const val = draft[f.key];

      if (f.type === 'textarea') {
        html += `
          <div class="object-edit-row">
            <label class="object-edit-label">${escapeHtml(f.label)}</label>
            <textarea class="object-edit-input" data-edit-key="${escapeHtml(f.key)}">${escapeHtml(val || '')}</textarea>
          </div>
        `;
      } else {
        const displayVal = f.type === 'csv' && Array.isArray(val) ? val.join(', ') : (val || '');
        html += `
          <div class="object-edit-row">
            <label class="object-edit-label">${escapeHtml(f.label)}</label>
            <input class="object-edit-input" type="text" data-edit-key="${escapeHtml(f.key)}" value="${escapeHtml(displayVal)}" />
          </div>
        `;
      }
    });

    html += `</div>`;

    // Attributes section unchanged (read-only)
    html += `
      <div class="card-row">
        <div class="card card-attributes">
          <h3>Attributes</h3>
    `;

    if (!attrs.length) {
      html += '<p>No attributes defined for this object.</p>';
    } else {
      html += '<ul>';
      attrs.forEach((attr) => {
        html += `
          <li>
            <button type="button" class="link-button" data-attr-id="${escapeHtml(attr.id)}">
              ${escapeHtml(attr.id)} – ${escapeHtml(attr.label || '')}
            </button>
          </li>`;
      });
      html += '</ul>';
    }

    html += `
        </div>
        <div class="card card-inline-attribute" id="inlineAttributeDetail">
          <h3>Attribute details</h3>
          <p>Select an attribute from the list to see its properties here without leaving this object.</p>
        </div>
      </div>
    `;

    objectDetailEl.innerHTML = html;
    objectDetailEl.classList.remove('hidden');

    // Animate ONLY when entering edit mode
    staggerCards(objectDetailEl);
    animatePanel(objectDetailEl);

    const attrButtons = objectDetailEl.querySelectorAll('button[data-attr-id]');
    attrButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const attrId = btn.getAttribute('data-attr-id');
        renderInlineAttributeDetail(attrId);
      });
    });

    const cancelBtn = objectDetailEl.querySelector('button[data-edit-cancel]');
    if (cancelBtn) cancelBtn.addEventListener('click', () => renderObjectDetail(objectId));

    const submitBtn = objectDetailEl.querySelector('button[data-edit-submit]');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        const inputs = objectDetailEl.querySelectorAll('[data-edit-key]');
        inputs.forEach((el) => {
          const k = el.getAttribute('data-edit-key');
          const raw = el.value;

          const fieldDef = OBJECT_EDIT_FIELDS.find((x) => x.key === k);
          if (fieldDef && fieldDef.type === 'csv') {
            draft[k] = parseCsvList(raw);
          } else {
            draft[k] = String(raw || '').trim();
          }
        });

        const updated = compactObject(draft);
        const origCompact = compactObject(original);
        const changes = computeChanges(origCompact, updated);

        const issueUrl = buildGithubIssueUrlForEditedObject(objectId, origCompact, updated, changes);

        // Return UI to normal view right away
        renderObjectDetail(objectId);

        // Then open GitHub issue
        window.open(issueUrl, '_blank', 'noopener');
      });
    }
  }

  function renderNewAttributeCreateForm(prefill = {}) {
    const hostEl = attributeDetailEl || objectDetailEl;
    if (!hostEl) return;

    const NEW_ATTR_PLACEHOLDERS =
      (catalogData && catalogData.ui && catalogData.ui.placeholders && catalogData.ui.placeholders.new_attribute) || {};

    function placeholderFor(key, fallback = '') {
      return escapeHtml(NEW_ATTR_PLACEHOLDERS[key] || fallback || '');
    }

    const draft = {
      mode: 'single', // 'single' | 'bulk'
      id: '',
      label: '',
      type: '',
      definition: '',
      expected_value: '',
      values_json: '',
      notes: '',
      bulk_json: '',
      bulk_notes: '',
      ...deepClone(prefill || {}),
    };

    let html = '';

    html += `<h2>Add a new attribute</h2>`;
    html += `<p class="modal-help">This will open a pre-filled GitHub Issue for review/approval by the catalog owner.</p>`;

    html += `
      <div class="card card-meta">
        <div class="object-edit-actions">
          <button type="button" class="btn ${draft.mode === 'single' ? 'primary' : ''}" data-new-attr-mode="single">Single</button>
          <button type="button" class="btn ${draft.mode === 'bulk' ? 'primary' : ''}" data-new-attr-mode="bulk">Bulk JSON</button>
          <span style="flex:1"></span>
          <button type="button" class="btn" data-new-attr-cancel>Cancel</button>
          <button type="button" class="btn primary" data-new-attr-submit>Submit suggestion</button>
        </div>
      </div>
    `;

    html += `<div class="card card-attribute-meta" id="newAttrSingleCard" ${draft.mode === 'bulk' ? 'style="display:none"' : ''}>`;

    html += `
      <div class="object-edit-row">
        <label class="object-edit-label">Attribute ID (required)</label>
        <input class="object-edit-input" type="text" data-new-attr-key="id"
               placeholder="${placeholderFor('id', 'e.g., STATE_NAME')}"
               value="${escapeHtml(draft.id || '')}" />
      </div>
    `;

    ATTRIBUTE_EDIT_FIELDS.forEach((f) => {
      const k = f.key;
      let val = '';
      if (k === 'values') val = draft.values_json || '';
      else val = draft[k] === undefined ? '' : String(draft[k] || '');

      if (f.type === 'textarea' || f.type === 'json') {
        html += `
          <div class="object-edit-row">
            <label class="object-edit-label">${escapeHtml(f.label)}</label>
            <textarea class="object-edit-input" data-new-attr-key="${escapeHtml(k)}"
              placeholder="${placeholderFor(k)}">${escapeHtml(val)}</textarea>
          </div>
        `;
      } else {
        html += `
          <div class="object-edit-row">
            <label class="object-edit-label">${escapeHtml(f.label)}</label>
            <input class="object-edit-input" type="text" data-new-attr-key="${escapeHtml(k)}"
              placeholder="${placeholderFor(k)}"
              value="${escapeHtml(val)}" />
          </div>
        `;
      }
    });

    html += `
      <div class="object-edit-row">
        <label class="object-edit-label">Notes / context (optional)</label>
        <textarea class="object-edit-input" data-new-attr-key="notes"
          placeholder="${placeholderFor('notes', 'any extra context for reviewers')}">${escapeHtml(draft.notes || '')}</textarea>
      </div>
    `;

    html += `</div>`;

    html += `<div class="card card-attribute-meta" id="newAttrBulkCard" ${draft.mode === 'single' ? 'style="display:none"' : ''}>`;
    html += `
      <div class="object-edit-row">
        <label class="object-edit-label">Bulk attributes JSON (required)</label>
        <textarea class="object-edit-input" data-new-attr-bulk="json" rows="12"
          placeholder="${placeholderFor('bulk_attributes_json', '[{ \"id\": \"...\", \"label\": \"...\" }]')}">${escapeHtml(draft.bulk_json || '')}</textarea>
      </div>
      <div class="object-edit-row">
        <label class="object-edit-label">Notes / context (optional)</label>
        <textarea class="object-edit-input" data-new-attr-bulk="notes"
          placeholder="${placeholderFor('bulk_notes', 'any extra context for reviewers')}">${escapeHtml(draft.bulk_notes || '')}</textarea>
      </div>
    `;
    html += `</div>`;

    hostEl.innerHTML = html;
    hostEl.classList.remove('hidden');

    // Animate ONLY when entering create page
    staggerCards(hostEl);
    animatePanel(hostEl);

    const cancelBtn = hostEl.querySelector('button[data-new-attr-cancel]');
    if (cancelBtn) cancelBtn.addEventListener('click', goBackToAttributesListOrFirst);

    const modeBtns = hostEl.querySelectorAll('button[data-new-attr-mode]');
    const singleCard = hostEl.querySelector('#newAttrSingleCard');
    const bulkCard = hostEl.querySelector('#newAttrBulkCard');
    modeBtns.forEach((b) => {
      b.addEventListener('click', () => {
        const mode = b.getAttribute('data-new-attr-mode');
        const isBulk = mode === 'bulk';
        if (singleCard) singleCard.style.display = isBulk ? 'none' : '';
        if (bulkCard) bulkCard.style.display = isBulk ? '' : 'none';
        modeBtns.forEach((x) => {
          const active = x.getAttribute('data-new-attr-mode') === mode;
          x.classList.toggle('primary', active);
        });
      });
    });

    const submitBtn = hostEl.querySelector('button[data-new-attr-submit]');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        const isBulk = bulkCard && bulkCard.style.display !== 'none';

        let attributesPayload = [];
        let notes = '';

        if (isBulk) {
          const raw = String(hostEl.querySelector('[data-new-attr-bulk="json"]')?.value || '').trim();
          notes = String(hostEl.querySelector('[data-new-attr-bulk="notes"]')?.value || '').trim();

          const parsed = tryParseJson(raw);
          if (!parsed) {
            alert('Bulk JSON is required.');
            return;
          }
          if (parsed.__parse_error__) {
            alert(`Bulk JSON parse error:\n${parsed.__parse_error__}`);
            return;
          }
          if (!Array.isArray(parsed)) {
            alert('Bulk JSON must be a JSON array of attribute objects.');
            return;
          }
          attributesPayload = parsed;
        } else {
          const getVal = (k) => String(hostEl.querySelector(`[data-new-attr-key="${k}"]`)?.value || '').trim();

          const id = getVal('id');
          if (!id) {
            alert('Attribute ID is required.');
            return;
          }

          const type = getVal('type');
          const definition = getVal('definition');
          const label = getVal('label');
          const expectedValueRaw = getVal('expected_value');
          const status = getVal('status');
          const dataStandard = getVal('data_standard');
          notes = getVal('notes');


          let values = undefined;
          if (type === 'enumerated') {
            const valuesRaw = getVal('values');
            if (valuesRaw) {
              const parsedValues = tryParseJson(valuesRaw);
              if (parsedValues && parsedValues.__parse_error__) {
                alert(`Enumerated values JSON parse error:\n${parsedValues.__parse_error__}`);
                return;
              }
              if (parsedValues && !Array.isArray(parsedValues)) {
                alert('Enumerated values must be a JSON array of objects like {code,label,description}.');
                return;
              }
              values = parsedValues || [];
            } else {
              values = [];
            }
          }

          const attrObj = compactObject({
            id,
            label,
            type,
            definition,
            expected_value: expectedValueRaw || undefined,
            values,
            status: status || undefined,
            data_standard: dataStandard || undefined,
            notes: notes || undefined,
          });

          const exists = Catalog.getAttributeById(id);
          if (exists) {
            const proceed = confirm(`An attribute with ID "${id}" already exists. Open an issue anyway?`);
            if (!proceed) return;
          }

          attributesPayload = [attrObj];
        }

        const missingIds = attributesPayload.filter((a) => !a || typeof a !== 'object' || !a.id).length;
        if (missingIds) {
          alert('One or more attribute objects are missing an "id" attribute.');
          return;
        }

        const payload = {
          title:
            attributesPayload.length === 1
              ? `New attribute request: ${attributesPayload[0].id}`
              : `New attributes request (${attributesPayload.length})`,
          attributes: attributesPayload,
          notes,
        };

        const issueUrl = buildGithubIssueUrlForNewAttributes(payload);

        goBackToAttributesListOrFirst();

        const w = window.open(issueUrl, '_blank', 'noopener');
        if (!w) alert('Popup blocked — please allow popups to open the GitHub Issue.');
      });
    }
  }

// ----------------------------------------------------//
// ----- BEGIN SUBMIT NEW OBJECT FORM FUNCTION --------//  
// ----------------------------------------------------//

function renderNewObjectCreateForm(prefill = {}) {
  if (!objectDetailEl) return;

  const NEW_OBJECT_PLACEHOLDERS =
    (catalogData && catalogData.ui && catalogData.ui.placeholders && catalogData.ui.placeholders.new_object) ||
    (catalogData && catalogData.ui && catalogData.ui.placeholders && catalogData.ui.placeholders.new_dataset) ||
    {};

  function placeholderFor(key, fallback = '') {
    return escapeHtml(NEW_OBJECT_PLACEHOLDERS[key] || fallback || '');
  }

  const draft = {
    // required
    id: '',
    // object-page fields
    title: '',
    description: '',
    objname: '',
    geometry_type: '',
    topics: [],
    update_frequency: '',
    status: '',
    access_level: '',
    data_standard: '',
    notes: '',
    // attribute selection/creation
    attribute_ids: [],
    new_attributes: [],
    ...deepClone(prefill || {}),
  };

  let html = '';

  // =========================================================
  // HEADER: Name editable (replaces static <h2>)
  // =========================================================
  html += `
    <div class="object-title-edit">
      <span class="object-title-label">Name</span>
      <input
        class="object-title-input"
        type="text"
        data-new-obj-key="title"
        placeholder="${placeholderFor('title', 'display name (optional)')}"
        value="${escapeHtml(draft.title || '')}"
      />
    </div>
  `;

  // Definition directly under header (still editable)
  html += `
    <p><strong>Definition:</strong></p>
    <textarea class="object-edit-input" data-new-obj-key="description"
      placeholder="${placeholderFor('description', 'short definition of the object')}">${escapeHtml(
        draft.description || ''
      )}</textarea>
  `;

  // =========================================================
  // ACTIONS CARD: move help text here + button label change
  // =========================================================
  html += `
    <div class="card card-meta" id="newObjectActionsCard">
      <div class="object-edit-actions">
        <button type="button" class="btn" data-new-obj-cancel>Cancel</button>
        <button type="button" class="btn primary" data-new-obj-submit>Submit</button>
      </div>
      <div class="action-help">This will open a pre-filled GitHub Issue for review/approval by the catalog owner.</div>
    </div>
  `;

  // --- Build a case-insensitive set of existing object IDs for live warnings ---
  const existingObjectIds = new Set((allObjects || []).map((o) => String(o.id || '').trim().toLowerCase()));

  // =========================================================
  // META CARD (Option A layout) — NO Name field here anymore
  // =========================================================
  html += `<div class="card card-meta" id="newObjectMetaCard">`;

  // Object ID (keep your helper + warning + hooks)
  html += `
    <p><strong>Object ID:</strong>
      <input class="object-edit-input object-edit-inline" type="text" data-new-obj-key="id"
        placeholder="${placeholderFor('id', 'auto-generated from Name (you can edit)')}"
        value="${escapeHtml(draft.id || '')}" />
    </p>

    <div class="form-hint" data-new-obj-id-hint>
      Object ID will be generated automatically from Name. Optionally, you can edit Object ID manually. This is used as a unique identifier for entries of this catalog.
    </div>
    <div class="form-warning" data-new-obj-id-warning style="display:none;">
      ⚠️ This Object ID already exists in the catalog. Please suggest a change to the existing object rather than submitting a duplicate.
    </div>
  `;

  // Database Object Name
  html += `
    <p><strong>Database Object Name:</strong>
      <input class="object-edit-input object-edit-inline" type="text" data-new-obj-key="objname"
        placeholder="${placeholderFor('objname', 'e.g., SDE.BLM_RMP_BOUNDARIES')}"
        value="${escapeHtml(draft.objname || '')}" />
    </p>
  `;

  // Geometry Type
  html += `
    <p><strong>Geometry Type:</strong>
      <input class="object-edit-input object-edit-inline" type="text" data-new-obj-key="geometry_type"
        placeholder="${placeholderFor('geometry_type', 'POINT / POLYLINE / POLYGON / TABLE')}"
        value="${escapeHtml(draft.geometry_type || '')}" />
    </p>
  `;

  // Topics (editable CSV)
  const topicsVal = Array.isArray(draft.topics) ? draft.topics.join(', ') : String(draft.topics || '');
  html += `
    <p><strong>Topics:</strong>
      <input class="object-edit-input object-edit-inline" type="text" data-new-obj-key="topics"
        placeholder="${placeholderFor('topics', 'comma-separated topics')}"
        value="${escapeHtml(topicsVal)}" />
    </p>
  `;

  // Update Frequency
  html += `
    <p><strong>Update Frequency:</strong>
      <input class="object-edit-input object-edit-inline" type="text" data-new-obj-key="update_frequency"
        placeholder="${placeholderFor('update_frequency', '')}"
        value="${escapeHtml(draft.update_frequency || '')}" />
    </p>
  `;

  // Status
  html += `
    <p><strong>Status:</strong>
      <input class="object-edit-input object-edit-inline" type="text" data-new-obj-key="status"
        placeholder="${placeholderFor('status', '')}"
        value="${escapeHtml(draft.status || '')}" />
    </p>
  `;

  // Access Level
  html += `
    <p><strong>Access Level:</strong>
      <input class="object-edit-input object-edit-inline" type="text" data-new-obj-key="access_level"
        placeholder="${placeholderFor('access_level', '')}"
        value="${escapeHtml(draft.access_level || '')}" />
    </p>
  `;

  // Data Standard
  html += `
    <p><strong>Data Standard:</strong>
      <input class="object-edit-input object-edit-inline" type="text" data-new-obj-key="data_standard"
        placeholder="${placeholderFor('data_standard', 'https://...')}"
        value="${escapeHtml(draft.data_standard || '')}" />
    </p>
  `;

  // Notes
  html += `
    <p><strong>Notes:</strong></p>
    <textarea class="object-edit-input" data-new-obj-key="notes"
      placeholder="${placeholderFor('notes', '')}">${escapeHtml(draft.notes || '')}</textarea>
  `;

  html += `</div>`; // end meta card

  // ---------------------------
  // Attributes section (UNCHANGED)
  // ---------------------------
  const attrOptions = (allAttributes || [])
    .map((a) => {
      const id = a.id || '';
      const label = a.label ? ` — ${a.label}` : '';
      return `<option value="${escapeHtml(id)}">${escapeHtml(id + label)}</option>`;
    })
    .join('');

  html += `
    <div class="card card-meta" id="newObjectAttributesCard">
      <h3>Attributes</h3>
      <p class="modal-help" style="margin-top:0.25rem;">
        Add existing attributes, or create new ones inline. New attributes will be included in the GitHub issue.
      </p>

      <div class="object-edit-row">
        <label class="object-edit-label">Add existing attribute (search by ID)</label>
        <div style="display:flex; gap:0.5rem; align-items:center;">
          <input class="object-edit-input" style="flex:1;" type="text"
            list="existingAttributesDatalist"
            data-new-obj-existing-attr-input
            placeholder="Start typing an attribute ID..." />
          <button type="button" class="btn" data-new-obj-add-existing-attr>Add</button>
        </div>
        <datalist id="existingAttributesDatalist">
          ${attrOptions}
        </datalist>
      </div>

      <div class="object-edit-row">
        <label class="object-edit-label">Selected attributes</label>
        <div data-new-obj-selected-attrs style="display:flex; flex-wrap:wrap; gap:0.5rem;"></div>
      </div>

      <div class="object-edit-row">
        <label class="object-edit-label">Create new attribute</label>
        <div>
          <button type="button" class="btn" data-new-obj-add-new-attr>+ Add new attribute</button>
        </div>
      </div>

      <div data-new-obj-new-attrs></div>
    </div>
  `;

  objectDetailEl.innerHTML = html;
  objectDetailEl.classList.remove('hidden');

  // Animate ONLY when entering create page
  staggerCards(objectDetailEl);
  animatePanel(objectDetailEl);

  // ---------- Auto-suggest Object ID from Name (and objname fallback) ----------
  const idInput = objectDetailEl.querySelector('[data-new-obj-key="id"]');
  const nameInput = objectDetailEl.querySelector('[data-new-obj-key="title"]');       // now in header
  const objnameInput = objectDetailEl.querySelector('[data-new-obj-key="objname"]');
  const descInput = objectDetailEl.querySelector('[data-new-obj-key="description"]');

  const idHintEl = objectDetailEl.querySelector('[data-new-obj-id-hint]');
  const idWarnEl = objectDetailEl.querySelector('[data-new-obj-id-warning]');

  const BASE_ID_HINT =
    'Object ID will be generated automatically from Name. Optionally, you can edit Object ID manually. This is used as a unique identifier for entries of this catalog.';

  function updateIdStatus() {
    if (!idInput) return;
    const idVal = String(idInput.value || '').trim().toLowerCase();
    const exists = idVal && existingObjectIds.has(idVal);
    if (idWarnEl) idWarnEl.style.display = exists ? '' : 'none';
    if (idHintEl) idHintEl.textContent = BASE_ID_HINT;
  }

  let lastAutoId = '';

  function computeSuggestedId() {
    const draftNow = {
      title: nameInput ? nameInput.value : '',
      objname: objnameInput ? objnameInput.value : '',
      description: descInput ? descInput.value : '',
    };
    return suggestObjectIdFromDraft(draftNow);
  }

  function maybeSuggestId(force = false) {
    if (!idInput) return;
    const suggested = computeSuggestedId();
    if (!suggested) return;

    const current = String(idInput.value || '').trim();
    const canOverwrite = force || current === '' || (lastAutoId && current === lastAutoId);

    if (canOverwrite) {
      idInput.value = suggested;
      lastAutoId = suggested;
    }
  }

  if (idInput) {
    idInput.addEventListener('input', () => {
      const current = String(idInput.value || '').trim();
      if (lastAutoId && current !== lastAutoId) {
        lastAutoId = ''; // manual mode
      }
      updateIdStatus();
    });
  }

  if (nameInput) {
    nameInput.addEventListener('input', () => {
      maybeSuggestId(false);
      updateIdStatus();
    });
  }
  if (objnameInput) objnameInput.addEventListener('input', () => { maybeSuggestId(false); updateIdStatus(); });
  if (descInput) descInput.addEventListener('input', () => { maybeSuggestId(false); updateIdStatus(); });

  maybeSuggestId(false);
  updateIdStatus();

  // ---------- Attributes UI wiring (UNCHANGED) ----------
  const selectedAttrsEl = objectDetailEl.querySelector('[data-new-obj-selected-attrs]');
  const existingAttrInput = objectDetailEl.querySelector('[data-new-obj-existing-attr-input]');
  const addExistingBtn = objectDetailEl.querySelector('button[data-new-obj-add-existing-attr]');
  const addNewAttrBtn = objectDetailEl.querySelector('button[data-new-obj-add-new-attr]');
  const newAttrsHost = objectDetailEl.querySelector('[data-new-obj-new-attrs]');

  const NEW_ATTR_PLACEHOLDERS =
    (catalogData && catalogData.ui && catalogData.ui.placeholders && catalogData.ui.placeholders.new_attribute) || {};
  function attrPlaceholderFor(key, fallback = '') {
    return escapeHtml(NEW_ATTR_PLACEHOLDERS[key] || fallback || '');
  }

  function renderSelectedAttrChips() {
    if (!selectedAttrsEl) return;
    const ids = Array.from(new Set((draft.attribute_ids || []).map((x) => String(x || '').trim()).filter(Boolean)));
    draft.attribute_ids = ids;

    selectedAttrsEl.innerHTML = ids.length
      ? ids
          .map(
            (id) => `
              <span class="pill pill-keyword" style="display:inline-flex; gap:0.4rem; align-items:center;">
                <span>${escapeHtml(id)}</span>
                <button type="button" class="icon-button" style="padding:0.15rem 0.35rem;" data-remove-attr-id="${escapeHtml(
                  id
                )}">✕</button>
              </span>
            `
          )
          .join('')
      : `<span style="color: var(--text-muted);">None selected yet.</span>`;

    selectedAttrsEl.querySelectorAll('button[data-remove-attr-id]').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.getAttribute('data-remove-attr-id');
        draft.attribute_ids = (draft.attribute_ids || []).filter((x) => x !== id);
        renderSelectedAttrChips();
      });
    });
  }

  function makeNewAttrDraft() {
    return {
      id: '',
      label: '',
      type: '',
      definition: '',
      expected_value: '',
      values_json: '',
      notes: '',
    };
  }

  function renderNewAttributesForms() {
    if (!newAttrsHost) return;
    const arr = draft.new_attributes || [];
    if (!arr.length) {
      newAttrsHost.innerHTML = '';
      return;
    }

    newAttrsHost.innerHTML = arr
      .map((a, idx) => {
        const safeIdx = String(idx);
        return `
          <div class="card" style="margin-top:0.75rem;" data-new-attr-card data-new-attr-idx="${safeIdx}">
            <div class="object-edit-actions" style="margin-bottom:0.75rem;">
              <strong style="align-self:center;">New attribute #${idx + 1}</strong>
              <span style="flex:1"></span>
              <button type="button" class="btn" data-remove-new-attr="${safeIdx}">Remove</button>
            </div>

            <div class="object-edit-row">
              <label class="object-edit-label">Attribute ID (required)</label>
              <input class="object-edit-input" type="text"
                data-new-attr-idx="${safeIdx}" data-new-attr-key="id"
                placeholder="${attrPlaceholderFor('id', 'e.g., STATE_NAME')}"
                value="${escapeHtml(a.id || '')}" />
            </div>

            <div class="object-edit-row">
              <label class="object-edit-label">Attribute Label</label>
              <input class="object-edit-input" type="text"
                data-new-attr-idx="${safeIdx}" data-new-attr-key="label"
                placeholder="${attrPlaceholderFor('label', 'Human-friendly label')}"
                value="${escapeHtml(a.label || '')}" />
            </div>

            <div class="object-edit-row">
              <label class="object-edit-label">Attribute Type</label>
              <input class="object-edit-input" type="text"
                data-new-attr-idx="${safeIdx}" data-new-attr-key="type"
                placeholder="${attrPlaceholderFor('type', 'string / integer / enumerated / ...')}"
                value="${escapeHtml(a.type || '')}" />
            </div>

            <div class="object-edit-row">
              <label class="object-edit-label">Attribute Definition</label>
              <textarea class="object-edit-input"
                data-new-attr-idx="${safeIdx}" data-new-attr-key="definition"
                placeholder="${attrPlaceholderFor('definition', 'What this attribute means and how it is used')}">${escapeHtml(
                  a.definition || ''
                )}</textarea>
            </div>

            <div class="object-edit-row">
              <label class="object-edit-label">Example Expected Value</label>
              <input class="object-edit-input" type="text"
                data-new-attr-idx="${safeIdx}" data-new-attr-key="expected_value"
                placeholder="${attrPlaceholderFor('expected_value', 'Optional example')}"
                value="${escapeHtml(a.expected_value || '')}" />
            </div>

            <div class="object-edit-row">
              <label class="object-edit-label">Allowed values (JSON array) — only if type = enumerated</label>
              <textarea class="object-edit-input"
                data-new-attr-idx="${safeIdx}" data-new-attr-key="values_json"
                placeholder="${attrPlaceholderFor(
                  'values',
                  '[{"code":1,"label":"Yes","description":"..."},{"code":0,"label":"No"}]'
                )}">${escapeHtml(a.values_json || '')}</textarea>
            </div>

            <div class="object-edit-row">
              <label class="object-edit-label">Notes / context (optional)</label>
              <textarea class="object-edit-input"
                data-new-attr-idx="${safeIdx}" data-new-attr-key="notes"
                placeholder="${attrPlaceholderFor('notes', 'Any context for reviewers')}">${escapeHtml(
                  a.notes || ''
                )}</textarea>
            </div>
          </div>
        `;
      })
      .join('');

    newAttrsHost.querySelectorAll('button[data-remove-new-attr]').forEach((b) => {
      b.addEventListener('click', () => {
        const idx = Number(b.getAttribute('data-remove-new-attr'));
        if (Number.isNaN(idx)) return;
        draft.new_attributes.splice(idx, 1);
        renderNewAttributesForms();
      });
    });
  }

  if (addExistingBtn) {
    addExistingBtn.addEventListener('click', () => {
      const raw = String(existingAttrInput?.value || '').trim();
      if (!raw) return;
      const exists = Catalog.getAttributeById(raw);
      if (!exists) {
        alert(`Attribute "${raw}" doesn't exist yet. Use "Add new attribute" to propose it.`);
        return;
      }
      draft.attribute_ids = draft.attribute_ids || [];
      if (!draft.attribute_ids.includes(raw)) draft.attribute_ids.push(raw);
      if (existingAttrInput) existingAttrInput.value = '';
      renderSelectedAttrChips();
    });
  }

  if (addNewAttrBtn) {
    addNewAttrBtn.addEventListener('click', () => {
      draft.new_attributes = draft.new_attributes || [];
      draft.new_attributes.push(makeNewAttrDraft());
      renderNewAttributesForms();
    });
  }

  renderSelectedAttrChips();
  renderNewAttributesForms();

  const cancelBtn = objectDetailEl.querySelector('button[data-new-obj-cancel]');
  if (cancelBtn) cancelBtn.addEventListener('click', goBackToLastObjectOrList);

  const submitBtn = objectDetailEl.querySelector('button[data-new-obj-submit]');
  if (submitBtn) {
    submitBtn.addEventListener('click', () => {
      const out = {};

      // collect the object-page fields + required ID
      const inputs = objectDetailEl.querySelectorAll('[data-new-obj-key]');
      inputs.forEach((el) => {
        const k = el.getAttribute('data-new-obj-key');
        const raw = el.value;

        if (k === 'topics') {
          out[k] = parseCsvList(raw);
          return;
        }
        out[k] = String(raw || '').trim();
      });

      const id = String(out.id || '').trim();
      if (!id) {
        alert('Object ID is required.');
        return;
      }

      // Live warning check (case-insensitive, matches the UI warning)
      if (existingObjectIds.has(id.toLowerCase())) {
        const proceed = confirm(`⚠️ Object ID "${id}" already exists in the catalog.\n\nDo you still want to open an issue?`);
        if (!proceed) return;
      }

      // collect new attribute drafts from UI (UNCHANGED)
      const newAttrInputs = objectDetailEl.querySelectorAll('[data-new-attr-idx][data-new-attr-key]');
      newAttrInputs.forEach((el) => {
        const idx = Number(el.getAttribute('data-new-attr-idx'));
        const k = el.getAttribute('data-new-attr-key');
        if (Number.isNaN(idx) || !k) return;
        if (!draft.new_attributes || !draft.new_attributes[idx]) return;
        draft.new_attributes[idx][k] = String(el.value || '');
      });

      const newAttributesOut = [];
      const newAttrIds = [];

      for (let i = 0; i < (draft.new_attributes || []).length; i++) {
        const a = draft.new_attributes[i];
        const aid = String(a.id || '').trim();
        if (!aid) {
          alert(`New attribute #${i + 1} is missing an Attribute ID.`);
          return;
        }
        if (Catalog.getAttributeById(aid)) {
          alert(`New attribute ID "${aid}" already exists. Add it as an existing attribute instead.`);
          return;
        }

        const type = String(a.type || '').trim();
        let values = undefined;
        if (type === 'enumerated') {
          const rawVals = String(a.values_json || '').trim();
          if (rawVals) {
            const parsed = tryParseJson(rawVals);
            if (parsed && parsed.__parse_error__) {
              alert(`Allowed values JSON parse error for "${aid}":\n${parsed.__parse_error__}`);
              return;
            }
            if (parsed && !Array.isArray(parsed)) {
              alert(`Allowed values for "${aid}" must be a JSON array.`);
              return;
            }
            values = parsed || [];
          } else {
            values = [];
          }
        }

        const attrObj = compactObject({
          id: aid,
          label: String(a.label || '').trim() || undefined,
          type: type || undefined,
          definition: String(a.definition || '').trim() || undefined,
          expected_value: String(a.expected_value || '').trim() || undefined,
          values,
        });

        newAttributesOut.push(attrObj);
        newAttrIds.push(aid);
      }

      const existingIds = Array.from(
        new Set((draft.attribute_ids || []).map((x) => String(x || '').trim()).filter(Boolean))
      );
      const combinedAttrIds = Array.from(new Set([...existingIds, ...newAttrIds]));

      // Build object payload using ONLY the fields shown on the object page
      const objectObj = compactObject({
        id,
        title: out.title, // Name (now from header)
        description: out.description, // Definition
        objname: out.objname,
        geometry_type: out.geometry_type,
        topics: out.topics || [],
        update_frequency: out.update_frequency,
        status: out.status,
        access_level: out.access_level,
        data_standard: out.data_standard,
        notes: out.notes,
        attribute_ids: combinedAttrIds.length ? combinedAttrIds : undefined,
      });

      const issueUrl = buildGithubIssueUrlForNewObject(objectObj, newAttributesOut);

      goBackToLastObjectOrList();

      const w = window.open(issueUrl, '_blank', 'noopener');
      if (!w) alert('Popup blocked — please allow popups to open the GitHub Issue.');
    });
  }
}


// ----------------------------------------------------//
// ----- END SUBMIT NEW OBJECT FORM FUNCTION --------//  
// ----------------------------------------------------//


  function renderAttributeEditForm(attrId) {
    if (!attributeDetailEl) return;

    const attribute = Catalog.getAttributeById(attrId);
    if (!attribute) return;

    const original = deepClone(attribute);
    const draft = deepClone(attribute);
    const objects = Catalog.getObjectsForAttribute(attrId) || [];

    let html = '';

    html += `<h2>Editing: ${escapeHtml(attribute.id)} – ${escapeHtml(attribute.label || '')}</h2>`;

    html += `<div class="card card-attribute-meta" id="attributeEditCard">`;
    html += `<div class="object-edit-actions">
      <button type="button" class="btn" data-edit-attr-cancel>Cancel</button>
      <button type="button" class="btn primary" data-edit-attr-submit>Submit suggestion</button>
    </div>`;

    ATTRIBUTE_EDIT_FIELDS.forEach((f) => {
      let val = draft[f.key];

      if (f.type === 'json') {
        val = val === undefined ? '' : JSON.stringify(val, null, 2);
        html += `
          <div class="object-edit-row">
            <label class="object-edit-label">${escapeHtml(f.label)}</label>
            <textarea class="object-edit-input" data-edit-attr-key="${escapeHtml(f.key)}">${escapeHtml(val)}</textarea>
          </div>
        `;
        return;
      }

      if (f.type === 'textarea') {
        html += `
          <div class="object-edit-row">
            <label class="object-edit-label">${escapeHtml(f.label)}</label>
            <textarea class="object-edit-input" data-edit-attr-key="${escapeHtml(f.key)}">${escapeHtml(val || '')}</textarea>
          </div>
        `;
        return;
      }

      html += `
        <div class="object-edit-row">
          <label class="object-edit-label">${escapeHtml(f.label)}</label>
          <input class="object-edit-input" type="text" data-edit-attr-key="${escapeHtml(f.key)}"
                 value="${escapeHtml(val === undefined ? '' : String(val))}" />
        </div>
      `;
    });

    html += `</div>`;

    if (attribute.type === 'enumerated' && Array.isArray(attribute.values) && attribute.values.length) {
      html += '<div class="card card-enumerated">';
      html += '<h3>Current allowed values (read-only preview)</h3>';
      html += `
        <table>
          <thead>
            <tr><th>Code</th><th>Label</th><th>Description</th></tr>
          </thead>
          <tbody>
      `;
      attribute.values.forEach((v) => {
        const code = v.code !== undefined ? String(v.code) : '';
        const label = v.label || '';
        const desc = v.description || '';
        html += `
          <tr>
            <td>${escapeHtml(code)}</td>
            <td>${escapeHtml(label)}</td>
            <td>${escapeHtml(desc)}</td>
          </tr>
        `;
      });
      html += `
          </tbody>
        </table>
      `;
      html += '</div>';
    }

    html += '<div class="card card-attribute-objects">';
    html += '<h3>Objects using this attribute</h3>';
    if (!objects.length) {
      html += '<p>No objects currently reference this attribute.</p>';
    } else {
      html += '<ul>';
      objects.forEach((obj) => {
        html += `
          <li>
            <button type="button" class="link-button" data-object-id="${escapeHtml(obj.id)}">
              ${escapeHtml(obj.title || obj.id)}
            </button>
          </li>`;
      });
      html += '</ul>';
    }
    html += '</div>';

    attributeDetailEl.innerHTML = html;
    attributeDetailEl.classList.remove('hidden');

    // Animate ONLY when entering edit mode
    staggerCards(attributeDetailEl);
    animatePanel(attributeDetailEl);

    const objButtons = attributeDetailEl.querySelectorAll('button[data-object-id]');
    objButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const objId = btn.getAttribute('data-object-id');
        showObjectsView();
        renderObjectDetail(objId);
      });
    });

    const cancelBtn = attributeDetailEl.querySelector('button[data-edit-attr-cancel]');
    if (cancelBtn) cancelBtn.addEventListener('click', () => renderAttributeDetail(attrId));

    const submitBtn = attributeDetailEl.querySelector('button[data-edit-attr-submit]');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        let hadError = false;
        const inputs = attributeDetailEl.querySelectorAll('[data-edit-attr-key]');
        inputs.forEach((el) => {
          const k = el.getAttribute('data-edit-attr-key');
          const raw = el.value;

          const def = ATTRIBUTE_EDIT_FIELDS.find((x) => x.key === k);
          if (def && def.type === 'json') {
            const parsed = tryParseJson(raw);
            if (parsed && parsed.__parse_error__) {
              alert(`Allowed values JSON parse error:\n${parsed.__parse_error__}`);
              hadError = true;
              return;
            }
            draft[k] = parsed === null ? undefined : parsed;
          } else {
            const s = String(raw || '').trim();
            draft[k] = s === '' ? undefined : s;
          }
        });

        if (hadError) return;

        const updated = compactObject(draft);
        const origCompact = compactObject(original);
        const changes = computeChanges(origCompact, updated);

        const issueUrl = buildGithubIssueUrlForEditedAttribute(attrId, origCompact, updated, changes);

        renderAttributeDetail(attrId);

        window.open(issueUrl, '_blank', 'noopener');
      });
    }
  }

  // --- Load catalog once ---
  let catalog;
  let catalogData = null;
  try {
    catalog = await Catalog.loadCatalog();
    catalogData = catalog;
  } catch (err) {
    console.error('Failed to load catalog.json:', err);
    if (objectListEl) objectListEl.textContent = 'Error loading catalog.';
    if (attributeListEl) attributeListEl.textContent = 'Error loading catalog.';
    return;
  }

  const allObjects = catalog.objects || [];
  const allAttributes = catalog.attributes || [];

  // ===========================
  // BUTTONS (new object/attribute)
  // ===========================
  const newObjectBtn = document.getElementById('newObjectBtn');
  if (newObjectBtn) {
    newObjectBtn.addEventListener('click', () => {
      showObjectsView();
      renderNewObjectCreateForm();
    });
  }

  const newAttributeBtn = document.getElementById('newAttributeBtn');
  if (newAttributeBtn) {
    newAttributeBtn.addEventListener('click', () => {
      showAttributesView();
      renderNewAttributeCreateForm();
    });
  }

  // ===========================
  // LIST RENDERING
  // ===========================
  function renderObjectList(filterText = '') {
    if (!objectListEl) return;
    const ft = filterText.trim().toLowerCase();

    const filtered = !ft
      ? allObjects
      : allObjects.filter((obj) => {
          const haystack = [obj.id, obj.title, obj.description, obj.agency_owner, obj.office_owner, ...(obj.topics || [])]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return haystack.includes(ft);
        });

    if (!filtered.length) {
      objectListEl.innerHTML = '<p>No objects found.</p>';
      return;
    }

    const list = document.createElement('ul');
    filtered.forEach((obj) => {
      const li = document.createElement('li');
      li.className = 'list-item object-item';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'list-item-button';
      btn.setAttribute('data-obj-id', obj.id);

      const geomIconHtml = getGeometryIconHTML(obj.geometry_type || '', 'geom-icon-list');

      const primary = obj.objname || obj.id; // Database Object Name first
      const secondary = obj.title || obj.id; // Name under it

      btn.innerHTML = `
        ${geomIconHtml}
          <span class="list-item-text">
          <span class="list-item-primary">${escapeHtml(primary)}</span>
          <span class="list-item-secondary">${escapeHtml(secondary)}</span>
          </span>
      `;

      btn.addEventListener('click', () => {
        showObjectsView();
        renderObjectDetail(obj.id);
      });

      li.appendChild(btn);
      list.appendChild(li);
    });

    objectListEl.innerHTML = '';
    objectListEl.appendChild(list);

    setActiveListButton(objectListEl, (b) => b.getAttribute('data-obj-id') === lastSelectedObjectId);
  }

  function renderAttributeList(filterText = '') {
    if (!attributeListEl) return;
    const ft = filterText.trim().toLowerCase();

    const filtered = !ft
      ? allAttributes
      : allAttributes.filter((attr) => {
          const haystack = [attr.id, attr.label, attr.definition].filter(Boolean).join(' ').toLowerCase();
          return haystack.includes(ft);
        });

    if (!filtered.length) {
      attributeListEl.innerHTML = '<p>No attributes found.</p>';
      return;
    }

    const list = document.createElement('ul');
    filtered.forEach((attr) => {
      const li = document.createElement('li');
      li.className = 'list-item attribute-item';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'list-item-button';
      btn.setAttribute('data-attr-id', attr.id);
      const primary = attr.label || attr.id; // Field Name first
      const secondary = attr.id;            // Name (ID) under it

      btn.innerHTML = `
        <span class="list-item-text">
        <span class="list-item-primary">${escapeHtml(primary)}</span>
        <span class="list-item-secondary">${escapeHtml(secondary)}</span>
        </span>
      `;

      btn.addEventListener('click', () => {
        showAttributesView();
        renderAttributeDetail(attr.id);
      });

      li.appendChild(btn);
      list.appendChild(li);
    });

    attributeListEl.innerHTML = '';
    attributeListEl.appendChild(list);

    setActiveListButton(attributeListEl, (b) => b.getAttribute('data-attr-id') === lastSelectedAttributeId);

  }

  // ===========================
  // DETAIL RENDERERS
  // ===========================
  function renderObjectDetail(objectId) {
  if (!objectDetailEl) return;

  // Browsing existing objects should not animate.
  objectDetailEl.classList.remove('fx-enter', 'fx-animating');

  lastSelectedObjectId = objectId;
  setActiveListButton(objectListEl, (b) => b.getAttribute('data-obj-id') === objectId);

  const obj = Catalog.getObjectById(objectId);
  if (!obj) {
    objectDetailEl.classList.remove('hidden');
    objectDetailEl.innerHTML = `<p>Object not found: ${escapeHtml(objectId)}</p>`;
    return;
  }

  const geomIconHtml = getGeometryIconHTML(obj.geometry_type || '', 'geom-icon-inline');
  const attrs = Catalog.getAttributesForObject(obj);

  let html = '';

  // Object page header
  // (Keep title visible, but we now label it as "Name" in the meta card per your request.)
  html += `<h2>${escapeHtml(obj.title || obj.id)}</h2>`;

  // Definition (no change)
  if (obj.description) {
    html += `<p><strong>Definition:</strong> ${escapeHtml(obj.description)}</p>`;
  }

  html += '<div class="card card-meta">';

  // ✅ Change "Title" to "Name" (and show it explicitly as a field)
  html += `<p><strong>Name:</strong> ${escapeHtml(obj.title || obj.id)}</p>`;

  // No change fields
  html += `<p><strong>Database Object Name:</strong> ${escapeHtml(obj.objname || '')}</p>`;
  html += `<p><strong>Geometry Type:</strong> ${geomIconHtml}${escapeHtml(obj.geometry_type || '')}</p>`;

  // ❌ Removed per your table:
  // - Agency Owner
  // - Office Owner
  // - Contact Email

  html += `<p><strong>Topics:</strong> ${
    Array.isArray(obj.topics)
      ? obj.topics.map((t) => `<span class="pill pill-topic">${escapeHtml(t)}</span>`).join(' ')
      : ''
  }</p>`;

  html += `<p><strong>Update Frequency:</strong> ${escapeHtml(obj.update_frequency || '')}</p>`;
  html += `<p><strong>Status:</strong> ${escapeHtml(obj.status || '')}</p>`;
  html += `<p><strong>Access Level:</strong> ${escapeHtml(obj.access_level || '')}</p>`;

  // Keep Data Standard (no change)
  if (obj.data_standard) {
    html += `<p><strong>Data Standard:</strong> <a href="${obj.data_standard}" target="_blank" rel="noopener">${escapeHtml(
      obj.data_standard
    )}</a></p>`;
  }

  if (obj.notes) html += `<p><strong>Notes:</strong> ${escapeHtml(obj.notes)}</p>`;

  html += '</div>';

  // Attributes section (unchanged)
  html += `
    <div class="card-row">
      <div class="card card-attributes">
        <h3>Attributes</h3>
  `;

  if (!attrs.length) {
    html += '<p>No attributes defined for this object.</p>';
  } else {
    html += '<ul>';
    attrs.forEach((attr) => {
      html += `
        <li>
          <button type="button" class="link-button" data-attr-id="${escapeHtml(attr.id)}">
            ${escapeHtml(attr.id)} – ${escapeHtml(attr.label || '')}
          </button>
        </li>`;
    });
    html += '</ul>';
  }

  html += `
      </div>
      <div class="card card-inline-attribute" id="inlineAttributeDetail">
        <h3>Attribute details</h3>
        <p>Select an attribute from the list to see its properties here without leaving this object.</p>
      </div>
    </div>
  `;

  // Actions (unchanged)
  html += `
    <div class="card card-actions">
      <button type="button" class="suggest-button" data-edit-object="${escapeHtml(obj.id)}">
        Suggest a change to this object
      </button>
      <button type="button" class="export-button" data-export-schema="${escapeHtml(obj.id)}">
        Export ArcGIS schema (Python)
      </button>
    </div>
  `;

  objectDetailEl.innerHTML = html;
  objectDetailEl.classList.remove('hidden');

  const editBtn = objectDetailEl.querySelector('button[data-edit-object]');
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      const objId = editBtn.getAttribute('data-edit-object');
      renderObjectEditForm(objId);
    });
  }

  const attrButtons = objectDetailEl.querySelectorAll('button[data-attr-id]');
  attrButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const attrId = btn.getAttribute('data-attr-id');
      renderInlineAttributeDetail(attrId);
    });
  });

  const exportBtn = objectDetailEl.querySelector('button[data-export-schema]');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const objId = exportBtn.getAttribute('data-export-schema');
      const o = Catalog.getObjectById(objId);
      if (!o) return;
      const attrsForObj = Catalog.getAttributesForObject(o);
      const script = buildArcGisSchemaPython(o, attrsForObj);
      downloadTextFile(script, `${o.id}_schema_arcpy.py`);
    });
  }
}


  function renderInlineAttributeDetail(attrId) {
    if (!objectDetailEl) return;

    const container = objectDetailEl.querySelector('#inlineAttributeDetail');
    if (!container) return;

    const attribute = Catalog.getAttributeById(attrId);
    if (!attribute) {
      container.innerHTML = `
        <h3>Attribute details</h3>
        <p>Attribute not found: ${escapeHtml(attrId)}</p>
      `;
      return;
    }

    const objectsUsing = Catalog.getObjectsForAttribute(attrId) || [];

    let html = '';
    html += '<h3>Attribute details</h3>';
    html += `<h4>${escapeHtml(attribute.id)} – ${escapeHtml(attribute.label || '')}</h4>`;

    html += `<p><strong>Name:</strong> ${escapeHtml(attribute.id)}</p>`;
    html += `<p><strong>Definition:</strong> ${escapeHtml(attribute.definition || '')}</p>`;
    html += `<p><strong>Field Name:</strong> ${escapeHtml(attribute.label || '')}</p>`;
    html += `<p><strong>Attribute Type:</strong> ${escapeHtml(attribute.type || '')}</p>`;
    
    if (attribute.expected_value !== undefined) {
      html += `<p><strong>Expected Input:</strong> ${escapeHtml(String(attribute.expected_value))}</p>`;
    }

    if (attribute.status) {
      html += `<p><strong>Status:</strong> ${escapeHtml(attribute.status)}</p>`;
    } 

    if (attribute.data_standard) {
      html += `<p><strong>Data Standard:</strong> <a href="${attribute.data_standard}" target="_blank" rel="noopener">${escapeHtml(
        attribute.data_standard
      )}</a></p>`;
    }

    if (attribute.notes) {
      html += `<p><strong>Notes:</strong> ${escapeHtml(attribute.notes)}</p>`;
    }

    if (attribute.type === 'enumerated' && Array.isArray(attribute.values) && attribute.values.length) {
      html += '<h4>Allowed values</h4>';
      html += `
        <table>
          <thead>
            <tr><th>Code</th><th>Label</th><th>Description</th></tr>
          </thead>
          <tbody>
      `;

      attribute.values.forEach((v) => {
        const code = v.code !== undefined ? String(v.code) : '';
        const label = v.label || '';
        const desc = v.description || '';
        html += `
          <tr>
            <td>${escapeHtml(code)}</td>
            <td>${escapeHtml(label)}</td>
            <td>${escapeHtml(desc)}</td>
          </tr>
        `;
      });

      html += `
          </tbody>
        </table>
      `;
    }

    html += '<h4>Objects using this attribute</h4>';
    if (!objectsUsing.length) {
      html += '<p>No other objects currently reference this attribute.</p>';
    } else {
      html += '<ul>';
      objectsUsing.forEach((obj) => {
        html += `
          <li>
            <button type="button" class="link-button" data-object-id="${escapeHtml(obj.id)}">
              ${escapeHtml(obj.title || obj.id)}
            </button>
          </li>
        `;
      });
      html += '</ul>';
    }

    html += `
      <p style="margin-top:0.6rem;">
        <button type="button" class="link-button" data-open-full-attribute="${escapeHtml(attribute.id)}">
          Open full attribute page
        </button>
      </p>
    `;

    container.innerHTML = html;

    const openFullBtn = container.querySelector('button[data-open-full-attribute]');
    if (openFullBtn) {
      openFullBtn.addEventListener('click', () => {
        const id = openFullBtn.getAttribute('data-open-full-attribute');
        showAttributesView();
        renderAttributeDetail(id);
      });
    }

    const objButtons = container.querySelectorAll('button[data-object-id]');
    objButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const objId = btn.getAttribute('data-object-id');
        showObjectsView();
        lastSelectedObjectId = objId;
        renderObjectDetail(objId);
      });
    });
  }

  function renderAttributeDetail(attrId) {
  if (!attributeDetailEl) return;

  // Browsing existing attributes should not animate.
  attributeDetailEl.classList.remove('fx-enter', 'fx-animating');

  lastSelectedAttributeId = attrId;
  setActiveListButton(attributeListEl, (b) => b.getAttribute('data-attr-id') === attrId);

  const attribute = Catalog.getAttributeById(attrId);
  if (!attribute) {
    attributeDetailEl.classList.remove('hidden');
    attributeDetailEl.innerHTML = `<p>Attribute not found: ${escapeHtml(attrId)}</p>`;
    return;
  }

  const objects = Catalog.getObjectsForAttribute(attrId);

  let html = '';

  // Header
  html += `<h2>${escapeHtml(attribute.id)}</h2>`;

  if (attribute.definition) {
  html += `<p><strong>Definition:</strong> ${escapeHtml(attribute.definition)}</p>`;
  }

  // Meta card (updated field names + order)
  html += '<div class="card card-attribute-meta">';

  html += `<p><strong>Name:</strong> ${escapeHtml(attribute.id)}</p>`; // was Attribute Name
  html += `<p><strong>Field Name:</strong> ${escapeHtml(attribute.label || '')}</p>`; // was Attribute Label
  html += `<p><strong>Attribute Type:</strong> ${escapeHtml(attribute.type || '')}</p>`; // no change

  if (attribute.expected_value !== undefined) {
    html += `<p><strong>Expected Input:</strong> ${escapeHtml(String(attribute.expected_value))}</p>`;
  }

  if (attribute.status) {
    html += `<p><strong>Status:</strong> ${escapeHtml(attribute.status)}</p>`;
  }

  if (attribute.data_standard) {
    html += `<p><strong>Data Standard:</strong> <a href="${attribute.data_standard}" target="_blank" rel="noopener">${escapeHtml(
      attribute.data_standard
    )}</a></p>`;
  }

  if (attribute.notes) {
    html += `<p><strong>Notes:</strong> ${escapeHtml(attribute.notes)}</p>`;
  }

  html += '</div>';

  // Enumerated values (unchanged)
  if (attribute.type === 'enumerated' && Array.isArray(attribute.values) && attribute.values.length) {
    html += '<div class="card card-enumerated">';
    html += '<h3>Allowed values</h3>';
    html += `
      <table>
        <thead>
          <tr><th>Code</th><th>Label</th><th>Description</th></tr>
        </thead>
        <tbody>
    `;
    attribute.values.forEach((v) => {
      const code = v.code !== undefined ? String(v.code) : '';
      const label = v.label || '';
      const desc = v.description || '';
      html += `
        <tr>
          <td>${escapeHtml(code)}</td>
          <td>${escapeHtml(label)}</td>
          <td>${escapeHtml(desc)}</td>
        </tr>
      `;
    });
    html += `
        </tbody>
      </table>
    `;
    html += '</div>';
  }

    html += '<div class="card card-attribute-objects">';
    html += '<h3>Objects using this attribute</h3>';
    if (!objects.length) {
      html += '<p>No objects currently reference this attribute.</p>';
    } else {
      html += '<ul>';
      objects.forEach((obj) => {
        html += `
          <li>
            <button type="button" class="link-button" data-object-id="${escapeHtml(obj.id)}">
              ${escapeHtml(obj.title || obj.id)}
            </button>
          </li>`;
      });
      html += '</ul>';
    }
    html += '</div>';

    html += `
      <div class="card card-actions">
        <button type="button" class="suggest-button" data-edit-attribute="${escapeHtml(attribute.id)}">
          Suggest a change to this attribute
        </button>
      </div>
    `;

    attributeDetailEl.innerHTML = html;
    attributeDetailEl.classList.remove('hidden');

    const editAttrBtn = attributeDetailEl.querySelector('button[data-edit-attribute]');
    if (editAttrBtn) {
      editAttrBtn.addEventListener('click', () => {
        const id = editAttrBtn.getAttribute('data-edit-attribute');
        renderAttributeEditForm(id);
      });
    }

    const objButtons = attributeDetailEl.querySelectorAll('button[data-object-id]');
    objButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const objId = btn.getAttribute('data-object-id');
        showObjectsView();
        lastSelectedObjectId = objId;
        renderObjectDetail(objId);
      });
    });
  }

  // ===========================
  // INITIAL RENDER + SEARCH
  // ===========================
  renderObjectList();
  renderAttributeList();

  if (objectSearchInput) {
    objectSearchInput.addEventListener('input', () => renderObjectList(objectSearchInput.value));
  }
  if (attributeSearchInput) {
    attributeSearchInput.addEventListener('input', () => renderAttributeList(attributeSearchInput.value));
  }

  // Initial render: objects tab is active by default
  if (allObjects.length) {
    lastSelectedObjectId = allObjects[0].id;
    renderObjectDetail(allObjects[0].id);
  }
});

// ====== UTILS ======
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Return HTML snippet for a geometry icon based on geometry_type
// contextClass should be either "geom-icon-list" or "geom-icon-inline"
function getGeometryIconHTML(geometryType, contextClass) {
  const geom = (geometryType || '').toUpperCase().trim();

  const baseClass = 'geom-icon';
  const fullClass = `${baseClass} ${contextClass || ''}`.trim();

  if (geom === 'POLYGON') {
    return `<span class="${fullClass} geom-poly"></span>`;
  }

  let symbol = '';
  if (geom === 'POINT' || geom === 'MULTIPOINT') {
    symbol = '•';
  } else if (geom === 'POLYLINE' || geom === 'LINE') {
    symbol = '〰️';
  } else if (geom === 'TABLE') {
    symbol = '▦';
  } else {
    symbol = '';
  }

  return `<span class="${fullClass}">${symbol}</span>`;
}

// Build ArcGIS Python schema script for an object
function buildArcGisSchemaPython(obj, attrs) {
  const lines = [];
  const objId = obj.id || '';
  const objname = obj.objname || objId;

  lines.push('# -*- coding: utf-8 -*-');
  lines.push('# Auto-generated ArcGIS schema script from National Lands Data Catalog');
  lines.push(`# Object ID: ${objId}`);
  if (obj.title) lines.push(`# Title: ${obj.title}`);
  if (obj.description) lines.push(`# Description: ${obj.description}`);
  lines.push('');
  lines.push('import arcpy');
  lines.push('');
  lines.push('# TODO: Update these paths and settings before running');
  lines.push('gdb = r"C:\\path\\to\\your.gdb"');
  lines.push(`fc_name = "${objname}"`);

  const proj = obj.projection || '';
  const epsgMatch = proj.match(/EPSG:(\\d+)/i);

  const geomType = (obj.geometry_type || 'POLYGON').toUpperCase();
  lines.push(`geometry_type = "${geomType}"  # e.g. "POINT", "POLYLINE", "POLYGON"`);

  if (epsgMatch) {
    lines.push(`spatial_reference = arcpy.SpatialReference(${epsgMatch[1]})  # from ${proj}`);
  } else {
    lines.push('spatial_reference = None  # TODO: set a spatial reference if desired');
  }

  lines.push('');
  lines.push('# Create the feature class');
  lines.push('out_fc = arcpy.management.CreateFeatureclass(');
  lines.push('    gdb,');
  lines.push('    fc_name,');
  lines.push('    geometry_type,');
  lines.push('    spatial_reference=spatial_reference');
  lines.push(')[0]');
  lines.push('');
  lines.push('# Define attributes: (name, type, alias, length, domain)');
  lines.push('attributes = [');

  const enumDomainComments = [];

  attrs.forEach((attr) => {
    const attrInfo = mapAttributeToArcGisAttributeSpec(attr);

    const name = attr.id || '';
    const alias = attr.label || '';
    const type = attrInfo.type;
    const length = attrInfo.length;
    const domain = 'None';

    const safeAlias = alias.replace(/"/g, '""');

    lines.push(`    ("${name}", "${type}", "${safeAlias}", ${length}, ${domain}),`);

    if (attr.type === 'enumerated' && Array.isArray(attr.values) && attr.values.length) {
      const commentLines = [];
      commentLines.push(`# Domain suggestion for ${name} (${alias}):`);
      attr.values.forEach((v) => {
        const code = v.code !== undefined ? String(v.code) : '';
        const label = v.label || '';
        const desc = v.description || '';
        commentLines.push(`#   ${code} = ${label}  -  ${desc}`);
      });
      enumDomainComments.push(commentLines.join('\n'));
    }
  });

  lines.push(']');
  lines.push('');
  lines.push('# Add attributes to the feature class');
  lines.push('for name, atype, alias, length, domain in attributes:');
  lines.push('    kwargs = {"field_alias": alias}');
  lines.push('    if length is not None and atype == "TEXT":');
  lines.push('        kwargs["field_length"] = length');
  lines.push('    if domain is not None and domain != "None":');
  lines.push('        kwargs["field_domain"] = domain');
  lines.push('    arcpy.management.AddField(out_fc, name, atype, **kwargs)');
  lines.push('');

  if (enumDomainComments.length) {
    lines.push('# ---------------------------------------------------------------------------');
    lines.push('# Suggested coded value domains for enumerated attributes');
    lines.push('# You can use these comments to create geodatabase domains manually:');
    lines.push('# ---------------------------------------------------------------------------');
    enumDomainComments.forEach((block) => {
      lines.push(block);
      lines.push('');
    });
  }

  return lines.join('\n');
}

// ✅ renamed: no "field" in the codebase naming
function mapAttributeToArcGisAttributeSpec(attr) {
  const t = (attr.type || '').toLowerCase();
  switch (t) {
    case 'string':
      return { type: 'TEXT', length: 255 };
    case 'integer':
      return { type: 'LONG', length: null };
    case 'float':
      return { type: 'DOUBLE', length: null };
    case 'boolean':
      return { type: 'SHORT', length: null };
    case 'date':
      return { type: 'DATE', length: null };
    case 'enumerated':
      return { type: 'LONG', length: null };
    default:
      return { type: 'TEXT', length: 255 };
  }
}

function slugifyObjectId(raw) {
  // Make a safe catalog ID like: blm_rmp_boundaries
  // - lowercase
  // - convert spaces/dashes to underscores
  // - remove non-alphanumerics (keep underscores)
  // - collapse multiple underscores
  // - trim underscores
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\.(?=[a-z0-9])/g, '_')          // dots -> underscores (e.g., SDE.NAME)
    .replace(/[\s\-\/]+/g, '_')              // spaces/dashes/slashes -> underscores
    .replace(/[^a-z0-9_]/g, '')              // remove everything else
    .replace(/_+/g, '_')                     // collapse underscores
    .replace(/^_+|_+$/g, '');                // trim underscores
}

function suggestObjectIdFromDraft(draft) {
  // Prefer Name (title). Fallback to objname. Fallback to description.
  const name = (draft && draft.title) || '';
  const objname = (draft && draft.objname) || '';
  const desc = (draft && draft.description) || '';

  // If objname looks like "SDE.FOO_BAR", take the last token
  let base = name;
  if (!base && objname) {
    const parts = String(objname).split('.');
    base = parts[parts.length - 1] || objname;
  }
  if (!base) base = desc;

  return slugifyObjectId(base);
}

function downloadTextFile(content, filename) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// forcing commit 2 //