// app.js

// ====== CONFIG ======
const CATALOG_URL = 'data/catalog.json';

// >>>>> SET THIS to your real GitHub repo's "new issue" URL base
// Example: 'https://github.com/blm-gis/public-lands-data-catalog/issues/new'
const GITHUB_NEW_ISSUE_BASE =
  'https://github.com/AmateurProjects/Public-Lands-Data-Catalog/issues/new';

// ====== CATALOG MODULE (shared loader + indexes) ======
const Catalog = (function () {
  let cache = null;
  let indexesBuilt = false;
  let attributeById = {};
  let datasetById = {};
  let datasetsByAttributeId = {};

  async function loadCatalog() {
    if (cache) return cache;
    const resp = await fetch(CATALOG_URL);
    if (!resp.ok) {
      throw new Error(`Failed to load catalog.json: ${resp.status}`);
    }
    cache = await resp.json();
    buildIndexes();
    return cache;
  }

  function buildIndexes() {
    if (!cache || indexesBuilt) return;

    attributeById = {};
    datasetById = {};
    datasetsByAttributeId = {};

    // Index attributes
    (cache.attributes || []).forEach((attr) => {
      if (attr.id) attributeById[attr.id] = attr;
    });

    // Index datasets + reverse index of attribute -> datasets
    (cache.datasets || []).forEach((ds) => {
      if (ds.id) datasetById[ds.id] = ds;

      (ds.attribute_ids || []).forEach((attrId) => {
        if (!datasetsByAttributeId[attrId]) datasetsByAttributeId[attrId] = [];
        datasetsByAttributeId[attrId].push(ds);
      });
    });

    indexesBuilt = true;
  }

  function getAttributeById(id) {
    return attributeById[id] || null;
  }

  function getDatasetById(id) {
    return datasetById[id] || null;
  }

  function getAttributesForDataset(dataset) {
    if (!dataset || !dataset.attribute_ids) return [];
    return dataset.attribute_ids.map((id) => attributeById[id]).filter(Boolean);
  }

  function getDatasetsForAttribute(attrId) {
    return datasetsByAttributeId[attrId] || [];
  }

  function buildGithubIssueUrlForDataset(dataset) {
    const title = encodeURIComponent(`Dataset change request: ${dataset.id}`);
    const bodyLines = [
      `Please describe the requested change for dataset \`${dataset.id}\` (\`${dataset.title || ''}\`).`,
      '',
      '---',
      '',
      'Current dataset JSON:',
      '```json',
      JSON.stringify(dataset, null, 2),
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
    getDatasetById,
    getAttributesForDataset,
    getDatasetsForAttribute,
    buildGithubIssueUrlForDataset,
    buildGithubIssueUrlForAttribute,
  };
})();

// ====== MAIN APP (tabs, lists, detail panels) ======
document.addEventListener('DOMContentLoaded', async () => {
  // --- Elements ---
  const datasetsTabBtn = document.getElementById('datasetsTab');
  const attributesTabBtn = document.getElementById('attributesTab');
  const datasetsView = document.getElementById('datasetsView');
  const attributesView = document.getElementById('attributesView');

  const datasetSearchInput = document.getElementById('datasetSearchInput');
  const attributeSearchInput = document.getElementById('attributeSearchInput');

  const datasetListEl = document.getElementById('datasetList');
  const attributeListEl = document.getElementById('attributeList');

  const datasetDetailEl = document.getElementById('datasetDetail');
  const attributeDetailEl = document.getElementById('attributeDetail');

  // --- Edit Fields for Suggest Dataset Change functionality ---

  const DATASET_EDIT_FIELDS = [
    { key: 'objname', label: 'Database Object Name', type: 'text' },
    { key: 'topics', label: 'Topics (comma-separated)', type: 'csv' },

    { key: 'agency_owner', label: 'Agency Owner', type: 'text' },
    { key: 'office_owner', label: 'Office Owner', type: 'text' },
    { key: 'contact_email', label: 'Contact Email', type: 'text' },

    { key: 'geometry_type', label: 'Geometry Type', type: 'text' },
    { key: 'update_frequency', label: 'Update Frequency', type: 'text' },

    { key: 'status', label: 'Status', type: 'text' },
    { key: 'access_level', label: 'Access Level', type: 'text' },

    { key: 'public_web_service', label: 'Public Web Service', type: 'text' },
    { key: 'internal_web_service', label: 'Internal Web Service', type: 'text' },
    { key: 'data_standard', label: 'Data Standard', type: 'text' },

    { key: 'notes', label: 'Notes', type: 'textarea' },
  ];

  // --- Edit Fields for Suggest Attribute Change functionality ---
  const ATTRIBUTE_EDIT_FIELDS = [
    { key: 'label', label: 'Attribute Label', type: 'text' },
    { key: 'type', label: 'Attribute Type', type: 'text' }, // you can later make this a select
    { key: 'definition', label: 'Attribute Definition', type: 'textarea' },
    { key: 'expected_value', label: 'Example Expected Value', type: 'text' },
    { key: 'values', label: 'Allowed values (JSON array) — for enumerated types', type: 'json' },
  ];


  // --- Helpers (shared) ---
  function compactObject(obj) {
    const out = {};
    Object.keys(obj).forEach((k) => {
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

  function buildGithubIssueUrlForEditedDataset(datasetId, original, updated, changes) {
    const title = encodeURIComponent(`Dataset change request: ${datasetId}`);

    const bodyLines = [
      `## Suggested changes for dataset: \`${datasetId}\``,
      '',
      '### Summary of changes',
    ];

    if (!changes.length) {
      bodyLines.push('- No changes detected.');
    } else {
      changes.forEach((c) => {
        bodyLines.push(
          `- **${c.key}**: \`${JSON.stringify(c.from)}\` → \`${JSON.stringify(c.to)}\``
        );
      });
    }

    bodyLines.push(
      '',
      '---',
      '',
      '### Original dataset JSON',
      '```json',
      JSON.stringify(original, null, 2),
      '```',
      '',
      '### Updated dataset JSON',
      '```json',
      JSON.stringify(updated, null, 2),
      '```'
    );

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
        bodyLines.push(
          `- **${c.key}**: \`${JSON.stringify(c.from)}\` → \`${JSON.stringify(c.to)}\``
        );
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




  // --- Edit mode renderer ---

  function renderDatasetEditForm(datasetId) {
    if (!datasetDetailEl) return;

    const dataset = Catalog.getDatasetById(datasetId);
    if (!dataset) return;

    const original = deepClone(dataset);
    const draft = deepClone(dataset);
    const attrs = Catalog.getAttributesForDataset(dataset);

    let html = '';

    // Breadcrumb
    html += `
    <nav class="breadcrumb">
      <button type="button" class="breadcrumb-root" data-breadcrumb="datasets">Datasets</button>
      <span class="breadcrumb-separator">/</span>
      <span class="breadcrumb-current">${escapeHtml(dataset.title || dataset.id)}</span>
    </nav>
  `;

    html += `<h2>Editing: ${escapeHtml(dataset.title || dataset.id)}</h2>`;
    if (dataset.description) html += `<p>${escapeHtml(dataset.description)}</p>`;

    // Form container
    html += `<div class="card card-meta" id="datasetEditCard">`;
    html += `<div class="dataset-edit-actions">
      <button type="button" class="btn" data-edit-cancel>Cancel</button>
      <button type="button" class="btn primary" data-edit-submit>Submit suggestion</button>
    </div>`;

    // Fields
    DATASET_EDIT_FIELDS.forEach((f) => {
      const val = draft[f.key];

      if (f.type === 'textarea') {
        html += `
        <div class="dataset-edit-row">
          <label class="dataset-edit-label">${escapeHtml(f.label)}</label>
          <textarea class="dataset-edit-input" data-edit-key="${escapeHtml(f.key)}">${escapeHtml(
          val || ''
        )}</textarea>
        </div>
      `;
      } else {
        const displayVal =
          f.type === 'csv' && Array.isArray(val) ? val.join(', ') : (val || '');
        html += `
        <div class="dataset-edit-row">
          <label class="dataset-edit-label">${escapeHtml(f.label)}</label>
          <input class="dataset-edit-input" type="text" data-edit-key="${escapeHtml(
          f.key
        )}" value="${escapeHtml(displayVal)}" />
        </div>
      `;
      }
    });

    html += `</div>`;

    // Keep attributes section unchanged (read-only), as requested
    html += `
    <div class="card-row">
      <div class="card card-attributes">
        <h3>Attributes</h3>
  `;

    if (!attrs.length) {
      html += '<p>No attributes defined for this dataset.</p>';
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
        <p>Select an attribute from the list to see its properties here without leaving this dataset.</p>
      </div>
    </div>
  `;

    datasetDetailEl.innerHTML = html;
    datasetDetailEl.classList.remove('hidden');

    // Breadcrumb
    const rootBtn = datasetDetailEl.querySelector('button[data-breadcrumb="datasets"]');
    if (rootBtn) rootBtn.addEventListener('click', showDatasetsView);

    // Inline attribute hooks
    const attrButtons = datasetDetailEl.querySelectorAll('button[data-attr-id]');
    attrButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const attrId = btn.getAttribute('data-attr-id');
        renderInlineAttributeDetail(attrId);
      });
    });

    // Cancel -> back to normal view
    const cancelBtn = datasetDetailEl.querySelector('button[data-edit-cancel]');
    if (cancelBtn) cancelBtn.addEventListener('click', () => renderDatasetDetail(datasetId));

    // Submit -> collect values, compute diff, open issue
    const submitBtn = datasetDetailEl.querySelector('button[data-edit-submit]');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        const inputs = datasetDetailEl.querySelectorAll('[data-edit-key]');
        inputs.forEach((el) => {
          const k = el.getAttribute('data-edit-key');
          const raw = el.value;

          const fieldDef = DATASET_EDIT_FIELDS.find((x) => x.key === k);
          if (fieldDef && fieldDef.type === 'csv') {
            draft[k] = parseCsvList(raw);
          } else {
            draft[k] = String(raw || '').trim();
          }
        });

        const updated = compactObject(draft);
        const origCompact = compactObject(original);
        const changes = computeChanges(origCompact, updated);

        const issueUrl = buildGithubIssueUrlForEditedDataset(datasetId, origCompact, updated, changes);

        // Return UI to normal view right away
        renderDatasetDetail(datasetId);

        // Then open the GitHub issue in a new tab
        window.open(issueUrl, '_blank', 'noopener');

      });
    }
  }


  function renderAttributeEditForm(attrId) {
    if (!attributeDetailEl) return;

    const attribute = Catalog.getAttributeById(attrId);
    if (!attribute) return;

    const original = deepClone(attribute);
    const draft = deepClone(attribute);
    const datasets = Catalog.getDatasetsForAttribute(attrId) || [];

    let html = '';

    html += `
    <nav class="breadcrumb">
      <button type="button" class="breadcrumb-root" data-breadcrumb="attributes">Attributes</button>
      <span class="breadcrumb-separator">/</span>
      <span class="breadcrumb-current">${escapeHtml(attribute.id)}</span>
    </nav>
  `;

    html += `<h2>Editing: ${escapeHtml(attribute.id)} – ${escapeHtml(attribute.label || '')}</h2>`;

    html += `<div class="card card-attribute-meta" id="attributeEditCard">`;

    html += `<div class="dataset-edit-actions">
      <button type="button" class="btn" data-edit-attr-cancel>Cancel</button>
      <button type="button" class="btn primary" data-edit-attr-submit>Submit suggestion</button>
    </div>`;

    ATTRIBUTE_EDIT_FIELDS.forEach((f) => {
      let val = draft[f.key];

      // For enumerated values, we edit as JSON text
      if (f.type === 'json') {
        val = val === undefined ? '' : JSON.stringify(val, null, 2);
        html += `
        <div class="dataset-edit-row">
          <label class="dataset-edit-label">${escapeHtml(f.label)}</label>
          <textarea class="dataset-edit-input" data-edit-attr-key="${escapeHtml(f.key)}">${escapeHtml(
          val
        )}</textarea>
        </div>
      `;
        return;
      }

      if (f.type === 'textarea') {
        html += `
        <div class="dataset-edit-row">
          <label class="dataset-edit-label">${escapeHtml(f.label)}</label>
          <textarea class="dataset-edit-input" data-edit-attr-key="${escapeHtml(f.key)}">${escapeHtml(
          val || ''
        )}</textarea>
        </div>
      `;
        return;
      }

      html += `
      <div class="dataset-edit-row">
        <label class="dataset-edit-label">${escapeHtml(f.label)}</label>
        <input class="dataset-edit-input" type="text" data-edit-attr-key="${escapeHtml(
        f.key
      )}" value="${escapeHtml(val === undefined ? '' : String(val))}" />
      </div>
    `;
    });

    html += `</div>`;

    // Keep “Allowed values” preview if it exists (optional but nice)
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

    // Keep datasets list unchanged (read-only), like your normal view
    html += '<div class="card card-attribute-datasets">';
    html += '<h3>Datasets using this attribute</h3>';
    if (!datasets.length) {
      html += '<p>No datasets currently reference this attribute.</p>';
    } else {
      html += '<ul>';
      datasets.forEach((ds) => {
        html += `
        <li>
          <button type="button" class="link-button" data-dataset-id="${escapeHtml(ds.id)}">
            ${escapeHtml(ds.title || ds.id)}
          </button>
        </li>`;
      });
      html += '</ul>';
    }
    html += '</div>';

    attributeDetailEl.innerHTML = html;
    attributeDetailEl.classList.remove('hidden');

    // Breadcrumb root
    const rootBtn = attributeDetailEl.querySelector('button[data-breadcrumb="attributes"]');
    if (rootBtn) rootBtn.addEventListener('click', showAttributesView);

    // Dataset navigation still works
    const dsButtons = attributeDetailEl.querySelectorAll('button[data-dataset-id]');
    dsButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const dsId = btn.getAttribute('data-dataset-id');
        showDatasetsView();
        renderDatasetDetail(dsId);
      });
    });

    // Cancel -> normal view
    const cancelBtn = attributeDetailEl.querySelector('button[data-edit-attr-cancel]');
    if (cancelBtn) cancelBtn.addEventListener('click', () => renderAttributeDetail(attrId));

    // Submit -> collect, validate JSON for values, diff, open issue, return to normal view
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

        // return UI to normal view immediately
        renderAttributeDetail(attrId);

        window.open(issueUrl, '_blank', 'noopener');
      });
    }
  }



  // --- Load catalog once ---
  let catalog;
  try {
    catalog = await Catalog.loadCatalog();
  } catch (err) {
    console.error('Failed to load catalog.json:', err);
    if (datasetListEl) datasetListEl.textContent = 'Error loading catalog.';
    if (attributeListEl) attributeListEl.textContent = 'Error loading catalog.';
    return;
  }

  const allDatasets = catalog.datasets || [];
  const allAttributes = catalog.attributes || [];

  // ===========================
  // DATASET SUBMISSION MODAL
  // ===========================
  const newDatasetBtn = document.getElementById('newDatasetBtn');
  const newDatasetDialog = document.getElementById('newDatasetDialog');
  const newDatasetForm = document.getElementById('newDatasetForm');
  const newDatasetCloseBtn = document.getElementById('newDatasetCloseBtn');
  const newDatasetCancelBtn = document.getElementById('newDatasetCancelBtn');

  function openNewDatasetDialog() {
    if (!newDatasetDialog) return;
    if (typeof newDatasetDialog.showModal === 'function') {
      newDatasetDialog.showModal();
    } else {
      alert(
        'Your browser does not support the dataset submission modal. Please use GitHub Issues directly.'
      );
    }
  }

  function closeNewDatasetDialog() {
    if (!newDatasetDialog) return;
    newDatasetDialog.close();
  }

  function buildGithubIssueUrlForNewDataset(datasetObj) {
    const titleBase = datasetObj.id || datasetObj.title || 'New dataset request';
    const title = encodeURIComponent(`New dataset request: ${titleBase}`);

    const bodyLines = [
      '## New dataset submission',
      '',
      'Please review the dataset proposal below. If approved, add it to `data/catalog.json` under `datasets`.',
      '',
      '### Review checklist',
      '- [ ] ID is unique and follows naming conventions',
      '- [ ] Title/description are clear',
      '- [ ] Owner/contact info is present',
      '- [ ] Geometry type is correct',
      '- [ ] Services/standards links are valid (if provided)',
      '',
      '---',
      '',
      '### Proposed dataset JSON',
      '```json',
      JSON.stringify(datasetObj, null, 2),
      '```',
    ];

    const body = encodeURIComponent(bodyLines.join('\n'));
    return `${GITHUB_NEW_ISSUE_BASE}?title=${title}&body=${body}`;
  }

  if (newDatasetBtn) newDatasetBtn.addEventListener('click', openNewDatasetDialog);
  if (newDatasetCloseBtn) newDatasetCloseBtn.addEventListener('click', closeNewDatasetDialog);
  if (newDatasetCancelBtn) newDatasetCancelBtn.addEventListener('click', closeNewDatasetDialog);

  // click outside dialog to close (your preferred method)
  if (newDatasetDialog) {
    newDatasetDialog.addEventListener('click', (e) => {
      const rect = newDatasetDialog.getBoundingClientRect();
      const clickedInDialog =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;
      if (!clickedInDialog) closeNewDatasetDialog();
    });
  }

  if (newDatasetForm) {
    newDatasetForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const fd = new FormData(newDatasetForm);
      const id = String(fd.get('id') || '').trim();
      if (!id) {
        alert('Dataset ID is required.');
        return;
      }

      const dataset = compactObject({
        id,
        title: String(fd.get('title') || '').trim(),
        description: String(fd.get('description') || '').trim(),
        objname: String(fd.get('objname') || '').trim(),
        geometry_type: String(fd.get('geometry_type') || '').trim(),
        agency_owner: String(fd.get('agency_owner') || '').trim(),
        office_owner: String(fd.get('office_owner') || '').trim(),
        contact_email: String(fd.get('contact_email') || '').trim(),
        topics: parseCsvList(fd.get('topics')),
        update_frequency: String(fd.get('update_frequency') || '').trim(),
        status: String(fd.get('status') || '').trim(),
        access_level: String(fd.get('access_level') || '').trim(),
        public_web_service: String(fd.get('public_web_service') || '').trim(),
        internal_web_service: String(fd.get('internal_web_service') || '').trim(),
        data_standard: String(fd.get('data_standard') || '').trim(),
        projection: String(fd.get('projection') || '').trim(),
        notes: String(fd.get('notes') || '').trim(),
      });

      const exists = Catalog.getDatasetById(id);
      if (exists) {
        const proceed = confirm(
          `A dataset with ID "${id}" already exists in the catalog. Open an issue anyway?`
        );
        if (!proceed) return;
      }

      const issueUrl = buildGithubIssueUrlForNewDataset(dataset);
      window.open(issueUrl, '_blank', 'noopener');

      newDatasetForm.reset();
      closeNewDatasetDialog();
    });
  }

  // ===========================
  // ATTRIBUTE SUBMISSION MODAL
  // ===========================
  const newAttributeBtn = document.getElementById('newAttributeBtn');
  const newAttributeDialog = document.getElementById('newAttributeDialog');
  const newAttributeForm = document.getElementById('newAttributeForm');
  const newAttributeCloseBtn = document.getElementById('newAttributeCloseBtn');
  const newAttributeCancelBtn = document.getElementById('newAttributeCancelBtn');

  const attrTabBtns = document.querySelectorAll('button[data-attr-tab]');
  const attrPanels = document.querySelectorAll('[data-attr-panel]');

  function openNewAttributeDialog() {
    if (!newAttributeDialog) return;
    if (typeof newAttributeDialog.showModal === 'function') {
      newAttributeDialog.showModal();
    } else {
      alert(
        'Your browser does not support the attribute submission modal. Please use GitHub Issues directly.'
      );
    }
  }

  function closeNewAttributeDialog() {
    if (!newAttributeDialog) return;
    newAttributeDialog.close();
  }

  function setAttrTab(tabName) {
    attrTabBtns.forEach((b) =>
      b.classList.toggle('active', b.getAttribute('data-attr-tab') === tabName)
    );
    attrPanels.forEach((p) =>
      p.classList.toggle('hidden', p.getAttribute('data-attr-panel') !== tabName)
    );
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

  if (newAttributeBtn) {
    newAttributeBtn.addEventListener('click', () => {
      setAttrTab('single');
      openNewAttributeDialog();
    });
  }
  if (newAttributeCloseBtn) newAttributeCloseBtn.addEventListener('click', closeNewAttributeDialog);
  if (newAttributeCancelBtn) newAttributeCancelBtn.addEventListener('click', closeNewAttributeDialog);

  attrTabBtns.forEach((btn) => {
    btn.addEventListener('click', () => setAttrTab(btn.getAttribute('data-attr-tab')));
  });

  // backdrop click close (simple)
  if (newAttributeDialog) {
    newAttributeDialog.addEventListener('click', (e) => {
      if (e.target === newAttributeDialog) closeNewAttributeDialog();
    });
  }

  if (newAttributeForm) {
    newAttributeForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const activeTabBtn = document.querySelector('button[data-attr-tab].active');
      const mode = activeTabBtn ? activeTabBtn.getAttribute('data-attr-tab') : 'single';

      const fd = new FormData(newAttributeForm);
      let attributesPayload = [];
      let notes = '';

      if (mode === 'bulk') {
        const raw = String(fd.get('bulk_attributes_json') || '').trim();
        notes = String(fd.get('bulk_notes') || '').trim();

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
        const id = String(fd.get('attr_id') || '').trim();
        if (!id) {
          alert('Attribute ID is required.');
          return;
        }

        const type = String(fd.get('attr_type') || '').trim();
        const definition = String(fd.get('attr_definition') || '').trim();
        const label = String(fd.get('attr_label') || '').trim();
        const expectedValueRaw = String(fd.get('attr_expected_value') || '').trim();
        notes = String(fd.get('attr_notes') || '').trim();

        let values = undefined;
        if (type === 'enumerated') {
          const valuesRaw = String(fd.get('attr_values_json') || '').trim();
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
        });

        const exists = Catalog.getAttributeById(id);
        if (exists) {
          const proceed = confirm(
            `An attribute with ID "${id}" already exists. Open an issue anyway?`
          );
          if (!proceed) return;
        }

        attributesPayload = [attrObj];
      }

      const missingIds = attributesPayload.filter((a) => !a || typeof a !== 'object' || !a.id).length;
      if (missingIds) {
        alert('One or more attribute objects are missing an "id" field.');
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
      window.open(issueUrl, '_blank', 'noopener');

      newAttributeForm.reset();
      setAttrTab('single');
      closeNewAttributeDialog();
    });
  }

  // ===========================
  // TAB SWITCHING
  // ===========================
  function showDatasetsView() {
    datasetsView.classList.remove('hidden');
    attributesView.classList.add('hidden');
    datasetsTabBtn.classList.add('active');
    attributesTabBtn.classList.remove('active');
  }

  function showAttributesView() {
    attributesView.classList.remove('hidden');
    datasetsView.classList.add('hidden');
    attributesTabBtn.classList.add('active');
    datasetsTabBtn.classList.remove('active');
  }

  if (datasetsTabBtn) datasetsTabBtn.addEventListener('click', showDatasetsView);
  if (attributesTabBtn) attributesTabBtn.addEventListener('click', showAttributesView);

  // ===========================
  // LIST RENDERING
  // ===========================
  function renderDatasetList(filterText = '') {
    if (!datasetListEl) return;
    const ft = filterText.trim().toLowerCase();

    const filtered = !ft
      ? allDatasets
      : allDatasets.filter((ds) => {
        const haystack = [ds.id, ds.title, ds.description, ds.agency_owner, ds.office_owner, ...(ds.topics || [])]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(ft);
      });

    if (!filtered.length) {
      datasetListEl.innerHTML = '<p>No datasets found.</p>';
      return;
    }

    const list = document.createElement('ul');
    filtered.forEach((ds) => {
      const li = document.createElement('li');
      li.className = 'list-item dataset-item';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'list-item-button';

      const geomIconHtml = getGeometryIconHTML(ds.geometry_type || '', 'geom-icon-list');

      btn.innerHTML = `
        ${geomIconHtml}
        <span class="list-item-label">${escapeHtml(ds.title || ds.id)}</span>
      `;

      btn.addEventListener('click', () => {
        showDatasetsView();
        renderDatasetDetail(ds.id);
      });

      li.appendChild(btn);
      list.appendChild(li);
    });

    datasetListEl.innerHTML = '';
    datasetListEl.appendChild(list);
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
      btn.textContent = `${attr.id} – ${attr.label || ''}`;

      btn.addEventListener('click', () => {
        showAttributesView();
        renderAttributeDetail(attr.id);
      });

      li.appendChild(btn);
      list.appendChild(li);
    });

    attributeListEl.innerHTML = '';
    attributeListEl.appendChild(list);
  }

  // ===========================
  // DETAIL RENDERERS
  // ===========================
  function renderDatasetDetail(datasetId) {
    if (!datasetDetailEl) return;

    const dataset = Catalog.getDatasetById(datasetId);
    if (!dataset) {
      datasetDetailEl.classList.remove('hidden');
      datasetDetailEl.innerHTML = `<p>Dataset not found: ${escapeHtml(datasetId)}</p>`;
      return;
    }

    const geomIconHtml = getGeometryIconHTML(dataset.geometry_type || '', 'geom-icon-inline');
    const attrs = Catalog.getAttributesForDataset(dataset);

    let html = '';

    // Breadcrumb
    html += `
      <nav class="breadcrumb">
        <button type="button" class="breadcrumb-root" data-breadcrumb="datasets">Datasets</button>
        <span class="breadcrumb-separator">/</span>
        <span class="breadcrumb-current">${escapeHtml(dataset.title || dataset.id)}</span>
      </nav>
    `;

    html += `<h2>${escapeHtml(dataset.title || dataset.id)}</h2>`;
    if (dataset.description) html += `<p>${escapeHtml(dataset.description)}</p>`;

    html += '<div class="card card-meta">';
    html += `<p><strong>Database Object Name:</strong> ${escapeHtml(dataset.objname || '')}</p>`;
    html += `<p><strong>Geometry Type:</strong> ${geomIconHtml}${escapeHtml(dataset.geometry_type || '')}</p>`;
    html += `<p><strong>Agency Owner:</strong> ${escapeHtml(dataset.agency_owner || '')}</p>`;
    html += `<p><strong>Office Owner:</strong> ${escapeHtml(dataset.office_owner || '')}</p>`;
    html += `<p><strong>Contact Email:</strong> ${escapeHtml(dataset.contact_email || '')}</p>`;

    html += `<p><strong>Topics:</strong> ${Array.isArray(dataset.topics)
      ? dataset.topics.map((t) => `<span class="pill pill-topic">${escapeHtml(t)}</span>`).join(' ')
      : ''
      }</p>`;

    html += `<p><strong>Update Frequency:</strong> ${escapeHtml(dataset.update_frequency || '')}</p>`;
    html += `<p><strong>Status:</strong> ${escapeHtml(dataset.status || '')}</p>`;
    html += `<p><strong>Access Level:</strong> ${escapeHtml(dataset.access_level || '')}</p>`;

    html += `<p><strong>Public Web Service:</strong> ${dataset.public_web_service
      ? `<a href="${dataset.public_web_service}" target="_blank" rel="noopener">${escapeHtml(
        dataset.public_web_service
      )}</a>`
      : ''
      }</p>`;

    html += `<p><strong>Internal Web Service:</strong> ${dataset.internal_web_service
      ? `<a href="${dataset.internal_web_service}" target="_blank" rel="noopener">${escapeHtml(
        dataset.internal_web_service
      )}</a>`
      : ''
      }</p>`;

    html += `<p><strong>Data Standard:</strong> ${dataset.data_standard
      ? `<a href="${dataset.data_standard}" target="_blank" rel="noopener">${escapeHtml(dataset.data_standard)}</a>`
      : ''
      }</p>`;

    if (dataset.notes) html += `<p><strong>Notes:</strong> ${escapeHtml(dataset.notes)}</p>`;
    html += '</div>';

    // Attributes + inline attribute details
    html += `
      <div class="card-row">
        <div class="card card-attributes">
          <h3>Attributes</h3>
    `;

    if (!attrs.length) {
      html += '<p>No attributes defined for this dataset.</p>';
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
          <p>Select an attribute from the list to see its properties here without leaving this dataset.</p>
        </div>
      </div>
    `;

    html += `
  <div class="card card-actions">
    <button type="button" class="suggest-button" data-edit-dataset="${escapeHtml(dataset.id)}">
      Suggest a change to this dataset
    </button>
    <button type="button" class="export-button" data-export-schema="${escapeHtml(dataset.id)}">
      Export ArcGIS schema (Python)
    </button>
  </div>
`;


    datasetDetailEl.innerHTML = html;
    datasetDetailEl.classList.remove('hidden');

    const editBtn = datasetDetailEl.querySelector('button[data-edit-dataset]');
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        const dsId = editBtn.getAttribute('data-edit-dataset');
        renderDatasetEditForm(dsId);
      });
    }


    const rootBtn = datasetDetailEl.querySelector('button[data-breadcrumb="datasets"]');
    if (rootBtn) rootBtn.addEventListener('click', showDatasetsView);

    const attrButtons = datasetDetailEl.querySelectorAll('button[data-attr-id]');
    attrButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const attrId = btn.getAttribute('data-attr-id');
        renderInlineAttributeDetail(attrId);
      });
    });

    const exportBtn = datasetDetailEl.querySelector('button[data-export-schema]');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const dsId = exportBtn.getAttribute('data-export-schema');
        const ds = Catalog.getDatasetById(dsId);
        if (!ds) return;
        const attrsForDs = Catalog.getAttributesForDataset(ds);
        const script = buildArcGisSchemaPython(ds, attrsForDs);
        downloadTextFile(script, `${ds.id}_schema_arcpy.py`);
      });
    }
  }

  function renderInlineAttributeDetail(attrId) {
    if (!datasetDetailEl) return;

    const container = datasetDetailEl.querySelector('#inlineAttributeDetail');
    if (!container) return;

    const attribute = Catalog.getAttributeById(attrId);
    if (!attribute) {
      container.innerHTML = `
        <h3>Attribute details</h3>
        <p>Attribute not found: ${escapeHtml(attrId)}</p>
      `;
      return;
    }

    const datasetsUsing = Catalog.getDatasetsForAttribute(attrId) || [];

    let html = '';
    html += '<h3>Attribute details</h3>';
    html += `<h4>${escapeHtml(attribute.id)} – ${escapeHtml(attribute.label || '')}</h4>`;

    html += `<p><strong>Attribute Field Name:</strong> ${escapeHtml(attribute.id)}</p>`;
    html += `<p><strong>Attribute Label:</strong> ${escapeHtml(attribute.label || '')}</p>`;
    html += `<p><strong>Attribute Type:</strong> ${escapeHtml(attribute.type || '')}</p>`;
    html += `<p><strong>Attribute Definition:</strong> ${escapeHtml(attribute.definition || '')}</p>`;
    if (attribute.expected_value !== undefined) {
      html += `<p><strong>Example Expected Value:</strong> ${escapeHtml(String(attribute.expected_value))}</p>`;
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

    html += '<h4>Datasets using this attribute</h4>';
    if (!datasetsUsing.length) {
      html += '<p>No other datasets currently reference this attribute.</p>';
    } else {
      html += '<ul>';
      datasetsUsing.forEach((ds) => {
        html += `
          <li>
            <button type="button" class="link-button" data-dataset-id="${escapeHtml(ds.id)}">
              ${escapeHtml(ds.title || ds.id)}
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

    const dsButtons = container.querySelectorAll('button[data-dataset-id]');
    dsButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const dsId = btn.getAttribute('data-dataset-id');
        showDatasetsView();
        renderDatasetDetail(dsId);
      });
    });
  }

  function renderAttributeDetail(attrId) {
    if (!attributeDetailEl) return;

    const attribute = Catalog.getAttributeById(attrId);
    if (!attribute) {
      attributeDetailEl.classList.remove('hidden');
      attributeDetailEl.innerHTML = `<p>Attribute not found: ${escapeHtml(attrId)}</p>`;
      return;
    }

    const datasets = Catalog.getDatasetsForAttribute(attrId);

    let html = '';

    html += `
      <nav class="breadcrumb">
        <button type="button" class="breadcrumb-root" data-breadcrumb="attributes">Attributes</button>
        <span class="breadcrumb-separator">/</span>
        <span class="breadcrumb-current">${escapeHtml(attribute.id)}</span>
      </nav>
    `;

    html += `<h2>${escapeHtml(attribute.id)} – ${escapeHtml(attribute.label || '')}</h2>`;
    html += '<div class="card card-attribute-meta">';
    html += `<p><strong>Attribute Field Name:</strong> ${escapeHtml(attribute.id)}</p>`;
    html += `<p><strong>Attribute Label:</strong> ${escapeHtml(attribute.label || '')}</p>`;
    html += `<p><strong>Attribute Type:</strong> ${escapeHtml(attribute.type || '')}</p>`;
    html += `<p><strong>Attribute Definition:</strong> ${escapeHtml(attribute.definition || '')}</p>`;
    if (attribute.expected_value !== undefined) {
      html += `<p><strong>Example Expected Value:</strong> ${escapeHtml(String(attribute.expected_value))}</p>`;
    }
    html += '</div>';

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

    html += '<div class="card card-attribute-datasets">';
    html += '<h3>Datasets using this attribute</h3>';
    if (!datasets.length) {
      html += '<p>No datasets currently reference this attribute.</p>';
    } else {
      html += '<ul>';
      datasets.forEach((ds) => {
        html += `
          <li>
            <button type="button" class="link-button" data-dataset-id="${escapeHtml(ds.id)}">
              ${escapeHtml(ds.title || ds.id)}
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

    const rootBtn = attributeDetailEl.querySelector('button[data-breadcrumb="attributes"]');
    if (rootBtn) rootBtn.addEventListener('click', showAttributesView);

    const dsButtons = attributeDetailEl.querySelectorAll('button[data-dataset-id]');
    dsButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const dsId = btn.getAttribute('data-dataset-id');
        showDatasetsView();
        renderDatasetDetail(dsId);
      });
    });
  }

  // ===========================
  // INITIAL RENDER + SEARCH
  // ===========================
  renderDatasetList();
  renderAttributeList();

  if (datasetSearchInput) {
    datasetSearchInput.addEventListener('input', () => renderDatasetList(datasetSearchInput.value));
  }
  if (attributeSearchInput) {
    attributeSearchInput.addEventListener('input', () => renderAttributeList(attributeSearchInput.value));
  }

  if (allDatasets.length) renderDatasetDetail(allDatasets[0].id);

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

// Build ArcGIS Python schema script for a dataset
function buildArcGisSchemaPython(dataset, attrs) {
  const lines = [];
  const dsId = dataset.id || '';
  const objname = dataset.objname || dsId;

  lines.push('# -*- coding: utf-8 -*-');
  lines.push('# Auto-generated ArcGIS schema script from Public Lands National GIS Data Catalog');
  lines.push(`# Dataset ID: ${dsId}`);
  if (dataset.title) lines.push(`# Title: ${dataset.title}`);
  if (dataset.description) lines.push(`# Description: ${dataset.description}`);
  lines.push('');
  lines.push('import arcpy');
  lines.push('');
  lines.push('# TODO: Update these paths and settings before running');
  lines.push('gdb = r"C:\\path\\to\\your.gdb"');
  lines.push(`fc_name = "${objname}"`);

  const proj = dataset.projection || '';
  const epsgMatch = proj.match(/EPSG:(\d+)/i);

  const geomType = (dataset.geometry_type || 'POLYGON').toUpperCase();
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
  lines.push('# Define fields: (name, type, alias, length, domain)');
  lines.push('fields = [');

  const enumDomainComments = [];

  attrs.forEach((attr) => {
    const fieldInfo = mapAttributeToArcGisField(attr);

    const name = attr.id || '';
    const alias = attr.label || '';
    const type = fieldInfo.type;
    const length = fieldInfo.length;
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
  lines.push('# Add fields to the feature class');
  lines.push('for name, ftype, alias, length, domain in fields:');
  lines.push('    kwargs = {"field_alias": alias}');
  lines.push('    if length is not None and ftype == "TEXT":');
  lines.push('        kwargs["field_length"] = length');
  lines.push('    if domain is not None and domain != "None":');
  lines.push('        kwargs["field_domain"] = domain');
  lines.push('    arcpy.management.AddField(out_fc, name, ftype, **kwargs)');
  lines.push('');

  if (enumDomainComments.length) {
    lines.push('# ---------------------------------------------------------------------------');
    lines.push('# Suggested coded value domains for enumerated fields');
    lines.push('# You can use these comments to create geodatabase domains manually:');
    lines.push('# ---------------------------------------------------------------------------');
    enumDomainComments.forEach((block) => {
      lines.push(block);
      lines.push('');
    });
  }

  return lines.join('\n');
}

function mapAttributeToArcGisField(attr) {
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
