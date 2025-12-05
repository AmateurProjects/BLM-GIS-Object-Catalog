// app.js

// ====== CONFIG ======
const CATALOG_URL = 'data/catalog.json';

// >>>>> SET THIS to your real GitHub repo's new-issue URL base
// Example: 'https://github.com/blm-gis/data-catalog/issues/new'
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

  function buildDatasetUrl(datasetId) {
    // Adjust if your dataset page name or query param is different
    return `dataset.html?dataset=${encodeURIComponent(datasetId)}`;
  }

  function buildAttributeUrl(attrId) {
    // Adjust if your attribute page name or query param is different
    return `attribute.html?attribute=${encodeURIComponent(attrId)}`;
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
    buildDatasetUrl,
    buildAttributeUrl,
    buildGithubIssueUrlForDataset,
    buildGithubIssueUrlForAttribute
  };
})();

// ====== PAGE INITIALIZER ======
document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const datasetId = params.get('dataset');
  const attrId = params.get('attribute');

  try {
    await Catalog.loadCatalog();
  } catch (err) {
    console.error('Failed to load catalog.json:', err);
    return;
  }

  // Decide which view we are on based on query params + presence of elements
  if (datasetId && document.getElementById('dataset-title')) {
    renderDatasetPage(datasetId);
  } else if (attrId && document.getElementById('attribute-title')) {
    renderAttributePage(attrId);
  } else {
    // Optional: index/home listing view
    if (document.getElementById('dataset-list')) {
      renderDatasetList();
    }
    if (document.getElementById('attribute-list')) {
      renderAttributeList();
    }
  }
});

// ====== DATASET PAGE RENDERING ======
async function renderDatasetPage(datasetId) {
  const dataset = Catalog.getDatasetById(datasetId);

  if (!dataset) {
    console.error(`Dataset not found: ${datasetId}`);
    renderDatasetNotFound(datasetId);
    return;
  }

  // Title
  const titleEl = document.getElementById('dataset-title');
  if (titleEl) {
    titleEl.textContent = dataset.title || dataset.id;
  }

  // Description
  const descEl = document.getElementById('dataset-description');
  if (descEl) {
    descEl.textContent = dataset.description || '';
  }

  // Meta info (office, email, etc.)
  const metaEl = document.getElementById('dataset-meta');
  if (metaEl) {
    metaEl.innerHTML = `
      <p><strong>Object Name:</strong> ${escapeHtml(dataset.objname || '')}</p>
      <p><strong>Office Owner:</strong> ${escapeHtml(dataset.office_owner || '')}</p>
      <p><strong>Contact Email:</strong> ${escapeHtml(dataset.contact_email || '')}</p>
      <p><strong>Topics:</strong> ${Array.isArray(dataset.topics) ? dataset.topics.map(escapeHtml).join(', ') : ''}</p>
      <p><strong>Keywords:</strong> ${Array.isArray(dataset.keywords) ? dataset.keywords.map(escapeHtml).join(', ') : ''}</p>
      <p><strong>Update Frequency:</strong> ${escapeHtml(dataset.update_frequency || '')}</p>
      <p><strong>Status:</strong> ${escapeHtml(dataset.status || '')}</p>
      <p><strong>Access Level:</strong> ${escapeHtml(dataset.access_level || '')}</p>
      <p><strong>Public Web Service:</strong> ${
        dataset.public_web_service
          ? `<a href="${dataset.public_web_service}" target="_blank" rel="noopener">${escapeHtml(dataset.public_web_service)}</a>`
          : ''
      }</p>
      <p><strong>Internal Web Service:</strong> ${
        dataset.internal_web_service
          ? `<a href="${dataset.internal_web_service}" target="_blank" rel="noopener">${escapeHtml(dataset.internal_web_service)}</a>`
          : ''
      }</p>
      <p><strong>Data Standard:</strong> ${
        dataset.data_standard
          ? `<a href="${dataset.data_standard}" target="_blank" rel="noopener">${escapeHtml(dataset.data_standard)}</a>`
          : ''
      }</p>
      ${dataset.notes ? `<p><strong>Notes:</strong> ${escapeHtml(dataset.notes)}</p>` : ''}
    `;
  }

  // Attributes list (attributes that belong to this dataset)
  const attrsEl = document.getElementById('dataset-attributes');
  if (attrsEl) {
    const attrs = Catalog.getAttributesForDataset(dataset);

    if (!attrs.length) {
      attrsEl.innerHTML = '<p>No attributes defined for this dataset.</p>';
    } else {
      const list = document.createElement('ul');
      attrs.forEach(attr => {
        const li = document.createElement('li');
        const link = document.createElement('a');
        link.href = Catalog.buildAttributeUrl(attr.id);
        link.textContent = `${attr.id} – ${attr.label || ''}`;
        li.appendChild(link);
        list.appendChild(li);
      });
      attrsEl.innerHTML = '<h2>Attributes</h2>';
      attrsEl.appendChild(list);
    }
  }

  // Suggest change button (dataset)
  const suggestBtn = document.getElementById('dataset-suggest-change');
  if (suggestBtn) {
    suggestBtn.href = Catalog.buildGithubIssueUrlForDataset(dataset);
  }
}

function renderDatasetNotFound(datasetId) {
  const titleEl = document.getElementById('dataset-title');
  if (titleEl) {
    titleEl.textContent = `Dataset not found: ${datasetId}`;
  }
  const descEl = document.getElementById('dataset-description');
  if (descEl) {
    descEl.textContent = 'The requested dataset ID does not exist in the catalog.';
  }
}

// ====== ATTRIBUTE PAGE RENDERING ======
async function renderAttributePage(attrId) {
  const attribute = Catalog.getAttributeById(attrId);

  if (!attribute) {
    console.error(`Attribute not found: ${attrId}`);
    renderAttributeNotFound(attrId);
    return;
  }

  const titleEl = document.getElementById('attribute-title');
  if (titleEl) {
    titleEl.textContent = `${attribute.id} – ${attribute.label || ''}`;
  }

  const detailsEl = document.getElementById('attribute-details');
  if (detailsEl) {
    detailsEl.innerHTML = `
      <p><strong>ID:</strong> ${escapeHtml(attribute.id)}</p>
      <p><strong>Label:</strong> ${escapeHtml(attribute.label || '')}</p>
      <p><strong>Type:</strong> ${escapeHtml(attribute.type || '')}</p>
      <p><strong>Nullable:</strong> ${attribute.nullable ? 'Yes' : 'No'}</p>
      <p><strong>Description:</strong> ${escapeHtml(attribute.description || '')}</p>
      ${
        attribute.example !== undefined
          ? `<p><strong>Example:</strong> ${escapeHtml(String(attribute.example))}</p>`
          : ''
      }
    `;
  }

  // Suggest change button (attribute)
  const suggestBtn = document.getElementById('attribute-suggest-change');
  if (suggestBtn) {
    suggestBtn.href = Catalog.buildGithubIssueUrlForAttribute(attribute);
  }

  // List of datasets that use this attribute
  const datasetsEl = document.getElementById('attribute-datasets');
  if (datasetsEl) {
    const datasets = Catalog.getDatasetsForAttribute(attrId);

    if (!datasets.length) {
      datasetsEl.innerHTML = '<p>No datasets currently reference this attribute.</p>';
    } else {
      const list = document.createElement('ul');
      datasets.forEach(ds => {
        const li = document.createElement('li');
        const link = document.createElement('a');
        link.href = Catalog.buildDatasetUrl(ds.id);
        link.textContent = ds.title || ds.id;
        li.appendChild(link);
        list.appendChild(li);
      });
      datasetsEl.innerHTML = '<h2>Datasets using this attribute</h2>';
      datasetsEl.appendChild(list);
    }
  }
}

function renderAttributeNotFound(attrId) {
  const titleEl = document.getElementById('attribute-title');
  if (titleEl) {
    titleEl.textContent = `Attribute not found: ${attrId}`;
  }
  const detailsEl = document.getElementById('attribute-details');
  if (detailsEl) {
    detailsEl.textContent = 'The requested attribute ID does not exist in the catalog.';
  }
}

// ====== OPTIONAL: INDEX PAGE LISTS ======
async function renderDatasetList() {
  const listEl = document.getElementById('dataset-list');
  if (!listEl) return;

  const catalog = await Catalog.loadCatalog();
  const datasets = catalog.datasets || [];

  if (!datasets.length) {
    listEl.innerHTML = '<p>No datasets found in the catalog.</p>';
    return;
  }

  const list = document.createElement('ul');
  datasets.forEach(ds => {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = Catalog.buildDatasetUrl(ds.id);
    link.textContent = ds.title || ds.id;
    li.appendChild(link);
    list.appendChild(li);
  });

  listEl.innerHTML = '<h2>Datasets</h2>';
  listEl.appendChild(list);
}

async function renderAttributeList() {
  const listEl = document.getElementById('attribute-list');
  if (!listEl) return;

  const catalog = await Catalog.loadCatalog();
  const attributes = catalog.attributes || [];

  if (!attributes.length) {
    listEl.innerHTML = '<p>No attributes found in the catalog.</p>';
    return;
  }

  const list = document.createElement('ul');
  attributes.forEach(attr => {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = Catalog.buildAttributeUrl(attr.id);
    link.textContent = `${attr.id} – ${attr.label || ''}`;
    li.appendChild(link);
    list.appendChild(li);
  });

  listEl.innerHTML = '<h2>Attributes</h2>';
  listEl.appendChild(list);
}

// ====== UTILS ======
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
