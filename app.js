// app.js

// ====== CONFIG ======
const CATALOG_URL = 'data/catalog.json';

// >>>>> SET THIS to your real GitHub repo's "new issue" URL base
// Example: 'https://github.com/blm-gis/public-lands-data-catalog/issues/new'
const GITHUB_NEW_ISSUE_BASE = 'https://github.com/AmateurProjects/Public-Lands-Data-Catalog/issues/new';

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
    (cache.attributes || []).forEach(attr => {
      if (attr.id) {
        attributeById[attr.id] = attr;
      }
    });

    // Index datasets + reverse index of attribute -> datasets
    (cache.datasets || []).forEach(ds => {
      if (ds.id) {
        datasetById[ds.id] = ds;
      }
      (ds.attribute_ids || []).forEach(attrId => {
        if (!datasetsByAttributeId[attrId]) {
          datasetsByAttributeId[attrId] = [];
        }
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
    return dataset.attribute_ids
      .map(id => attributeById[id])
      .filter(Boolean);
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
      '```'
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
      '```'
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
    buildGithubIssueUrlForAttribute
  };
})();

// ====== MAIN APP (tabs, lists, detail panels) ======
document.addEventListener('DOMContentLoaded', async () => {
  const datasetsTabBtn = document.getElementById('datasetsTab');
  const attributesTabBtn = document.getElementById('attributesTab');
  const datasetsView = document.getElementById('datasetsView');
  const attributesView = document.getElementById('attributesView');

  const datasetSearchInput = document.getElementById('datasetSearchInput');
  const attributeSearchInput = document.getElementById('attributeSearchInput');

  const datasetListEl = document.getElementById('datasetList');
  const attributeListEl = document.getElementById('attributeList');

  // Load catalog once
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

  // ---- Tab switching ----
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

  datasetsTabBtn.addEventListener('click', showDatasetsView);
  attributesTabBtn.addEventListener('click', showAttributesView);

  // ---- Render lists ----
  function renderDatasetList(filterText = '') {
    if (!datasetListEl) return;
    const ft = filterText.trim().toLowerCase();

    const filtered = !ft
      ? allDatasets
      : allDatasets.filter(ds => {
          const haystack = [
            ds.id,
            ds.title,
            ds.description,
            ...(ds.topics || []),
            ...(ds.keywords || [])
          ]
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
    filtered.forEach(ds => {
      const li = document.createElement('li');
      li.className = 'list-item dataset-item';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'list-item-button';
      btn.textContent = ds.title || ds.id;
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
      : allAttributes.filter(attr => {
          const haystack = [
            attr.id,
            attr.label,
            attr.description
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return haystack.includes(ft);
        });

    if (!filtered.length) {
      attributeListEl.innerHTML = '<p>No attributes found.</p>';
      return;
    }

    const list = document.createElement('ul');
    filtered.forEach(attr => {
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

  // Initial render
  renderDatasetList();
  renderAttributeList();

  // ---- Search wiring ----
  if (datasetSearchInput) {
    datasetSearchInput.addEventListener('input', () => {
      renderDatasetList(datasetSearchInput.value);
    });
  }

  if (attributeSearchInput) {
    attributeSearchInput.addEventListener('input', () => {
      renderAttributeList(attributeSearchInput.value);
    });
  }

  // ---- Detail renderers ----
  const datasetDetailEl = document.getElementById('datasetDetail');
  const attributeDetailEl = document.getElementById('attributeDetail');

function renderDatasetDetail(datasetId) {
  if (!datasetDetailEl) return;

  const dataset = Catalog.getDatasetById(datasetId);
  if (!dataset) {
    datasetDetailEl.classList.remove('hidden');
    datasetDetailEl.innerHTML = `<p>Dataset not found: ${escapeHtml(datasetId)}</p>`;
    return;
  }

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

  // Heading + description
  html += `<h2>${escapeHtml(dataset.title || dataset.id)}</h2>`;
  if (dataset.description) {
    html += `<p>${escapeHtml(dataset.description)}</p>`;
  }

  // Meta section
  html += '<div class="detail-section">';
  html += `<p><strong>Object Name:</strong> ${escapeHtml(dataset.objname || '')}</p>`;
  html += `<p><strong>Office Owner:</strong> ${escapeHtml(dataset.office_owner || '')}</p>`;
  html += `<p><strong>Contact Email:</strong> ${escapeHtml(dataset.contact_email || '')}</p>`;
  html += `<p><strong>Topics:</strong> ${
    Array.isArray(dataset.topics) ? dataset.topics.map(escapeHtml).join(', ') : ''
  }</p>`;
  html += `<p><strong>Keywords:</strong> ${
    Array.isArray(dataset.keywords) ? dataset.keywords.map(escapeHtml).join(', ') : ''
  }</p>`;
  html += `<p><strong>Update Frequency:</strong> ${escapeHtml(dataset.update_frequency || '')}</p>`;
  html += `<p><strong>Status:</strong> ${escapeHtml(dataset.status || '')}</p>`;
  html += `<p><strong>Access Level:</strong> ${escapeHtml(dataset.access_level || '')}</p>`;
  html += `<p><strong>Public Web Service:</strong> ${
    dataset.public_web_service
      ? `<a href="${dataset.public_web_service}" target="_blank" rel="noopener">${escapeHtml(dataset.public_web_service)}</a>`
      : ''
  }</p>`;
  html += `<p><strong>Internal Web Service:</strong> ${
    dataset.internal_web_service
      ? `<a href="${dataset.internal_web_service}" target="_blank" rel="noopener">${escapeHtml(dataset.internal_web_service)}</a>`
      : ''
  }</p>`;
  html += `<p><strong>Data Standard:</strong> ${
    dataset.data_standard
      ? `<a href="${dataset.data_standard}" target="_blank" rel="noopener">${escapeHtml(dataset.data_standard)}</a>`
      : ''
  }</p>`;
  if (dataset.notes) {
    html += `<p><strong>Notes:</strong> ${escapeHtml(dataset.notes)}</p>`;
  }
  html += '</div>';

  // Attributes section
  html += '<div class="detail-section">';
  html += '<h3>Attributes</h3>';
  if (!attrs.length) {
    html += '<p>No attributes defined for this dataset.</p>';
  } else {
    html += '<ul>';
    attrs.forEach(attr => {
      html += `
        <li>
          <button type="button" class="link-button" data-attr-id="${escapeHtml(attr.id)}">
            ${escapeHtml(attr.id)} – ${escapeHtml(attr.label || '')}
          </button>
        </li>`;
    });
    html += '</ul>';
  }
  html += '</div>';

  // Inline attribute details panel (stays on the dataset page)
  html += `
    <div class="detail-section" id="inlineAttributeDetail">
      <h3>Attribute details</h3>
      <p>Select an attribute from the list above to see its properties here without leaving this dataset.</p>
    </div>
  `;

  // Suggest change button (dataset)
  const issueUrl = Catalog.buildGithubIssueUrlForDataset(dataset);
  html += `
    <div class="detail-section">
      <a href="${issueUrl}" target="_blank" rel="noopener" class="suggest-button">
        Suggest a change to this dataset
      </a>
    </div>
  `;

  datasetDetailEl.innerHTML = html;
  datasetDetailEl.classList.remove('hidden');

  // Wire breadcrumb root
  const rootBtn = datasetDetailEl.querySelector('button[data-breadcrumb="datasets"]');
  if (rootBtn) {
    rootBtn.addEventListener('click', () => {
      showDatasetsView();
    });
  }

  // Wire attribute buttons to open inline attribute detail (stay on datasets view)
  const attrButtons = datasetDetailEl.querySelectorAll('button[data-attr-id]');
  attrButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const attrId = btn.getAttribute('data-attr-id');
      renderInlineAttributeDetail(attrId);
    });
  });
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
  html += `<p><strong>ID:</strong> ${escapeHtml(attribute.id)}</p>`;
  html += `<p><strong>Label:</strong> ${escapeHtml(attribute.label || '')}</p>`;
  html += `<p><strong>Type:</strong> ${escapeHtml(attribute.type || '')}</p>`;
  html += `<p><strong>Nullable:</strong> ${attribute.nullable ? 'Yes' : 'No'}</p>`;
  html += `<p><strong>Description:</strong> ${escapeHtml(attribute.description || '')}</p>`;
  if (attribute.example !== undefined) {
    html += `<p><strong>Example:</strong> ${escapeHtml(String(attribute.example))}</p>`;
  }

  // Optional: show which datasets use this attribute (helpful context)
  html += '<h4>Datasets using this attribute</h4>';
  if (!datasetsUsing.length) {
    html += '<p>No other datasets currently reference this attribute.</p>';
  } else {
    html += '<ul>';
    datasetsUsing.forEach(ds => {
      html += `
        <li>
          ${escapeHtml(ds.title || ds.id)}
        </li>
      `;
    });
    html += '</ul>';
  }

  // Optional: deep-link to full attribute page in Attributes tab
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

    // Breadcrumb
    html += `
      <nav class="breadcrumb">
        <button type="button" class="breadcrumb-root" data-breadcrumb="attributes">Attributes</button>
        <span class="breadcrumb-separator">/</span>
        <span class="breadcrumb-current">${escapeHtml(attribute.id)}</span>
      </nav>
    `;

    html += `<h2>${escapeHtml(attribute.id)} – ${escapeHtml(attribute.label || '')}</h2>`;
    html += '<div class="detail-section">';
    html += `<p><strong>ID:</strong> ${escapeHtml(attribute.id)}</p>`;
    html += `<p><strong>Label:</strong> ${escapeHtml(attribute.label || '')}</p>`;
    html += `<p><strong>Type:</strong> ${escapeHtml(attribute.type || '')}</p>`;
    html += `<p><strong>Nullable:</strong> ${attribute.nullable ? 'Yes' : 'No'}</p>`;
    html += `<p><strong>Description:</strong> ${escapeHtml(attribute.description || '')}</p>`;
    if (attribute.example !== undefined) {
      html += `<p><strong>Example:</strong> ${escapeHtml(String(attribute.example))}</p>`;
    }
    html += '</div>';

    // Datasets that use this attribute
    html += '<div class="detail-section">';
    html += '<h3>Datasets using this attribute</h3>';
    if (!datasets.length) {
      html += '<p>No datasets currently reference this attribute.</p>';
    } else {
      html += '<ul>';
      datasets.forEach(ds => {
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

    // Suggest change button (attribute)
    const issueUrl = Catalog.buildGithubIssueUrlForAttribute(attribute);
    html += `
      <div class="detail-section">
        <a href="${issueUrl}" target="_blank" rel="noopener" class="suggest-button">
          Suggest a change to this attribute
        </a>
      </div>
    `;

    attributeDetailEl.innerHTML = html;
    attributeDetailEl.classList.remove('hidden');

    // Wire breadcrumb root
    const rootBtn = attributeDetailEl.querySelector('button[data-breadcrumb="attributes"]');
    if (rootBtn) {
      rootBtn.addEventListener('click', () => {
        showAttributesView();
      });
    }

    // Wire dataset buttons to open dataset detail view
    const dsButtons = attributeDetailEl.querySelectorAll('button[data-dataset-id]');
    dsButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const dsId = btn.getAttribute('data-dataset-id');
        showDatasetsView();
        renderDatasetDetail(dsId);
      });
    });
  }

  // Optionally: auto-select first dataset/attribute at load
  if (allDatasets.length) {
    renderDatasetDetail(allDatasets[0].id);
  }
  if (allAttributes.length) {
    renderAttributeDetail(allAttributes[0].id);
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
