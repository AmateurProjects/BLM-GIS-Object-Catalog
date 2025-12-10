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
    html += `<p><strong>Geometry Type:</strong> ${escapeHtml(dataset.geometry_type || '')}</p>`;
    html += `<p><strong>Office Owner:</strong> ${escapeHtml(dataset.office_owner || '')}</p>`;
    html += `<p><strong>Contact Email:</strong> ${escapeHtml(dataset.contact_email || '')}</p>`;

    html += `<p><strong>Topics:</strong> ${
      Array.isArray(dataset.topics)
        ? dataset.topics
            .map(t => `<span class="pill pill-topic">${escapeHtml(t)}</span>`)
            .join(' ')
        : ''
    }</p>`;

    html += `<p><strong>Keywords:</strong> ${
      Array.isArray(dataset.keywords)
        ? dataset.keywords
            .map(k => `<span class="pill pill-keyword">${escapeHtml(k)}</span>`)
            .join(' ')
        : ''
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

    // Suggest change + export schema buttons (dataset)
    const issueUrl = Catalog.buildGithubIssueUrlForDataset(dataset);
    html += `
      <div class="detail-section">
        <a href="${issueUrl}" target="_blank" rel="noopener" class="suggest-button">
          Suggest a change to this dataset
        </a>
        <button type="button" class="export-button" data-export-schema="${escapeHtml(dataset.id)}">
          Export ArcGIS schema (Python)
        </button>
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

    // Wire export schema button (now that the HTML exists)
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
    html += `<p><strong>ID:</strong> ${escapeHtml(attribute.id)}</p>`;
    html += `<p><strong>Label:</strong> ${escapeHtml(attribute.label || '')}</p>`;
    html += `<p><strong>Type:</strong> ${escapeHtml(attribute.type || '')}</p>`;
    html += `<p><strong>Nullable:</strong> ${attribute.nullable ? 'Yes' : 'No'}</p>`;
    html += `<p><strong>Description:</strong> ${escapeHtml(attribute.description || '')}</p>`;
    if (attribute.example !== undefined) {
      html += `<p><strong>Example:</strong> ${escapeHtml(String(attribute.example))}</p>`;
    }

    // Enumerated values (if present)
    if (
      attribute.type === 'enumerated' &&
      Array.isArray(attribute.values) &&
      attribute.values.length
    ) {
      html += '<h4>Allowed values</h4>';
      html += `
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Label</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
      `;

      attribute.values.forEach(v => {
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

    // Datasets that use this attribute
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

    // Deep-link to full attribute page in Attributes tab
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

    // If this is an enumerated attribute, show its allowed values (codes + labels)
    if (
      attribute.type === 'enumerated' &&
      Array.isArray(attribute.values) &&
      attribute.values.length
    ) {
      html += '<div class="detail-section">';
      html += '<h3>Allowed values</h3>';
      html += `
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Label</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
      `;

      attribute.values.forEach(v => {
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

// Build ArcGIS Python schema script for a dataset
function buildArcGisSchemaPython(dataset, attrs) {
  const lines = [];
  const dsId = dataset.id || '';
  const objname = dataset.objname || dsId;

  lines.push('# -*- coding: utf-8 -*-');
  lines.push('# Auto-generated ArcGIS schema script from Public Lands Data Catalog');
  lines.push(`# Dataset ID: ${dsId}`);
  if (dataset.title) {
    lines.push(`# Title: ${dataset.title}`);
  }
  if (dataset.description) {
    lines.push(`# Description: ${dataset.description}`);
  }
  lines.push('');
  lines.push('import arcpy');
  lines.push('');
  lines.push('# TODO: Update these paths and settings before running');
  lines.push('gdb = r"C:\\path\\to\\your.gdb"');
  lines.push(`fc_name = "${objname}"`);
  
  const proj = dataset.projection || '';
  const epsgMatch = proj.match(/EPSG:(\d+)/i);

  // Use geometry_type from the dataset if present, default to POLYGON
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

  attrs.forEach(attr => {
    const fieldInfo = mapAttributeToArcGisField(attr);

    const name = attr.id || '';
    const alias = attr.label || '';
    const type = fieldInfo.type;
    const length = fieldInfo.length;
    const domain = 'None'; // placeholder, no auto-domain creation

    const safeAlias = alias.replace(/"/g, '""');

    lines.push(
      `    ("${name}", "${type}", "${safeAlias}", ${length}, ${domain}),`
    );

    if (attr.type === 'enumerated' && Array.isArray(attr.values) && attr.values.length) {
      const commentLines = [];
      commentLines.push(`# Domain suggestion for ${name} (${alias}):`);
      attr.values.forEach(v => {
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
    enumDomainComments.forEach(block => {
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
      // Represent booleans as SHORT (0/1) by default
      return { type: 'SHORT', length: null };
    case 'date':
      return { type: 'DATE', length: null };
    case 'enumerated':
      // Use LONG so it can be tied to a coded value domain later
      return { type: 'LONG', length: null };
    default:
      // Fallback to TEXT if unknown
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
