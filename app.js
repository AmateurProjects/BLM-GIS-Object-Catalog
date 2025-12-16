// app.js

// ====== CONFIG ======
const CATALOG_URL = 'data/catalog.json';
const GITHUB_NEW_ISSUE_BASE =
  'https://github.com/AmateurProjects/Public-Lands-Data-Catalog/issues/new';

// ====== CATALOG MODULE ======
const Catalog = (function () {
  let cache = null;
  let indexesBuilt = false;
  let attributeById = {};
  let datasetById = {};
  let datasetsByAttributeId = {};

  async function loadCatalog() {
    if (cache) return cache;
    const resp = await fetch(CATALOG_URL);
    if (!resp.ok) throw new Error(`Failed to load catalog.json: ${resp.status}`);
    cache = await resp.json();
    buildIndexes();
    return cache;
  }

  function buildIndexes() {
    if (!cache || indexesBuilt) return;

    attributeById = {};
    datasetById = {};
    datasetsByAttributeId = {};

    (cache.attributes || []).forEach(a => {
      if (a.id) attributeById[a.id] = a;
    });

    (cache.datasets || []).forEach(ds => {
      if (ds.id) datasetById[ds.id] = ds;
      (ds.attribute_ids || []).forEach(attrId => {
        datasetsByAttributeId[attrId] ||= [];
        datasetsByAttributeId[attrId].push(ds);
      });
    });

    indexesBuilt = true;
  }

  return {
    loadCatalog,
    getAttributeById: id => attributeById[id] || null,
    getDatasetById: id => datasetById[id] || null,
    getAttributesForDataset: ds =>
      ds?.attribute_ids?.map(id => attributeById[id]).filter(Boolean) || [],
    getDatasetsForAttribute: id => datasetsByAttributeId[id] || [],
    buildGithubIssueUrlForDataset(dataset) {
      const title = encodeURIComponent(`Dataset change request: ${dataset.id}`);
      const body = encodeURIComponent(
        [
          `Please describe the requested change for dataset \`${dataset.id}\`.`,
          '',
          '```json',
          JSON.stringify(dataset, null, 2),
          '```',
        ].join('\n')
      );
      return `${GITHUB_NEW_ISSUE_BASE}?title=${title}&body=${body}`;
    },
    buildGithubIssueUrlForAttribute(attribute) {
      const title = encodeURIComponent(`Attribute change request: ${attribute.id}`);
      const body = encodeURIComponent(
        [
          `Please describe the requested change for attribute \`${attribute.id}\`.`,
          '',
          '```json',
          JSON.stringify(attribute, null, 2),
          '```',
        ].join('\n')
      );
      return `${GITHUB_NEW_ISSUE_BASE}?title=${title}&body=${body}`;
    },
  };
})();

// ====== MAIN APP ======
document.addEventListener('DOMContentLoaded', async () => {
  const datasetsTabBtn = document.getElementById('datasetsTab');
  const attributesTabBtn = document.getElementById('attributesTab');
  const datasetsView = document.getElementById('datasetsView');
  const attributesView = document.getElementById('attributesView');

  const datasetSearchInput = document.getElementById('datasetSearchInput');
  const attributeSearchInput = document.getElementById('attributeSearchInput');

  const datasetListEl = document.getElementById('datasetList');
  const attributeListEl = document.getElementById('attributeList');

  let catalog;
  try {
    catalog = await Catalog.loadCatalog();
  } catch (e) {
    datasetListEl.textContent = 'Failed to load catalog.';
    attributeListEl.textContent = 'Failed to load catalog.';
    return;
  }

  const allDatasets = catalog.datasets || [];
  const allAttributes = catalog.attributes || [];

  // ================= DATASET SUBMISSION =================
  const newDatasetBtn = document.getElementById('newDatasetBtn');
  const newDatasetDialog = document.getElementById('newDatasetDialog');
  const newDatasetForm = document.getElementById('newDatasetForm');
  const newDatasetCloseBtn = document.getElementById('newDatasetCloseBtn');
  const newDatasetCancelBtn = document.getElementById('newDatasetCancelBtn');

  const openNewDatasetDialog = () => newDatasetDialog?.showModal();
  const closeNewDatasetDialog = () => newDatasetDialog?.close();

  newDatasetBtn?.addEventListener('click', openNewDatasetDialog);
  newDatasetCloseBtn?.addEventListener('click', closeNewDatasetDialog);
  newDatasetCancelBtn?.addEventListener('click', closeNewDatasetDialog);

  newDatasetDialog?.addEventListener('click', e => {
    if (e.target === newDatasetDialog) closeNewDatasetDialog();
  });

  newDatasetForm?.addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(newDatasetForm);
    const id = String(fd.get('id') || '').trim();
    if (!id) return alert('Dataset ID is required.');

    if (Catalog.getDatasetById(id)) {
      if (!confirm(`Dataset "${id}" already exists. Open issue anyway?`)) return;
    }

    const dataset = compactObject({
      id,
      title: fd.get('title'),
      description: fd.get('description'),
      objname: fd.get('objname'),
      geometry_type: fd.get('geometry_type'),
      agency_owner: fd.get('agency_owner'),
      office_owner: fd.get('office_owner'),
      contact_email: fd.get('contact_email'),
      topics: parseCsvList(fd.get('topics')),
      update_frequency: fd.get('update_frequency'),
      status: fd.get('status'),
      access_level: fd.get('access_level'),
      public_web_service: fd.get('public_web_service'),
      internal_web_service: fd.get('internal_web_service'),
      data_standard: fd.get('data_standard'),
      projection: fd.get('projection'),
      notes: fd.get('notes'),
    });

    const issueUrl = buildGithubIssueUrlForNewDataset(dataset);
    window.open(issueUrl, '_blank', 'noopener');
    newDatasetForm.reset();
    closeNewDatasetDialog();
  });

  // ================= ATTRIBUTE SUBMISSION =================
  const newAttributeBtn = document.getElementById('newAttributeBtn');
  const newAttributeDialog = document.getElementById('newAttributeDialog');
  const newAttributeForm = document.getElementById('newAttributeForm');
  const newAttributeCloseBtn = document.getElementById('newAttributeCloseBtn');
  const newAttributeCancelBtn = document.getElementById('newAttributeCancelBtn');

  const attrTabBtns = document.querySelectorAll('[data-attr-tab]');
  const attrPanels = document.querySelectorAll('[data-attr-panel]');

  function setAttrTab(tab) {
    attrTabBtns.forEach(b => b.classList.toggle('active', b.dataset.attrTab === tab));
    attrPanels.forEach(p =>
      p.classList.toggle('hidden', p.dataset.attrPanel !== tab)
    );
  }

  newAttributeBtn?.addEventListener('click', () => {
    setAttrTab('single');
    newAttributeDialog.showModal();
  });
  newAttributeCloseBtn?.addEventListener('click', () => newAttributeDialog.close());
  newAttributeCancelBtn?.addEventListener('click', () => newAttributeDialog.close());

  attrTabBtns.forEach(b =>
    b.addEventListener('click', () => setAttrTab(b.dataset.attrTab))
  );

  newAttributeDialog?.addEventListener('click', e => {
    if (e.target === newAttributeDialog) newAttributeDialog.close();
  });

  newAttributeForm?.addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(newAttributeForm);
    const mode =
      document.querySelector('[data-attr-tab].active')?.dataset.attrTab ||
      'single';

    let attributes = [];
    let notes = '';

    if (mode === 'bulk') {
      const parsed = tryParseJson(fd.get('bulk_attributes_json'));
      if (!Array.isArray(parsed)) return alert('Bulk JSON must be an array.');
      attributes = parsed;
      notes = fd.get('bulk_notes');
    } else {
      const id = String(fd.get('attr_id') || '').trim();
      if (!id) return alert('Attribute ID is required.');

      if (Catalog.getAttributeById(id)) {
        if (!confirm(`Attribute "${id}" exists. Open issue anyway?`)) return;
      }

      let values;
      if (fd.get('attr_type') === 'enumerated') {
        values = tryParseJson(fd.get('attr_values_json')) || [];
        if (!Array.isArray(values)) return alert('Enumerated values must be JSON array.');
      }

      attributes = [
        compactObject({
          id,
          label: fd.get('attr_label'),
          type: fd.get('attr_type'),
          definition: fd.get('attr_definition'),
          expected_value: fd.get('attr_expected_value'),
          values,
        }),
      ];
      notes = fd.get('attr_notes');
    }

    if (attributes.some(a => !a?.id)) return alert('Each attribute needs an id.');

    const issueUrl = buildGithubIssueUrlForNewAttributes({
      title:
        attributes.length === 1
          ? `New attribute request: ${attributes[0].id}`
          : `New attributes request (${attributes.length})`,
      attributes,
      notes,
    });

    window.open(issueUrl, '_blank', 'noopener');
    newAttributeForm.reset();
    setAttrTab('single');
    newAttributeDialog.close();
  });

  // ================= TABS =================
  const showDatasetsView = () => {
    datasetsView.classList.remove('hidden');
    attributesView.classList.add('hidden');
    datasetsTabBtn.classList.add('active');
    attributesTabBtn.classList.remove('active');
  };

  const showAttributesView = () => {
    attributesView.classList.remove('hidden');
    datasetsView.classList.add('hidden');
    attributesTabBtn.classList.add('active');
    datasetsTabBtn.classList.remove('active');
  };

  datasetsTabBtn.addEventListener('click', showDatasetsView);
  attributesTabBtn.addEventListener('click', showAttributesView);

  // ================= LISTS =================
  function renderDatasetList(filter = '') {
    const ft = filter.toLowerCase();
    datasetListEl.innerHTML = '';
    (allDatasets.filter(ds =>
      [ds.id, ds.title, ds.description].join(' ').toLowerCase().includes(ft)
    )).forEach(ds => {
      const b = document.createElement('button');
      b.className = 'list-item-button';
      b.textContent = ds.title || ds.id;
      b.onclick = () => renderDatasetDetail(ds.id);
      datasetListEl.appendChild(b);
    });
  }

  function renderAttributeList(filter = '') {
    const ft = filter.toLowerCase();
    attributeListEl.innerHTML = '';
    (allAttributes.filter(a =>
      [a.id, a.label, a.definition].join(' ').toLowerCase().includes(ft)
    )).forEach(a => {
      const b = document.createElement('button');
      b.className = 'list-item-button';
      b.textContent = `${a.id} – ${a.label || ''}`;
      b.onclick = () => renderAttributeDetail(a.id);
      attributeListEl.appendChild(b);
    });
  }

  datasetSearchInput?.addEventListener('input', e =>
    renderDatasetList(e.target.value)
  );
  attributeSearchInput?.addEventListener('input', e =>
    renderAttributeList(e.target.value)
  );

  renderDatasetList();
  renderAttributeList();
});

// ====== HELPERS ======
function compactObject(obj) {
  const o = {};
  Object.entries(obj).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    if (Array.isArray(v) && !v.length) return;
    o[k] = v;
  });
  return o;
}

function parseCsvList(v) {
  return String(v || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function tryParseJson(v) {
  if (!v) return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

function buildGithubIssueUrlForNewDataset(ds) {
  const title = encodeURIComponent(`New dataset request: ${ds.id}`);
  const body = encodeURIComponent(
    [
      '## New dataset submission',
      '',
      '```json',
      JSON.stringify(ds, null, 2),
      '```',
    ].join('\n')
  );
  return `${GITHUB_NEW_ISSUE_BASE}?title=${title}&body=${body}`;
}

function buildGithubIssueUrlForNewAttributes(payload) {
  const title = encodeURIComponent(payload.title);
  const body = encodeURIComponent(
    [
      '## New attribute(s) submission',
      '',
      '```json',
      JSON.stringify(payload.attributes, null, 2),
      '```',
      payload.notes ? `\n### Notes\n${payload.notes}` : '',
    ].join('\n')
  );
  return `${GITHUB_NEW_ISSUE_BASE}?title=${title}&body=${body}`;
}
