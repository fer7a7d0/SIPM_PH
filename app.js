/*
  Control de Produccion - Frontend principal
  Este archivo concentra:
  - Estado global de la app
  - Validaciones de captura
  - Integracion con API de Google Apps Script
  - Render de dashboard y exportacion CSV local
*/

// Reemplazar con la URL del despliegue de Apps Script (Web App).
const API_BASE_URL = "https://script.google.com/macros/s/AKfycbzyF8JfqtjwSO8cgSMoYOJPRbgvoDPO7X-0pFq_Lj6mlrOKA6sIV6mRcWIpycj0i2ia/exec";

const APP_STATE = {
  operators: [],
  activities: [
    "Desvalvulado",
    "Prueba Hidrostatica (PH)",
    "Lavado",
    "Valvulado",
    "Pintura",
    "Reparaciones Minimas"
  ],
  shiftOptions: ["Matutino", "Vespertino", "Nocturno"],
  localRecords: [],
  dashboard: {
    monthKey: "",
    totalMonth: 0,
    totalDay: 0,
    balanceDay: 0,
    monthlyReception: 0,
    monthlyDelivered: 0,
    byActivityMonth: {},
    byShiftMonth: {},
    byOperatorMonth: [],
    byActivity: {},
    byShift: {},
    byOperator: []
  },
  duplicateCache: new Set()
};

const DOM = {
  currentDate: document.getElementById("currentDate"),
  currentTime: document.getElementById("currentTime"),
  operatorSelect: document.getElementById("operator"),
  shiftSelect: document.getElementById("shift"),
  activitySelect: document.getElementById("activity"),
  quantityInput: document.getElementById("quantity"),
  observationsInput: document.getElementById("observations"),
  captureUserInput: document.getElementById("captureUser"),
  productionForm: document.getElementById("productionForm"),
  formMessage: document.getElementById("formMessage"),
  saveButton: document.getElementById("saveButton"),
  downloadCsvButton: document.getElementById("downloadCsvButton"),
  tabCapture: document.getElementById("tabCapture"),
  tabDashboard: document.getElementById("tabDashboard"),
  captureScreen: document.getElementById("captureScreen"),
  dashboardScreen: document.getElementById("dashboardScreen"),
  monthSelector: document.getElementById("monthSelector"),
  refreshDashboardButton: document.getElementById("refreshDashboardButton"),
  kpiTotalDay: document.getElementById("kpiTotalDay"),
  kpiTotalMonth: document.getElementById("kpiTotalMonth"),
  kpiBalanceDay: document.getElementById("kpiBalanceDay"),
  kpiMonthReception: document.getElementById("kpiMonthReception"),
  kpiMonthDelivered: document.getElementById("kpiMonthDelivered"),
  kpiMonthLabel: document.getElementById("kpiMonthLabel"),
  kpiFlowMonthLabel: document.getElementById("kpiFlowMonthLabel"),
  activityListDay: document.getElementById("activityListDay"),
  shiftListDay: document.getElementById("shiftListDay"),
  operatorTableBodyDay: document.getElementById("operatorTableBodyDay"),
  activityListMonth: document.getElementById("activityListMonth"),
  shiftListMonth: document.getElementById("shiftListMonth"),
  operatorTableBodyMonth: document.getElementById("operatorTableBodyMonth")
};

function initApp() {
  bindEvents();
  renderStaticActivities();
  initializeDashboardFilters();
  startClock();
  loadInitialData();
}

function initializeDashboardFilters() {
  if (DOM.monthSelector) {
    DOM.monthSelector.value = getCurrentMonthKey();
  }
}

function bindEvents() {
  DOM.productionForm.addEventListener("submit", onSubmitProduction);
  DOM.downloadCsvButton.addEventListener("click", exportCsvFromLocalRecords);
  DOM.tabCapture.addEventListener("click", () => activateScreen("capture"));
  DOM.tabDashboard.addEventListener("click", () => {
    activateScreen("dashboard");
    loadDashboard();
  });
  DOM.refreshDashboardButton.addEventListener("click", loadDashboard);
  DOM.monthSelector.addEventListener("change", loadDashboard);
}

function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function startClock() {
  updateClock();
  setInterval(updateClock, 1000);
}

function updateClock() {
  const now = new Date();
  DOM.currentDate.textContent = now.toLocaleDateString("es-EC");
  DOM.currentTime.textContent = now.toLocaleTimeString("es-EC");
}

function activateScreen(target) {
  const captureActive = target === "capture";
  DOM.captureScreen.classList.toggle("active", captureActive);
  DOM.dashboardScreen.classList.toggle("active", !captureActive);

  DOM.tabCapture.classList.toggle("active", captureActive);
  DOM.tabDashboard.classList.toggle("active", !captureActive);

  DOM.tabCapture.setAttribute("aria-selected", String(captureActive));
  DOM.tabDashboard.setAttribute("aria-selected", String(!captureActive));
  DOM.dashboardScreen.setAttribute("aria-hidden", String(captureActive));
}

function renderStaticActivities() {
  APP_STATE.activities.forEach((activity) => {
    const option = document.createElement("option");
    option.value = activity;
    option.textContent = activity;
    DOM.activitySelect.appendChild(option);
  });
}

async function loadInitialData() {
  try {
    setFormMessage("Cargando configuracion inicial...", "");

    const data = await callApi("getInitialData", {});
    APP_STATE.operators = (data.operators || []).filter((name) => Boolean(name));

    if (data.activities && data.activities.length > 0) {
      APP_STATE.activities = data.activities;
      repaintActivityOptions();
    }

    repaintOperatorOptions();
    setFormMessage("Sistema listo para registrar produccion.", "success");
  } catch (error) {
    console.error(error);
    setFormMessage("No se pudo cargar la configuracion inicial.", "error");
  }
}

function repaintOperatorOptions() {
  DOM.operatorSelect.innerHTML = '<option value="">Selecciona un operador</option>';

  APP_STATE.operators.forEach((operator) => {
    const option = document.createElement("option");
    option.value = operator;
    option.textContent = operator;
    DOM.operatorSelect.appendChild(option);
  });

  repaintCaptureUserOptions();
}

function repaintCaptureUserOptions() {
  DOM.captureUserInput.innerHTML = '<option value="">Selecciona usuario de captura</option>';

  APP_STATE.operators.forEach((operator) => {
    const option = document.createElement("option");
    option.value = operator;
    option.textContent = operator;
    DOM.captureUserInput.appendChild(option);
  });
}

function repaintActivityOptions() {
  DOM.activitySelect.innerHTML = '<option value="">Selecciona una actividad</option>';
  APP_STATE.activities.forEach((activity) => {
    const option = document.createElement("option");
    option.value = activity;
    option.textContent = activity;
    DOM.activitySelect.appendChild(option);
  });
}

async function onSubmitProduction(event) {
  event.preventDefault();

  const payload = buildPayloadFromForm();
  const selectedOperator = payload.operator;
  const selectedCaptureUser = payload.captureUser;
  const validation = validatePayload(payload);

  if (!validation.ok) {
    setFormMessage(validation.message, "error");
    return;
  }

  // Proteccion inmediata de doble clic por huella local del registro.
  if (APP_STATE.duplicateCache.has(payload.duplicateKey)) {
    setFormMessage("Registro duplicado detectado. Verifica antes de guardar de nuevo.", "error");
    return;
  }

  APP_STATE.duplicateCache.add(payload.duplicateKey);

  try {
    DOM.saveButton.disabled = true;
    setFormMessage("Guardando registro...", "");

    const response = await callApi("createProductionRecord", payload);

    APP_STATE.localRecords.push({
      id: response.id,
      ...payload,
      savedAt: new Date().toISOString()
    });

    setFormMessage("Registro guardado correctamente", "success");
    DOM.productionForm.reset();
    DOM.operatorSelect.value = selectedOperator;
    DOM.captureUserInput.value = selectedCaptureUser;
    DOM.activitySelect.focus();
  } catch (error) {
    console.error(error);
    // Si el servidor falla, liberamos la llave local para que el usuario pueda reintentar.
    APP_STATE.duplicateCache.delete(payload.duplicateKey);
    setFormMessage(error.message || "No se pudo guardar el registro.", "error");
  } finally {
    DOM.saveButton.disabled = false;
  }
}

function buildPayloadFromForm() {
  const now = new Date();
  const quantity = Number(DOM.quantityInput.value);
  const operator = DOM.operatorSelect.value.trim();
  const activity = DOM.activitySelect.value.trim();
  const shift = DOM.shiftSelect.value.trim();

  return {
    date: now.toLocaleDateString("es-EC"),
    time: now.toLocaleTimeString("es-EC"),
    operator,
    shift,
    activity,
    quantity,
    observations: DOM.observationsInput.value.trim(),
    captureUser: DOM.captureUserInput.value.trim(),
    duplicateKey: createDuplicateKey({
      operator,
      shift,
      activity,
      quantity,
      minuteBucket: now.toISOString().slice(0, 16)
    }),
    sourceDevice: navigator.userAgent
  };
}

function validatePayload(payload) {
  if (!payload.operator) {
    return { ok: false, message: "Debe seleccionar un operador." };
  }

  if (!payload.shift || !APP_STATE.shiftOptions.includes(payload.shift)) {
    return { ok: false, message: "Debe seleccionar un turno valido." };
  }

  if (!payload.activity) {
    return { ok: false, message: "Debe seleccionar una actividad." };
  }

  if (!Number.isFinite(payload.quantity) || payload.quantity <= 0) {
    return { ok: false, message: "La cantidad debe ser un numero positivo." };
  }

  if (!Number.isInteger(payload.quantity)) {
    return { ok: false, message: "La cantidad debe ser un numero entero." };
  }

  if (!payload.captureUser) {
    return { ok: false, message: "Debe registrar el usuario que captura." };
  }

  return { ok: true, message: "OK" };
}

function setFormMessage(message, type) {
  DOM.formMessage.textContent = message;
  DOM.formMessage.classList.remove("success", "error");
  if (type) {
    DOM.formMessage.classList.add(type);
  }
}

function createDuplicateKey(parts) {
  // Clave de deduplicacion basada en campos operativos + ventana por minuto.
  return [parts.operator, parts.shift, parts.activity, parts.quantity, parts.minuteBucket]
    .join("|")
    .toLowerCase();
}

async function loadDashboard() {
  try {
    DOM.refreshDashboardButton.disabled = true;
    const selectedMonth = DOM.monthSelector.value || "";

    const data = await callApi("getDailyDashboard", { monthKey: selectedMonth });

    APP_STATE.dashboard.monthKey = data.monthKey || "";
    APP_STATE.dashboard.totalMonth = data.totalMonth || 0;
    APP_STATE.dashboard.byActivityMonth = data.byActivityMonth || {};
    APP_STATE.dashboard.byShiftMonth = data.byShiftMonth || {};
    APP_STATE.dashboard.byOperatorMonth = data.byOperatorMonth || [];
    APP_STATE.dashboard.totalDay = data.totalDay || 0;
    APP_STATE.dashboard.balanceDay = data.balanceDay || 0;
    APP_STATE.dashboard.monthlyReception = data.monthlyReception || 0;
    APP_STATE.dashboard.monthlyDelivered = data.monthlyDelivered || 0;
    APP_STATE.dashboard.byActivity = data.byActivity || {};
    APP_STATE.dashboard.byShift = data.byShift || {};
    APP_STATE.dashboard.byOperator = data.byOperator || [];

    renderDashboard();
  } catch (error) {
    console.error(error);
    setFormMessage("No se pudo actualizar el dashboard.", "error");
  } finally {
    DOM.refreshDashboardButton.disabled = false;
  }
}

function renderDashboard() {
  DOM.kpiTotalDay.textContent = String(APP_STATE.dashboard.totalDay);
  DOM.kpiTotalMonth.textContent = String(APP_STATE.dashboard.totalMonth);
  DOM.kpiBalanceDay.textContent = String(APP_STATE.dashboard.balanceDay);
  DOM.kpiMonthReception.textContent = String(APP_STATE.dashboard.monthlyReception);
  DOM.kpiMonthDelivered.textContent = String(APP_STATE.dashboard.monthlyDelivered);
  DOM.kpiMonthLabel.textContent = APP_STATE.dashboard.monthKey
    ? `Periodo ${APP_STATE.dashboard.monthKey}`
    : "Periodo --";
  DOM.kpiFlowMonthLabel.textContent = APP_STATE.dashboard.monthKey
    ? `Periodo ${APP_STATE.dashboard.monthKey}`
    : "Periodo --";

  if (DOM.monthSelector.value !== APP_STATE.dashboard.monthKey && APP_STATE.dashboard.monthKey) {
    DOM.monthSelector.value = APP_STATE.dashboard.monthKey;
  }

  renderStatList(DOM.activityListDay, APP_STATE.activities, APP_STATE.dashboard.byActivity);
  renderStatList(DOM.shiftListDay, APP_STATE.shiftOptions, APP_STATE.dashboard.byShift);
  renderOperatorTable(DOM.operatorTableBodyDay, APP_STATE.dashboard.byOperator);

  renderStatList(DOM.activityListMonth, APP_STATE.activities, APP_STATE.dashboard.byActivityMonth);
  renderStatList(DOM.shiftListMonth, APP_STATE.shiftOptions, APP_STATE.dashboard.byShiftMonth);
  renderOperatorTable(DOM.operatorTableBodyMonth, APP_STATE.dashboard.byOperatorMonth);
}

function renderStatList(targetElement, keys, valuesMap) {
  targetElement.innerHTML = "";
  keys.forEach((key) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${key}</span><strong>${valuesMap[key] || 0}</strong>`;
    targetElement.appendChild(li);
  });
}

function renderOperatorTable(targetElement, rows) {
  targetElement.innerHTML = "";
  rows.forEach((item, index) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${item.operator}</td>
      <td>${item.total}</td>
    `;
    targetElement.appendChild(tr);
  });
}

async function callApi(action, payload) {
  if (!API_BASE_URL || API_BASE_URL === "PEGAR_AQUI_URL_WEB_APP") {
    throw new Error("Debes configurar API_BASE_URL en app.js con tu URL de Apps Script.");
  }

  // Usamos text/plain para evitar preflight CORS, pero conservando un cuerpo JSON.
  const requestBody = JSON.stringify({
    action,
    payload: payload || {}
  });

  const response = await fetch(API_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: requestBody,
    redirect: "follow"
  });

  if (!response.ok) {
    throw new Error("Error de red al contactar la API.");
  }

  let body;
  try {
    body = await response.json();
  } catch (error) {
    throw new Error("La API no devolvio un JSON valido. Revisa el despliegue de Apps Script.");
  }

  if (!body.ok) {
    throw new Error(body.message || "Error en el servidor.");
  }

  return body.data;
}

function exportCsvFromLocalRecords() {
  if (APP_STATE.localRecords.length === 0) {
    setFormMessage("No hay registros locales para exportar.", "error");
    return;
  }

  const headers = [
    "ID",
    "Fecha",
    "Hora",
    "Operador",
    "Turno",
    "Actividad",
    "Cantidad",
    "Observaciones",
    "Usuario captura",
    "Clave duplicado",
    "Origen dispositivo",
    "Guardado local"
  ];

  const lines = APP_STATE.localRecords.map((row) => [
    row.id,
    row.date,
    row.time,
    row.operator,
    row.shift,
    row.activity,
    row.quantity,
    sanitizeCsv(row.observations),
    sanitizeCsv(row.captureUser),
    sanitizeCsv(row.duplicateKey),
    sanitizeCsv(row.sourceDevice),
    row.savedAt
  ]);

  const csv = [headers.join(","), ...lines.map((line) => line.join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `produccion_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();

  URL.revokeObjectURL(url);
  setFormMessage("Archivo CSV generado correctamente.", "success");
}

function sanitizeCsv(value) {
  const text = String(value ?? "").replace(/"/g, '""');
  return `"${text}"`;
}

initApp();
