  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) % 9973;
  }
  return subjectPalette[hash % subjectPalette.length];
}

function teacherInitial(name = "") {
  const value = clean(name);
  return value ? value[0].toUpperCase() : "?";
}

function siteKey(value) {
  const key = normalizeForSearch(value);
  if (key === "barajas") return "barajas";
  if (key === "moncloa") return "moncloa";
  return "other";
}

function renderEntityViews() {
  renderEntityList(elements.roomsList, groupBy(state.filteredRows, "room"), buildRoomEntity);
  renderEntityList(elements.teachersList, groupBy(state.filteredRows, "teacher"), buildTeacherEntity);
  renderEntityList(elements.subjectsList, groupBy(state.filteredRows, "subject"), buildSubjectEntity);
}

function groupBy(rows, key) {
  return rows.reduce((groups, row) => {
    const value = row[key] || "Sin indicar";
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(row);
    return groups;
  }, new Map());
}

function renderEntityList(container, groups, builder) {
  container.replaceChildren();
  if (!groups.size) {
    const note = document.createElement("p");
    note.className = "muted-note";
    note.textContent = "No hay resultados con los filtros actuales.";
    container.append(note);
    return;
  }
  [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "es"))
    .forEach(([name, rows]) => container.append(builder(name, rows)));
}

function buildRoomEntity(name, rows) {
  return createEntityCard({
    title: name,
    label: `${rows.length} sesiones`,
    chips: [formatUnique(rows, "site"), formatUnique(rows, "floor", "Planta"), formatUnique(rows, "shift")],
    lines: topValues(rows, "teacher", 4).map(([teacher, count]) => `${teacher} · ${count}`),
  });
}

function buildTeacherEntity(name, rows) {
  return createEntityCard({
    title: name,
    label: `${rows.length} sesiones`,
    chips: [formatUnique(rows, "site"), formatUnique(rows, "room", "Aulas"), formatUnique(rows, "shift")],
    lines: topValues(rows, "subject", 4).map(([subject, count]) => `${subject} · ${count}`),
  });
}

function buildSubjectEntity(name, rows) {
  return createEntityCard({
    title: name,
    label: `${rows.length} sesiones`,
    chips: [formatUnique(rows, "site"), formatUnique(rows, "cycle", "Ciclo"), formatUnique(rows, "room", "Aulas")],
    lines: topValues(rows, "teacher", 4).map(([teacher, count]) => `${teacher} · ${count}`),
  });
}

function createEntityCard({ title, label, chips, lines }) {
  const article = document.createElement("article");
  article.className = "entity-card";

  const labelNode = document.createElement("span");
  labelNode.className = "entity-label";
  labelNode.textContent = label;

  const titleNode = document.createElement("h3");
  titleNode.textContent = title;

  const chipWrap = document.createElement("div");
  chipWrap.className = "entity-meta";
  chips.filter(Boolean).forEach((chip) => {
    const chipNode = document.createElement("span");
    chipNode.className = "entity-chip";
    chipNode.textContent = chip;
    chipWrap.append(chipNode);
  });

  const list = document.createElement("div");
  list.className = "entity-list";
  lines.forEach((line) => {
    const item = document.createElement("span");
    item.textContent = line;
    list.append(item);
  });

  article.append(labelNode, titleNode, chipWrap, list);
  return article;
}

function formatUnique(rows, key, prefix = "") {
  const values = unique(rows, key);
  if (!values.length) return "";
  const text = values.length <= 2 ? values.join(", ") : `${values.length} ${prefix || "valores"}`;
  if (prefix && values.length > 2) return text;
  return prefix && values.length <= 2 ? `${prefix}: ${text}` : text;
}

function topValues(rows, key, limit) {
  const counts = rows.reduce((map, row) => {
    const value = row[key] || "Sin indicar";
    map.set(value, (map.get(value) || 0) + 1);
    return map;
  }, new Map());
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))
    .slice(0, limit);
}

function clearFilters() {
  filterControls.forEach((control) => {
    control.value = "";
  });
  elements.searchInput.value = "";
  render();
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
