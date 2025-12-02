const CATALOG_URL = '../data/catalog.json'; // adjust if needed

let catalog = [];
let filteredCatalog = [];

const searchInput = document.getElementById('searchInput');
const topicFilter = document.getElementById('topicFilter');
const datasetList = document.getElementById('datasetList');
const datasetDetail = document.getElementById('datasetDetail');

async function loadCatalog() {
  const res = await fetch(CATALOG_URL);
  catalog = await res.json();
  filteredCatalog = catalog;
  populateTopicFilter();
  renderList();
}

function populateTopicFilter() {
  const topics = new Set();
  catalog.forEach(d => (d.topics || []).forEach(t => topics.add(t)));
  topics.forEach(topic => {
    const opt = document.createElement('option');
    opt.value = topic;
    opt.textContent = topic;
    topicFilter.appendChild(opt);
  });
}

function renderList() {
  datasetList.innerHTML = '';
  filteredCatalog.forEach(d => {
    const card = document.createElement('div');
    card.className = 'dataset-card';
    card.innerHTML = `
      <strong>${d.title}</strong>
      <div>${d.description || ''}</div>
      <div style="font-size: 0.85em; color: #555;">
        Topics: ${(d.topics || []).join(', ') || 'None'}
      </div>
    `;
    card.addEventListener('click', () => showDetail(d));
    datasetList.appendChild(card);
  });
}

function applyFilters() {
  const q = (searchInput.value || '').toLowerCase();
  const topic = topicFilter.value;

  filteredCatalog = catalog.filter(d => {
    const text = [
      d.title,
      d.description,
      ...(d.keywords || []),
      ...(d.topics || [])
    ]
      .join(' ')
      .toLowerCase();

    const matchesSearch = !q || text.includes(q);
    const matchesTopic = !topic || (d.topics || []).includes(topic);

    return matchesSearch && matchesTopic;
  });

  renderList();
  datasetDetail.classList.add('hidden');
}

function showDetail(d) {
  datasetDetail.classList.remove('hidden');
  datasetDetail.innerHTML = `
    <h2>${d.title}</h2>
    <p>${d.description || ''}</p>

    <h3>Details</h3>
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
      <li><strong>Update frequency:</strong> ${d.update_frequency || '—'}</li>
      <li><strong>Status:</strong> ${d.status || '—'}</li>
      <li><strong>Last updated:</strong> ${d.last_updated || '—'}</li>
    </ul>

    <h3>Access</h3>
    <ul>
      ${(d.distribution || [])
        .map(
          dist => `
        <li>
          <strong>${dist.type}</strong> (${dist.format || 'unknown'}):
          <a href="${dist.url}" target="_blank" rel="noopener">Open</a>
        </li>`
        )
        .join('') || '<li>None listed.</li>'}
    </ul>

    <h3>Metadata</h3>
    <ul>
      <li><strong>Standard:</strong> ${d.metadata?.standard || '—'}</li>
      <li><a href="${d.metadata?.xml_url || '#'}" target="_blank" rel="noopener">
        ${d.metadata?.xml_url ? 'View metadata XML' : 'No metadata URL'}
      </a></li>
    </ul>

    <button id="suggestChangeBtn">Suggest a change</button>
  `;

  const btn = document.getElementById('suggestChangeBtn');
  btn.addEventListener('click', () => openSuggestChange(d));
}

// Make a GitHub issues link with pre-filled title/body
function openSuggestChange(d) {
  const owner = 'AmateurProjects';
  const repo = 'public-lands-data-catalog';

  const title = encodeURIComponent(`Change request: ${d.id}`);
  const body = encodeURIComponent(
    `Please describe the requested change for dataset **${d.id} (${d.title})**.\n\n` +
      `- What is wrong or missing?\n- Suggested new values?\n\n` +
      `Current record:\n\`\`\`json\n${JSON.stringify(d, null, 2)}\n\`\`\`\n`
  );

  const url = `https://github.com/${owner}/${repo}/issues/new?title=${title}&body=${body}`;
  window.open(url, '_blank', 'noopener');
}

searchInput.addEventListener('input', applyFilters);
topicFilter.addEventListener('change', applyFilters);

loadCatalog().catch(err => {
  console.error('Failed to load catalog', err);
  datasetList.innerHTML = '<p>Error loading catalog.</p>';
});

