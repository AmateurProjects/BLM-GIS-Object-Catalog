const CATALOG_URL = 'data/catalog.json';

let catalog = [];
let filteredDatasets = [];
let attributeIndex = {};
let filteredAttributes = [];

let datasetSearchInput;
let attributeSearchInput;
let datasetList;
let datasetDetail;
let attributeList;
let attributeDetail;
let datasetsView;
let attributesView;
let datasetsTab;
let attributesTab;

document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, wiring up UI...');

  datasetSearchInput = document.getElementById('datasetSearchInput');
  attributeSearchInput = document.getElementById('attributeSearchInput');
  datasetList = document.getElementById('datasetList');
  datasetDetail = document.getElementById('datasetDetail');
  attributeList = document.getElementById('attributeList');
  attributeDetail = document.getElementById('attributeDetail');
  datasetsView = document.getElementById('datasetsView');
  attributesView = document.getElementById('attributesView');
  datasetsTab = document.getElementById('datasetsTab');
  attributesTab = document.getElementById('attributesTab');

  // Defensive wiring – only attach listeners if elements exist
  if (datasetSearchInput) {
    datasetSearchInput.addEventListener('input', applyDatasetFilters);
  } else {
    console.warn('datasetSearchInput element not found');
  }

  if (attributeSearchInput) {
    attributeSearchInput.addEventListener('input', applyAttributeFilters);
  } else {
    console.warn('attributeSearchInput element not found');
  }

  if (datasetsTab) {
    datasetsTab.addEventListener('click', () => switchView('datasets'));
  } else {
    console.warn('datasetsTab element not found');
  }

  if (attributesTab) {
    attributesTab.addEventListener('click', () => switchView('attributes'));
  } else {
    console.warn('attributesTab element not found');
  }

  // Default to datasets view
  switchView('datasets');

  loadCatalog();
});

async function loadCatalog() {
  try {
    console.log('Fetching catalog from', CATALOG_URL);
    const res = await fetch(CATALOG_URL);
    if (!res.ok) {
      console.error('Failed to fetch catalog.json', res.status, res.statusText);
      if (datasetList) {
        datasetList.innerHTML = `<p>Error loading catalog (HTTP ${res.status}).</p>`;
      }
      return;
    }

    const raw = await res.json();
    console.log('Raw catalog JSON:', raw);

    if (!Array.isArray(raw)) {
      console.error('catalog.json is not an array at the top level');
      if (datasetList) {
        datasetList.innerHTML =
          '<p>catalog.json should be a JSON array: [ { dataset1 }, { dataset2 }, ... ].</p>';
      }
      return;
    }

    catalog = raw;
    filteredDatasets = catalog;

    buildAttributeIndex();
    filteredAttributes = Object.values(attributeIndex);

    renderDatasetList();
    renderAttributeList();
  } catch (err) {
    console.error('Error loading catalog', err);
    if (datasetList) {
      datasetList.innerHTML = '<p>Error loading catalog (check console).</p>';
    }
  }
}

function buildAttributeIndex() {
  attributeIndex = {};

  catalog.forEach(dataset => {
    const attrs = dataset.attributes || [];
    attrs.forEach(attr => {
      const key = attr.name;
      if (!key) return;

      if (!attributeIndex[key]) {
        attributeIndex[key] = {
          name: attr.name,
          label: attr.label || attr.name,
          type: attr.type || '',
          description: attr.description || '',
          nullable: attr.nullable,
          examples: new Set(),
          datasets: []
        };
      }

      if (attr.example !== undefined && attr.example !== null) {
        attributeIndex[key].examples.add(String(attr.example));
      }

      attributeIndex[key].datasets.push({
        id: dataset.id,
        title: dataset.title || dataset.id
      });
    });
  });

  Object.values(attributeIndex).forEach(a => {
    a.examples = Array.from(a.examples);
  });

  console.log('Built attribute index:', attributeIndex);
}

function switchView(which) {
  if (!datasetsView || !attributesView || !datasetsTab || !attributesTab) {
    console.warn('View elements not fully found, switchView skipped');
    return;
  }

  if (which === 'datasets') {
    datasetsView.classList.remove('hidden');
    attributesView.classList.add('hidden');
    datasetsTab.classList.add('active');
    attributesTab.classList.remove('active');
  } else {
    datasetsView.classList.add('hidden');
    attributesView.classList.remove('hidden');
    datasetsTab.classList.remove('active');
    attributesTab.classList.add('active');
  }
}

/* ========== DATASETS VIEW ========== */

function renderDatasetList() {
  if (!datasetList) return;

  datasetList.innerHTML = '';

  if (!filteredDatasets.length) {
    datasetList.innerHTML = '<p>No datasets match your search.</p>';
    return;
  }

  filteredDatasets.forEach(d => {
    const card = document.createElement('div');
    card.className = 'dataset-card';
    card.innerHTML = `
      <strong>${d.title}</strong>
      <div>${d.description || ''}</div>
      <div style="font-size: 0.85em; color: #555;">
        Topics: ${(d.topics || []).join(', ') || 'None'}
      </div>
    `;
    card.addEventListener('click', () => showDatasetDetail(d));
    datasetList.appendChild(card);
  });
}

function applyDatasetFilters() {
  const q = (datasetSearchInput?.value || '').toLowerCase();

  filteredDatasets = catalog.filter(d => {
    const text = [
      d.title,
      d.description,
      d.id,
      ...(d.topics || []),
      ...(d.keywords || [])
    ]
      .join(' ')
      .toLowerCase();

    return !q || text.includes(q);
  });

  renderDatasetList();
  if (datasetDetail) datasetDetail.classList.add('hidden');
}

function showDatasetDetail(d) {
  if (!datasetDetail) return;

  datasetDetail.classList.remove('hidden');

  const attrs = d.attributes || [];

  const attributesTable = attrs.length
    ? `
      <table border="1" cellpadding="4" cellspacing="0">
        <thead>
          <tr>
            <th>Name</th>
            <th>Label</th>
            <th>Type</th>
            <th>Nullable</th>
            <th>Description</th>
            <th>Example</th>
          </tr>
        </thead>
        <tbody>
          ${attrs
            .map(
              a => `
            <tr>
              <td><a href="#" onclick="openAttributeFromDataset('${a.name}'); return false;">${a.name}</a></td>
              <td>${a.label || ''}</td>
              <td>${a.type || ''}</td>
              <td>${a.nullable === false ? 'No' : 'Yes'}</td>
              <td>${a.description || ''}</td>
              <td>${a.example !== undefined ? a.example : ''}</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    `
    : '<p>No attribute metadata defined for this dataset.</p>';

  datasetDetail.innerHTML = `
    <h2>${d.title}</h2>
    <p>${d.description || ''}</p>

    <h3>Dataset details</h3>
    <ul>
      <li><strong>ID:</strong> ${d.id}</li>
      <li><strong>Owner:</strong> ${d.owner || '—'}</li>
      <li><strong>Contact:</strong> ${
        d.contact_email
          ? `<a href="mailto:${d.contact_email}">${d.contact_email}</a>`
          : '—'
      }</li>
      <li><strong>Topics:</strong> ${(d.topics || []).join(', ') || '—'}</li>
      <li><strong>Keywords:</strong> ${(d.keywords || []).join(', ') || '—'}</li>
      <li><strong>Status:</strong> ${d.status || '—'}</li>
      <li><strong>Last updated:</strong> ${d.last_updated || '—'}</li>
    </ul>

    <h3>Attributes</h3>
    ${attributesTable}
  `;
}


function openAttributeFromDataset(attrName) {
  console.log('Opening attribute from dataset:', attrName);

  // Switch view
  switchView('attributes');

  // Ensure attribute list is showing the full set
  filteredAttributes = Object.values(attributeIndex);
  renderAttributeList();

  // Open the detail panel for that attribute
  showAttributeDetail(attrName);

  // Scroll the detail panel to top
  attributeDetail?.scrollTo({ top: 0, behavior: 'smooth' });
}
 



/* ========== ATTRIBUTES VIEW ========== */

function renderAttributeList() {
  if (!attributeList) return;

  attributeList.innerHTML = '';

  if (!filteredAttributes.length) {
    attributeList.innerHTML = '<p>No attributes match your search.</p>';
    return;
  }

  filteredAttributes.forEach(a => {
    const card = document.createElement('div');
    card.className = 'attribute-card';
    card.innerHTML = `
      <strong>${a.name}</strong>
      <div>${a.description || ''}</div>
      <div style="font-size: 0.85em; color: #555;">
        Type: ${a.type || 'unknown'}
      </div>
    `;
    card.addEventListener('click', () => showAttributeDetail(a.name));
    attributeList.appendChild(card);
  });
}

function applyAttributeFilters() {
  const q = (attributeSearchInput?.value || '').toLowerCase();

  filteredAttributes = Object.values(attributeIndex).filter(a => {
    const text = [
      a.name,
      a.label,
      a.type,
      a.description,
      ...(a.examples || [])
    ]
      .join(' ')
      .toLowerCase();

    return !q || text.includes(q);
  });

  renderAttributeList();
  if (attributeDetail) attributeDetail.classList.add('hidden');
}

function showAttributeDetail(name) {
  if (!attributeDetail) return;

  const a = attributeIndex[name];
  if (!a) return;

  attributeDetail.classList.remove('hidden');

  const examplesHtml =
    a.examples && a.examples.length
      ? `<ul>${a.examples.map(e => `<li>${e}</li>`).join('')}</ul>`
      : '<p>No examples recorded.</p>';

  const datasetsHtml =
    a.datasets && a.datasets.length
      ? `
        <ul>
          ${a.datasets
            .map(
              d => `<li><strong>${d.title}</strong> <code>${d.id}</code></li>`
            )
            .join('')}
        </ul>`
      : '<p>No datasets found using this attribute.</p>';

  attributeDetail.innerHTML = `
    <h2>${a.name}</h2>
    <p>${a.description || ''}</p>

    <h3>Attribute details</h3>
    <ul>
      <li><strong>Label:</strong> ${a.label || '—'}</li>
      <li><strong>Type:</strong> ${a.type || '—'}</li>
      <li><strong>Nullable:</strong> ${
        a.nullable === false ? 'No' : 'Yes/Unknown'
      }</li>
    </ul>

    <h3>Examples</h3>
    ${examplesHtml}

    <h3>Datasets using this attribute</h3>
    ${datasetsHtml}
  `;
}
