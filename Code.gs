/**
 * Control de Produccion - Backend Apps Script
 *
 * Este archivo implementa:
 * - API para captura y dashboard
 * - Validaciones robustas de servidor
 * - Creacion automatica de hojas base
 * - Mecanismo anti-duplicado configurable
 */

const SHEET_NAMES = {
  production: 'Produccion',
  operators: 'Operadores',
  activities: 'Actividades',
  dashboard: 'Dashboard',
  config: 'Configuracion'
};

const DEFAULT_ACTIVITIES = [
  'Desvalvulado',
  'Prueba Hidrostatica (PH)',
  'Lavado',
  'Valvulado',
  'Pintura',
  'Reparaciones Minimas'
];

const DEFAULT_SHIFTS = ['Matutino', 'Vespertino', 'Nocturno'];

/**
 * Endpoint de prueba rapido y de diagnostico.
 */
function doGet() {
  return jsonResponse({
    ok: true,
    message: 'API Control Produccion activa',
    data: {
      serverTime: new Date().toISOString()
    }
  });
}

/**
 * Endpoint principal que enruta acciones.
 */
function doPost(e) {
  try {
    initializeSystem();

    const request = parseRequestData(e);
    const action = request.action;
    const payload = request.payload || {};

    if (!action) {
      return jsonResponse(errorResponse('Accion no especificada', 'BAD_REQUEST'));
    }

    switch (action) {
      case 'getInitialData':
        return jsonResponse(successResponse('Datos iniciales cargados', getInitialData()));

      case 'createProductionRecord':
        return jsonResponse(successResponse('Registro guardado correctamente', createProductionRecord(payload)));

      case 'getDailyDashboard':
        return jsonResponse(successResponse('Dashboard diario calculado', getDailyDashboard(payload.monthKey)));

      case 'getRecordsByDate':
        return jsonResponse(successResponse('Consulta por fecha completada', getRecordsByDate(payload.date)));

      default:
        return jsonResponse(errorResponse('Accion no soportada: ' + action, 'UNSUPPORTED_ACTION'));
    }
  } catch (error) {
    return jsonResponse(errorResponse(error.message || 'Error interno del servidor', 'SERVER_ERROR'));
  }
}

function parseRequestData(e) {
  const fallback = {
    action: '',
    payload: {}
  };

  if (!e) {
    return fallback;
  }

  const rawContents = e.postData && e.postData.contents ? e.postData.contents : '';
  if (rawContents) {
    try {
      const parsedJson = JSON.parse(rawContents);
      return {
        action: parsedJson.action || '',
        payload: parsedJson.payload || {}
      };
    } catch (jsonError) {
      // Si no viene JSON, intentamos leer los parametros de formulario.
    }
  }

  const action = e.parameter && e.parameter.action ? e.parameter.action : '';
  const rawPayload = e.parameter && e.parameter.payload ? e.parameter.payload : '{}';

  let payload = {};
  try {
    payload = JSON.parse(rawPayload);
  } catch (payloadError) {
    payload = {};
  }

  return {
    action: action,
    payload: payload
  };
}

/**
 * Crea las hojas faltantes y estructuras base en el libro de Google Sheets.
 */
function initializeSystem() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  const productionSheet = ensureSheet(spreadsheet, SHEET_NAMES.production, [
    'id_registro',
    'fecha',
    'hora',
    'operador',
    'turno',
    'actividad',
    'cantidad',
    'observaciones',
    'usuario_captura',
    'timestamp_servidor',
    'clave_duplicado',
    'origen_dispositivo',
    'estado_registro'
  ]);

  ensureSheet(spreadsheet, SHEET_NAMES.operators, [
    'id_operador',
    'nombre_operador',
    'activo',
    'turno_preferente',
    'fecha_alta',
    'fecha_baja',
    'observaciones'
  ]);

  ensureSheet(spreadsheet, SHEET_NAMES.activities, [
    'id_actividad',
    'nombre_actividad',
    'activo',
    'orden',
    'observaciones'
  ]);

  ensureSheet(spreadsheet, SHEET_NAMES.dashboard, [
    'fecha',
    'total_dia',
    'total_desvalvulado',
    'total_ph',
    'total_lavado',
    'total_valvulado',
    'total_pintura',
    'total_reparaciones_minimas',
    'top_operador_1',
    'top_operador_2',
    'top_operador_3',
    'total_matutino',
    'total_vespertino',
    'total_nocturno',
    'ultima_actualizacion'
  ]);

  const configSheet = ensureSheet(spreadsheet, SHEET_NAMES.config, ['clave', 'valor', 'descripcion', 'activo']);

  seedDefaultOperatorsIfEmpty();
  seedDefaultActivitiesIfEmpty();
  seedDefaultConfigIfMissing(configSheet);

  // Congelar encabezados de la hoja transaccional para facilitar navegacion.
  productionSheet.setFrozenRows(1);
}

function ensureSheet(spreadsheet, sheetName, headers) {
  let sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }

  const lastRow = sheet.getLastRow();
  if (lastRow === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.autoResizeColumns(1, headers.length);
  }

  return sheet;
}

function seedDefaultOperatorsIfEmpty() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.operators);
  if (sheet.getLastRow() > 1) {
    return;
  }

  const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const defaultRows = [
    ['OP-001', 'Operador Demo 1', 'SI', 'Matutino', now, '', 'Inicial'],
    ['OP-002', 'Operador Demo 2', 'SI', 'Vespertino', now, '', 'Inicial'],
    ['OP-003', 'Operador Demo 3', 'SI', 'Nocturno', now, '', 'Inicial']
  ];

  sheet.getRange(2, 1, defaultRows.length, defaultRows[0].length).setValues(defaultRows);
}

function seedDefaultActivitiesIfEmpty() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.activities);
  if (sheet.getLastRow() > 1) {
    return;
  }

  const defaultRows = DEFAULT_ACTIVITIES.map(function (name, index) {
    const id = 'ACT-' + String(index + 1).padStart(3, '0');
    return [id, name, 'SI', index + 1, 'Inicial'];
  });

  sheet.getRange(2, 1, defaultRows.length, defaultRows[0].length).setValues(defaultRows);
}

function seedDefaultConfigIfMissing(configSheet) {
  const defaults = [
    ['APP_NOMBRE', 'Control de Produccion Taller', 'Nombre visible del sistema', 'SI'],
    ['EMPRESA_NOMBRE', 'Taller de Cilindros', 'Razon social u operativa', 'SI'],
    ['ZONA_HORARIA', Session.getScriptTimeZone(), 'Zona horaria operativa', 'SI'],
    ['INVENTARIO_BASE_INICIAL', '0', 'Saldo base usado cuando no existe historial previo', 'SI'],
    ['DUPLICADO_VENTANA_SEGUNDOS', '90', 'Ventana para prevenir doble registro', 'SI'],
    ['MAX_CANTIDAD_POR_REGISTRO', '500', 'Limite superior por captura', 'SI'],
    ['VERSION_APP', '1.0.0', 'Version actual de la solucion', 'SI']
  ];

  const existingByKey = {};
  const duplicateRows = [];
  const lastRow = configSheet.getLastRow();

  if (lastRow > 1) {
    const existingRows = configSheet.getRange(2, 1, lastRow - 1, 4).getValues();
    existingRows.forEach(function (row, index) {
      const key = normalizeConfigKey(row[0]);
      if (!key) {
        return;
      }

      const rowNumber = index + 2;
      if (!existingByKey[key]) {
        existingByKey[key] = { rowNumber: rowNumber, values: row.slice() };
        return;
      }

      // Conserva la primera fila por clave y usa las siguientes solo para completar vacios.
      const keeper = existingByKey[key];
      const merged = [
        String(keeper.values[0] || '').trim() || String(row[0] || '').trim(),
        String(keeper.values[1] || '').trim() || String(row[1] || '').trim(),
        String(keeper.values[2] || '').trim() || String(row[2] || '').trim(),
        String(keeper.values[3] || '').trim() || String(row[3] || '').trim()
      ];

      const changed = merged.some(function (value, idx) {
        return String(value) !== String(keeper.values[idx] || '');
      });

      if (changed) {
        configSheet.getRange(keeper.rowNumber, 1, 1, 4).setValues([merged]);
        keeper.values = merged;
      }

      duplicateRows.push(rowNumber);
    });
  }

  if (duplicateRows.length > 0) {
    duplicateRows
      .sort(function (a, b) { return b - a; })
      .forEach(function (rowNumber) {
        configSheet.deleteRow(rowNumber);
      });
  }

  const rowsToAppend = [];
  defaults.forEach(function (row) {
    const key = normalizeConfigKey(row[0]);
    const existing = existingByKey[key];

    if (!existing) {
      rowsToAppend.push(row);
      return;
    }

    const patched = [
      String(existing.values[0] || '').trim() || row[0],
      String(existing.values[1] || '').trim() || row[1],
      String(existing.values[2] || '').trim() || row[2],
      String(existing.values[3] || '').trim() || row[3]
    ];

    const changed = patched.some(function (value, idx) {
      return String(value) !== String(existing.values[idx] || '');
    });

    if (changed) {
      configSheet.getRange(existing.rowNumber, 1, 1, 4).setValues([patched]);
    }
  });

  if (rowsToAppend.length > 0) {
    configSheet.getRange(configSheet.getLastRow() + 1, 1, rowsToAppend.length, rowsToAppend[0].length).setValues(rowsToAppend);
  }
}

function normalizeConfigKey(value) {
  return String(value || '').trim().toUpperCase();
}

function getInitialData() {
  return {
    operators: getActiveOperators(),
    activities: getActiveActivities(),
    shifts: DEFAULT_SHIFTS,
    serverTime: new Date().toISOString()
  };
}

function createProductionRecord(payload) {
  validatePayload(payload);

  const duplicateWindowSeconds = Number(getConfigValue('DUPLICADO_VENTANA_SEGUNDOS', '90'));
  if (isDuplicateRecord(payload.duplicateKey, duplicateWindowSeconds)) {
    throw new Error('Posible registro duplicado detectado. Valida antes de reenviar.');
  }

  const recordId = generateRecordId();
  const now = new Date();
  const timezone = Session.getScriptTimeZone();
  const serverDate = Utilities.formatDate(now, timezone, 'yyyy-MM-dd');
  const serverTime = Utilities.formatDate(now, timezone, 'HH:mm:ss');
  const timestamp = Utilities.formatDate(now, timezone, 'yyyy-MM-dd HH:mm:ss');

  const row = [
    recordId,
    serverDate,
    serverTime,
    payload.operator,
    payload.shift,
    payload.activity,
    Number(payload.quantity),
    payload.observations || '',
    payload.captureUser,
    timestamp,
    payload.duplicateKey,
    payload.sourceDevice || '',
    'ACTIVO'
  ];

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.production);
  sheet.appendRow(row);

  updateDashboardSnapshot();

  return {
    id: recordId,
    message: 'Registro guardado correctamente'
  };
}

function validatePayload(payload) {
  if (!payload.operator || String(payload.operator).trim() === '') {
    throw new Error('Operador vacio no permitido');
  }

  if (!payload.shift || DEFAULT_SHIFTS.indexOf(payload.shift) === -1) {
    throw new Error('Turno invalido');
  }

  const activeActivities = getActiveActivities();
  if (!payload.activity || activeActivities.indexOf(payload.activity) === -1) {
    throw new Error('Actividad vacia o no valida');
  }

  const quantity = Number(payload.quantity);
  if (!isFinite(quantity) || quantity <= 0) {
    throw new Error('Cantidad vacia o negativa no permitida');
  }

  if (Math.floor(quantity) !== quantity) {
    throw new Error('Cantidad debe ser entera');
  }

  const maxQuantity = Number(getConfigValue('MAX_CANTIDAD_POR_REGISTRO', '500'));
  if (quantity > maxQuantity) {
    throw new Error('Cantidad supera el maximo permitido por configuracion');
  }

  if (!payload.captureUser || String(payload.captureUser).trim() === '') {
    throw new Error('Usuario que captura es obligatorio');
  }

  if (!payload.duplicateKey || String(payload.duplicateKey).trim() === '') {
    throw new Error('Clave de duplicado no enviada');
  }
}

function isDuplicateRecord(duplicateKey, windowSeconds) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.production);
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    return false;
  }

  // Escaneo de las ultimas filas para mantener respuesta rapida en libros grandes.
  const rowsToCheck = Math.min(200, lastRow - 1);
  const startRow = lastRow - rowsToCheck + 1;
  const data = sheet.getRange(startRow, 1, rowsToCheck, 13).getValues();

  const now = new Date();
  for (var i = data.length - 1; i >= 0; i--) {
    const row = data[i];
    const existingKey = String(row[10] || '');
    const timestamp = String(row[9] || '');

    if (existingKey !== String(duplicateKey)) {
      continue;
    }

    const parsed = parseTimestamp(timestamp);
    if (!parsed) {
      return true;
    }

    const diffSeconds = Math.abs((now.getTime() - parsed.getTime()) / 1000);
    if (diffSeconds <= windowSeconds) {
      return true;
    }
  }

  return false;
}

function parseTimestamp(text) {
  if (!text) return null;
  const normalized = String(text).replace(' ', 'T');
  const date = new Date(normalized);
  return isNaN(date.getTime()) ? null : date;
}

function getDailyDashboard(requestedMonthKey) {
  const timezone = Session.getScriptTimeZone();
  const today = Utilities.formatDate(new Date(), timezone, 'yyyy-MM-dd');
  const currentMonthKey = today.slice(0, 7);
  const monthKey = isValidMonthKey(requestedMonthKey) ? requestedMonthKey : currentMonthKey;
  const activeActivities = getActiveActivities();
  const inventoryBase = Number(getConfigValue('INVENTARIO_BASE_INICIAL', '0')) || 0;

  const byActivity = {};
  const byActivityMonth = {};
  activeActivities.forEach(function (activity) {
    byActivity[activity] = 0;
    byActivityMonth[activity] = 0;
  });

  const byShift = { Matutino: 0, Vespertino: 0, Nocturno: 0 };
  const byShiftMonth = { Matutino: 0, Vespertino: 0, Nocturno: 0 };
  const byOperatorMap = {};
  const byOperatorMonthMap = {};
  const netByDate = {};

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.production);
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    return {
      date: today,
      monthKey: monthKey,
      totalMonth: 0,
      totalDay: 0,
      balanceDay: inventoryBase,
      monthlyReception: 0,
      monthlyDelivered: 0,
      byActivityMonth: byActivityMonth,
      byShiftMonth: byShiftMonth,
      byOperatorMonth: [],
      byActivity: byActivity,
      byShift: byShift,
      byOperator: []
    };
  }

  const data = sheet.getRange(2, 1, lastRow - 1, 13).getValues();
  let totalMonth = 0;
  let totalDay = 0;
  let monthlyReception = 0;
  let monthlyDelivered = 0;

  data.forEach(function (row) {
    const rowDateKey = normalizeDateKeyFromRow(row, timezone);
    const activity = String(row[5] || '');
    const qty = Number(row[6] || 0);

    if (rowDateKey) {
      if (!netByDate[rowDateKey]) {
        netByDate[rowDateKey] = 0;
      }

      const normalizedActivity = normalizeActivityName(activity);
      if (normalizedActivity === '01 recepcion de cilindros') {
        netByDate[rowDateKey] += qty;
      } else if (normalizedActivity === '11 entrega de cilindros (cilindros terminados)') {
        netByDate[rowDateKey] -= qty;
      }
    }

    if (rowDateKey && rowDateKey.slice(0, 7) === monthKey) {
      const monthOperator = String(row[3] || 'Sin operador');
      const monthShift = String(row[4] || '');
      const monthActivity = activity;
      const monthQty = qty;
      const normalizedMonthActivity = normalizeActivityName(monthActivity);

      totalMonth += monthQty;

      if (normalizedMonthActivity === 'recepcion de cilindros') {
        monthlyReception += monthQty;
      } else if (normalizedMonthActivity === 'entrega de cilindros') {
        monthlyDelivered += monthQty;
      }

      if (byActivityMonth[monthActivity] !== undefined) {
        byActivityMonth[monthActivity] += monthQty;
      }

      if (byShiftMonth[monthShift] !== undefined) {
        byShiftMonth[monthShift] += monthQty;
      }

      if (!byOperatorMonthMap[monthOperator]) {
        byOperatorMonthMap[monthOperator] = 0;
      }
      byOperatorMonthMap[monthOperator] += monthQty;
    }

    if (rowDateKey !== today) {
      return;
    }

    const operator = String(row[3] || 'Sin operador');
    const shift = String(row[4] || '');

    totalDay += qty;

    if (byActivity[activity] !== undefined) {
      byActivity[activity] += qty;
    }

    if (byShift[shift] !== undefined) {
      byShift[shift] += qty;
    }

    if (!byOperatorMap[operator]) {
      byOperatorMap[operator] = 0;
    }
    byOperatorMap[operator] += qty;
  });

  const sortedDates = Object.keys(netByDate).sort();
  let openingToday = inventoryBase;
  sortedDates.forEach(function (dateKey) {
    if (dateKey < today) {
      openingToday += netByDate[dateKey];
    }
  });

  const balanceDay = openingToday + (netByDate[today] || 0);

  const byOperator = Object.keys(byOperatorMap)
    .map(function (operator) {
      return {
        operator: operator,
        total: byOperatorMap[operator]
      };
    })
    .sort(function (a, b) {
      return b.total - a.total;
    });

  const byOperatorMonth = Object.keys(byOperatorMonthMap)
    .map(function (operator) {
      return {
        operator: operator,
        total: byOperatorMonthMap[operator]
      };
    })
    .sort(function (a, b) {
      return b.total - a.total;
    });

  return {
    date: today,
    monthKey: monthKey,
    totalMonth: totalMonth,
    totalDay: totalDay,
    balanceDay: balanceDay,
    monthlyReception: monthlyReception,
    monthlyDelivered: monthlyDelivered,
    byActivityMonth: byActivityMonth,
    byShiftMonth: byShiftMonth,
    byOperatorMonth: byOperatorMonth,
    byActivity: byActivity,
    byShift: byShift,
    byOperator: byOperator
  };
}

function isValidMonthKey(monthKey) {
  if (!monthKey) {
    return false;
  }
  return /^\d{4}-\d{2}$/.test(String(monthKey));
}

function normalizeDateKeyFromRow(row, timezone) {
  // Prioriza timestamp del servidor; si no existe, intenta normalizar la fecha visible.
  const serverTimestamp = row[9];
  const fromTimestamp = normalizeDateKeyFromAny(serverTimestamp, timezone);
  if (fromTimestamp) {
    return fromTimestamp;
  }

  const dateCell = row[1];
  const fromDateCell = normalizeDateKeyFromAny(dateCell, timezone);
  if (fromDateCell) {
    return fromDateCell;
  }

  return '';
}

function normalizeDateKeyFromAny(value, timezone) {
  if (!value) {
    return '';
  }

  // Caso Date real proveniente de Google Sheets.
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, timezone, 'yyyy-MM-dd');
  }

  const text = String(value).trim();
  if (!text) {
    return '';
  }

  // Si ya viene en formato yyyy-MM-dd (con o sin hora), conserva la fecha textual.
  const ymdMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/);
  if (ymdMatch) {
    return ymdMatch[1] + '-' + ymdMatch[2] + '-' + ymdMatch[3];
  }

  // Caso ISO o timestamp parseable por Date.
  const tryNative = new Date(text.replace(' ', 'T'));
  if (!isNaN(tryNative.getTime())) {
    return Utilities.formatDate(tryNative, timezone, 'yyyy-MM-dd');
  }

  // Caso dd/MM/yyyy o d/M/yyyy.
  const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const day = ('0' + slashMatch[1]).slice(-2);
    const month = ('0' + slashMatch[2]).slice(-2);
    const year = slashMatch[3];
    return year + '-' + month + '-' + day;
  }

  return '';
}

function normalizeTimeValue(value, timezone) {
  if (!value) {
    return '';
  }

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, timezone, 'HH:mm:ss');
  }

  const text = String(value).trim();
  const hhmmss = text.match(/^(\d{2}):(\d{2}):(\d{2})$/);
  if (hhmmss) {
    return text;
  }

  const nativeDate = new Date(text.replace(' ', 'T'));
  if (!isNaN(nativeDate.getTime())) {
    return Utilities.formatDate(nativeDate, timezone, 'HH:mm:ss');
  }

  return text;
}

function normalizeTimestampValue(value, timezone) {
  if (!value) {
    return '';
  }

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, timezone, 'yyyy-MM-dd HH:mm:ss');
  }

  const text = String(value).trim();
  const ymdhms = text.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/);
  if (ymdhms) {
    return ymdhms[1] + ' ' + ymdhms[2];
  }

  const nativeDate = new Date(text.replace(' ', 'T'));
  if (!isNaN(nativeDate.getTime())) {
    return Utilities.formatDate(nativeDate, timezone, 'yyyy-MM-dd HH:mm:ss');
  }

  return text;
}

function normalizeActivityName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function updateDashboardSnapshot() {
  const dashboard = getDailyDashboard();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.dashboard);
  const timezone = Session.getScriptTimeZone();

  const row = [
    dashboard.date,
    dashboard.totalDay,
    dashboard.byActivity['Desvalvulado'] || 0,
    dashboard.byActivity['Prueba Hidrostatica (PH)'] || 0,
    dashboard.byActivity['Lavado'] || 0,
    dashboard.byActivity['Valvulado'] || 0,
    dashboard.byActivity['Pintura'] || 0,
    dashboard.byActivity['Reparaciones Minimas'] || 0,
    dashboard.byOperator[0] ? dashboard.byOperator[0].operator + ' (' + dashboard.byOperator[0].total + ')' : '',
    dashboard.byOperator[1] ? dashboard.byOperator[1].operator + ' (' + dashboard.byOperator[1].total + ')' : '',
    dashboard.byOperator[2] ? dashboard.byOperator[2].operator + ' (' + dashboard.byOperator[2].total + ')' : '',
    dashboard.byShift['Matutino'] || 0,
    dashboard.byShift['Vespertino'] || 0,
    dashboard.byShift['Nocturno'] || 0,
    Utilities.formatDate(new Date(), timezone, 'yyyy-MM-dd HH:mm:ss')
  ];

  // Se reemplaza la fila del dia para evitar crecimiento innecesario del snapshot.
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    const dates = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < dates.length; i++) {
      if (String(dates[i][0]) === dashboard.date) {
        sheet.getRange(i + 2, 1, 1, row.length).setValues([row]);
        return;
      }
    }
  }

  sheet.appendRow(row);
}

function getRecordsByDate(dateString) {
  if (!dateString) {
    throw new Error('Fecha requerida para la consulta');
  }

  const timezone = Session.getScriptTimeZone();
  const requestedDateKey = normalizeDateKeyFromAny(dateString, timezone);
  if (!requestedDateKey) {
    throw new Error('Fecha invalida para la consulta');
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.production);
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    return [];
  }

  const data = sheet.getRange(2, 1, lastRow - 1, 13).getValues();
  return data
    .filter(function (row) {
      return normalizeDateKeyFromRow(row, timezone) === requestedDateKey;
    })
    .map(function (row) {
      const dateKey = normalizeDateKeyFromRow(row, timezone);
      const timeValue = normalizeTimeValue(row[2], timezone);
      const timestampValue = normalizeTimestampValue(row[9], timezone);

      return {
        id: row[0],
        date: dateKey,
        time: timeValue,
        operator: row[3],
        shift: row[4],
        activity: row[5],
        quantity: row[6],
        observations: row[7],
        captureUser: row[8],
        timestampServer: timestampValue,
        duplicateKey: row[10],
        sourceDevice: row[11],
        status: row[12]
      };
    });
}

function getActiveOperators() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.operators);
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    return [];
  }

  const data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();

  return data
    .filter(function (row) {
      return String(row[2]).toUpperCase() === 'SI' && String(row[1]).trim() !== '';
    })
    .map(function (row) {
      return String(row[1]).trim();
    });
}

function getActiveActivities() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.activities);
  if (!sheet) {
    return DEFAULT_ACTIVITIES.slice();
  }

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return DEFAULT_ACTIVITIES.slice();
  }

  const data = sheet.getRange(2, 1, lastRow - 1, 5).getValues();

  const rows = data
    .filter(function (row) {
      return String(row[2]).toUpperCase() === 'SI' && String(row[1]).trim() !== '';
    })
    .map(function (row) {
      return {
        name: String(row[1]).trim(),
        order: Number(row[3] || 9999)
      };
    })
    .sort(function (a, b) {
      return a.order - b.order;
    });

  if (rows.length === 0) {
    return DEFAULT_ACTIVITIES.slice();
  }

  return rows.map(function (item) {
    return item.name;
  });
}

function getConfigMap() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.config);
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    return {};
  }

  const data = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
  const map = {};

  data.forEach(function (row) {
    const key = String(row[0] || '').trim();
    const value = String(row[1] || '').trim();
    const active = String(row[3] || '').toUpperCase();

    if (key && active === 'SI') {
      map[key] = value;
    }
  });

  return map;
}

function getConfigValue(key, fallbackValue) {
  const map = getConfigMap();
  return map[key] || fallbackValue;
}

function generateRecordId() {
  const now = new Date();
  const timezone = Session.getScriptTimeZone();
  const base = Utilities.formatDate(now, timezone, 'yyyyMMdd-HHmmss');
  const random = Math.floor(1000 + Math.random() * 9000);
  return 'PROD-' + base + '-' + random;
}

function successResponse(message, data) {
  return {
    ok: true,
    message: message,
    data: data,
    errorCode: '',
    serverTime: new Date().toISOString()
  };
}

function errorResponse(message, errorCode) {
  return {
    ok: false,
    message: message,
    data: null,
    errorCode: errorCode,
    serverTime: new Date().toISOString()
  };
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
