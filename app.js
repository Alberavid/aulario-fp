const dayOrder = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
const storageKey = "aulario-fp-csv-v1";
const state = {
  allRows: [],
  filteredRows: [],
  sourceName: "",
  loadDate: null,
  activeView: "schedule",
  defaultCsv: "",
  error: "",
};

const elements = {
  csvInput: document.querySelector("#csvInput"),
  reloadDefault: document.querySelector("#reloadDefault"),
  fileName: document.querySelector("#fileName"),
  loadTime: document.querySelector("#loadTime"),
  rowCount: document.querySelector("#rowCount"),
  sedeFilter: document.querySelector("#sedeFilter"),
  dayFilter: document.querySelector("#dayFilter"),
  shiftFilter: document.querySelector("#shiftFilter"),
  roomFilter: document.querySelector("#roomFilter"),
  teacherFilter: document.querySelector("#teacherFilter"),
  subjectFilter: document.querySelector("#subjectFilter"),
  searchInput: document.querySelector("#searchInput"),
  clearFilters: document.querySelector("#clearFilters"),
  emptyState: document.querySelector("#emptyState"),
  scheduleHead: document.querySelector("#scheduleHead"),
  scheduleBody: document.querySelector("#scheduleBody"),
  scheduleView: document.querySelector("#scheduleView"),
  roomsView: document.querySelector("#roomsView"),
  teachersView: document.querySelector("#teachersView"),
  subjectsView: document.querySelector("#subjectsView"),
  roomsList: document.querySelector("#roomsList"),
  teachersList: document.querySelector("#teachersList"),
  subjectsList: document.querySelector("#subjectsList"),
  kpiSessions: document.querySelector("#kpiSessions"),
  kpiRooms: document.querySelector("#kpiRooms"),
  kpiTeachers: document.querySelector("#kpiTeachers"),
  kpiSubjects: document.querySelector("#kpiSubjects"),
  kpiSites: document.querySelector("#kpiSites"),
  sessionTemplate: document.querySelector("#sessionTemplate"),
  tabs: document.querySelectorAll(".tab"),
};

const filterControls = [
  elements.sedeFilter,
  elements.dayFilter,
  elements.shiftFilter,
  elements.roomFilter,
  elements.teacherFilter,
  elements.subjectFilter,
];

document.addEventListener("DOMContentLoaded", boot);
elements.csvInput.addEventListener("change", handleFile);
elements.reloadDefault.addEventListener("click", loadBundledCsv);
elements.clearFilters.addEventListener("click", clearFilters);
elements.searchInput.addEventListener("input", render);
filterControls.forEach((control) => control.addEventListener("change", render));
elements.tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    state.activeView = tab.dataset.view;
    render();
  });
});

async function boot() {
  await primeBundledCsv();
  const stored = readStoredCsv();
  if (stored?.text) {
    loadCsvText(stored.text, stored.name || "CSV guardado", stored.loadedAt);
    return;
  }
  if (state.defaultCsv) {
    loadCsvText(state.defaultCsv, "PLANIFICADOR DE AULAS (1).csv", new Date().toISOString(), false);
    return;
  }
  render();
}

async function primeBundledCsv() {
  try {
    const response = await fetch("data/planificador.csv", { cache: "no-store" });
    if (!response.ok) return;
    state.defaultCsv = await response.text();
  } catch {
    state.defaultCsv = "";
  }
}

function readStoredCsv() {
  try {
    return JSON.parse(localStorage.getItem(storageKey));
  } catch {
    return null;
  }
}

function handleFile(event) {
  const [file] = event.target.files;
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const loadedAt = new Date().toISOString();
    const text = String(reader.result || "");
    localStorage.setItem(storageKey, JSON.stringify({ text, name: file.name, loadedAt }));
    loadCsvText(text, file.name, loadedAt);
    elements.csvInput.value = "";
  };
  reader.readAsText(file, "utf-8");
}

function loadBundledCsv() {
  if (!state.defaultCsv) {
    setError("No se ha encontrado el CSV inicial. Carga un archivo para continuar.");
    return;
  }
  localStorage.removeItem(storageKey);
  loadCsvText(state.defaultCsv, "PLANIFICADOR DE AULAS (1).csv", new Date().toISOString(), false);
}

function loadCsvText(text, name, loadedAt = new Date().toISOString(), persist = true) {
  try {
    const rows = normalizeRows(parseDelimitedText(text));
    if (!rows.length) throw new Error("El CSV no contiene filas válidas.");
    state.allRows = rows;
    state.sourceName = name;
    state.loadDate = new Date(loadedAt);
    state.error = "";
    if (persist) {
      localStorage.setItem(storageKey, JSON.stringify({ text, name, loadedAt }));
    }
    resetFilterOptions();
    render();
  } catch (error) {
    state.allRows = [];
    state.sourceName = "";
    state.loadDate = null;
    state.error = error.message;
    resetFilterOptions();
    render();
  }
}

function parseDelimitedText(text) {
  const cleanText = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const delimiter = detectDelimiter(cleanText);
  const records = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < cleanText.length; i += 1) {
    const char = cleanText[i];
    const next = cleanText[i + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        field += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === delimiter && !quoted) {
      row.push(field);
      field = "";
      continue;
    }

    if (char === "\n" && !quoted) {
      row.push(field);
      if (row.some((cell) => cell.trim() !== "")) records.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) records.push(row);
  return records;
}

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const candidates = [";", ",", "\t"];
  return candidates
    .map((delimiter) => ({
      delimiter,
      count: firstLine.split(delimiter).length,
    }))
    .sort((a, b) => b.count - a.count)[0].delimiter;
}

function normalizeRows(records) {
  const [headerRow, ...bodyRows] = records;
  if (!headerRow) return [];
  const headers = headerRow.map((header) => normalizeHeader(header));
  const indexes = {
    time: findColumn(headers, ["horario", "hora"]),
    day: findColumn(headers, ["dia", "día"]),
    floor: findColumn(headers, ["planta"]),
    room: findColumn(headers, ["aula"]),
    subject: findColumn(headers, ["asignatura"]),
    cycle: findColumn(headers, ["ciclo master", "ciclo / master", "ciclo"]),
    course: findColumn(headers, ["curso"]),
    group: findColumn(headers, ["grupo"]),
    teacher: findColumn(headers, ["profesor"]),
    site: findColumn(headers, ["sede"]),
  };

  const missing = Object.entries(indexes)
    .filter(([, index]) => index === -1)
    .map(([key]) => requiredLabels[key]);
  if (missing.length) {
    throw new Error(`Faltan columnas: ${missing.join(", ")}.`);
  }

  return bodyRows
    .map((row, index) => {
      const time = clean(row[indexes.time]);
      const day = normalizeDay(row[indexes.day]);
      const room = clean(row[indexes.room]) || "Sin aula";
      const site = normalizeSite(row[indexes.site]);
      const subject = clean(row[indexes.subject]);
      const teacher = clean(row[indexes.teacher]);
      const minutes = timeToMinutes(time);

      return {
        id: `${index}-${day}-${time}-${room}-${teacher}`,
        time,
        minutes,
        shift: shiftFromMinutes(minutes),
        day,
        floor: clean(row[indexes.floor]),
        room,
        subject,
        cycle: clean(row[indexes.cycle]),
        course: clean(row[indexes.course]),
        group: clean(row[indexes.group]),
        teacher,
        site,
        searchText: "",
      };
    })
    .filter((item) => item.time && item.day && item.site && item.minutes !== null)
    .map((item) => ({
      ...item,
      searchText: normalizeForSearch(
        [
          item.time,
          item.day,
          item.room,
          item.subject,
          item.cycle,
          item.course,
          item.group,
          item.teacher,
          item.site,
          item.floor,
          item.shift,
        ].join(" ")
      ),
    }))
    .sort(sortSessions);
}

const requiredLabels = {
  time: "Horario",
  day: "Día",
  floor: "Planta",
  room: "Aula",
  subject: "Asignatura",
  cycle: "Ciclo / Master",
  course: "Curso",
  group: "Grupo",
  teacher: "Profesor",
  site: "Sede",
};

function normalizeHeader(value = "") {
  return normalizeForSearch(value).replace(/\s+/g, " ").trim();
}

function findColumn(headers, options) {
  const normalized = options.map((option) => normalizeHeader(option));
  return headers.findIndex((header) => normalized.includes(header));
}

function clean(value = "") {
  return String(value).replace(/\uFEFF/g, "").trim();
}

function normalizeForSearch(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function normalizeDay(value = "") {
  const raw = normalizeForSearch(value);
  const match = dayOrder.find((day) => normalizeForSearch(day) === raw);
  return match || clean(value);
}

function normalizeSite(value = "") {
  const raw = clean(value);
  const key = normalizeForSearch(raw);
  if (key === "moncloa") return "Moncloa";
  if (key === "barajas") return "Barajas";
  return raw;
}

function timeToMinutes(value = "") {
  const match = clean(value).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function shiftFromMinutes(minutes) {
  if (minutes === null) return "";
  if (minutes < 14 * 60 + 30) return "Mañana";
  if (minutes < 18 * 60) return "Tarde";
  return "Tarde-noche";
}

function sortSessions(a, b) {
  return (
    dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day) ||
    a.minutes - b.minutes ||
    a.site.localeCompare(b.site, "es") ||
    a.room.localeCompare(b.room, "es") ||
    a.teacher.localeCompare(b.teacher, "es")
  );
}

function resetFilterOptions() {
  fillSelect(elements.sedeFilter, "Todas", unique(state.allRows, "site"));
  fillSelect(elements.dayFilter, "Todos", dayOrder.filter((day) => state.allRows.some((row) => row.day === day)));
  fillSelect(elements.shiftFilter, "Todos", unique(state.allRows, "shift"));
  fillSelect(elements.roomFilter, "Todas", unique(state.allRows, "room"));
  fillSelect(elements.teacherFilter, "Todos", unique(state.allRows, "teacher"));
  fillSelect(elements.subjectFilter, "Todas", unique(state.allRows, "subject"));
  elements.searchInput.value = "";
}

function fillSelect(select, emptyLabel, values) {
  select.replaceChildren();
  select.append(new Option(emptyLabel, ""));
  values.forEach((value) => select.append(new Option(value, value)));
}

function unique(rows, key) {
  return [...new Set(rows.map((row) => row[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
}

function render() {
  updateChrome();
  state.filteredRows = getFilteredRows();
  const hasRows = state.allRows.length > 0;
  elements.emptyState.hidden = hasRows;
  elements.scheduleView.hidden = !hasRows || state.activeView !== "schedule";
  elements.roomsView.hidden = !hasRows || state.activeView !== "rooms";
  elements.teachersView.hidden = !hasRows || state.activeView !== "teachers";
  elements.subjectsView.hidden = !hasRows || state.activeView !== "subjects";
  updateTabs();
  renderKpis();
  renderSchedule();
  renderEntityViews();
}

function updateChrome() {
  if (state.error) {
    elements.fileName.innerHTML = `<span class="error">${escapeHtml(state.error)}</span>`;
    elements.loadTime.textContent = "-";
    elements.rowCount.textContent = "0";
    return;
  }
  elements.fileName.textContent = state.sourceName || "Sin datos";
  elements.loadTime.textContent = state.loadDate ? state.loadDate.toLocaleString("es-ES") : "-";
  elements.rowCount.textContent = String(state.allRows.length);
}

function setError(message) {
  state.error = message;
  updateChrome();
}

function getFilteredRows() {
  const query = normalizeForSearch(elements.searchInput.value);
  return state.allRows.filter((row) => {
    return (
      filterMatch(row.site, elements.sedeFilter.value) &&
      filterMatch(row.day, elements.dayFilter.value) &&
      filterMatch(row.shift, elements.shiftFilter.value) &&
      filterMatch(row.room, elements.roomFilter.value) &&
      filterMatch(row.teacher, elements.teacherFilter.value) &&
      filterMatch(row.subject, elements.subjectFilter.value) &&
      (!query || row.searchText.includes(query))
    );
  });
}

function filterMatch(value, selected) {
  return !selected || value === selected;
}

function updateTabs() {
  elements.tabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === state.activeView);
  });
}

function renderKpis() {
  const rows = state.filteredRows;
  elements.kpiSessions.textContent = String(rows.length);
  elements.kpiRooms.textContent = String(unique(rows, "room").length);
  elements.kpiTeachers.textContent = String(unique(rows, "teacher").length);
  elements.kpiSubjects.textContent = String(unique(rows, "subject").length);
  elements.kpiSites.textContent = String(unique(rows, "site").length);
}

function renderSchedule() {
  renderScheduleHead();
  elements.scheduleBody.replaceChildren();
  const rows = state.filteredRows;
  const visibleDays = elements.dayFilter.value ? [elements.dayFilter.value] : dayOrder;
  const times = [...new Set(rows.map((row) => row.time))]
    .sort((a, b) => timeToMinutes(a) - timeToMinutes(b));

  if (!times.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = visibleDays.length + 1;
    td.className = "muted-note";
    td.textContent = "No hay sesiones con los filtros actuales.";
    tr.append(td);
    elements.scheduleBody.append(tr);
    return;
  }

  times.forEach((time) => {
    const tr = document.createElement("tr");
    const timeCell = document.createElement("th");
    timeCell.scope = "row";
    timeCell.className = "time-cell";
    timeCell.textContent = time;
    tr.append(timeCell);

    visibleDays.forEach((day) => {
      const td = document.createElement("td");
      td.className = "day-cell";
      const stack = document.createElement("div");
      stack.className = "cell-stack";
      rows
        .filter((row) => row.time === time && row.day === day)
        .sort(sortSessions)
        .forEach((session) => stack.append(createSessionCard(session)));
      td.append(stack);
      tr.append(td);
    });

    elements.scheduleBody.append(tr);
  });
}

function renderScheduleHead() {
  const visibleDays = elements.dayFilter.value ? [elements.dayFilter.value] : dayOrder;
  const tr = document.createElement("tr");
  const empty = document.createElement("th");
  empty.textContent = "Hora";
  tr.append(empty);
  visibleDays.forEach((day) => {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = day;
    tr.append(th);
  });
  elements.scheduleHead.replaceChildren(tr);
}

function createSessionCard(session) {
  const fragment = elements.sessionTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".session");
  const room = fragment.querySelector(".session-room");
  const site = fragment.querySelector(".session-site");
  const subject = fragment.querySelector(".session-subject");
  const meta = fragment.querySelector(".session-meta");
  const teacher = fragment.querySelector(".session-teacher");

  card.dataset.site = siteKey(session.site);
  room.textContent = session.room;
  site.textContent = session.site;
  subject.textContent = session.subject || "Sin asignatura";
  meta.textContent = [
    session.cycle,
    session.course,
    session.group ? `Grupo ${session.group}` : "",
    session.floor ? `Planta ${session.floor}` : "",
    session.shift,
  ]
    .filter(Boolean)
    .join(" · ");
  teacher.textContent = session.teacher || "Profesor sin indicar";
  return fragment;
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
