/* =========================================================================
   VISOR DE RESULTADOS — Indicadores de Operaciones (solo consulta)
   Los datos los carga y calcula el "Panel de Cargue"; aquí solo se leen
   de la nube (Firestore) y del almacenamiento local del navegador.
   ========================================================================= */
/* =========================================================================
   1. DEFINICIÓN DE FUENTES (Tabla_1, Tabla_2, Tabla_4, Tabla_5, Tabla_6, Tabla_7)
   ========================================================================= */
const BODEGAS_PRINCIPAL = ['B05 ALTO COSTO', 'CENDIS PRINCIPAL TULUA PARQUE INDUSTRIAL'];

// Consolidado EPS: agrupa distintas siglas comerciales (con sufijos de régimen, etc.)
// bajo una sola EPS "madre" para poder filtrar de forma consolidada.
const EPS_GRUPO_MAP_RAW = {
  'ASMET SALUD EPS SAS':'ASMET SALUD','ASMET SALUD EPS SAS-CONTRIBUTIVO':'ASMET SALUD','ASMET SALUD EPS SAS-SUBSIDIADO':'ASMET SALUD',
  'COOSALUD CONTRIBUTIVO':'COOSALUD','COOSALUD SUBSIDIADO':'COOSALUD',
  'CRUZ VERDE CONTRIBUTIVO':'CRUZ VERDE','CRUZ VERDE SUBSIDIADO':'CRUZ VERDE',
  'E.P.S. SANITAS CONTRIBUTIVO':'SANITAS','E.P.S. SANITAS SUBSIDIADO':'SANITAS',
  'EPS FAMILIAR DE COLOMBIA SAS-CONTRIBUTIVO':'FAMILIAR','EPS FAMILIAR DE COLOMBIA SAS-SUBSIDIADO':'FAMILIAR',
  'FAMISANAR EPS CONTRIBUTIVO':'FAMISANAR','FAMISANAR EPS SUBSIDIADO':'FAMISANAR',
  'FIDEICOMISOS PATRIMONIOS AUTONOMOS FIDUCIARIA LA PREVISORA S.A-CAPITA':'FIDEICOMISOS','FIDEICOMISOS PATRIMONIOS AUTONOMOS FIDUCIARIA LA PREVISORA S.A-EVENTO':'FIDEICOMISOS',
  'NUEVA EMPRESA PROMOTORA DE SALUD S.A.-CONTRIBUTIVO':'NUEVA EPS','NUEVA EMPRESA PROMOTORA DE SALUD S.A.-TUTELAS':'NUEVA EPS','NUEVA EMPRESA PROMOTORA DE SALUD S.A.-TUTELAS SUB':'NUEVA EPS','NUEVA EMPRESA PROMOTORA DE SALUD S.A.-SUBSIDIADO':'NUEVA EPS',
  'SERVICIO OCCIDENTAL DE SALUD S.O.S. S.A':'S.O.S','SERVICIO OCCIDENTAL DE SALUD S.O.S. S.A-CONTRIBUTIVO':'S.O.S','SERVICIO OCCIDENTAL DE SALUD S.O.S. S.A-SUBSIDIADO':'S.O.S',
  'POSITIVA COMPAÑÍA DE SEGUROS S.A.':'POSITIVA',
  'UNION TEMPORAL SALUD INTEGRAL MAISFEN':'MAISFEN',
  'EMSSANAR SUBSIDIADO':'EMSSANAR','EMSSANAR CONTRIBUTIVO':'EMSSANAR',
  'CAJA DE COMPENSACION FAMILIAR COMFENALCO VALLE':'COMFENALCO'
};
const EPS_GRUPO_MAP = new Map(Object.entries(EPS_GRUPO_MAP_RAW).map(([k,v])=>[normValue(k), v]));
function epsAGrupo(eps){
  const nv = normValue(eps);
  const g = EPS_GRUPO_MAP.get(nv);
  if(g) return g;
  // Respaldo para las variantes de S.O.S. (con o sin sufijo de régimen, puntos o espacios
  // distintos): todas se consolidan en una sola EPS "S.O.S".
  if(nv.includes('SERVICIO OCCIDENTAL DE SALUD') || /(^|[\s-])S\s?\.?\s?O\s?\.?\s?S(\b|\.)/.test(nv)) return 'S.O.S';
  // Nombres muy largos del archivo fuente: se muestran con su sigla corta.
  if(nv.includes('COMFENAL')) return 'COMFENALCO';
  if(nv.includes('EMSSANAR')) return 'EMSSANAR';
  if(nv.includes('MAISFEN')) return 'MAISFEN';
  return String(eps||'').trim() || 'N/D'; // si no está en la tabla, queda como su propia sigla (no se pierde)
}

// Correcciones de siglas mal codificadas / duplicadas que llegan del archivo fuente
// (acentos y "Ñ" rotos, espacios donde debería ir un punto, etc.). Se corrigen ANTES de
// filtrar/agrupar, así el selector "EPS / Sigla Comercial" no muestra duplicados.
const EPS_RAW_CORRECTIONS_RAW = {
  'NUEVA EMPRESA PROMOTORA DE SALUD S. A SUBSIDIADO': 'NUEVA EMPRESA PROMOTORA DE SALUD S.A.-SUBSIDIADO',
  'POSITIVA CAMPAÑ A A DE SEGUROS S. A.': 'POSITIVA COMPAÑÍA DE SEGUROS S.A.'
};
const EPS_RAW_CORRECTIONS = new Map(Object.entries(EPS_RAW_CORRECTIONS_RAW).map(([k,v])=>[normValue(k), v]));
function corregirEps(epsRaw){
  const original = String(epsRaw||'').trim();
  if(!original) return original;
  const nv = normValue(original);
  if(EPS_RAW_CORRECTIONS.has(nv)) return EPS_RAW_CORRECTIONS.get(nv);
  // Reglas genéricas de respaldo, por si aparecen otras variantes con el mismo problema
  // de codificación que no están listadas explícitamente arriba.
  if(nv.includes('NUEVA EMPRESA PROMOTORA') && nv.includes('SUBSIDIADO')) return 'NUEVA EMPRESA PROMOTORA DE SALUD S.A.-SUBSIDIADO';
  if(nv.includes('POSITIVA') && nv.includes('SEGUROS')) return 'POSITIVA COMPAÑÍA DE SEGUROS S.A.';
  return original;
}

const DATASETS = [
  {
    key: 'reporte', tabla: 'Tabla_1', title: 'Reporte de Dispensación', required: true, accumulate: true,
    desc: 'Base transaccional principal. Cargue diario: cada archivo que subas se ACUMULA con lo ya guardado (no lo reemplaza); las filas repetidas se descartan automáticamente. Esta tarjeta ya NO acepta cargue manual: sus datos provienen exclusivamente de la carpeta de Google Drive.',
    cols: ['Documento','Fecha de Dispensación','EPS','Contrato','Código de Articulo','Descripción','Unidades','Cantidad Autorizada','Diferencia','Bodega Detalle','Soporte','Estado','Usuario Creación','DESCRIPCION CIE 10'],
    fields: {
      documento: ['DOCUMENTO'],
      codigoCie10: ['DESCRIPCION CIE 10','DESCRIPCIÓN CIE 10','DESCRIPCION CIE10','DESCRIPCIÓN CIE10','DESCRIPCION CIE-10','DESCRIPCION DIAGNOSTICO','DIAGNOSTICO','DIAGNÓSTICO','CODIGO CIE 10','CODIGO CIE10','CODIGO CIE-10','CÓDIGO CIE 10','CIE 10','CIE10','CIE-10'],
      estadoDispensa: ['ESTADO','ESTADO DISPENSA','ESTADO DE LA DISPENSA','ESTADO DE DISPENSA'],
      usuarioCreacion: ['USUARIO CREACION','USUARIO CREACIÓN','USUARIO DE CREACION','USUARIO DE CREACIÓN','USUARIO CREADOR','USUARIO'],
      fechaDispensacion: ['FECHA DE DISPENSACION','FECHA DISPENSACION','FECHA DISPENSACIÓN'],
      eps: ['EPS'],
      contrato: ['CONTRATO'],
      codigoArticulo: ['CODIGO DE ARTICULO','CODIGO ARTICULO','CODIGO ARTICLE','CODIGO','COD ARTICULO','COD. ARTICULO','COD ARTICLE','ID ARTICULO'],
      descripcion: ['DESCRIPCION','DESCRIPCIÓN'],
      unidades: ['UNIDADES'],
      fechaVencimiento: ['FECHA DE VENCIMIENTO'],
      cantidadAutorizada: ['CANTIDAD AUTORIZADA'],
      diferencia: ['DIFERENCIA'],
      bodegaDetalle: ['BODEGA DETALLE'],
      soportes: ['SOPORTE','SOPORTES']
    }
  },
  {
    key: 'homologo', tabla: 'Tabla_4', title: 'Homólogo', required: true,
    desc: 'Catálogo maestro: código de artículo, homólogo y si la molécula es Pareto.',
    cols: ['Codigo','Articulo','Homologo','Descripción DCI','Molecula Pareto'],
    fields: {
      codigo: ['CODIGO','CÓDIGO','COD ARTICULO','COD. ARTICULO','CODIGO ARTICULO','CODIGO DE ARTICULO'],
      articulo: ['ARTICULO'],
      homologo: ['HOMOLOGO','HOMÓLOGO'],
      descripcionDci: ['DESCRIPCION DCI','DESCRIPCIÓN DCI'],
      moleculaPareto: ['MOLECULA PARETO','MOLÉCULA PARETO','PARETO','TIPO PARETO','CLASIFICACION PARETO']
    }
  },
  {
    key: 'bodegas', tabla: 'Tabla_5', title: 'Bodega y Zona', required: true,
    desc: 'Catálogo de bodegas con su zona asociada.',
    cols: ['Bodega','Zona'],
    fields: { bodega: ['BODEGA'], zona: ['ZONA'] }
  },
  {
    key: 'agotados', tabla: 'Tabla_7', title: 'Estado de la Molécula', required: true,
    desc: 'Estado de disponibilidad por molécula/código (agotado o disponible).',
    cols: ['Molecula','Estado'],
    fields: { codigoArticulo: ['MOLECULA'], estado: ['ESTADO'] }
  },
  {
    key: 'inventario', tabla: 'Tabla_2', title: 'Inventario del Punto', required: true,
    desc: 'Existencias por artículo y bodega. El Homólogo se cruza automáticamente con la tabla Homólogo.',
    cols: ['Codigo','Bodega Detalle','Unidades','Fecha de Vencimiento'],
    fields: {
      codigoArticulo: ['CODIGO'],
      bodegaDetalle: ['BODEGA DETALLE'],
      unidades: ['UNIDADES'],
      fechaVencimiento: ['FECHA DE VENCIMIENTO','FECHA VENCIMIENTO','FECHA VTO','VENCIMIENTO','FECHA VENC.']
    }
  },
  {
    key: 'sigla', tabla: 'Tabla_6', title: 'Sigla Comercial (EPS)', required: false,
    desc: 'Catálogo de siglas comerciales de cliente / EPS, usado como referencia para el filtro.',
    cols: ['Sigla Comercial del Cliente'],
    fields: { sigla: ['SIGLA COMERCIAL DEL CLIENTE','SIGLA COMERCIAL CLIENTE','SIGLA'] }
  },
  {
    key: 'traslados', tabla: 'Tabla_8', title: 'Traslados', required: false,
    desc: 'Traslados entre bodegas realizados por cada usuario. Los datos provienen exclusivamente de la carpeta de Google Drive y se reemplazan por completo en cada sincronización. El Codigo se cruza con la tabla Homólogo para saber si la molécula es Pareto o No Pareto.',
    cols: ['Traslado','Fecha','Bodega Origen','Bodega Destino','Codigo','Descripcion','Cantidad','Recibido','Usuario'],
    fields: {
      traslado: ['TRASLADO','NRO TRASLADO','NUMERO TRASLADO','NÚMERO TRASLADO','No TRASLADO','DOCUMENTO TRASLADO','DOCUMENTO','CONSECUTIVO'],
      fecha: ['FECHA','FECHA TRASLADO','FECHA DE TRASLADO','FECHA DEL TRASLADO'],
      bodegaOrigen: ['BODEGA ORIGEN','BODEGA DE ORIGEN','ORIGEN','BODEGA SALIDA'],
      bodegaDestino: ['BODEGA DESTINO','BODEGA DE DESTINO','DESTINO','BODEGA LLEGADA'],
      codigo: ['CODIGO','CÓDIGO','CODIGO ARTICULO','CODIGO DE ARTICULO','COD ARTICULO','COD. ARTICULO'],
      descripcion: ['DESCRIPCION','DESCRIPCIÓN','DESCRIPCION ARTICULO','DESCRIPCIÓN ARTICULO','ARTICULO','NOMBRE ARTICULO','PRODUCTO'],
      cantidad: ['CANTIDAD','CANTIDAD TRASLADADA','UNIDADES','CANT','CANT.'],
      // Estado de recepción del traslado: 'Recibido' o 'No Recibido'. En la Base
      // Supervisores solo se cuentan como pendientes las líneas NO recibidas.
      recibido: ['RECIBIDO','RECIBIDA','ESTADO RECIBIDO','ESTADO DEL TRASLADO','ESTADO TRASLADO','ESTADO','RECEPCION','RECEPCIÓN'],
      usuario: ['USUARIO','USUARIO CREACION','USUARIO CREACIÓN','USUARIO QUE REALIZA','USUARIO TRASLADO','RESPONSABLE']
    }
  },
  {
    key: 'facturas', tabla: 'Tabla_9', title: 'Facturas', required: false,
    desc: 'Facturas por punto de venta. Los datos provienen exclusivamente de la carpeta de Google Drive y se reemplazan por completo en cada sincronización. El Codigo se cruza con la tabla Homólogo para saber si el código está homologado o no.',
    cols: ['Fecha Factura','Factura','Codigo','Descripcion','Cantidad','Punto de venta'],
    fields: {
      fechaFactura: ['FECHA FACTURA','FECHA DE FACTURA','FECHA DE LA FACTURA','FECHA FACTURACION','FECHA FACTURACIÓN','FECHA'],
      factura: ['FACTURA','NRO FACTURA','NUMERO FACTURA','NÚMERO FACTURA','No FACTURA','NUMERO DE FACTURA','DOCUMENTO','CONSECUTIVO'],
      codigo: ['CODIGO','CÓDIGO','CODIGO ARTICULO','CODIGO DE ARTICULO','COD ARTICULO','COD. ARTICULO','CODIGO ARTICLE'],
      descripcion: ['DESCRIPCION','DESCRIPCIÓN','DESCRIPCION ARTICULO','DESCRIPCIÓN ARTICULO','ARTICULO','NOMBRE ARTICULO'],
      cantidad: ['CANTIDAD','CANTIDADES','UNIDADES','CANT','CANT.'],
      puntoVenta: ['PUNTO DE VENTA','PUNTO VENTA','PUNTOVENTA','PUNTO','BODEGA','BODEGA DETALLE','SUCURSAL','PDV']
    }
  },
  {
    key: 'invfisico', tabla: 'Tabla_10', title: 'Inventario Físico (conteo)', required: false,
    desc: 'Conteo físico de inventario por bodega. Los datos provienen exclusivamente de la carpeta de Google Drive y se reemplazan por completo en cada sincronización. Se cruza con el Inventario del Punto por Bodega Detalle + Codigo.',
    cols: ['Codigo','Bodega Detalle','Unidades en fisico'],
    fields: {
      codigoArticulo: ['CODIGO','CÓDIGO','CODIGO ARTICULO','CODIGO DE ARTICULO','COD ARTICULO','COD. ARTICULO'],
      bodegaDetalle: ['BODEGA DETALLE','BODEGA','BODEGADETALLE','BODEGA DE DETALLE'],
      unidades: ['UNIDADES EN FISICO','UNIDADES EN FÍSICO','UNIDADES FISICAS','UNIDADES FÍSICAS','UNIDADES FISICO','UNIDADES','CANTIDAD FISICA','CANTIDAD FÍSICA','CANTIDAD','CONTEO']
    }
  }
];

/* =========================================================================
   2. Firebase Cloud Firestore — persistencia en la nube con respaldo en
      memoria si Firebase no está disponible (p.ej. sin conexión a internet)
   ========================================================================= */
const COLLECTION = 'datasets';
let dbFailed = false;
const memoryStore = new Map(); // respaldo local: key -> record (solo dura la sesión)
let _unsubscribe = null; // onSnapshot unsubscribe handle
let _localWriteActive = false;   // true while THIS client is writing
let _snapshotDebounce = null;    // debounce timer for snapshot-driven refreshes

// Firestore-ready check
function isFirestoreReady(){
  return typeof dbFirestore !== 'undefined' && dbFirestore !== null && !dbFailed;
}

let modoMemoriaAvisado = false;
function activarModoMemoria(err){
  dbFailed = true;
  console.warn('Firebase no disponible, usando memoria temporal (sin persistencia en la nube):', err);
  if (modoMemoriaAvisado) return;
  modoMemoriaAvisado = true;
  const warn = document.getElementById('persistenceWarning');
  if (warn) warn.style.display = 'flex';
  updateTopStatus();
}


/* --- Serialización para Firestore (1 MB límite por documento) --- */
// Firestore limita cada documento a ~1 MB. Para datasets grandes serializamos
// el array `rows` como JSON string en el campo `rowsJSON` y lo guardamos por
// fragmentos si es necesario.
const FIRESTORE_DOC_LIMIT = 900000; // bytes, margen de seguridad

function utf8ByteLength(s){
  return new Blob([s]).size;
}
function serializeForFirestore(record){
  // Si rows es pequeño, se guarda directamente como array.
  // Si es grande, se serializa como JSON string en rowsJSON.
  const rowsCopy = record.rows;
  const testJSON = JSON.stringify(rowsCopy);
  if(utf8ByteLength(testJSON) < FIRESTORE_DOC_LIMIT){
    // cabe como array nativo
    return { key: record.key, rows: rowsCopy, fileName: record.fileName || '',
             batches: record.batches || null, updatedAt: record.updatedAt || new Date().toISOString() };
  }
  // Demasiado grande: serializar rows como string
  return { key: record.key, rowsJSON: testJSON, fileName: record.fileName || '',
           batches: record.batches ? JSON.stringify(record.batches) : null,
           updatedAt: record.updatedAt || new Date().toISOString() };
}
function deserializeFromFirestore(doc){
  if(!doc.exists) return null;
  const d = doc.data();
  let rows = d.rows || [];
  if(d.rowsJSON){
    try { rows = JSON.parse(d.rowsJSON); } catch(e){ console.error('Error parsing rowsJSON for', d.key, e); rows = []; }
  }
  let batches = d.batches || null;
  if(typeof d.batches === 'string'){
    try { batches = JSON.parse(d.batches); } catch(e){ batches = null; }
  }
  return { key: d.key, rows, fileName: d.fileName || '', batches, updatedAt: d.updatedAt || '' };
}

/* =========================================================================
   2-bis. Almacen LOCAL (IndexedDB) para las tarjetas que dependen UNICAMENTE
   de Google Drive: "Inventario del Punto" y "Reporte de Dispensacion".
   Estas dos NO usan Firebase (ni Firestore ni Firebase Auth): sus datos salen
   de sus carpetas de Drive y se guardan en el navegador.
   Se usa IndexedDB (no localStorage) porque el acumulado del Reporte puede
   superar facilmente la cuota de localStorage.
   ========================================================================= */
const DRIVE_ONLY_KEYS = ['inventario', 'reporte', 'homologo', 'traslados', 'facturas', 'invfisico'];
function isDriveOnlyKey(k){ return DRIVE_ONLY_KEYS.indexOf(k) >= 0; }

const LOCAL_DB_NAME = 'medisfarma_drive_local';
const LOCAL_DB_STORE = 'datasets';
let _localDbPromise = null;

function localDbOpen(){
  if(_localDbPromise) return _localDbPromise;
  _localDbPromise = new Promise(resolve => {
    try{
      if(typeof indexedDB === 'undefined' || !indexedDB){ resolve(null); return; }
      const req = indexedDB.open(LOCAL_DB_NAME, 1);
      req.onupgradeneeded = function(){
        const db = req.result;
        if(!db.objectStoreNames.contains(LOCAL_DB_STORE)) db.createObjectStore(LOCAL_DB_STORE, { keyPath: 'key' });
      };
      req.onsuccess = function(){ resolve(req.result); };
      req.onerror = function(){ console.warn('IndexedDB no disponible:', req.error); resolve(null); };
    }catch(e){ console.warn('IndexedDB no disponible:', e); resolve(null); }
  });
  return _localDbPromise;
}
function localTx(mode, fn){
  return localDbOpen().then(db => {
    if(!db) return null;
    return new Promise(resolve => {
      let out = null;
      try{
        const tx = db.transaction(LOCAL_DB_STORE, mode);
        const store = tx.objectStore(LOCAL_DB_STORE);
        const req = fn(store);
        if(req) req.onsuccess = function(){ out = req.result; };
        tx.oncomplete = function(){ resolve(out); };
        tx.onerror = function(){ console.warn('IndexedDB tx error:', tx.error); resolve(null); };
        tx.onabort = function(){ console.warn('IndexedDB tx abort:', tx.error); resolve(null); };
      }catch(e){ console.warn('IndexedDB tx fallo:', e); resolve(null); }
    });
  });
}
function localPutRecord(record){
  const plain = { key: record.key, rows: record.rows || [], fileName: record.fileName || '',
                  batches: record.batches || null, updatedAt: record.updatedAt || new Date().toISOString() };
  return localTx('readwrite', store => store.put(plain));
}
function localGetRecord(key){ return localTx('readonly', store => store.get(key)); }
function localDeleteRecord(key){ return localTx('readwrite', store => store.delete(key)); }

/* --- Operaciones CRUD --- */

async function idbPut(record) {
  // Inventario y Reporte: solo navegador (IndexedDB), sin Firestore
  if (isDriveOnlyKey(record.key)) {
    memoryStore.set(record.key, record);
    await localPutRecord(record);
    if (record.key === 'inventario') {
      // Copia ligera de respaldo (el inventario suele ser pequeno)
      try {
        localStorage.setItem('inventario_data', JSON.stringify({ rows: record.rows, fileName: record.fileName, updatedAt: record.updatedAt, rowCount: record.rows.length }));
      } catch(e) { /* quota: IndexedDB ya tiene el dato */ }
    }
    return;
  }

  const docData = serializeForFirestore(record);
  _localWriteActive = true;
  try {
    if(!isFirestoreReady()) throw new Error('Firestore not initialized');
    await dbFirestore.collection(COLLECTION).doc(record.key).set(docData, {merge:true});
  } catch (err) {
    activarModoMemoria(err);
    memoryStore.set(record.key, record);
  } finally {
    // Dar tiempo al onSnapshot local a llegar y ser ignorado
    setTimeout(() => { _localWriteActive = false; }, 500);
  }
}
async function idbGetAll() {
  // Inventario y Reporte vienen del almacen local (Drive), nunca de Firestore
  const localRecs = [];
  for (let i = 0; i < DRIVE_ONLY_KEYS.length; i++) {
    const rec = await idbGet(DRIVE_ONLY_KEYS[i]);
    if (rec && rec.rows) localRecs.push(rec);
  }
  let remote;
  try {
    if(!isFirestoreReady()) throw new Error('Firestore not initialized');
    const snap = await dbFirestore.collection(COLLECTION).get();
    remote = snap.docs.map(d => deserializeFromFirestore(d)).filter(Boolean).filter(r => !isDriveOnlyKey(r.key));
  } catch (err) {
    activarModoMemoria(err);
    remote = Array.from(memoryStore.values()).filter(r => !isDriveOnlyKey(r.key));
  }
  return remote.concat(localRecs);
}
async function idbGet(key) {
  if (isDriveOnlyKey(key)) {
    const mem = memoryStore.get(key);
    if (mem) return mem;
    const rec = await localGetRecord(key);
    if (rec && rec.rows) { memoryStore.set(key, rec); return rec; }
    if (key === 'inventario') {
      // Respaldo antiguo en localStorage
      try {
        const stored = localStorage.getItem('inventario_data');
        if (stored) {
          const data = JSON.parse(stored);
          const r = { key: 'inventario', rows: data.rows || [], fileName: data.fileName || '', batches: null, updatedAt: data.updatedAt || '' };
          memoryStore.set('inventario', r);
          return r;
        }
      } catch(e) { /* ignorar */ }
    }
    return null;
  }

  try {
    if(!isFirestoreReady()) throw new Error('Firestore not initialized');
    const doc = await dbFirestore.collection(COLLECTION).doc(key).get();
    return deserializeFromFirestore(doc);
  } catch (err) {
    activarModoMemoria(err);
    return memoryStore.get(key) || null;
  }
}
async function idbDelete(key) {
  // Inventario y Reporte: solo limpiar almacen local del navegador
  if (isDriveOnlyKey(key)) {
    memoryStore.delete(key);
    await localDeleteRecord(key);
    if (key === 'inventario') {
      try { localStorage.removeItem('inventario_data'); } catch(e) {}
      try { localStorage.removeItem('inventario_drive_files'); } catch(e) {}
      _driveFiles = [];
    } else if (key === 'reporte') {
      try { localStorage.removeItem('reporte_drive_files'); } catch(e) {}
      _driveFilesReporte = [];
    } else if (key === 'homologo') {
      // Homologo NO usa localStorage: solo memoria + IndexedDB
      _driveFilesHomologo = [];
    } else if (key === 'traslados') {
      // Traslados NO usa localStorage: solo memoria + IndexedDB
      _driveFilesTraslados = [];
    } else if (key === 'facturas') {
      // Facturas NO usa localStorage: solo memoria + IndexedDB
      _driveFilesFacturas = [];
    } else if (key === 'invfisico') {
      // Inventario Fisico NO usa localStorage: solo memoria + IndexedDB
      _driveFilesInvFisico = [];
    }
    delete state.loaded[key];
    return;
  }

  _localWriteActive = true;
  try {
    if(!isFirestoreReady()) throw new Error('Firestore not initialized');
    await dbFirestore.collection(COLLECTION).doc(key).delete();
  } catch (err) {
    activarModoMemoria(err);
    memoryStore.delete(key);
  } finally {
    setTimeout(() => { _localWriteActive = false; }, 500);
  }
}
async function idbClearAll() {
  // Inventario y Reporte: limpiar el almacen local del navegador
  for (let i = 0; i < DRIVE_ONLY_KEYS.length; i++) {
    memoryStore.delete(DRIVE_ONLY_KEYS[i]);
    await localDeleteRecord(DRIVE_ONLY_KEYS[i]);
    delete state.loaded[DRIVE_ONLY_KEYS[i]];
  }
  try { localStorage.removeItem('inventario_data'); } catch(e) {}
  try { localStorage.removeItem('inventario_drive_files'); } catch(e) {}
  try { localStorage.removeItem('reporte_drive_files'); } catch(e) {}
  _driveFiles = [];
  _driveFilesReporte = [];
  _driveFilesHomologo = [];
  _driveFilesTraslados = [];
  _driveFilesFacturas = [];
  _driveFilesInvFisico = [];
  _localWriteActive = true;
  try {
    if(!isFirestoreReady()) throw new Error('Firestore not initialized');
    const snap = await dbFirestore.collection(COLLECTION).get();
    const batch = dbFirestore.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    if(snap.docs.length) await batch.commit();
  } catch (err) {
    activarModoMemoria(err);
    memoryStore.clear();
  } finally {
    setTimeout(() => { _localWriteActive = false; }, 500);
  }
}

/* --- Real-time listener (onSnapshot) --- */

function startFirestoreListener(){
  if(!isFirestoreReady()) return;
  if(_unsubscribe) return; // ya activo
  _unsubscribe = dbFirestore.collection(COLLECTION).onSnapshot(snap => {
    // Si estamos en medio de una escritura local (cargue/borrado),
    // refreshStatusFromDB ya refresca la UI. Evitamos duplicar.
    if(_localWriteActive){ return; }
    // Debounce: si llegan varios snaps rápidos, solo el último dispara
    clearTimeout(_snapshotDebounce);
    _snapshotDebounce = setTimeout(() => {
      const records = snap.docs.map(d => deserializeFromFirestore(d)).filter(Boolean);
      // Conservar el estado de las tarjetas que solo dependen de Drive:
      // Firestore no las controla y no debe borrarlas de la interfaz.
      const keepDriveOnly = {};
      DRIVE_ONLY_KEYS.forEach(k => { if(state.loaded[k]) keepDriveOnly[k] = state.loaded[k]; });
      state.loaded = Object.assign({}, keepDriveOnly);
      const filteredRecords = records.filter(r => !isDriveOnlyKey(r.key));
      filteredRecords.forEach(rec => {
        state.loaded[rec.key] = {
          rowCount: rec.rows.length,
          fileName: rec.fileName,
          updatedAt: rec.updatedAt,
          batches: rec.batches || null
        };
      });
      renderUploadCards();
      updateTopStatus();
      updateCalcButton();
      // Si ya hay un cálculo procesado y los datos cambiaron (vienen de otro
      // dispositivo), recalcular automáticamente.
      if(state.processed){
        calcularIndicadores();
      }
    }, 300);
  }, err => {
    console.warn('Firestore onSnapshot error:', err);
    if(err && err.code === 'permission-denied'){
      activarModoMemoria(err);
      stopFirestoreListener();
    }
  });
}
function stopFirestoreListener(){
  if(_unsubscribe){ _unsubscribe(); _unsubscribe = null; }
}


/* =========================================================================
   3. Utilidades
   ========================================================================= */
function stripAccents(s){return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
function normHeader(s){return stripAccents(String(s||'')).toUpperCase().replace(/\s+/g,' ').trim();}
/* Version "compacta" del encabezado: sin espacios ni signos, para comparar
   "NO RECIBIDO", "No_Recibido" y "No. Recibido" como el mismo texto. */
function compactHeader(s){return normHeader(s).replace(/[^A-Z0-9]/g,'');}
function normValue(s){if(s===null||s===undefined)return '';return stripAccents(String(s)).toUpperCase().trim();}
/* Clave "suelta" de un codigo de articulo: solo letras y numeros y sin ceros a la
   izquierda. Sirve para emparejar el mismo codigo escrito de formas distintas
   entre tablas (por ejemplo M-00123, M00123 y 123). */
function claveCodigo(c){
  const s=normValue(c).replace(/[^A-Z0-9]/g,'');
  if(!s) return '';
  const sinCeros=s.replace(/^0+/,'');
  return sinCeros || s;
}
/* Estado de recepcion de un traslado (columna "Recibido" de la tabla Traslados).
   Devuelve tres posibles valores:
     'RECIBIDO'  la linea ya entro a la bodega destino (no esta en camino),
     'PENDIENTE' sigue en camino (No Recibido, Sin recibir, Pendiente, En transito),
     ''          no hay dato confiable (celda vacia o un numero suelto).
   El tercer caso es importante: una linea sin estado no se puede sumar como si
   estuviera en camino cuando el resto del archivo si trae el estado. */
function estadoTraslado(v){
  const s=normValue(v).replace(/[^A-Z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  if(!s) return '';                                    // celda vacia: sin dato
  if(s==='1') return 'RECIBIDO';                       // banderas 1/0
  if(s==='0') return 'PENDIENTE';
  if(/^[0-9]+$/.test(s)) return '';                    // un numero suelto no es un estado
  // "NO RECIBIDO", "SIN RECIBIR", "PENDIENTE" y similares: sigue en camino.
  if(/(^|\s)(NO|SIN|PENDIENTE|FALSE|FALSO)(\s|$)/.test(s)) return 'PENDIENTE';
  const prim=s.split(' ')[0];
  if(/^RECIBID/.test(prim)) return 'RECIBIDO';
  if(['SI','S','Y','YES','TRUE','VERDADERO','X','OK','ENTREGADO','ENTREGADA','CONFIRMADO','CONFIRMADA','APROBADO','APROBADA','CERRADO','CERRADA'].indexOf(prim)>=0) return 'RECIBIDO';
  return 'PENDIENTE';                                  // En transito, En ruta, etc.
}
/* true SOLO cuando la linea dice expresamente que no se ha recibido
   ("No Recibido", "Sin recibir", "Pendiente", "En transito"). Las celdas vacias
   o sin un estado reconocible devuelven false: no se cuentan como en camino. */
function esTrasladoNoRecibido(v){ return estadoTraslado(v)==='PENDIENTE'; }
/* Códigos que NO corresponden a un medicamento (servicios, cobros, domicilios, etc.).
   Aunque la columna Diferencia sea negativa, estas líneas no se cuentan como pendientes
   ni como líneas por subsanar en ningún indicador. */
const CODIGOS_NO_MEDICAMENTO=new Set(['M000339']);
function esCodigoNoMedicamento(codigo, descripcion){
  const cod=normValue(codigo);
  if(CODIGOS_NO_MEDICAMENTO.has(cod)) return true;
  // Respaldo por descripción: cualquier cobro de domicilio (con o sin IVA).
  return normValue(descripcion).indexOf('DOMICILIO')>=0;
}
function toNumber(v){
  if (v===null||v===undefined||v==='') return 0;
  if (typeof v==='number') return v;
  const n2 = parseFloat(v);
  return isNaN(n2) ? 0 : n2;
}
function excelSerialToDate(n){const utcDays=Math.floor(n-25569);return new Date(utcDays*86400*1000);}
function toDateSafe(v){
  if (v===null||v===undefined||v==='') return null;
  if (v instanceof Date && !isNaN(v)) return v;
  if (typeof v==='number') return excelSerialToDate(v);
  const s=String(v).trim();
  let m=s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if(m){let [,d,mo,y]=m; if(y.length===2)y='20'+y; const dt=new Date(Date.UTC(+y,+mo-1,+d)); if(!isNaN(dt))return dt;}
  m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(m){const [,y,mo,d]=m; const dt=new Date(Date.UTC(+y,+mo-1,+d)); if(!isNaN(dt))return dt;}
  const dt2=new Date(s); return isNaN(dt2)?null:dt2;
}
function dateToISO(d){ if(!d) return ''; return d.toISOString().slice(0,10); }
// ---- Apoyo para el filtro global por mes ----
// Las fechas del reporte se construyen en UTC, por eso el mes se lee con getUTC*.
// La clave "AAAA-MM" permite ordenar los meses cronológicamente sin ambigüedad.
const MESES_FILTRO_ES=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
function mesKey(d){
  const dt = d instanceof Date ? d : toDateSafe(d);
  if(!dt || isNaN(dt)) return '';
  return dt.getUTCFullYear()+'-'+String(dt.getUTCMonth()+1).padStart(2,'0');
}
function mesLabel(key){
  const m=String(key||'').match(/^(\d{4})-(\d{2})$/);
  if(!m) return String(key||'');
  const nombre=MESES_FILTRO_ES[(+m[2])-1]||m[2];
  return nombre.charAt(0).toUpperCase()+nombre.slice(1)+' '+m[1];
}
function fmtInt(n){ if(n===null||n===undefined||isNaN(n)) return '—'; return n.toLocaleString('es-CO'); }
function fmtPct(n){ if(n===null||n===undefined||isNaN(n)) return '—'; return (n*100).toFixed(1)+'%'; }
function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function pctClass(n){ if(n===null||n===undefined||isNaN(n)) return ''; if(n>=0.85) return 'pct-good'; if(n>=0.6) return 'pct-mid'; return 'pct-bad'; }
// Escala para indicadores de EFICIENCIA (entre más alto, mejor): >98% verde, 80%-98% amarillo, <80% rojo
function effClass(n){ if(n===null||n===undefined||isNaN(n)) return ''; if(n>0.98) return 'pct-good'; if(n>=0.80) return 'pct-mid'; return 'pct-bad'; }
// Escala para el ÍNDICE DE PENDIENTES (entre más bajo, mejor): <3% verde, 3%-80% amarillo, >80% rojo
function pendClass(n){ if(n===null||n===undefined||isNaN(n)) return ''; if(n<0.03) return 'pct-good'; if(n<=0.80) return 'pct-mid'; return 'pct-bad'; }
function showToast(msg,isError){
  const t=document.getElementById('toast'); t.textContent=msg;
  t.className='toast show'+(isError?' error':''); clearTimeout(showToast._h);
  showToast._h=setTimeout(()=>{t.className='toast';},3600);
}

/* =========================================================================
   4. Parseo de archivos
   ========================================================================= */
// Palabras clave de respaldo: si ninguno de los alias exactos existe en el archivo,
// se busca cualquier encabezado que CONTENGA estas palabras. Evita que un cambio de
// nombre en el archivo original (p. ej. "Estado dispensa 2024") deje el campo vacío.
const FIELD_FALLBACK_KEYWORDS = {
  codigoCie10: ['DESCRIPCION CIE','DESCRIPCIÓN CIE','CIE 10','CIE10','CIE-10','CIE','DIAGNOSTIC'],
  estadoDispensa: ['ESTADO'],
  usuarioCreacion: ['USUARIO'],
  bodegaDetalle: ['BODEGA'],
  fechaDispensacion: ['FECHA DISPENS', 'FECHA DE DISPENS'],
  cantidadAutorizada: ['AUTORIZAD'],
  soportes: ['SOPORTE'],
  documento: ['DOCUMENTO'],
  // Columna "Recibido" de Traslados (valores tipo Recibido / No Recibido)
  recibido: ['RECIBIDO','ESTADO RECIB','NO RECIBIDO','RECIB']
};
/* Busca una columna por palabra clave, de lo mas preciso a lo mas laxo:
   1) el encabezado es exactamente la palabra buscada,
   2) el encabezado empieza por la palabra buscada,
   3) el encabezado la contiene (ultimo recurso).
   Asi "Recibido" gana sobre "Fecha de recibido" y no se toma una columna vecina. */
function findHeaderByKeyword(headerIndex, keywords){
  for (const kw of keywords){
    const objetivo=compactHeader(kw);
    if(!objetivo) continue;
    let porInicio=-1, porContenido=-1;
    for (const h of headerIndex.keys()){
      const ch=compactHeader(h);
      if (ch===objetivo) return headerIndex.get(h);
      if (porInicio<0 && ch.startsWith(objetivo)) porInicio=headerIndex.get(h);
      if (porContenido<0 && ch.includes(objetivo)) porContenido=headerIndex.get(h);
    }
    if (porInicio>=0) return porInicio;
    if (porContenido>=0) return porContenido;
  }
  return -1;
}
function mapRowToFields(rawRow, headerIndex, fieldsDef){
  const out={};
  for (const fieldName in fieldsDef){
    let val='', matched=false;
    for (const alias of fieldsDef[fieldName]){
      const key=normHeader(alias);
      if (headerIndex.has(key)){
        matched=true;
        const col=headerIndex.get(key); val=rawRow[col];
        if (val!==undefined && val!==null && val!=='') break;
      }
    }
    // Respaldo por palabra clave solo si el encabezado exacto no existe en el archivo
    if (!matched && FIELD_FALLBACK_KEYWORDS[fieldName]){
      const col=findHeaderByKeyword(headerIndex, FIELD_FALLBACK_KEYWORDS[fieldName]);
      if (col>=0) val=rawRow[col];
    }
    out[fieldName]= val===undefined ? '' : val;
  }
  return out;
}
// Completa en una fila ya guardada los campos que estén vacíos usando una fila
// recién leída del archivo. Sirve para "reparar" el acumulado histórico cuando se
// agregan columnas nuevas (Estado, Usuario Creación) que antes no se guardaban.
// Cuando una MISMA línea se vuelve a cargar y ahora sí trae soporte (antes 0 / "NO TIENE"),
// guardamos el soporte nuevo y la fecha del cargue en el que apareció. Eso permite el
// Reporte Comparativo Periódico de "soportes recuperados" entre cargues.
function registrarSoporteRecuperado(destino, origen, fechaISO){
  const nuevo = toNumber(origen.soportes);
  const actual = toNumber(destino.soportes);
  if(nuevo>0 && actual===0){
    destino.soportes = origen.soportes;
    destino._fechaSoporte = fechaISO;
    return true;
  }
  return false;
}
function completarCamposFaltantes(destino, origen){
  let cambios=0;
  for (const f in origen){
    const nuevo=origen[f];
    if (nuevo===undefined || nuevo===null || nuevo==='') continue;
    const actual=destino[f];
    if (actual===undefined || actual===null || actual===''){ destino[f]=nuevo; cambios++; }
  }
  return cambios;
}
async function parseFile(file, datasetDef){
  const buf=await file.arrayBuffer();
  const wb=XLSX.read(buf,{type:'array',cellDates:true,dense:true});
  const sheetName=wb.SheetNames[0];
  const ws=wb.Sheets[sheetName];
  const aoa=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:''});
  if(!aoa.length) throw new Error('El archivo está vacío.');

  let headerRowIdx=0, bestScore=-1;
  const allAliases=new Set();
  Object.values(datasetDef.fields).forEach(arr=>arr.forEach(a=>allAliases.add(normHeader(a))));
  for(let i=0;i<Math.min(aoa.length,10);i++){
    let score=0;
    aoa[i].forEach(c=>{ if(allAliases.has(normHeader(c))) score++; });
    if(score>bestScore){bestScore=score; headerRowIdx=i;}
  }
  const headerIndex=new Map();
  aoa[headerRowIdx].forEach((h,idx)=>{ const nh=normHeader(h); if(nh && !headerIndex.has(nh)) headerIndex.set(nh,idx); });

  const rows=[];
  for(let r=headerRowIdx+1;r<aoa.length;r++){
    const raw=aoa[r];
    if(!raw || raw.every(c=>c===''||c===null||c===undefined)) continue;
    rows.push(mapRowToFields(raw,headerIndex,datasetDef.fields));
  }
  return rows;
}

/* =========================================================================
   5. Estado en memoria
   ========================================================================= */
const state = { loaded:{}, processed:null };

async function refreshStatusFromDB(){
  const all=await idbGetAll();
  state.loaded={};
  restoreDriveFileLists();
  all.forEach(rec=>{ state.loaded[rec.key]={rowCount:rec.rows.length, fileName:rec.fileName, updatedAt:rec.updatedAt, batches:rec.batches||null}; });
  renderUploadCards(); updateTopStatus(); updateCalcButton();
}
function updateTopStatus(){
  const dot=document.getElementById('dbDot'); const txt=document.getElementById('dbStatusText');
  const n=Object.keys(state.loaded).length;
  const modo = dbFailed ? ' (modo sesión, sin sincronización en la nube)' : '';
  if(n===0){ dot.className='dot'+(dbFailed?' warn':''); txt.textContent='Sin datos cargados'+modo; }
  else{
    dot.className='dot'+(dbFailed?' warn':' on');
    const totalRows=Object.values(state.loaded).reduce((a,b)=>a+b.rowCount,0);
    txt.textContent=n+' fuente(s) cargadas · '+fmtInt(totalRows)+' filas en total'+modo;
  }
}
function renderDiagPanel(diag){
  const el=document.getElementById('diagPanel');
  if(!el) return;
  const pctPareto = diag.reporteFilas ? diag.reporteConPareto/diag.reporteFilas : 0;
  let level='ok', msg='';
  if(diag.homologoFilasConCodigo===0){
    level='bad';
    msg='La tabla Homólogo se cargó pero ninguna fila tiene un valor reconocible en la columna "Codigo". Revisa que el encabezado de esa columna en tu archivo diga exactamente "Codigo" (o similar) y que la fila de encabezados esté en las primeras filas del archivo.';
  }else if(pctPareto < 0.5){
    level='bad';
    msg='Menos de la mitad de las líneas del Reporte encontraron PARETO/NO PARETO en el Homólogo. Lo más probable es que el "Codigo" del Reporte no coincida con el "Codigo" del Homólogo (formato distinto, espacios, o el archivo Homólogo cargado no es el correcto).';
  }else if(pctPareto < 0.95){
    level='warn';
    msg='La mayoría de las líneas sí cruzaron, pero hay códigos del Reporte que no aparecen en el Homólogo cargado (ver ejemplos abajo). Puede ser normal si son artículos nuevos, o puede indicar que falta actualizar el Homólogo.';
  }else{
    level='ok';
    msg='El cruce con Homólogo está funcionando correctamente.';
  }
  el.className = 'diag-panel diag-'+level;
  el.style.display='flex';
  el.innerHTML = `
    <span class="pw-icon">${level==='ok'?'✓':'⚠'}</span>
    <div>
      <b>Diagnóstico del cruce con Homólogo:</b> ${msg}
      <div class="diag-stats">
        <span>Homólogo cargado: <b>${fmtInt(diag.homologoFilasCargadas)}</b> filas (${fmtInt(diag.homologoFilasConCodigo)} con "Codigo" válido)</span>
        <span>Líneas del Reporte con Pareto/No Pareto identificado: <b>${fmtInt(diag.reporteConPareto)}</b> de ${fmtInt(diag.reporteFilas)} (${fmtPct(pctPareto)})</span>
        <span>Códigos únicos del Reporte sin homólogo: <b>${fmtInt(diag.codigosSinHomologo)}</b> de ${fmtInt(diag.codigosUnicosReporte)}</span>
        ${diag.ejemplosSinHomologo.length ? `<span>Ejemplos de códigos sin cruce: <b>${diag.ejemplosSinHomologo.join(', ')}</b></span>` : ''}
      </div>
    </div>
  `;
}

/* ---- Stubs: en el visor no existe la vista de cargue ---- */
function renderUploadCards(){ /* sin tarjetas de cargue en el visor */ }
function updateCalcButton(){ /* sin botón de cálculo en el visor */ }
let _driveFilesReporte = [];
let _driveFilesHomologo = []; // solo en memoria: Homologo no usa localStorage
let _driveFilesTraslados = []; // solo en memoria: Traslados no usa localStorage
let _driveFilesFacturas = []; // solo en memoria: Facturas no usa localStorage
let _driveFilesInvFisico = []; // solo en memoria: Inventario Fisico no usa localStorage
let _driveFiles = []; // archivos listados del folder de Drive
// Restaura la lista de archivos vistos en Drive (solo para mostrarla en las tarjetas)
function restoreDriveFileLists() {
  try {
    const storedFiles = localStorage.getItem('inventario_drive_files');
    if (storedFiles) {
      try { _driveFiles = JSON.parse(storedFiles); } catch(e) { _driveFiles = []; }
    }
    const storedFilesRep = localStorage.getItem('reporte_drive_files');
    if (storedFilesRep) {
      try { _driveFilesReporte = JSON.parse(storedFilesRep); } catch(e) { _driveFilesReporte = []; }
    }
  } catch(e) { /* ignore */ }
}
// Carga Inventario y Reporte desde el almacen local del navegador (datos de Drive)
async function loadDriveOnlyFromLocal() {
  restoreDriveFileLists();
  for (let i = 0; i < DRIVE_ONLY_KEYS.length; i++) {
    const key = DRIVE_ONLY_KEYS[i];
    try {
      const rec = await idbGet(key);
      if (rec && rec.rows && rec.rows.length) {
        state.loaded[key] = {
          rowCount: rec.rows.length,
          fileName: rec.fileName || '',
          updatedAt: rec.updatedAt || '',
          batches: rec.batches || null
        };
      }
    } catch(e) { /* ignore */ }
  }
}
/* =========================================================================
   Paquete cifrado publicado por el Panel de Cargue (modo solo lectura)
   Aqui NO se cargan archivos fuente: unicamente se abre el paquete
   .medisfarma con la contrasena que entrega el administrador y se muestran
   los indicadores ya calculados sobre esos datos.
   ========================================================================= */
const PAQUETE_APP_ID = 'medisfarma-paquete';
const PAQUETE_META_KEY = 'medisfarma_paquete_meta'; // recuerda el ultimo paquete abierto

// Las fechas viajan marcadas dentro del paquete; se devuelven como objetos Date.
function backupDecodeRows(rows){
  return (rows||[]).map(r=>{
    if(!r || typeof r!=='object') return r;
    const o={};
    Object.keys(r).forEach(k=>{
      const v=r[k];
      if(v && typeof v==='object' && typeof v.__date==='string'){
        const d=new Date(v.__date); o[k]=isNaN(d)?null:d;
      }else{ o[k]=v; }
    });
    return o;
  });
}
function base64ABytes(b64){
  const bin=atob(String(b64||''));
  const out=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) out[i]=bin.charCodeAt(i);
  return out;
}
async function paqueteDerivarClave(password, salt, iteraciones){
  const base=await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name:'PBKDF2', salt, iterations: iteraciones||150000, hash:'SHA-256' },
    base, { name:'AES-GCM', length:256 }, false, ['decrypt']
  );
}
async function paqueteDescomprimir(bytes){
  if(typeof DecompressionStream==='undefined') throw new Error('Este navegador no puede abrir el paquete comprimido. Usa Chrome o Edge actualizado.');
  const ds=new DecompressionStream('gzip');
  const w=ds.writable.getWriter();
  w.write(bytes); w.close();
  const buf=await new Response(ds.readable).arrayBuffer();
  return new TextDecoder().decode(buf);
}

/* Paquete nuevo (formato binario): 8 bytes de marca + 4 bytes con el largo de
   la ficha + ficha JSON corta + contenido cifrado en bytes puros. Antes todo
   viajaba dentro de un JSON con textos base64 enormes y el navegador no podia
   con ellos ("Invalid string length"). */
const PAQUETE_MARCA = [0x4D,0x53,0x46,0x50,0x32,0x00,0x00,0x00]; // "MSFP2\0\0\0"
function paqueteLeerCabeceraBinaria(buffer){
  const bytes=new Uint8Array(buffer);
  if(bytes.length < PAQUETE_MARCA.length+4) return null;
  for(let i=0;i<PAQUETE_MARCA.length;i++){ if(bytes[i]!==PAQUETE_MARCA[i]) return null; }
  const largo=new DataView(bytes.buffer, bytes.byteOffset+PAQUETE_MARCA.length, 4).getUint32(0, true);
  const ini=PAQUETE_MARCA.length+4;
  if(largo<=0 || ini+largo>bytes.length) return null;
  let cabecera;
  try{ cabecera=JSON.parse(new TextDecoder().decode(bytes.subarray(ini, ini+largo))); }
  catch(e){ return null; }
  return { cabecera, cifrado: bytes.subarray(ini+largo) };
}

/* Recorre el contenido linea por linea (una fila por linea) sin juntar nunca
   todo el texto: la primera linea es la ficha del paquete y las demas son las
   filas, en el mismo orden en que se guardaron las fuentes. */
async function paqueteRecorrerNDJSON(bytes, comprimido, alLeerLinea){
  let flujo=new Response(bytes).body;
  if(comprimido){
    if(typeof DecompressionStream==='undefined') throw new Error('Este navegador no puede abrir el paquete comprimido. Usa Chrome o Edge actualizado.');
    flujo=flujo.pipeThrough(new DecompressionStream('gzip'));
  }
  const lector=flujo.getReader();
  const dec=new TextDecoder();
  let resto='';
  for(;;){
    const {value, done}=await lector.read();
    if(done) break;
    resto+=dec.decode(value,{stream:true});
    let corte;
    while((corte=resto.indexOf('\n'))>=0){
      const linea=resto.slice(0,corte);
      resto=resto.slice(corte+1);
      if(linea) alLeerLinea(linea);
    }
  }
  resto+=dec.decode();
  if(resto.trim()) alLeerLinea(resto);
}

// Guarda cada tabla del paquete en este navegador para que siga disponible
// al recargar la pagina (sin escribir nada en la nube).
async function paqueteGuardarLocal(datasets){
  for(let i=0;i<datasets.length;i++){
    const d=datasets[i];
    const rec={ key:d.key, rows: backupDecodeRows(d.rows), fileName: d.fileName||'', batches: d.batches||null, updatedAt: d.updatedAt||'' };
    memoryStore.set(rec.key, rec);
    try{ await localPutRecord(rec); }catch(e){ /* si no hay espacio, queda en memoria */ }
    state.loaded[rec.key]={ rowCount: rec.rows.length, fileName: rec.fileName, updatedAt: rec.updatedAt, batches: rec.batches };
  }
}
// Al abrir la pagina, recupera el paquete guardado antes en este navegador.
async function paqueteCargarGuardado(){
  let meta=null;
  try{ meta=JSON.parse(localStorage.getItem(PAQUETE_META_KEY)||'null'); }catch(e){ meta=null; }
  if(!meta || !Array.isArray(meta.keys)) return false;
  let encontradas=0;
  for(let i=0;i<meta.keys.length;i++){
    const key=meta.keys[i];
    try{
      const rec=await localGetRecord(key);
      if(rec && rec.rows && rec.rows.length){
        memoryStore.set(key, rec);
        state.loaded[key]={ rowCount: rec.rows.length, fileName: rec.fileName||'', updatedAt: rec.updatedAt||'', batches: rec.batches||null };
        encontradas++;
      }
    }catch(e){ /* ignorar */ }
  }
  return encontradas>0;
}

async function abrirPaqueteVisor(file){
  if(!file) return;
  let buffer;
  try{ buffer=await file.arrayBuffer(); }
  catch(err){ console.error(err); showToast('No se pudo leer el archivo: '+err.message,true); return; }
  await procesarPaquete(buffer);
}

/* Punto de entrada unico: recibe el contenido del paquete en bytes, reconoce si
   es el formato nuevo (binario) o uno de los antiguos (sobre JSON con base64) y
   lo abre en cualquiera de los dos casos. */
async function procesarPaquete(buffer){
  try{
    if(!(window.crypto && crypto.subtle)){
      showToast('Este navegador no permite abrir paquetes cifrados. Usa Chrome o Edge actualizado.',true); return;
    }
    const nuevo=paqueteLeerCabeceraBinaria(buffer);
    if(nuevo){
      if(nuevo.cabecera.app!==PAQUETE_APP_ID){
        showToast('Este archivo no es un paquete del Panel de Cargue.',true); return;
      }
      await procesarPaqueteBinario(nuevo.cabecera, nuevo.cifrado);
      return;
    }
    let texto;
    try{ texto=new TextDecoder().decode(buffer); }
    catch(e){ showToast('El archivo no es un paquete valido.',true); return; }
    await procesarPaqueteTexto(texto);
  }catch(err){
    console.error(err);
    showToast('No se pudo abrir el paquete: '+err.message,true);
  }
}

// Formato nuevo: se descifra y se van leyendo las filas linea por linea.
async function procesarPaqueteBinario(cabecera, cifrado){
  const pass=prompt('Contrasena del paquete (te la entrega el responsable del Panel de Cargue):');
  if(pass===null) return;
  showToast('Abriendo el paquete\u2026');
  await new Promise(r=>setTimeout(r,30));
  const clave=await paqueteDerivarClave(pass, base64ABytes(cabecera.salt), cabecera.iteraciones);
  let abierto;
  try{
    abierto=await crypto.subtle.decrypt({name:'AES-GCM', iv: base64ABytes(cabecera.iv)}, clave, cifrado);
  }catch(e){
    showToast('Contrasena incorrecta o paquete danado.',true); return;
  }
  let ficha=null;
  const datasets=[];
  let actual=0;
  // Avanza a la siguiente fuente que si tenga filas por leer.
  const acomodar=()=>{
    while(actual<datasets.length && datasets[actual].rows.length>=(datasets[actual].rowCount||0)) actual++;
  };
  try{
    await paqueteRecorrerNDJSON(new Uint8Array(abierto), !!cabecera.comprimido, (linea)=>{
      if(!ficha){
        ficha=JSON.parse(linea);
        (ficha.datasets||[]).forEach(d=>datasets.push(Object.assign({}, d, {rows:[]})));
        acomodar();
        return;
      }
      if(actual>=datasets.length) return;
      datasets[actual].rows.push(JSON.parse(linea));
      acomodar();
    });
  }catch(e){
    console.error(e);
    showToast('El paquete se descifro, pero no se pudo leer su contenido: '+e.message,true); return;
  }
  if(!ficha || !datasets.length){ showToast('El paquete no contiene datos.',true); return; }
  await paqueteAplicarBackup({
    generadoEn: ficha.generadoEn||'',
    totalFilas: ficha.totalFilas||datasets.reduce((a,b)=>a+b.rows.length,0),
    driveFiles: ficha.driveFiles||null,
    datasets
  });
}

// Formato antiguo (sobre JSON con textos base64): se mantiene para poder abrir
// los paquetes que ya se habian repartido.
async function procesarPaqueteTexto(texto){
  let sobre;
  try{ sobre=JSON.parse(texto); }catch(e){ showToast('El archivo no es un paquete valido.',true); return; }
  if(!sobre || sobre.app!==PAQUETE_APP_ID || !sobre.datos){
    showToast('Este archivo no es un paquete del Panel de Cargue.',true); return;
  }
  const pass=prompt('Contrasena del paquete (te la entrega el responsable del Panel de Cargue):');
  if(pass===null) return;
  showToast('Abriendo el paquete\u2026');
  await new Promise(r=>setTimeout(r,30));
  const clave=await paqueteDerivarClave(pass, base64ABytes(sobre.salt), sobre.iteraciones);
  let plano;
  try{
    const abierto=await crypto.subtle.decrypt({name:'AES-GCM', iv: base64ABytes(sobre.iv)}, clave, base64ABytes(sobre.datos));
    const bytes=new Uint8Array(abierto);
    plano = sobre.comprimido ? await paqueteDescomprimir(bytes) : new TextDecoder().decode(bytes);
  }catch(e){
    showToast('Contrasena incorrecta o paquete danado.',true); return;
  }
  const backup=JSON.parse(plano);
  if(!backup || !Array.isArray(backup.datasets) || !backup.datasets.length){
    showToast('El paquete no contiene datos.',true); return;
  }
  await paqueteAplicarBackup(backup);
}

// Pasos comunes a los dos formatos: guardar, recordar y calcular indicadores.
async function paqueteAplicarBackup(backup){
  try{
    // El visor es solo de consulta: se deja de escuchar la nube para que no
    // sobreescriba lo que trae el paquete.
    try{ stopFirestoreListener(); }catch(e){}
    await paqueteGuardarLocal(backup.datasets);
    try{
      localStorage.setItem(PAQUETE_META_KEY, JSON.stringify({
        generadoEn: backup.generadoEn||'', abiertoEn: new Date().toISOString(),
        fuentes: backup.datasets.length, totalFilas: backup.totalFilas||0,
        keys: backup.datasets.map(d=>d.key)
      }));
    }catch(e){ /* ignorar */ }
    if(backup.driveFiles){
      try{
        if(backup.driveFiles.inventario) localStorage.setItem('inventario_drive_files', JSON.stringify(backup.driveFiles.inventario));
        if(backup.driveFiles.reporte) localStorage.setItem('reporte_drive_files', JSON.stringify(backup.driveFiles.reporte));
        restoreDriveFileLists();
      }catch(e){ /* ignorar */ }
    }
    updateTopStatus();
    showToast('Paquete cargado: '+backup.datasets.length+' fuente(s) \u00b7 '+fmtInt(backup.totalFilas||0)+' filas. Calculando indicadores\u2026');
    try{
      if(typeof ensureFacturasData==='function') await ensureFacturasData();
      await calcularIndicadores();
      if(typeof renderInfoPorFactura==='function') renderInfoPorFactura();
    }catch(e){ console.warn(e); showToast('El paquete se cargo, pero no se pudieron calcular los indicadores: '+e.message,true); }
  }catch(err){
    console.error(err);
    showToast('No se pudo abrir el paquete: '+err.message,true);
  }
}

// Los dos botones (barra de filtros y pantalla vacia) usan el mismo selector oculto.
(function conectarBotonesPaquete(){
  const input=document.getElementById('inputPaquete');
  if(!input) return;
  const abrir=()=>{ input.value=''; input.click(); };
  const b1=document.getElementById('btnCargarPaquete');
  const b2=document.getElementById('btnCargarPaqueteVacio');
  if(b1) b1.addEventListener('click', abrir);
  if(b2) b2.addEventListener('click', abrir);
  input.addEventListener('change', e=>{ const f=e.target.files && e.target.files[0]; if(f) abrirPaqueteVisor(f); });
})();

/* =========================================================================
   Traer el paquete directamente de la carpeta de Google Drive
   La carpeta guarda un solo archivo (el mas reciente que envio el Panel de
   Cargue). Aqui solo se LEE: se descarga, se pide la contrasena y se
   muestran los indicadores. Nada se ve en pantalla hasta cargarlo.
   ========================================================================= */
const DRIVE_FOLDER_PAQUETE = '1RbpCEBkBSTXuschQBnG2olZ4SSoqP90Y'; // Resultados de los indicadores
const PAQUETE_DRIVE_SCOPES = 'https://www.googleapis.com/auth/drive.readonly';
const DRIVE_CLIENT_ID_STORAGE = 'drive_oauth_client_id';
let _pqToken=null, _pqTokenAt=0, _pqTokenClient=null, _pqTokenClientId='';

function pqLimpiarClientId(raw){
  let s=String(raw==null?'':raw).replace(/\s+/g,' ').trim();
  s=s.replace(/^["'\s]+|["',;\s]+$/g,'');
  const m=s.match(/[0-9][0-9A-Za-z._-]*\.apps\.googleusercontent\.com/);
  return m ? m[0] : s;
}
function pqClientIdValido(id){
  return /^[0-9][0-9A-Za-z._-]*\.apps\.googleusercontent\.com$/.test(String(id||'').trim());
}
function pqGetClientId(){
  try{ const g=localStorage.getItem(DRIVE_CLIENT_ID_STORAGE); if(g && g.trim()) return g.trim(); }catch(e){}
  return '';
}
function pqSetClientId(id){
  const limpio=pqLimpiarClientId(id);
  try{ if(limpio) localStorage.setItem(DRIVE_CLIENT_ID_STORAGE, limpio); else localStorage.removeItem(DRIVE_CLIENT_ID_STORAGE); }catch(e){}
  _pqTokenClient=null; _pqToken=null; _pqTokenAt=0;
  return limpio;
}
function pqOrigenActual(){ try{ return window.location.origin||'(origen desconocido)'; }catch(e){ return '(origen desconocido)'; } }
// Pide (una sola vez por navegador) el ID de cliente OAuth de Google.
function pqPedirClientId(){
  const ayuda='Pega el ID de cliente OAuth de Google que te entrego el administrador.\n\n'
    + 'Debe verse asi:  123456789012-abc123def456.apps.googleusercontent.com\n\n'
    + 'Es el mismo que se usa en el Panel de Cargue. En Google Cloud > Credenciales,\n'
    + 'en "Origenes autorizados de JavaScript" debe figurar exactamente:\n   ' + pqOrigenActual();
  let sug=pqGetClientId();
  for(let i=0;i<3;i++){
    const txt=window.prompt(ayuda, sug);
    if(txt===null) return '';
    const limpio=pqLimpiarClientId(txt);
    if(!limpio){ pqSetClientId(''); return ''; }
    if(pqClientIdValido(limpio)) return pqSetClientId(limpio);
    sug=limpio;
    window.alert('Ese ID no tiene el formato correcto: debe terminar en .apps.googleusercontent.com');
  }
  return '';
}
// Obtiene un token de solo lectura de Drive (reutiliza el vigente 45 minutos).
async function pqAutenticarDrive(forzar){
  if(!forzar && _pqToken && (Date.now()-_pqTokenAt) < 45*60*1000) return _pqToken;
  if(typeof google==='undefined' || !google.accounts || !google.accounts.oauth2) throw new Error('GIS_NOT_LOADED');
  let clientId=pqGetClientId();
  if(clientId && !pqClientIdValido(clientId)){ pqSetClientId(''); clientId=''; }
  if(!clientId) clientId=pqPedirClientId();
  if(!clientId) throw new Error('NO_CLIENT_ID');
  if(_pqTokenClient && _pqTokenClientId!==clientId) _pqTokenClient=null;
  let token;
  try{
    token=await new Promise((resolve,reject)=>{
      try{
        if(!_pqTokenClient){
          _pqTokenClient=google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: PAQUETE_DRIVE_SCOPES,
            callback:(resp)=>{
              if(resp && resp.access_token){ resolve(resp.access_token); return; }
              const e=new Error(resp && resp.error ? resp.error : 'OAUTH_NO_TOKEN');
              e.oauthDetail=(resp && (resp.error_description||resp.error))||'';
              reject(e);
            },
            error_callback:(err)=>{
              const tipo=(err && err.type)||'';
              if(tipo==='popup_closed'){ reject(new Error('POPUP_CLOSED')); return; }
              if(tipo==='popup_failed_to_open'){ reject(new Error('POPUP_BLOCKED')); return; }
              const e=new Error((err && err.message)||'OAUTH_ERROR'); e.oauthDetail=tipo; reject(e);
            }
          });
          _pqTokenClientId=clientId;
        }
        _pqTokenClient.requestAccessToken({ prompt: forzar ? 'consent' : '' });
      }catch(err){ reject(err); }
    });
  }catch(err){
    const texto=((err&&err.message)||'')+' '+((err&&err.oauthDetail)||'');
    if(/invalid_client|client was not found|unauthorized_client|deleted_client/i.test(texto)){
      pqSetClientId('');
      const e=new Error('INVALID_CLIENT'); e.oauthDetail=(err&&(err.oauthDetail||err.message))||''; throw e;
    }
    throw err;
  }
  _pqToken=token; _pqTokenAt=Date.now();
  return _pqToken;
}
// Lectura simple de la API de Drive con el detalle del error.
async function pqDriveFetch(url, token){
  let resp;
  try{ resp=await fetch(url, { headers:{ 'Authorization':'Bearer '+token } }); }
  catch(netErr){ const e=new Error('DRIVE_NETWORK'); e.driveDetail=(netErr&&netErr.message)||'fallo de red'; throw e; }
  if(!resp.ok){
    let detail='';
    try{ const j=await resp.json(); if(j && j.error) detail=j.error.message||j.error.status||''; }catch(e){}
    const e=new Error('DRIVE_HTTP_'+resp.status); e.httpStatus=resp.status; e.driveDetail=detail; throw e;
  }
  return resp;
}
// Traduce el fallo a un aviso entendible.
function pqDriveMensaje(err){
  const msg=(err&&err.message)||'', detail=(err&&err.driveDetail)||'';
  if(msg==='GIS_NOT_LOADED') return 'No se pudo cargar el acceso de Google. Revisa la conexion o el bloqueador de anuncios y recarga la pagina.';
  if(msg==='NO_CLIENT_ID') return 'Falta el ID de cliente OAuth de Google. Pide al administrador el ID que termina en .apps.googleusercontent.com y vuelve a intentarlo.';
  if(msg==='INVALID_CLIENT') return 'Google respondio "Acceso bloqueado / invalid_client": el ID de cliente no sirve para este sitio. El administrador debe agregar este origen en Google Cloud: '+pqOrigenActual();
  if(msg==='POPUP_BLOCKED') return 'El navegador bloqueo la ventana de Google. Permite las ventanas emergentes de este sitio e intenta de nuevo.';
  if(msg==='POPUP_CLOSED') return 'Se cerro la ventana de Google antes de terminar. Vuelve a intentarlo y acepta el permiso de lectura de Drive.';
  if(msg==='access_denied') return 'Se rechazo el permiso en la pantalla de Google. Vuelve a intentarlo y acepta "Ver tus archivos de Google Drive".';
  if(msg==='OAUTH_NO_TOKEN'||msg==='OAUTH_ERROR') return 'Google no devolvio un token de acceso. Vuelve a intentarlo y acepta el permiso de lectura de Drive.';
  if(err && err.httpStatus===401) return 'Google rechazo el acceso (401): la sesion expiro. Vuelve a pulsar el boton y acepta el permiso.';
  if(err && err.httpStatus===403) return 'Google Drive rechazo la peticion (403). Revisa que aceptaste el permiso de lectura y que la Drive API este habilitada. ['+(detail||'sin detalle')+']';
  if(err && err.httpStatus===404) return 'La carpeta de resultados no existe o tu cuenta no la ve (404). Pide al administrador que comparta la carpeta contigo.';
  if(err && err.httpStatus) return 'Error '+err.httpStatus+' de Google Drive. ['+(detail||'sin detalle')+']';
  if(msg==='DRIVE_NETWORK') return 'Error de red al contactar Google. Revisa la conexion, la VPN o el bloqueador de anuncios.';
  if(msg==='OAUTH_TIMEOUT') return 'El navegador no mostro la ventana de Google. Permite las ventanas emergentes de este sitio, recarga con Ctrl+F5 y vuelve a pulsar el boton.';
  if(msg==='LISTA_TIMEOUT') return 'Google Drive no respondio al revisar la carpeta de resultados. Revisa la conexion e intenta de nuevo.';
  if(msg==='DESCARGA_TIMEOUT') return 'La descarga del paquete tardo demasiado y se detuvo. Intenta de nuevo con una conexion mas estable.';
  if(msg==='CARPETA_VACIA') return 'La carpeta de resultados esta vacia: el responsable del Panel de Cargue todavia no ha enviado el paquete.';
  return 'No se pudo traer el paquete de la carpeta: '+(msg||'error desconocido')+(detail?' ['+detail+']':'');
}
// Corta la espera si Google no responde, para que el boton no se quede colgado.
function pqConTiempoLimite(promesa, ms, codigo){
  return new Promise((resolve,reject)=>{
    let listo=false;
    const t=setTimeout(()=>{ if(!listo){ listo=true; reject(new Error(codigo)); } }, ms);
    Promise.resolve(promesa).then(
      v=>{ if(!listo){ listo=true; clearTimeout(t); resolve(v); } },
      e=>{ if(!listo){ listo=true; clearTimeout(t); reject(e); } }
    );
  });
}
// Descarga el archivo mas reciente de la carpeta y lo abre.
async function traerPaqueteDeCarpetaDrive(){
  const botones=[document.getElementById('btnTraerDrive'), document.getElementById('btnTraerDriveVacio')].filter(Boolean);
  const textos=botones.map(b=>b.textContent);
  try{
    botones.forEach(b=>{ b.disabled=true; b.textContent='Buscando en la carpeta…'; });
    showToast('Conectando con Google Drive…');
    const token=await pqConTiempoLimite(pqAutenticarDrive(), 120000, 'OAUTH_TIMEOUT');
    const q="'"+DRIVE_FOLDER_PAQUETE+"' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'";
    const url='https://www.googleapis.com/drive/v3/files?q='+encodeURIComponent(q)
      + '&fields=files(id,name,mimeType,modifiedTime,size)'
      + '&orderBy=modifiedTime desc&pageSize=50'
      + '&supportsAllDrives=true&includeItemsFromAllDrives=true';
    const lista=await (await pqConTiempoLimite(pqDriveFetch(url, token), 45000, 'LISTA_TIMEOUT')).json();
    const archivos=(lista.files||[]);
    if(!archivos.length) throw new Error('CARPETA_VACIA');
    const archivo=archivos[0]; // la carpeta no es acumulativa: siempre el mas reciente
    botones.forEach(b=>{ b.textContent='Descargando…'; });
    showToast('Descargando el paquete de resultados…');
    const resp=await pqConTiempoLimite(pqDriveFetch('https://www.googleapis.com/drive/v3/files/'+archivo.id+'?alt=media&supportsAllDrives=true', token), 600000, 'DESCARGA_TIMEOUT');
    const buffer=await resp.arrayBuffer();
    await procesarPaquete(buffer);
  }catch(err){
    console.error(err);
    showToast(pqDriveMensaje(err), true);
  }finally{
    botones.forEach((b,i)=>{ b.disabled=false; b.textContent=textos[i]; });
  }
}
(function conectarBotonesDrivePaquete(){
  const b1=document.getElementById('btnTraerDrive');
  const b2=document.getElementById('btnTraerDriveVacio');
  if(b1) b1.addEventListener('click', traerPaqueteDeCarpetaDrive);
  if(b2) b2.addEventListener('click', traerPaqueteDeCarpetaDrive);
})();

function descargarArchivo(nombre, blob){
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 4000);
}
/* =========================================================================
   Descarga de listados MUY grandes: se arma un CSV separado por punto y coma
   (el que abre Excel en español) con BOM, para que las tildes se vean bien.
   Se usa como respaldo cuando el Excel no se puede generar por tamaño o
   porque la librería XLSX no cargó.
   ========================================================================= */
function filasACsv(filas){
  if(!filas || !filas.length) return '';
  const cols=Object.keys(filas[0]);
  const celda=v=>{
    if(v===null || v===undefined) return '';
    const s=String(v);
    return /[";\n\r]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
  };
  const partes=[cols.map(celda).join(';')];
  // Se arma por bloques para no crear una sola cadena gigante de golpe.
  const BLOQUE=5000;
  for(let i=0;i<filas.length;i+=BLOQUE){
    const trozo=[];
    for(let j=i;j<Math.min(i+BLOQUE, filas.length);j++){
      const f=filas[j];
      trozo.push(cols.map(c=>celda(f[c])).join(';'));
    }
    partes.push(trozo.join('\r\n'));
  }
  return '\uFEFF'+partes.join('\r\n')+'\r\n';
}
function descargarCsv(nombre, filas){
  descargarArchivo(nombre, new Blob([filasACsv(filas)], {type:'text/csv;charset=utf-8;'}));
}
// Límite prudente de filas por hoja de Excel en el navegador: por encima de esto
// se entrega CSV, que abre igual en Excel y no agota la memoria del equipo.
const MAX_FILAS_EXCEL=30000;
/* Descarga genérica de un informe: intenta Excel con varias hojas y, si la librería
   no cargó o el archivo es demasiado grande, entrega un CSV por hoja. Devuelve
   'xlsx' o 'csv' según lo que se haya descargado. */
function exportarInforme(nombreBase, hojas){
  const utiles=(hojas||[]).filter(h=>h && h.filas && h.filas.length);
  if(!utiles.length) return '';
  const grande=utiles.some(h=>h.filas.length>MAX_FILAS_EXCEL);
  const sinXlsx=(typeof XLSX==='undefined');
  if(!sinXlsx && !grande){
    try{
      const wb=XLSX.utils.book_new();
      utiles.forEach(h=>XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(h.filas), h.nombre.slice(0,31)));
      XLSX.writeFile(wb, nombreBase+'.xlsx');
      return 'xlsx';
    }catch(e){ /* si falla, se sigue por CSV */ }
  }
  utiles.forEach((h,i)=>{
    const nombre=nombreBase+(utiles.length>1 ? '_'+h.nombre.replace(/[^A-Za-z0-9]+/g,'_') : '')+'.csv';
    // Se separan las descargas en el tiempo para que el navegador no bloquee las siguientes.
    if(i===0) descargarCsv(nombre, h.filas);
    else setTimeout(()=>descargarCsv(nombre, h.filas), 900*i);
  });
  return 'csv';
}
/* =========================================================================
   Filtro de Bodega del visor: lista desplegable + búsqueda por texto.
   La lista tiene prioridad; si no hay bodega elegida se usa el texto escrito.
   ========================================================================= */
function getBodegaFiltro(){
  const sel=document.getElementById('fBodega');
  if(sel && sel.value) return normValue(sel.value);
  const inp=document.getElementById('fBodegaSearch');
  return normValue(inp? inp.value : '');
}
function getBodegaFiltroTexto(){
  const sel=document.getElementById('fBodega');
  if(sel && sel.value) return String(sel.value).trim();
  const inp=document.getElementById('fBodegaSearch');
  return String(inp? inp.value : '').trim();
}
function poblarSelectBodegas(rows){
  const sel=document.getElementById('fBodega');
  if(!sel) return;
  const previo=sel.value;
  const set=new Set();
  (rows||[]).forEach(r=>{ const b=String(r.bodegaDetalle||'').trim(); if(b) set.add(b); });
  const lista=Array.from(set).sort((a,b)=>a.localeCompare(b,'es'));
  sel.innerHTML='<option value="">Todas las bodegas</option>'+lista.map(b=>`<option value="${escHtml(b)}">${escHtml(b)}</option>`).join('');
  if(previo && lista.indexOf(previo)>=0) sel.value=previo;
}
/* =========================================================================
   7. Pipeline de cálculo
   ========================================================================= */
async function calcularIndicadores(){
  showToast('Cargando indicadores…');
  await new Promise(r=>setTimeout(r,30));
  try{
    const all=await idbGetAll();
    const byKey={}; all.forEach(r=>byKey[r.key]=r.rows);

    // ---- Tabla_4 Homólogo: Codigo->Homologo, Homologo->Molecula Pareto ----
    const codigoToHomologo=new Map();
    (byKey.homologo||[]).forEach(r=>{
      const cod=normValue(r.codigo);
      if(cod && !codigoToHomologo.has(cod)) codigoToHomologo.set(cod, normValue(r.homologo));
      // Llave suelta del mismo codigo (sin guiones ni ceros a la izquierda) para
      // cruzar las tablas Traslados y Facturas cuando lo escriben distinto.
      const ck=claveCodigo(r.codigo);
      if(ck && !codigoToHomologo.has(ck)) codigoToHomologo.set(ck, normValue(r.homologo));
    });
    // Homologo de un codigo cualquiera: primero exacto, luego por llave suelta.
    const homDeCod=(c)=>String(codigoToHomologo.get(normValue(c)) || codigoToHomologo.get(claveCodigo(c)) || '').trim();
    // Cruce DIRECTO Codigo -> Molecula Pareto (columna Codigo contra columna Molecula Pareto,
    // ambas dentro de la hoja Homologo — tal como se definió: "columna código y código de
    // articulo son iguales"). No se pasa por la columna Homologo para este dato.
    const codigoToParetoDirect=new Map();
    (byKey.homologo||[]).forEach(r=>{
      const cod=normValue(r.codigo);
      if(cod && !codigoToParetoDirect.has(cod)){
        const p=normValue(r.moleculaPareto);
        codigoToParetoDirect.set(cod, p==='PARETO'?'PARETO':(p==='NO PARETO'?'NO PARETO':'N/D'));
      }
    });
    // Codigo -> Descripción DCI (para el reporte de "Códigos a Comprar")
    const codigoToDescripcionDci=new Map();
    (byKey.homologo||[]).forEach(r=>{
      const cod=normValue(r.codigo);
      if(cod && !codigoToDescripcionDci.has(cod)) codigoToDescripcionDci.set(cod, String(r.descripcionDci||'').trim());
    });

    // ---- Tabla_5 Bodega y Zona ----
    const bodegaToZona=new Map();
    (byKey.bodegas||[]).forEach(r=>{
      const b=normValue(r.bodega);
      if(b && !bodegaToZona.has(b)) bodegaToZona.set(b, String(r.zona||'').trim() || 'N/D');
    });

    // ---- Tabla_7 Estado de la Molécula ----
    const agotadoMap=new Map();
    (byKey.agotados||[]).forEach(r=>{
      const cod=normValue(r.codigoArticulo);
      if(cod) agotadoMap.set(cod, normValue(r.estado));
    });
    // Resumen de la tabla Estado de la Molécula: sirve para avisar con claridad cuando la
    // descarga de Líneas Agotadas sale vacía (¿la tabla no se cargó? ¿no hay códigos agotados?).
    let _codigosAgotados=0;
    agotadoMap.forEach(v=>{ if(String(v||'').includes('AGOTAD')) _codigosAgotados++; });
    state.agotadosInfo={ filas:(byKey.agotados||[]).length, codigos:agotadoMap.size, agotados:_codigosAgotados };

    // ---- Tabla_2 Inventario del Punto: Codigo -> Homologo (via Tabla_4), luego Homologo|Bodega -> Unidades ----
    const invPuntoMap=new Map();
    const invBodegaPrincipal=new Map();
    const bodegasPrincipalSet=new Set(BODEGAS_PRINCIPAL.map(normValue));
    (byKey.inventario||[]).forEach(r=>{
      const cod=normValue(r.codigoArticulo);
      const hom=codigoToHomologo.get(cod) || '';
      const bod=normValue(r.bodegaDetalle);
      const un=toNumber(r.unidades);
      if(!hom) return;
      const k=hom+'|'+bod;
      invPuntoMap.set(k, (invPuntoMap.get(k)||0)+un);
      if(bodegasPrincipalSet.has(bod)) invBodegaPrincipal.set(hom, (invBodegaPrincipal.get(hom)||0)+un);
    });

    // ---- Tabla_1 Reporte de Dispensación: enriquecer ----
    const reporteRaw=byKey.reporte||[];
    if(!reporteRaw.length) throw new Error('No hay datos en Reporte de Dispensación.');

    const rows=reporteRaw.map((r,idx)=>{
      const codigoArticulo=normValue(r.codigoArticulo);
      const homologo=codigoToHomologo.get(codigoArticulo) || '';
      const moleculaPareto=codigoToParetoDirect.get(codigoArticulo) || 'N/D';
      const descripcionDci=codigoToDescripcionDci.get(codigoArticulo) || '';
      // Descripción tal como viene en el Reporte de Dispensación: se usa como respaldo
      // cuando el código no existe en la tabla Homólogo (código sin homologar).
      const descripcionReporte=String(r.descripcion||'').trim();
      const enHomologos=codigoToHomologo.has(codigoArticulo);
      const estado=agotadoMap.get(codigoArticulo) || 'DISPONIBLE';
      const unidades=toNumber(r.unidades);
      const cantidadAutorizada=toNumber(r.cantidadAutorizada);
      // "Diferencia" se toma directo del archivo si viene informada; si no, se calcula como
      // Unidades - Cantidad Autorizada (mismo criterio: negativo = línea pendiente).
      const diferenciaRaw = (r.diferencia!==undefined && r.diferencia!==null && String(r.diferencia).trim()!=='') ? toNumber(r.diferencia) : null;
      const diferencia = diferenciaRaw!==null ? diferenciaRaw : (unidades-cantidadAutorizada);
      const noMedicamento=esCodigoNoMedicamento(codigoArticulo, descripcionReporte);
      /* ENTREGADA = se entregó algo (Unidades > 0) y no quedó faltante (Diferencia = 0).
         Cualquier otro caso queda PENDIENTE: unidades en 0 (no se entregó nada) o
         diferencia distinta de 0 (faltó o sobró cantidad frente a lo autorizado).
         Los códigos que no son medicamento nunca generan pendiente.               */
      const lineaPendiente = noMedicamento ? 'NO' : ((unidades>0 && diferencia===0) ? 'NO':'SI');   // Linea pendiente
      const bodegaDetalle=String(r.bodegaDetalle||'').trim();
      const bodegaNorm=normValue(bodegaDetalle);
      const existenciaPunto=invPuntoMap.get(homologo+'|'+bodegaNorm) || 0;
      const existenciaBodega=invBodegaPrincipal.get(homologo) || 0;
      const sePuedeSubsanarPunto = Math.abs(diferencia) <= existenciaPunto ? 'SI':'NO';
      const sePuedeSubsanarBodega = Math.abs(diferencia) <= existenciaBodega ? 'SI':'NO';
      const soportes=toNumber(r.soportes);
      const tieneSoportes = soportes===0 ? 'NO TIENE SOPORTES':'TIENE SOPORTE';
      // Fecha del cargue en que entró la línea y fecha del cargue en que apareció el soporte
      // (solo si antes venía en 0). Se usan en el Reporte Comparativo Periódico.
      const fechaCargue=String(r._fechaCargue||'');
      const fechaSoporte=String(r._fechaSoporte||'');
      // Número consecutivo del cargue en que entró la línea y del cargue en que llegó su
      // soporte. Es el orden REAL de los cargues (1º, 2º, 3º...), sin depender de la fecha
      // del archivo: así dos cargues del mismo día siguen distinguiéndose entre sí.
      const secCargue=Number(r._secCargue)||0;
      const secSoporte=Number(r._secSoporte)||0;
      const documento=String(r.documento||'').trim();
      const contrato=normValue(r.contrato);
      const eps=corregirEps(r.eps);
      const epsGrupo=epsAGrupo(eps);
      const fecha=toDateSafe(r.fechaDispensacion);
      const estadoDispensa=normValue(r.estadoDispensa);
      const usuarioCreacion=String(r.usuarioCreacion||'').trim();
      const codigoCie10=String(r.codigoCie10||'').trim().toUpperCase();
      return {
        idx, documento, fecha, eps, epsGrupo, contrato, codigoArticulo, homologo, moleculaPareto, descripcionDci, estado,
        descripcionReporte, enHomologos,
        estadoDispensa, usuarioCreacion, codigoCie10,
        unidades, cantidadAutorizada, diferencia, lineaPendiente, noMedicamento, bodegaDetalle, bodegaNorm,
        zona: bodegaToZona.get(bodegaNorm) || 'N/D',
        existenciaPunto, existenciaBodega, sePuedeSubsanarPunto, sePuedeSubsanarBodega, tieneSoportes,
        fechaCargue, fechaSoporte, secCargue, secSoporte
      };
    });

    // ---- Número de ocurrencia de la línea dentro de su propio cargue -----------
    // Un mismo documento puede traer legítimamente DOS o más filas del mismo artículo
    // en la misma bodega (por ejemplo dos renglones del mismo medicamento). Si solo se
    // identificara la línea por documento + bodega + artículo, esas filas se confundirían
    // entre sí y el tablero contaría una sola. Para evitarlo se numera cada repetición
    // (1ª, 2ª, 3ª...) DENTRO DEL MISMO CARGUE.
    // El orden de esa numeración NO es el orden en que vienen las filas en el archivo,
    // porque de un cargue a otro las filas pueden venir en otro orden o con cantidades
    // distintas. Se ordena por la CANTIDAD AUTORIZADA, que es el dato que no cambia
    // cuando la línea se entrega (lo que cambia son las unidades entregadas y la
    // diferencia). Así la línea autorizada por 2 unidades que llegó pendiente (0 de 2)
    // se compara con la MISMA línea autorizada por 2 que después llegó entregada (2 de 2),
    // y el tablero la reconoce como entregada (recuperada) en vez de contarla como una
    // línea nueva.
    {
      const gruposPorCargue=new Map();
      rows.forEach(r=>{
        // Se identifica el cargue por su NÚMERO consecutivo (orden real de los cargues) y,
        // si el acumulado es antiguo y no lo trae, por la fecha del cargue. Usar el número
        // evita que dos cargues subidos el mismo día se mezclen en uno solo.
        const cargue = r.secCargue ? 'S'+r.secCargue : String(r.fechaCargue||'');
        // Si la fila no trae ninguna marca de cargue (acumulados guardados antes de incluir
        // esas columnas) no hay forma de saber a qué cargue pertenece: en ese caso se deja
        // como repetición 1 para no partir por error las versiones de una misma línea.
        if(!cargue){ r.ocurrenciaLinea=1; return; }
        const k=cargue+'#'+r.documento+'|'+r.bodegaNorm+'|'+r.codigoArticulo;
        if(!gruposPorCargue.has(k)) gruposPorCargue.set(k, []);
        gruposPorCargue.get(k).push(r);
      });
      gruposPorCargue.forEach(grupo=>{
        // Una sola fila: no hay repeticiones que numerar.
        if(grupo.length===1){ grupo[0].ocurrenciaLinea=1; return; }
        grupo.sort((a,b)=> (a.cantidadAutorizada-b.cantidadAutorizada) || (a.idx-b.idx));
        grupo.forEach((r,i)=>{ r.ocurrenciaLinea=i+1; });
      });
    }

    // ---- Versión VIGENTE de cada línea ----------------------------------------
    // Cada recargue del Reporte de Dispensación vuelve a traer la línea con su estado
    // actualizado, así que la misma línea (documento + bodega + artículo + nº de
    // repetición dentro del cargue) puede tener varias versiones guardadas.
    // Marcamos como VIGENTE la última versión cargada:
    // el recargue REEMPLAZA el estado de la versión anterior. Las versiones superadas
    // se conservan (el Reporte Comparativo las necesita para medir el avance por corte),
    // pero no deben sumar en los indicadores ni en el seguimiento del estado actual.
    {
      const ultimaPorLinea=new Map();
      rows.forEach(r=>{
        const k=claveLineaCargue(r);
        const prev=ultimaPorLinea.get(k);
        if(!prev || esVersionPosterior(r, prev)) ultimaPorLinea.set(k, r);
      });
      rows.forEach(r=>{ r.versionVigente = (ultimaPorLinea.get(claveLineaCargue(r))===r); });
    }

    /* Pendiente por DISPENSA. Una dispensa se identifica por Documento + Bodega: el mismo
       documento atendido en dos puntos son dos dispensas distintas.
       La dispensa solo está ENTREGADA si TODAS sus líneas están entregadas; basta una
       línea pendiente para que toda la dispensa quede pendiente.
       Solo cuentan las versiones vigentes: una línea que ya llegó entregada en un
       recargue posterior no puede seguir dejando la dispensa como pendiente.       */
    const docPendMap=new Map();
    rows.forEach(r=>{
      if(!r.documento || !r.versionVigente) return;
      const k=claveDocBodega(r);
      if(r.lineaPendiente==='SI') docPendMap.set(k,true);
      else if(!docPendMap.has(k)) docPendMap.set(k,false);
    });
    rows.forEach(r=>{
      r.pendienteDispensa = r.documento ? (docPendMap.get(claveDocBodega(r)) ? 'SI':'NO') : r.lineaPendiente;
      r.dispensaYPunto = r.bodegaDetalle + '||' + (r.documento || ('_R'+r.idx));   // Dispensa y Punto
    });

    // El estado vigente de cada línea sale del propio cargue acumulativo del Reporte de
    // Dispensación: cada cargue trae de nuevo la línea con su estado actualizado, por lo que
    // los avances se calculan comparando versiones (ver snapshotHastaCorte / buildCorteMetrics).

    const contratos=Array.from(new Set(rows.map(r=>r.contrato).filter(Boolean))).sort();
    const epsFromReporte=new Set(rows.map(r=>r.eps).filter(Boolean));
    (byKey.sigla||[]).forEach(r=>{ const s=String(r.sigla||'').trim(); if(s) epsFromReporte.add(s); });
    const epsList=Array.from(epsFromReporte).sort();
    const epsGrupos=Array.from(new Set(rows.map(r=>r.epsGrupo).filter(Boolean))).sort();
    const cie10List=Array.from(new Set(rows.map(r=>r.codigoCie10).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'es'));
    const zonas=Array.from(new Set(rows.map(r=>r.zona).filter(Boolean))).sort();
    const fechas=rows.map(r=>r.fecha).filter(Boolean);
    // Se recorre con un bucle en vez de Math.min(...fechas): con cientos de miles de filas
    // acumuladas el operador de propagacion desborda la pila ("Maximum call stack size exceeded").
    let minTs=null, maxTs=null;
    for(let i=0;i<fechas.length;i++){
      const t=fechas[i] instanceof Date ? fechas[i].getTime() : new Date(fechas[i]).getTime();
      if(!isFinite(t)) continue;
      if(minTs===null||t<minTs) minTs=t;
      if(maxTs===null||t>maxTs) maxTs=t;
    }
    const minFecha = minTs===null ? null : new Date(minTs);
    const maxFecha = maxTs===null ? null : new Date(maxTs);

    // ---- Diagnóstico del cruce con Homólogo (para detectar de inmediato si el problema
    //      es de encabezados o de valores, en vez de mostrar 0 en silencio) ----
    const codigosReporteUnicos = new Set(rows.map(r=>r.codigoArticulo).filter(Boolean));
    const codigosFaltantes = Array.from(codigosReporteUnicos).filter(c=>!codigoToParetoDirect.has(c));
    const homologoFilasValidas = (byKey.homologo||[]).filter(r=>normValue(r.codigo)).length;
    const diag = {
      homologoFilasCargadas: (byKey.homologo||[]).length,
      homologoFilasConCodigo: homologoFilasValidas,
      reporteFilas: rows.length,
      reporteConPareto: rows.filter(r=>r.moleculaPareto==='PARETO'||r.moleculaPareto==='NO PARETO').length,
      codigosUnicosReporte: codigosReporteUnicos.size,
      codigosSinHomologo: codigosFaltantes.length,
      ejemplosSinHomologo: codigosFaltantes.slice(0,6),
    };
    state.diag = diag;
    renderDiagPanel(diag);

    // ¿Hay al menos dos cargues distintos del Reporte de Dispensación? Solo así tiene
    // sentido el comparativo periódico (cargue contra cargue).
    const cargues = new Set(rows.map(r=>r.fechaCargue).filter(Boolean));
    const hasCargues = cargues.size > 0;
    // ---- Tabla_8 Traslados: cruce del Codigo con la tabla Homólogo (Pareto / No Pareto) ----
    const trasladosRaw = byKey.traslados || [];
    const trasladosRows = trasladosRaw.map(r=>{
      const codigo = normValue(r.codigo);
      const p = codigoToParetoDirect.get(codigo) || 'N/D';
      return {
        traslado: String(r.traslado||'').trim(),
        fecha: toDateSafe(r.fecha),
        bodegaOrigen: String(r.bodegaOrigen||'').trim(),
        bodegaDestino: String(r.bodegaDestino||'').trim(),
        codigo,
        descripcion: String(r.descripcion||'').trim() || (codigoToDescripcionDci.get(codigo) || ''),
        cantidad: toNumber(r.cantidad),
        // Texto original de la columna "Recibido" y bandera derivada: si el valor
        // empieza por "N" (No Recibido / NO RECIBIDA) la línea sigue pendiente.
        recibido: String(r.recibido||'').trim(),
        // Estado normalizado: 'RECIBIDO', 'PENDIENTE' o '' (sin dato).
        estadoRecibido: estadoTraslado(r.recibido),
        noRecibido: esTrasladoNoRecibido(r.recibido),
        // Homologo del codigo trasladado (tabla Homologo): permite llevar las
        // unidades en camino al mismo homologo de la Tabla 1 de supervisores.
        homologo: homDeCod(codigo),
        usuario: String(r.usuario||'').trim() || 'SIN USUARIO',
        moleculaPareto: p,
        // Zona de la bodega DESTINO (tabla Bodega y Zona). Permite agrupar y filtrar
        // los traslados recibidos por zona.
        zonaDestino: bodegaToZona.get(normValue(r.bodegaDestino)) || 'N/D'
      };
    });
    const trasladosOrigenes = Array.from(new Set(trasladosRows.map(r=>r.bodegaOrigen).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'es'));
    const trasladosDestinos = Array.from(new Set(trasladosRows.map(r=>r.bodegaDestino).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'es'));
    const trasladosZonas = Array.from(new Set(trasladosRows.filter(r=>r.bodegaDestino).map(r=>r.zonaDestino))).sort((a,b)=>a.localeCompare(b,'es'));

    // ---- Tabla_9 Facturas: cruce del Codigo con la tabla Homólogo (homologado / no homologado) ----
    const facturasRaw = byKey.facturas || [];
    const facturasRows = facturasRaw.map(r=>{
      const codigo = normValue(r.codigo);
      const hom = homDeCod(codigo);
      return {
        fechaFactura: toDateSafe(r.fechaFactura),
        factura: String(r.factura||'').trim(),
        codigo,
        descripcion: String(r.descripcion||'').trim() || (codigoToDescripcionDci.get(codigo) || ''),
        // Descripción DCI tomada de la tabla Homólogo (según el código facturado).
        descripcionDci: codigoToDescripcionDci.get(codigo) || '',
        cantidad: toNumber(r.cantidad),
        puntoVenta: String(r.puntoVenta||'').trim() || 'SIN PUNTO DE VENTA',
        homologo: hom,
        tieneHomologo: !!homDeCod(codigo)
      };
    });
    const facturasPuntos = Array.from(new Set(facturasRows.map(r=>r.puntoVenta).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'es'));

    state.processed={rows, contratos, epsList, epsGrupos, cie10List, zonas, minFecha, maxFecha, hasCargues, traslados:trasladosRows, trasladosOrigenes, trasladosDestinos, trasladosZonas, facturas:facturasRows, facturasPuntos};
    populateFilters();
    populateTrasladosFilters();
    populateFacturasFilters();
    aplicarFiltrosYRenderizar();
    document.getElementById('resCount').textContent=fmtInt(rows.length);
    /* el visor siempre está en la vista de resultados */
    showToast('Indicadores calculados sobre '+fmtInt(rows.length)+' filas.');
  }catch(err){
    console.error(err); showToast('Error calculando indicadores: '+err.message, true);
  }finally{
    /* sin botón de cálculo en el visor */
  }
}
/* El cálculo se dispara automáticamente al recibir datos de la nube. */

/* =========================================================================
   8. Filtros (fecha / contrato / EPS) + sub-filtros (bodega / zona)
   ========================================================================= */
function populateFilters(){
  const p=state.processed;
  document.getElementById('filtersBar').style.display='flex';
  document.getElementById('subfiltersBar').style.display='flex';
  const selC=document.getElementById('fContrato'); const selE=document.getElementById('fEps'); const selZ=document.getElementById('fZona'); const selEG=document.getElementById('fEpsGrupo');
  buildCie10Multi(p.cie10List||[]);
  selC.innerHTML='<option value="">Todos</option>'+p.contratos.map(c=>`<option value="${c}">${c}</option>`).join('');
  selE.innerHTML='<option value="">Todos</option>'+p.epsList.map(c=>`<option value="${c}">${c}</option>`).join('');
  selEG.innerHTML='<option value="">Todas</option>'+p.epsGrupos.map(c=>`<option value="${c}">${c}</option>`).join('');
  selZ.innerHTML='<option value="">Todas las zonas</option>'+p.zonas.map(z=>`<option value="${z}">${z}</option>`).join('');
  // Filtro por mes: se arman las opciones con los meses realmente presentes en el reporte.
  const selM=document.getElementById('fMes');
  if(selM){
    const mesesSet=new Set();
    for(let i=0;i<p.rows.length;i++){ const k=mesKey(p.rows[i].fecha); if(k) mesesSet.add(k); }
    const meses=Array.from(mesesSet).sort();
    const prevMes=selM.value;
    selM.innerHTML='<option value="">Todos</option>'+meses.map(k=>`<option value="${k}">${escHtml(mesLabel(k))}</option>`).join('');
    selM.value = meses.indexOf(prevMes)>=0 ? prevMes : '';
  }
  poblarSelectBodegas(p.rows);
  if(p.minFecha) document.getElementById('fFechaDesde').value=dateToISO(p.minFecha);
  if(p.maxFecha) document.getElementById('fFechaHasta').value=dateToISO(p.maxFecha);
}
document.getElementById('btnAplicarFiltro').addEventListener('click', aplicarFiltrosYRenderizar);
// Corte global: define hasta qué corte del mes se considera la información cargada.
// Afecta las columnas de totales, el gráfico de cumplimiento y el Reporte Comparativo.
function getCorteGlobal(){
  const el=document.getElementById('fCorte');
  const v=el? +el.value : 3;
  return (v>=1 && v<=3) ? v : 3;
}
document.getElementById('fCorte').addEventListener('change', ()=>{
  _segLastCorte = getCorteGlobal();
  aplicarFiltrosYRenderizar();
  const modal=document.getElementById('periodicModal');
  if(modal && modal.classList.contains('show')) renderReportePeriodico();
});
// Espejo del filtro de corte dentro de la vista Seguimiento por Bodega:
// cambiarlo equivale a cambiar el filtro de la barra superior.
(function(){
  const mirror=document.getElementById('segCorteGlobal');
  if(!mirror) return;
  mirror.addEventListener('change', ()=>{
    const el=document.getElementById('fCorte');
    if(el){ el.value=mirror.value; el.dispatchEvent(new Event('change')); }
  });
})();
// Se aplica automáticamente también al cambiar cualquiera de los campos (no solo con el botón),
['fMes','fFechaDesde','fFechaHasta','fContrato','fEps','fEpsGrupo'].forEach(id=>{
  const el=document.getElementById(id);
  if(el) el.addEventListener('change', aplicarFiltrosYRenderizar);
});

/* ---- Filtro Diagnóstico con selección múltiple (checkboxes) ---- */
let cie10Seleccionados=new Set();
function buildCie10Multi(list){
  const cont=document.getElementById('fCie10List');
  cie10Seleccionados=new Set();
  cont.innerHTML = list.length
    ? list.map((c,i)=>'<label><input type="checkbox" value="'+escHtml(c)+'"><span>'+escHtml(c)+'</span></label>').join('')
    : '<div class="ms-empty">Sin diagnósticos disponibles.</div>';
  cont.querySelectorAll('input[type=checkbox]').forEach(chk=>{
    chk.addEventListener('change', ()=>{
      if(chk.checked) cie10Seleccionados.add(chk.value); else cie10Seleccionados.delete(chk.value);
      actualizarEtiquetaCie10();
      aplicarFiltrosYRenderizar();
    });
  });
  actualizarEtiquetaCie10();
}
function actualizarEtiquetaCie10(){
  const btn=document.getElementById('fCie10Toggle');
  if(!btn) return;
  const n=cie10Seleccionados.size;
  if(n===0){ btn.textContent='Todos'; return; }
  if(n===1){ btn.textContent=Array.from(cie10Seleccionados)[0]; return; }
  btn.textContent=n+' diagnósticos seleccionados';
}
function limpiarCie10(){
  cie10Seleccionados=new Set();
  document.querySelectorAll('#fCie10List input[type=checkbox]').forEach(c=>{c.checked=false;});
  actualizarEtiquetaCie10();
}
(function initCie10Multi(){
  const wrap=document.getElementById('fCie10Wrap');
  const toggle=document.getElementById('fCie10Toggle');
  if(!wrap||!toggle) return;
  toggle.addEventListener('click', e=>{ e.stopPropagation(); wrap.classList.toggle('open'); });
  wrap.addEventListener('click', e=>e.stopPropagation());
  document.addEventListener('click', ()=>wrap.classList.remove('open'));
  document.getElementById('fCie10Search').addEventListener('input', function(){
    const q=normValue(this.value);
    document.querySelectorAll('#fCie10List label').forEach(l=>{
      l.style.display = (!q || normValue(l.textContent).includes(q)) ? 'flex' : 'none';
    });
  });
  document.getElementById('fCie10All').addEventListener('click', ()=>{
    document.querySelectorAll('#fCie10List label').forEach(l=>{
      if(l.style.display==='none') return;
      const chk=l.querySelector('input'); chk.checked=true; cie10Seleccionados.add(chk.value);
    });
    actualizarEtiquetaCie10(); aplicarFiltrosYRenderizar();
  });
  document.getElementById('fCie10None').addEventListener('click', ()=>{ limpiarCie10(); aplicarFiltrosYRenderizar(); });
})();
document.getElementById('btnLimpiarFiltro').addEventListener('click', ()=>{
  document.getElementById('fFechaDesde').value = state.processed.minFecha ? dateToISO(state.processed.minFecha):'';
  document.getElementById('fFechaHasta').value = state.processed.maxFecha ? dateToISO(state.processed.maxFecha):'';
  document.getElementById('fContrato').value=''; document.getElementById('fEps').value=''; document.getElementById('fEpsGrupo').value=''; limpiarCie10();
  const selMesLimpiar=document.getElementById('fMes'); if(selMesLimpiar) selMesLimpiar.value='';
  document.getElementById('fBodegaSearch').value=''; document.getElementById('fBodega').value=''; document.getElementById('fZona').value='';
  aplicarFiltrosYRenderizar();
});
document.getElementById('fBodegaSearch').addEventListener('input', renderAllTablesFromCache);
document.getElementById('fBodega').addEventListener('change', renderAllTablesFromCache);
document.getElementById('fZona').addEventListener('change', renderAllTablesFromCache);
// Selector de usuario de la tabla de dispensas inactivas: solo re-dibuja esa vista
document.getElementById('fInactivasUsuario').addEventListener('change', ()=>{
  if(!filteredRowsCache.length) return;
  const bodegaSearch = getBodegaFiltro();
  const zona = document.getElementById('fZona').value;
  renderIndicadorInactivas(filteredRowsCache.filter(r=>r.versionVigente!==false), bodegaSearch, zona);
});

let filteredRowsCache=[];

function aplicarFiltrosYRenderizar(){
  const p=state.processed; if(!p) return;
  const desdeStr=document.getElementById('fFechaDesde').value;
  const hastaStr=document.getElementById('fFechaHasta').value;
  const desde=desdeStr? new Date(desdeStr+'T00:00:00Z'):null;
  const hasta=hastaStr? new Date(hastaStr+'T23:59:59Z'):null;
  const contrato=document.getElementById('fContrato').value;
  const eps=document.getElementById('fEps').value;
  const epsGrupo=document.getElementById('fEpsGrupo').value;
  const selMes=document.getElementById('fMes');
  const mesSel=selMes? selMes.value : '';
  const cie10Sel=cie10Seleccionados;

  filteredRowsCache = p.rows.filter(r=>{
    if(mesSel && mesKey(r.fecha)!==mesSel) return false;
    if(desde && r.fecha && r.fecha<desde) return false;
    if(hasta && r.fecha && r.fecha>hasta) return false;
    if(contrato && r.contrato!==contrato) return false;
    if(eps && r.eps!==eps) return false;
    if(epsGrupo && r.epsGrupo!==epsGrupo) return false;
    if(cie10Sel.size && !cie10Sel.has(r.codigoCie10)) return false;
    return true;
  });

  renderAllTablesFromCache();
  document.getElementById('resultadosEmpty').style.display='none';
  document.getElementById('resultadosBody').style.display='block';
}
function showEmptyResults(){
  document.getElementById('filtersBar').style.display='none';
  document.getElementById('subfiltersBar').style.display='none';
  document.getElementById('diagPanel').style.display='none';
  document.getElementById('resultadosEmpty').style.display='block';
  document.getElementById('resultadosBody').style.display='none';
  document.getElementById('resCount').textContent='—';
}

/* =========================================================================
   Seguimiento de Dispensación agrupada por Bodega (cargue vs cargue)
   ========================================================================= */
let _segLastCorte = 3;

function renderSeguimientoBodega(rowsAll, bodegaSearch, zona){
  const hayDatos = !!(state.processed && state.processed.rows && state.processed.rows.length);
  const secEl  = document.getElementById('seguimientoSection');
  const noAvEl = document.getElementById('segNoDatos');
  const conEl  = document.getElementById('segContent');
  secEl.style.display = '';               // always show the section
  if(!hayDatos){
    noAvEl.style.display = '';
    conEl.style.display  = 'none';
    return;
  }
  noAvEl.style.display = 'none';
  conEl.style.display  = '';

  // Apply filters
  const filtered = rowsAll.filter(r => {
    if(bodegaSearch && !normValue(r.bodegaDetalle).includes(bodegaSearch)) return false;
    if(zona && r.zona !== zona) return false;
    return true;
  });

  const NUM_CORTES = 3;

  // Build per-bodega, per-corte metrics
  const cmAll = buildCorteMetrics(filtered); // returns {1:[...], 2:[...], 3:[...]}
  // Cortes que de verdad tuvieron dispensaciones (por fecha de dispensación). Un corte
  // sin dispensaciones queda en cero (“—”) y no repite las cifras del corte anterior.
  const cortesActivos = cortesConCargue(filtered);
  const hayCargues = cortesActivos.size > 0;
  const DASH = '—';
  const tdVacio = '<td class="num" style="color:#9CA9B6;" title="Corte sin dispensaciones: no hubo dispensaciones en estas fechas">' + DASH + '</td>';
  const tdSinCambio = '<td class="num" style="color:#9CA9B6;" title="Sin cambios frente al corte anterior: esta bodega no presentó movimientos nuevos en este corte">' + DASH + '</td>';
  const tdFuera = '<td class="num" style="color:#C3CCD6;" title="Corte posterior al corte global seleccionado en los filtros">' + DASH + '</td>';
  // Collect unique bodegas from all cortes
  const bodegaSet = new Set();
  [1,2,3].forEach(c => (cmAll[c]||[]).forEach(bm => bodegaSet.add(bm.bodega)));
  const bodegas = Array.from(bodegaSet).sort((a,b) => a.localeCompare(b,'es'));

  // Build a lookup: bodegaMetrics[bodega][corte] = {docsTotal, docsEnt, docsPend, ...}
  const bodegaMetrics = {};
  bodegas.forEach(b => { bodegaMetrics[b] = {}; });
  [0,1,2,3].forEach(c => {
    (cmAll[c]||[]).forEach(bm => { if(bodegaMetrics[bm.bodega]) bodegaMetrics[bm.bodega][c] = bm; });
  });
  // Ordenar bodegas ESTRICTAMENTE por Índice de Pendientes (mayor a menor).
  // Se usa la misma fórmula que la celda "Índice de Pendientes" (corte 3 = acumulado final):
  // Índice = Pendientes totales / Documentos totales. Desempate: más pendientes primero,
  // luego orden alfabético para que el resultado sea estable.
  const corteGlobalSeg = getCorteGlobal();
  const corteFinalSeg = corteVigenteHasta(cortesActivos, corteGlobalSeg);
  const cortePrevSeg  = corteFinalSeg>0 ? corteVigenteHasta(cortesActivos, corteFinalSeg-1) : 0;
  const hayPrevSeg    = corteFinalSeg>0;
  const tituloPrevSeg = cortePrevSeg===0 ? 'estado inicial (línea base)' : 'corte '+cortePrevSeg;
  // Celda con dos cifras: estado del corte seleccionado (negro) y el del corte anterior (gris).
  const celdaDoble = (act, ant) => (act===ant
      ? '<td class="num" title="Sin cambios frente al ' + tituloPrevSeg + '">' + fmtInt(act) + '</td>'
      : '<td class="num" title="Actual: corte '+corteFinalSeg+' · Anterior: '+tituloPrevSeg+'">'
        + fmtInt(act)
        + (hayPrevSeg ? '<span style="color:#9CA9B6;font-weight:500;"> · ' + fmtInt(ant) + '</span>' : '')
        + '</td>');
  const mirrorEl = document.getElementById('segCorteGlobal');
  if(mirrorEl) mirrorEl.value = String(corteGlobalSeg);
  const infoEl = document.getElementById('segCorteGlobalInfo');
  if(infoEl) infoEl.textContent = 'Las columnas por corte solo muestran cifras cuando la bodega tuvo cambios reales; si no hubo cambios frente al estado anterior aparece “—”.';
  const _idxPend = (b) => {
    const m = bodegaMetrics[b][corteFinalSeg] || {docsTotal:0, docsEnt:0, docsPend:0};
    const tot = m.docsTotal !== undefined ? m.docsTotal : (m.docsEnt + m.docsPend);
    return tot ? m.docsPend / tot : 0;
  };
  bodegas.sort((a,b) => {
    const d = _idxPend(b) - _idxPend(a);
    if(Math.abs(d) > 1e-12) return d;
    const pa = (bodegaMetrics[a][corteFinalSeg]||{docsPend:0}).docsPend || 0;
    const pb = (bodegaMetrics[b][corteFinalSeg]||{docsPend:0}).docsPend || 0;
    if(pb !== pa) return pb - pa;
    return a.localeCompare(b,'es');
  });

  // Compute totals row per corte
  const totRow = {};
  for(let c=0; c<=NUM_CORTES; c++){
    let dT=0,dE=0,dP=0;
    if(c===0 || cortesActivos.has(c)){
      bodegas.forEach(b => {
        const cd = bodegaMetrics[b][c];
        if(cd){ dT+=cd.docsTotal; dE+=cd.docsEnt; dP+=cd.docsPend; }
      });
    }
    totRow[c] = { docsTotal:dT, docsEnt:dE, docsPend:dP, sinCargue: c>0 && !cortesActivos.has(c) };
  }

  // Populate corte selector
  const selEl = document.getElementById('segCorteSelect');
  const prevVal = selEl.value;
  selEl.innerHTML = '';
  for(let c=1; c<=corteGlobalSeg; c++){
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = 'Corte ' + c + (cortesActivos.has(c) ? '' : ' (sin dispensaciones)');
    selEl.appendChild(opt);
  }
  const ultimoActivo = [3,2,1].find(c => cortesActivos.has(c) && c<=corteGlobalSeg) || corteGlobalSeg;
  selEl.value = (cortesActivos.has(corteGlobalSeg) ? corteGlobalSeg : ultimoActivo);

  // Render donut for selected corte
  function drawSegDonut(){
    const c = +selEl.value;
    _segLastCorte = c;
    const sinCargue = !cortesActivos.has(c);
    const tData = totRow[c] || {docsEnt:0, docsPend:0};
    const ent = sinCargue ? 0 : tData.docsEnt;
    const pen = sinCargue ? 0 : tData.docsPend;
    const tot = ent + pen;
    if(sinCargue){
      drawDonut('segDonut', [{ label:'', value:1, color:'#E8EEF4' }], DASH, '#9CA9B6');
      document.getElementById('segDonutLegend').innerHTML =
        '<div class="item" style="color:#9CA9B6;">Corte ' + c + ' sin dispensaciones<span class="val">' + DASH + '</span></div>'
        + '<div class="item" style="color:#9CA9B6;font-size:11.5px;">No se registran dispensaciones en estas fechas; el corte se actualizará cuando haya dispensaciones.</div>';
      return;
    }
    drawDonut('segDonut', [
      { label: 'Entregadas', value: ent, color: '#1E8F5E' },
      { label: 'Pendientes', value: pen, color: '#D98A2B' }
    ], fmtPct(tot ? ent/tot : null));
    document.getElementById('segDonutLegend').innerHTML = `
      <div class="item"><span class="sw" style="background:#1E8F5E;"></span>Entregadas<span class="val">${fmtInt(ent)}</span></div>
      <div class="item"><span class="sw" style="background:#D98A2B;"></span>Pendientes<span class="val">${fmtInt(pen)}</span></div>`;
  }
  drawSegDonut();
  selEl.onchange = drawSegDonut;

  // ¿En qué cortes hubo realmente cambios? Se compara cada corte con el estado anterior
  // de la MISMA bodega (partiendo de la línea base). Si no hay cambio no se muestran cifras.
  const cambioPorBodega = {};
  const corteConCambio = {};
  bodegas.forEach(b => {
    cambioPorBodega[b] = {};
    let ref = bodegaMetrics[b][0] || null;
    for(let c=1; c<=NUM_CORTES; c++){
      if(c>corteGlobalSeg || !cortesActivos.has(c)) continue;
      const cd = bodegaMetrics[b][c] || {docsEnt:0,docsPend:0};
      const cambio = !(ref && ref.docsEnt===cd.docsEnt && ref.docsPend===cd.docsPend);
      cambioPorBodega[b][c] = cambio;
      if(cambio) corteConCambio[c] = true;
      ref = cd;
    }
  });

  // Build table
  // Header: Bodega | Entregas totales | Pendientes totales | Entregas Corte 1 | Pendientes Corte 1 | ...
  let hHtml = '<tr><th rowspan="2">Bodega</th><th rowspan="2">Entregas totales<br><span style="font-weight:600;font-size:10.5px;color:#9CA9B6;">actual · anterior</span></th><th rowspan="2">Pendientes totales<br><span style="font-weight:600;font-size:10.5px;color:#9CA9B6;">actual · anterior</span></th><th rowspan="2">Índice de Pendientes</th>';
  for(let c=1; c<=NUM_CORTES; c++){
    if(c>corteGlobalSeg) hHtml += '<th colspan="2" style="color:#C3CCD6;">Corte ' + c + '</th>';
    else if(cortesActivos.has(c) && !corteConCambio[c]) hHtml += '<th colspan="2" style="color:#9CA9B6;">Corte ' + c + ' <span style="font-weight:600;">· sin cambios</span></th>';
    else hHtml += '<th colspan="2">Corte ' + c + '</th>';
  }
  void 0;
  hHtml += '</tr><tr>';
  for(let c=1; c<=NUM_CORTES; c++){
    if(c>corteGlobalSeg) hHtml += '<th style="color:#C3CCD6;">Fuera del corte</th><th style="color:#C3CCD6;">Fuera del corte</th>';
    else if(cortesActivos.has(c) && !corteConCambio[c]) hHtml += '<th style="color:#9CA9B6;">Sin cambios</th><th style="color:#9CA9B6;">Sin cambios</th>';
    else if(cortesActivos.has(c)) hHtml += '<th>Entregas</th><th>Pendientes</th>';
    else hHtml += '<th style="color:#9CA9B6;">Sin dispensaciones</th><th style="color:#9CA9B6;">Sin dispensaciones</th>';
  }
  hHtml += '</tr>';
  document.getElementById('tblSeguimientoHead').innerHTML = hHtml;

  // Body rows
  let bHtml = '';
  bodegas.forEach(b => {
    const c3 = bodegaMetrics[b][corteFinalSeg] || {docsEnt:0,docsPend:0};
    const cPrevB = bodegaMetrics[b][cortePrevSeg] || {docsEnt:0,docsPend:0};
    bHtml += '<tr><td>' + escHtml(b) + '</td>';
    bHtml += celdaDoble(c3.docsEnt, cPrevB.docsEnt);
    bHtml += celdaDoble(c3.docsPend, cPrevB.docsPend);
    // Índice de Pendientes
    const ipTotal = c3.docsTotal !== undefined ? c3.docsTotal : (c3.docsEnt + c3.docsPend);
    const iPend = ipTotal ? c3.docsPend / ipTotal : null;
    bHtml += '<td class="' + effClass(iPend) + '">' + fmtPct(iPend) + '</td>';
    for(let c=1; c<=NUM_CORTES; c++){
      if(c>corteGlobalSeg){ bHtml += tdFuera + tdFuera; continue; }
      if(!cortesActivos.has(c)){ bHtml += tdVacio + tdVacio; continue; }
      const cd = bodegaMetrics[b][c] || {docsEnt:0,docsPend:0};
      // Solo se muestran cifras cuando la bodega cambió respecto al estado anterior.
      if(!cambioPorBodega[b][c]){
        bHtml += tdSinCambio + tdSinCambio;
      } else {
        bHtml += '<td class="num">' + fmtInt(cd.docsEnt) + '</td>';
        bHtml += '<td class="num">' + fmtInt(cd.docsPend) + '</td>';
      }
    }
    bHtml += '</tr>';
  });
  // Totals row
  const t3 = totRow[corteFinalSeg] || {docsEnt:0,docsPend:0};
  const tPrev = totRow[cortePrevSeg] || {docsEnt:0,docsPend:0};
  bHtml += '<tr class="total-row"><td>TOTAL</td>';
  bHtml += celdaDoble(t3.docsEnt, tPrev.docsEnt);
  bHtml += celdaDoble(t3.docsPend, tPrev.docsPend);
  // Total Índice de Pendientes
  const t3DocsTotal = t3.docsTotal !== undefined ? t3.docsTotal : (t3.docsEnt + t3.docsPend);
  const t3IPend = t3DocsTotal ? t3.docsPend / t3DocsTotal : null;
  bHtml += '<td class="' + effClass(t3IPend) + '">' + fmtPct(t3IPend) + '</td>';
  let refTot = totRow[0] || null;
  for(let c=1; c<=NUM_CORTES; c++){
    if(c>corteGlobalSeg){ bHtml += tdFuera + tdFuera; continue; }
    if(!cortesActivos.has(c)){ bHtml += tdVacio + tdVacio; continue; }
    const cd = totRow[c] || {docsEnt:0,docsPend:0};
    if(refTot && refTot.docsEnt === cd.docsEnt && refTot.docsPend === cd.docsPend){
      bHtml += tdSinCambio + tdSinCambio;
    } else {
      bHtml += '<td class="num">' + fmtInt(cd.docsEnt) + '</td>';
      bHtml += '<td class="num">' + fmtInt(cd.docsPend) + '</td>';
    }
    refTot = cd;
  }
  bHtml += '</tr>';
  document.getElementById('tblSeguimientoBody').innerHTML = bHtml;

  renderSegMeses(filtered, corteGlobalSeg);
}

/* -------------------------------------------------------------------------
   Reasignación mensual de entregas
   Una entrega realizada en un mes posterior cuenta en el mes en que se hizo y
   se descuenta del mes que originó el pendiente (aplica a dispensas y líneas).
   ------------------------------------------------------------------------- */
const MESES_ES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
function ymDeFecha(iso){
  if(!iso) return null;
  const s = String(iso).slice(0,7);
  return /^\d{4}-\d{2}$/.test(s) ? s : null;
}
function etiquetaMes(ym){
  if(ym==='0000-00') return 'Sin fecha de dispensación';
  const p = ym.split('-');
  const mi = parseInt(p[1],10)-1;
  return (MESES_ES[mi]||p[1]) + '. ' + p[0];
}
function renderSegMeses(rows, corteGlobal){
  const headEl = document.getElementById('tblSegMesesHead');
  const bodyEl = document.getElementById('tblSegMesesBody');
  if(!headEl || !bodyEl) return;
  const SIN_FECHA = '0000-00';

  // Solo las dispensaciones visibles según el corte global. El corte se mide por la
  // FECHA DE DISPENSACIÓN (días 1-10, 11-20, 21-31), no por la fecha del archivo.
  const visibles = (rows||[]).filter(r => {
    const p = getPeriodoDeCarga(r.fecha);
    return p===null || p<=corteGlobal;                     // sin fecha: se conserva
  });

  // Agrupar versiones por línea y ordenarlas cronológicamente.
  const porLinea = new Map();
  // ¿El CARGUE de esta versión ya ocurrió dentro del corte global mostrado? El
  // cumplimiento solo puede acreditarse con cargues visibles en el corte seleccionado.
  const cargueVisible = (r) => {
    const p = getPeriodoDeCarga(r.fechaCargue||'');
    return p===null || p<=corteGlobal;                    // sin fecha de cargue: se conserva
  };
  visibles.forEach(r => {
    const k = claveLineaCargue(r);
    if(!porLinea.has(k)) porLinea.set(k, []);
    porLinea.get(k).push(r);
  });

  const lineaInfo = [];                 // {mesOrigen, mesEntrega}
  const docsMap = new Map();            // dispensa (documento+bodega) -> {mesOrigen, mesEntrega, completo}
  porLinea.forEach(vs => {
    vs.sort((a,b) => esVersionPosterior(a,b) ? 1 : -1);
    // Mes de origen = mes de la FECHA DE DISPENSACIÓN (fecha el ORIGEN del pendiente).
    const rBase = vs[0];
    const mesOrigen = mesDeDispensacion(rBase) || SIN_FECHA;
    const pendienteAlInicio = rBase.lineaPendiente==='SI';
    let mesEntrega = null;
    for(let i=0;i<vs.length;i++){
      if(vs[i].lineaPendiente!=='NO') continue;
      if(!cargueVisible(vs[i])) continue;                  // cargue fuera del corte mostrado
      /* DOS EJES: el mes de ORIGEN sale de la fecha de dispensación (allí nació el
         pendiente) y el mes de la ENTREGA sale del CARGUE en que la línea volvió a
         subirse ya entregada. Si la línea nunca estuvo pendiente, la entrega se queda
         en su propio mes de origen (no hay recuperación que reasignar).            */
      const acreditado = pendienteAlInicio && cambioAcreditado(rBase, vs[i]);
      mesEntrega = acreditado ? (mesDeCargue(vs[i]) || mesOrigen) : mesOrigen;
      if(mesEntrega < mesOrigen) mesEntrega = mesOrigen;
      break;
    }
    lineaInfo.push({ mesOrigen: mesOrigen, mesEntrega: mesEntrega });
    // Una dispensa se identifica por Documento + Bodega: el mismo documento atendido
    // en otro punto de entrega es una dispensa distinta.
    const doc = claveDocBodega(vs[0]);
    if(!doc) return;
    if(!docsMap.has(doc)) docsMap.set(doc, { mesOrigen: mesOrigen, mesEntrega: mesOrigen, completo: true });
    const d = docsMap.get(doc);
    if(mesOrigen < d.mesOrigen) d.mesOrigen = mesOrigen;
    if(mesEntrega===null) d.completo = false;
    else if(mesEntrega > d.mesEntrega) d.mesEntrega = mesEntrega;   // el documento cierra con su última línea
  });

  // Acumular por mes: dispensas (documentos) y líneas.
  const meses = new Map();
  const ensureMes = (ym) => {
    if(!meses.has(ym)) meses.set(ym, {
      dOrig:0, dEnt:0, dRec:0, dDesc:0, dPend:0,
      lOrig:0, lEnt:0, lRec:0, lDesc:0, lPend:0
    });
    return meses.get(ym);
  };
  const acumular = (mesOrigen, mesEntrega, pref) => {
    const mo = ensureMes(mesOrigen);
    mo[pref+'Orig']++;
    if(mesEntrega===null){ mo[pref+'Pend']++; return; }
    const me = ensureMes(mesEntrega);
    me[pref+'Ent']++;                               // la entrega cuenta en el mes en que se hizo
    if(mesEntrega!==mesOrigen){
      me[pref+'Rec']++;                             // recibida de un mes anterior
      mo[pref+'Desc']++;                            // se descuenta del mes que originó el pendiente
    }
  };
  lineaInfo.forEach(l => acumular(l.mesOrigen, l.mesEntrega, 'l'));
  docsMap.forEach(d => acumular(d.mesOrigen, d.completo ? d.mesEntrega : null, 'd'));

  const claves = Array.from(meses.keys()).sort();
  if(!claves.length){
    headEl.innerHTML = '';
    bodyEl.innerHTML = '<tr><td style="color:var(--ink-soft);">Aún no hay dispensaciones con fecha para reasignar entregas por mes.</td></tr>';
    return;
  }

  headEl.innerHTML = '<tr><th rowspan="2">Mes</th><th colspan="5">Dispensas</th><th colspan="5">Líneas</th></tr>'
    + '<tr>'
    + '<th title="Dispensas dispensadas por primera vez en el mes">Originadas</th>'
    + '<th title="Entregas contadas en el mes en que realmente se hicieron">Entregas del mes</th>'
    + '<th title="Entregas que venían pendientes de meses anteriores">Recibidas (+)</th>'
    + '<th title="Pendientes del mes que se entregaron después y por eso se descuentan de este mes">Descontadas (−)</th>'
    + '<th title="Pendientes del mes que siguen sin entregar">Pendientes</th>'
    + '<th title="Líneas dispensadas por primera vez en el mes">Originadas</th>'
    + '<th title="Entregas contadas en el mes en que realmente se hicieron">Entregas del mes</th>'
    + '<th title="Entregas que venían pendientes de meses anteriores">Recibidas (+)</th>'
    + '<th title="Pendientes del mes que se entregaron después y por eso se descuentan de este mes">Descontadas (−)</th>'
    + '<th title="Líneas del mes que siguen sin entregar">Pendientes</th>'
    + '</tr>';

  const T = { dOrig:0,dEnt:0,dRec:0,dDesc:0,dPend:0, lOrig:0,lEnt:0,lRec:0,lDesc:0,lPend:0 };
  const gris = (v) => v ? '<td class="num">' + fmtInt(v) + '</td>' : '<td class="num" style="color:#B7C2CD;">0</td>';
  let html = '';
  claves.forEach(ym => {
    const m = meses.get(ym);
    Object.keys(T).forEach(k => { T[k] += m[k]; });
    html += '<tr><td>' + escHtml(etiquetaMes(ym)) + '</td>'
      + '<td class="num">' + fmtInt(m.dOrig) + '</td>'
      + '<td class="num">' + fmtInt(m.dEnt) + '</td>'
      + gris(m.dRec) + gris(m.dDesc)
      + '<td class="num">' + fmtInt(m.dPend) + '</td>'
      + '<td class="num">' + fmtInt(m.lOrig) + '</td>'
      + '<td class="num">' + fmtInt(m.lEnt) + '</td>'
      + gris(m.lRec) + gris(m.lDesc)
      + '<td class="num">' + fmtInt(m.lPend) + '</td></tr>';
  });
  html += '<tr class="total-row"><td>TOTAL</td>'
    + '<td class="num">' + fmtInt(T.dOrig) + '</td><td class="num">' + fmtInt(T.dEnt) + '</td>'
    + '<td class="num">' + fmtInt(T.dRec) + '</td><td class="num">' + fmtInt(T.dDesc) + '</td>'
    + '<td class="num">' + fmtInt(T.dPend) + '</td>'
    + '<td class="num">' + fmtInt(T.lOrig) + '</td><td class="num">' + fmtInt(T.lEnt) + '</td>'
    + '<td class="num">' + fmtInt(T.lRec) + '</td><td class="num">' + fmtInt(T.lDesc) + '</td>'
    + '<td class="num">' + fmtInt(T.lPend) + '</td></tr>';
  bodyEl.innerHTML = html;
}

function renderAllTablesFromCache(){
  const bodegaSearch = getBodegaFiltro();
  const zona = document.getElementById('fZona').value;
  // Los indicadores muestran el estado ACTUAL: solo la última versión de cada línea.
  // Si una línea pendiente se recargó después como entregada, la versión vieja ya no suma.
  const rowsVigentes = filteredRowsCache.filter(r=>r.versionVigente!==false);
  renderIndicadorDispensa(rowsVigentes, bodegaSearch, zona);
  renderIndicadorLinea(rowsVigentes, bodegaSearch, zona);
  renderIndicadorSoporteEvento(rowsVigentes.filter(r=>r.contrato==='EVENTO'), bodegaSearch, zona);
  // Comparativo y seguimiento por corte sí necesitan el historial completo de versiones:
  // internamente toman la versión vigente al cierre de cada corte.
  renderComparativos(filteredRowsCache);
  renderSeguimientoBodega(filteredRowsCache, bodegaSearch, zona);
  renderIndicadorInactivas(rowsVigentes, bodegaSearch, zona);
  if(typeof renderCohortes==='function') renderCohortes(rowsVigentes, bodegaSearch, zona);
  // Base cuentas: la matriz usa el estado actual y la evolución por cortes el historial.
  if(typeof renderBaseCuentas==='function') renderBaseCuentas(rowsVigentes, bodegaSearch, zona, filteredRowsCache);
  // Base supervisores: necesita el historial completo (todos los meses) para el
  // pronostico SES, asi que se toman las filas vigentes SIN filtro de mes.
  const _pAll=state.processed||null;
  const rowsVigentesFull = _pAll ? _pAll.rows.filter(r=>r.versionVigente!==false) : rowsVigentes;
  if(typeof renderBaseSupervisores==='function') renderBaseSupervisores(rowsVigentesFull, bodegaSearch, zona);
  // El detalle por factura usa la cantidad pendiente del reporte, así que se
  // repinta cada vez que cambian los filtros generales.
  if(typeof renderInfoPorFactura==='function') renderInfoPorFactura();
}

/* =========================================================================
   10b. Indicador por Dispensas Inactivas (Estado = INACTIVO)
   ========================================================================= */
// Un estado cuenta como inactivo si empieza por INACTIV (INACTIVO, INACTIVA,
// INACTIVOS, "INACTIVO POR ..."), así toleramos variaciones del archivo original.
function esEstadoInactivo(v){
  const s=normValue(v);
  return s.startsWith('INACTIV') || s==='I' || s==='0';
}
// Cuenta como activo todo lo que NO es inactivo. Si el registro no trae valor en
// Estado (acumulados guardados antes de incluir esa columna) se conserva como
// activo para no perder historico.
function esEstadoActivo(v){
  return !esEstadoInactivo(v);
}
function soloActivas(rows){
  return rows.filter(r=>esEstadoActivo(r.estadoDispensa));
}

/* ---- Reglas exactas de conteo del Indicador por Línea -----------------------
   Se aplican SOLO sobre líneas activas (las INACTIVO ya salieron con soloActivas).
   · ENTREGADA : Unidades > 0 y Diferencia = 0.
   · PENDIENTE : Diferencia < 0 (faltó cantidad frente a lo autorizado).
   Una línea con Diferencia > 0 (sobrante) o con Unidades en 0 y Diferencia en 0 no
   suma en ninguno de los dos grupos, pero sí en el total de líneas.
   Los códigos que no son medicamento (servicios, domicilios) nunca generan pendiente. */
function lineaEsEntregada(r){
  return toNumber(r && r.unidades) > 0 && toNumber(r && r.diferencia) === 0;
}
function lineaEsPendiente(r){
  if(!r || r.noMedicamento) return false;
  return toNumber(r.diferencia) < 0;
}
// Guarda las dispensas inactivas ya agrupadas (Documento + Bodega) del último render,
// para que el botón de descarga por bodega exporte exactamente lo que se ve en pantalla.
let _inactivasDispCache = [];
// Guarda también las LÍNEAS inactivas del último render (una fila por artículo), para poder
// exportar el detalle con Código de artículo y Descripción por DCI.
let _inactivasLineasCache = [];
function renderIndicadorInactivas(rowsAll, bodegaSearch, zona){
  const ambito = rowsAll.filter(r=>{
    if(bodegaSearch && !normValue(r.bodegaDetalle).includes(bodegaSearch)) return false;
    if(zona && r.zona!==zona) return false;
    return true;
  });
  const rows = ambito.filter(r=>esEstadoInactivo(r.estadoDispensa));

  // Diagnóstico: si el acumulado guardado no trae la columna Estado, el indicador
  // saldría en 0 sin explicación. Avisamos al usuario qué hacer.
  const sinEstado = ambito.filter(r=>!normValue(r.estadoDispensa)).length;
  const estadosVistos=new Map();
  ambito.forEach(r=>{ const s=normValue(r.estadoDispensa); if(!s) return; estadosVistos.set(s,(estadosVistos.get(s)||0)+1); });
  const diagEl=document.getElementById('inactivasDiag');
  if(diagEl){
    if(!ambito.length){
      diagEl.style.display='none'; diagEl.innerHTML='';
    } else if(sinEstado===ambito.length){
      diagEl.style.display='';
      diagEl.innerHTML='<b>Atención:</b> ninguna de las '+fmtInt(ambito.length)+' líneas cargadas trae valor en la columna <b>Estado</b>. '+
        'Esto ocurre cuando el acumulado se guardó antes de incluir esa columna. Ve a la pestaña de carga, usa <b>Borrar acumulado</b> del Reporte de Dispensación y vuelve a sincronizar el archivo desde Drive.';
    } else if(sinEstado>0){
      diagEl.style.display='';
      diagEl.innerHTML='<b>Nota:</b> '+fmtInt(sinEstado)+' de '+fmtInt(ambito.length)+' líneas no traen valor en <b>Estado</b> y no se pueden clasificar. '+
        'Si el número es alto, vuelve a sincronizar el Reporte de Dispensación desde Drive para completar esos datos.';
    } else if(!rows.length && estadosVistos.size){
      const lista=[...estadosVistos.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6)
        .map(e=>escHtml(e[0])+' ('+fmtInt(e[1])+')').join(', ');
      diagEl.style.display='';
      diagEl.innerHTML='<b>Nota:</b> no se encontraron dispensas INACTIVAS. Estados presentes en los datos filtrados: '+lista+'.';
    } else {
      diagEl.style.display='none'; diagEl.innerHTML='';
    }
  }

  // Una dispensa = Documento + Bodega (misma definición usada en el resto del tablero)
  const dispMap=new Map();
  rows.forEach(r=>{
    const k=r.dispensaYPunto;
    if(dispMap.has(k)) {
      const d=dispMap.get(k);
      if(r.fecha && (!d.fecha || r.fecha<d.fecha)) d.fecha=r.fecha;
      d.lineas++;
      return;
    }
    dispMap.set(k, {usuario: r.usuarioCreacion || 'SIN USUARIO', documento: r.documento || '', bodega: r.bodegaDetalle, zona: r.zona, fecha: r.fecha||null, lineas:1});
  });
  const disp=[...dispMap.values()];
  _inactivasDispCache = disp;
  _inactivasLineasCache = rows;
  const total=disp.length;
  const totalDispensasGlobal=new Set(rowsAll.map(r=>r.dispensaYPunto)).size;
  const usuariosDistintos=new Set(disp.map(d=>d.usuario)).size;
  const bodegasDistintas=new Set(disp.map(d=>d.bodega)).size;
  const fechasAll=disp.map(d=>d.fecha).filter(Boolean).sort((a,b)=>a-b);

  document.getElementById('statsInactivas').innerHTML =
    '<div class="stat warn"><div class="label">Dispensas inactivas</div><div class="value">'+fmtInt(total)+'</div>'+
    '<div class="sub">'+fmtPct(totalDispensasGlobal?total/totalDispensasGlobal:null)+' del total de dispensas</div></div>'+
    '<div class="stat"><div class="label">Líneas involucradas</div><div class="value">'+fmtInt(rows.length)+'</div></div>'+
    '<div class="stat"><div class="label">Usuarios de creación</div><div class="value">'+fmtInt(usuariosDistintos)+'</div></div>'+
    '<div class="stat"><div class="label">Bodegas involucradas</div><div class="value">'+fmtInt(bodegasDistintas)+'</div></div>'+
    '<div class="stat"><div class="label">Rango de fechas</div><div class="value" style="font-size:16px;">'+
      (fechasAll.length ? escHtml(dateToISO(fechasAll[0])+' → '+dateToISO(fechasAll[fechasAll.length-1])) : '—')+'</div></div>';

  // ---- Por Usuario Creación (total por usuario, con selector de usuario) ----
  const porUsuario=new Map();
  disp.forEach(d=>{
    const k = d.usuario;
    if(!porUsuario.has(k)) porUsuario.set(k, {usuario:d.usuario, cant:0});
    porUsuario.get(k).cant++;
  });
  const listaUFull=[...porUsuario.values()].sort((a,b)=> (b.cant-a.cant) || a.usuario.localeCompare(b.usuario,'es'));

  // Selector de usuario: se repuebla conservando la selección si sigue existiendo
  const selU=document.getElementById('fInactivasUsuario');
  let usuarioSel='';
  if(selU){
    usuarioSel=selU.value||'';
    const opciones=listaUFull.map(u=>u.usuario);
    if(usuarioSel && !opciones.includes(usuarioSel)) usuarioSel='';
    selU.innerHTML='<option value="">Todos los usuarios</option>'+
      opciones.map(u=>'<option value="'+escHtml(u)+'">'+escHtml(u)+'</option>').join('');
    selU.value=usuarioSel;
  }

  const listaU = usuarioSel ? listaUFull.filter(u=>u.usuario===usuarioSel) : listaUFull;
  const tbU=document.querySelector('#tblInactivasUsuario tbody');
  if(!listaU.length){
    tbU.innerHTML='<tr><td colspan="3" class="txt" style="text-align:center;color:#9CA9B6;">No hay dispensas con Estado INACTIVO para el filtro seleccionado.</td></tr>';
  }else{
    let h=listaU.map(u=>{
      return '<tr><td class="txt">'+escHtml(u.usuario)+'</td><td>'+fmtInt(u.cant)+'</td>'+
        '<td>'+fmtPct(total?u.cant/total:null)+'</td></tr>';
    }).join('');
    const sumU=listaU.reduce((a,u)=>a+u.cant,0);
    h+='<tr class="total-row"><td class="txt">TOTAL ('+listaU.length+(listaU.length===1?' usuario)':' usuarios)')+'</td><td>'+fmtInt(sumU)+'</td><td>'+fmtPct(total?sumU/total:null)+'</td></tr>';
    tbU.innerHTML=h;
  }

  // ---- Por Bodega Detalle (mayor a menor) ----
  const porBodega=new Map();
  disp.forEach(d=>{
    const k=d.bodega||'N/D';
    if(!porBodega.has(k)) porBodega.set(k, {bodega:k, zona:d.zona||'N/D', cant:0});
    porBodega.get(k).cant++;
  });
  const listaB=[...porBodega.values()].sort((a,b)=>b.cant-a.cant);
  const tbB=document.querySelector('#tblInactivasBodega tbody');
  if(!listaB.length){
    tbB.innerHTML='<tr><td colspan="4" class="txt" style="text-align:center;color:#9CA9B6;">No hay dispensas con Estado INACTIVO para el filtro seleccionado.</td></tr>';
  }else{
    let h=listaB.map(b=>'<tr><td class="txt">'+escHtml(b.zona)+'</td><td class="txt">'+escHtml(b.bodega)+'</td>'+
      '<td>'+fmtInt(b.cant)+'</td><td>'+fmtPct(total?b.cant/total:null)+'</td></tr>').join('');
    h+='<tr class="total-row"><td class="txt">—</td><td class="txt">TOTAL ('+listaB.length+' bodegas)</td><td>'+fmtInt(total)+'</td><td>'+fmtPct(total?1:null)+'</td></tr>';
    tbB.innerHTML=h;
  }
}

/* =========================================================================
   Indicador de Traslados Realizados (tabla Traslados + cruce Homólogo)
   Filtros propios: Bodega Origen, Bodega Destino y buscador de usuario.
   ========================================================================= */
let _trasladosUsuarioCache=[];

function populateTrasladosFilters(){
  const p=state.processed; if(!p) return;
  const selO=document.getElementById('fTrasladoOrigen');
  const selD=document.getElementById('fTrasladoDestino');
  const selZ=document.getElementById('fTrasladoZona');
  if(selZ){
    const prev=selZ.value||'';
    const ops=p.trasladosZonas||[];
    selZ.innerHTML='<option value="">Todas las zonas</option>'+ops.map(o=>'<option value="'+escHtml(o)+'">'+escHtml(o)+'</option>').join('');
    selZ.value = ops.includes(prev) ? prev : '';
  }
  if(selO){
    const prev=selO.value||'';
    const ops=p.trasladosOrigenes||[];
    selO.innerHTML='<option value="">Todas las bodegas origen</option>'+ops.map(o=>'<option value="'+escHtml(o)+'">'+escHtml(o)+'</option>').join('');
    selO.value = ops.includes(prev) ? prev : '';
  }
  if(selD){
    fillTrasladoDestinos();
  }
  renderIndicadorTraslados();
}

/* Rellena el select de Bodega Destino respetando la zona elegida (si hay). */
function fillTrasladoDestinos(){
  const p=state.processed; if(!p) return;
  const selD=document.getElementById('fTrasladoDestino'); if(!selD) return;
  const zona=(document.getElementById('fTrasladoZona')||{}).value||'';
  const prev=selD.value||'';
  let ops=p.trasladosDestinos||[];
  if(zona){
    const permitidas=new Set((p.traslados||[]).filter(r=>r.zonaDestino===zona).map(r=>r.bodegaDestino));
    ops=ops.filter(o=>permitidas.has(o));
  }
  selD.innerHTML='<option value="">Todas las bodegas destino</option>'+ops.map(o=>'<option value="'+escHtml(o)+'">'+escHtml(o)+'</option>').join('');
  selD.value = ops.includes(prev) ? prev : '';
}

function renderIndicadorTraslados(){
  const tb=document.querySelector('#tblTrasladosUsuario tbody');
  if(!tb) return;
  const p=state.processed;
  const all=(p && p.traslados) ? p.traslados : [];
  const statsEl=document.getElementById('statsTraslados');
  const diagEl=document.getElementById('trasladosDiag');

  if(!all.length){
    if(statsEl) statsEl.innerHTML='';
    if(diagEl){
      diagEl.style.display='';
      diagEl.innerHTML='<b>Sin datos de traslados.</b> Ve a la pestaña de cargue, sincroniza la tarjeta <b>Traslados</b> desde Google Drive y vuelve a calcular los indicadores.';
    }
    tb.innerHTML='<tr><td colspan="8" class="txt" style="text-align:center;color:#9CA9B6;">No hay traslados cargados.</td></tr>';
    _trasladosUsuarioCache=[];
    return;
  }

  const origen=(document.getElementById('fTrasladoOrigen')||{}).value||'';
  const destino=(document.getElementById('fTrasladoDestino')||{}).value||'';
  const zona=(document.getElementById('fTrasladoZona')||{}).value||'';
  const busca=normValue((document.getElementById('fTrasladoUsuario')||{}).value||'');

  const filas=all.filter(r=>{
    if(zona && r.zonaDestino!==zona) return false;
    if(origen && r.bodegaOrigen!==origen) return false;
    if(destino && r.bodegaDestino!==destino) return false;
    return true;
  });

  // Traslados ÚNICOS por usuario: se agrupa por número de Traslado (si viene vacío se
  // usa una clave por fila para no perder el registro). Un traslado puede contener
  // moléculas Pareto y No Pareto: en ese caso suma en las dos columnas.
  const porUsuario=new Map();
  filas.forEach((r,i)=>{
    const u=r.usuario||'SIN USUARIO';
    if(!porUsuario.has(u)) porUsuario.set(u, {usuario:u, ids:new Set(), pareto:new Set(), noPareto:new Set(), lineas:0, linParetoetc:0, linNoPareto:0, linNoHom:0});
    const g=porUsuario.get(u);
    const id=r.traslado ? 'T:'+r.traslado : 'F:'+i;
    g.ids.add(id); g.lineas++;
    // Cada registro de la tabla es una LÍNEA: un mismo traslado con varios Codigos
    // aporta varias líneas. Pareto + No Pareto + No homologadas = Líneas totales.
    if(r.moleculaPareto==='PARETO'){ g.pareto.add(id); g.linParetoetc++; }
    else if(r.moleculaPareto==='NO PARETO'){ g.noPareto.add(id); g.linNoPareto++; }
    else g.linNoHom++;
  });

  const listaFull=[...porUsuario.values()].map(g=>({
    usuario:g.usuario, cant:g.ids.size, pareto:g.pareto.size, noPareto:g.noPareto.size,
    lineas:g.lineas, linPareto:g.linParetoetc, linNoPareto:g.linNoPareto, linNoHom:g.linNoHom
  })).sort((a,b)=> (b.cant-a.cant) || a.usuario.localeCompare(b.usuario,'es'));

  const totalTraslados=listaFull.reduce((a,u)=>a+u.cant,0);
  const trasladosUnicosGlobal=new Set(filas.map((r,i)=>r.traslado?('T:'+r.traslado):('F:'+i))).size;
  const sinClasificar=filas.filter(r=>r.moleculaPareto==='N/D').length;
  const fechas=filas.map(r=>r.fecha).filter(Boolean).sort((a,b)=>a-b);

  if(statsEl){
    statsEl.innerHTML =
      '<div class="stat"><div class="label">Traslados únicos</div><div class="value">'+fmtInt(trasladosUnicosGlobal)+'</div>'+
      '<div class="sub">'+fmtInt(filas.length)+' líneas de artículo</div></div>'+
      '<div class="stat"><div class="label">Usuarios que trasladaron</div><div class="value">'+fmtInt(listaFull.length)+'</div></div>'+
      '<div class="stat"><div class="label">Líneas Pareto</div><div class="value">'+fmtInt(filas.filter(r=>r.moleculaPareto==='PARETO').length)+'</div></div>'+
      '<div class="stat"><div class="label">Líneas No Pareto</div><div class="value">'+fmtInt(filas.filter(r=>r.moleculaPareto==='NO PARETO').length)+'</div></div>'+
      '<div class="stat"><div class="label">Líneas no homologadas</div><div class="value">'+fmtInt(sinClasificar)+'</div></div>'+
      '<div class="stat"><div class="label">Rango de fechas</div><div class="value" style="font-size:16px;">'+
        (fechas.length ? escHtml(dateToISO(fechas[0])+' → '+dateToISO(fechas[fechas.length-1])) : '—')+'</div></div>';
  }

  if(diagEl){
    if(sinClasificar>0){
      diagEl.style.display='';
      diagEl.innerHTML='<b>Nota:</b> '+fmtInt(sinClasificar)+' de '+fmtInt(filas.length)+' líneas tienen un <b>Codigo</b> que no se encontró en la tabla Homólogo, por lo que no se pueden clasificar como Pareto o No Pareto. Esas líneas sí cuentan en el total de traslados del usuario.';
    } else {
      diagEl.style.display='none'; diagEl.innerHTML='';
    }
  }

  _trasladosUsuarioCache=listaFull;

  const lista = busca ? listaFull.filter(u=>normValue(u.usuario).includes(busca)) : listaFull;

  if(!lista.length){
    tb.innerHTML='<tr><td colspan="8" class="txt" style="text-align:center;color:#9CA9B6;">No hay traslados para los filtros seleccionados.</td></tr>';
    return;
  }

  // La posición (#) corresponde al ranking real dentro de todos los usuarios,
  // así el buscador no altera el puesto que ocupa cada persona.
  const rank=new Map(); listaFull.forEach((u,i)=>rank.set(u.usuario, i+1));
  let h=lista.map(u=>
    '<tr><td>'+rank.get(u.usuario)+'</td>'+
    '<td class="txt">'+escHtml(u.usuario)+'</td>'+
    '<td><b>'+fmtInt(u.cant)+'</b></td>'+
    '<td><b>'+fmtInt(u.lineas)+'</b></td>'+
    '<td>'+fmtInt(u.linPareto)+'</td>'+
    '<td>'+fmtInt(u.linNoPareto)+'</td>'+
    '<td>'+fmtInt(u.linNoHom)+'</td>'+
    '<td>'+fmtPct(totalTraslados?u.cant/totalTraslados:null)+'</td></tr>'
  ).join('');
  const sum=lista.reduce((a,u)=>a+u.cant,0);
  const sumL=lista.reduce((a,u)=>a+u.lineas,0);
  const sumLP=lista.reduce((a,u)=>a+u.linPareto,0);
  const sumLNP=lista.reduce((a,u)=>a+u.linNoPareto,0);
  const sumLNH=lista.reduce((a,u)=>a+u.linNoHom,0);
  h+='<tr class="total-row"><td>—</td><td class="txt">TOTAL ('+lista.length+(lista.length===1?' usuario)':' usuarios)')+'</td>'+
     '<td>'+fmtInt(sum)+'</td>'+
     '<td>'+fmtInt(sumL)+'</td><td>'+fmtInt(sumLP)+'</td><td>'+fmtInt(sumLNP)+'</td><td>'+fmtInt(sumLNH)+'</td>'+
     '<td>'+fmtPct(totalTraslados?sum/totalTraslados:null)+'</td></tr>';
  tb.innerHTML=h;
}

['fTrasladoOrigen','fTrasladoDestino'].forEach(id=>{
  const el=document.getElementById(id);
  if(el) el.addEventListener('change', renderIndicadorTraslados);
});
(function(){
  const el=document.getElementById('fTrasladoZona');
  if(el) el.addEventListener('change', function(){ fillTrasladoDestinos(); renderIndicadorTraslados(); });
})();
(function(){
  const el=document.getElementById('fTrasladoUsuario');
  if(el) el.addEventListener('input', renderIndicadorTraslados);
})();

/* =========================================================================
   Información por factura (tabla Facturas + cruce Homólogo)
   Filtro propio: Punto de venta (no afecta al resto de la pantalla).
   ========================================================================= */
let _facturasPuntoCache=[];
let _facturasStandalone=[];        // facturas listas para verse sin haber pulsado "Calcular indicadores"
let _facturasStandaloneLoading=false;

/* La sección funciona en cuanto la tabla Facturas está sincronizada desde Drive:
   si todavía no se han recalculado los indicadores, se lee la tabla guardada en el
   navegador y se cruza con Homólogo aquí mismo. */
async function ensureFacturasData(){
  if(state.processed && state.processed.facturas && state.processed.facturas.length) return;
  if(_facturasStandaloneLoading) return;
  _facturasStandaloneLoading=true;
  try{
    const recF=await idbGet('facturas');
    const filas=(recF && recF.rows) ? recF.rows : [];
    if(!filas.length){ _facturasStandalone=[]; return; }
    const recH=await idbGet('homologo');
    const homSet=new Set();
    const homMap=new Map();
    const dciMap=new Map();
    ((recH && recH.rows) ? recH.rows : []).forEach(r=>{
      const c=normValue(r.codigo);
      if(!c) return;
      homSet.add(c);
      if(!homMap.has(c)) homMap.set(c, normValue(r.homologo));
      if(!dciMap.has(c)) dciMap.set(c, String(r.descripcionDci||'').trim());
    });
    _facturasStandalone=filas.map(r=>{
      const codigo=normValue(r.codigo);
      return {
        fechaFactura: toDateSafe(r.fechaFactura),
        factura: String(r.factura||'').trim(),
        codigo,
        descripcion: String(r.descripcion||'').trim(),
        // Descripción DCI de la tabla Homólogo.
        descripcionDci: dciMap.get(codigo) || '',
        cantidad: toNumber(r.cantidad),
        puntoVenta: String(r.puntoVenta||'').trim() || 'SIN PUNTO DE VENTA',
        // Código de homologación del artículo facturado: es la llave con la que se
        // cruza el pendiente del Reporte de Dispensación.
        homologo: homMap.get(codigo) || '',
        tieneHomologo: homSet.has(codigo)
      };
    });
    const puntos=Array.from(new Set(_facturasStandalone.map(r=>r.puntoVenta).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'es'));
    const sel=document.getElementById('fFacturaPunto');
    if(sel && sel.options.length<=1){
      const prev=sel.value||'';
      sel.innerHTML='<option value="">Todos los puntos de venta</option>'+puntos.map(o=>'<option value="'+escHtml(o)+'">'+escHtml(o)+'</option>').join('');
      sel.value = puntos.includes(prev) ? prev : '';
    }
  }catch(e){ console.warn('No se pudo leer la tabla Facturas:', e); }
  finally{ _facturasStandaloneLoading=false; }
}
function getFacturasRows(){
  const p=state.processed;
  if(p && p.facturas && p.facturas.length) return p.facturas;
  return _facturasStandalone;
}

function populateFacturasFilters(){
  const p=state.processed; if(!p) return;
  const sel=document.getElementById('fFacturaPunto');
  if(sel){
    const prev=sel.value||'';
    const ops=p.facturasPuntos||[];
    sel.innerHTML='<option value="">Todos los puntos de venta</option>'+ops.map(o=>'<option value="'+escHtml(o)+'">'+escHtml(o)+'</option>').join('');
    sel.value = ops.includes(prev) ? prev : '';
  }
  renderInfoPorFactura();
}

function facturasStatCardsHTML(cod, hom, noHom){
  return '<div class="stat"><div class="label">Cantidad de códigos</div><div class="value">'+fmtInt(cod)+'</div>'+
         '<div class="sub">códigos distintos facturados</div></div>'+
         '<div class="stat"><div class="label">Códigos homologados</div><div class="value">'+fmtInt(hom)+'</div>'+
         '<div class="sub">'+fmtPct(cod?hom/cod:null)+' del total</div></div>'+
         '<div class="stat"><div class="label">Códigos NO homologados</div><div class="value">'+fmtInt(noHom)+'</div>'+
         '<div class="sub">'+fmtPct(cod?noHom/cod:null)+' del total</div></div>';
}

function renderInfoPorFactura(){
  const tb=document.querySelector('#tblFacturasPunto tbody');
  if(!tb) return;
  const all=getFacturasRows();
  const statsEl=document.getElementById('statsFacturas');
  const diagEl=document.getElementById('facturasDiag');

  if(!all.length){
    if(statsEl) statsEl.innerHTML=facturasStatCardsHTML(0,0,0);
    if(diagEl){
      diagEl.style.display='';
      diagEl.innerHTML='<b>Sin datos de facturas.</b> Ve a la pestaña de cargue, sincroniza la tarjeta <b>Facturas</b> desde Google Drive y vuelve a calcular los indicadores.';
    }
    tb.innerHTML='<tr><td colspan="6" class="txt" style="text-align:center;color:#9CA9B6;">No hay facturas cargadas.</td></tr>';
    _facturasPuntoCache=[];
    renderFacturasDetalle([]);
    return;
  }

  const punto=(document.getElementById('fFacturaPunto')||{}).value||'';
  const filas=all.filter(r=>{
    if(punto && r.puntoVenta!==punto) return false;
    return true;
  });

  // Codigos SIN REPETIR dentro de cada punto de venta y numeros de factura DISTINTOS.
  const porPunto=new Map();
  filas.forEach(r=>{
    const k=r.puntoVenta||'SIN PUNTO DE VENTA';
    if(!porPunto.has(k)) porPunto.set(k, {punto:k, codigos:new Set(), hom:new Set(), noHom:new Set(), facturas:new Set(), lineas:0, cantidad:0});
    const g=porPunto.get(k);
    g.lineas++; g.cantidad+=r.cantidad;
    // Cantidad de facturas: numeros de factura sin repetir. Si la linea no trae
    // numero se cuenta como una factura propia para no perderla.
    const nro=String(r.factura||'').trim();
    g.facturas.add(nro ? 'F:'+nro.toUpperCase() : 'L:'+g.lineas);
    if(!r.codigo) return;
    g.codigos.add(r.codigo);
    if(r.tieneHomologo) g.hom.add(r.codigo); else g.noHom.add(r.codigo);
  });

  const lista=[...porPunto.values()].map(g=>({
    punto:g.punto, codigos:g.codigos.size, hom:g.hom.size, noHom:g.noHom.size,
    facturas:g.facturas.size, lineas:g.lineas, cantidad:g.cantidad
  })).sort((a,b)=> (b.facturas-a.facturas) || (b.codigos-a.codigos) || a.punto.localeCompare(b.punto,'es'));

  _facturasPuntoCache=lista;

  const facturasUnicas=new Set(filas.map((r,i)=>r.factura?('F:'+r.factura):('L:'+i))).size;
  const codigosGlobal=new Set(filas.map(r=>r.codigo).filter(Boolean));
  const codigosHomGlobal=new Set(filas.filter(r=>r.codigo && r.tieneHomologo).map(r=>r.codigo));
  const codigosNoHomGlobal=new Set(filas.filter(r=>r.codigo && !r.tieneHomologo).map(r=>r.codigo));
  const fechas=filas.map(r=>r.fechaFactura).filter(Boolean).sort((a,b)=>a-b);

  if(statsEl){
    statsEl.innerHTML =
      facturasStatCardsHTML(codigosGlobal.size, codigosHomGlobal.size, codigosNoHomGlobal.size)+
      '<div class="stat"><div class="label">Facturas</div><div class="value">'+fmtInt(facturasUnicas)+'</div>'+
      '<div class="sub">'+fmtInt(filas.length)+' líneas facturadas</div></div>'+
      '<div class="stat"><div class="label">Puntos de venta</div><div class="value">'+fmtInt(lista.length)+'</div></div>'+
      '<div class="stat"><div class="label">Rango de fechas</div><div class="value" style="font-size:16px;">'+
        (fechas.length ? escHtml(dateToISO(fechas[0])+' → '+dateToISO(fechas[fechas.length-1])) : '—')+'</div></div>';
  }

  if(diagEl){
    const sinCodigo=filas.filter(r=>!r.codigo).length;
    if(codigosNoHomGlobal.size>0 || sinCodigo>0){
      diagEl.style.display='';
      let t='';
      if(codigosNoHomGlobal.size>0) t+='<b>Nota:</b> '+fmtInt(codigosNoHomGlobal.size)+' códigos facturados no se encontraron en la tabla Homólogo. Descárgalos con el botón "Descargar códigos sin homólogo".';
      if(sinCodigo>0) t+=(t?' ':'')+fmtInt(sinCodigo)+' líneas vienen sin Codigo y no se pueden clasificar.';
      diagEl.innerHTML=t;
    } else {
      diagEl.style.display='none'; diagEl.innerHTML='';
    }
  }

  if(!lista.length){
    tb.innerHTML='<tr><td colspan="6" class="txt" style="text-align:center;color:#9CA9B6;">No hay facturas para los filtros seleccionados.</td></tr>';
    renderFacturasDetalle([]);
    return;
  }

  let h=lista.map((u,i)=>
    '<tr><td>'+(i+1)+'</td>'+
    '<td class="txt">'+escHtml(u.punto)+'</td>'+
    '<td><b>'+fmtInt(u.facturas)+'</b></td>'+
    '<td>'+fmtInt(u.hom)+'</td>'+
    '<td>'+fmtInt(u.noHom)+'</td>'+
    '<td>'+fmtPct(u.codigos?u.hom/u.codigos:null)+'</td></tr>'
  ).join('');
  const sumC=lista.reduce((a,u)=>a+u.codigos,0);
  const sumH=lista.reduce((a,u)=>a+u.hom,0);
  const sumN=lista.reduce((a,u)=>a+u.noHom,0);
  h+='<tr class="total-row"><td>—</td><td class="txt">TOTAL ('+lista.length+(lista.length===1?' punto)':' puntos)')+'</td>'+
     '<td>'+fmtInt(facturasUnicas)+'</td><td>'+fmtInt(sumH)+'</td><td>'+fmtInt(sumN)+'</td>'+
     '<td>'+fmtPct(sumC?sumH/sumC:null)+'</td></tr>';
  tb.innerHTML=h;
  renderFacturasDetalle(filas);
}

/* =========================================================================
   Detalle por factura y código con su Cantidad Pendiente
   La cantidad pendiente sale del Reporte de Dispensación (Diferencia < 0) y
   respeta los filtros generales de la pantalla (fechas, EPS, contrato, CIE10,
   bodega/punto y zona), igual que los demás indicadores.
   ========================================================================= */
let _facturasDetalleCache=[];
// Códigos cuyo punto de venta no corresponde a ninguna bodega detalle del reporte.
let _facturasSinBodegaCache=[];

// Porcentaje por subsanar = Cantidad facturada / Cantidad pendiente. Si supera el
// 100% se muestra 100%. Si no hay pendiente no hay nada por subsanar: 0%.
function pctSubsanarVal(pendiente, cantidad){
  const p=toNumber(pendiente);
  if(p<=0) return 0;
  return Math.min(100, (toNumber(cantidad)/p)*100);
}
function fmtPctSubsanar(pendiente, cantidad){
  const p=toNumber(pendiente);
  if(p<=0) return '0%';
  return pctSubsanarVal(pendiente, cantidad).toFixed(1)+'%';
}

/* Unidades pendientes del Reporte de Dispensación agrupadas por BODEGA DETALLE +
   CÓDIGO DE HOMOLOGACIÓN (el homólogo del código del reporte). Solo la última
   versión vigente de cada línea, dispensas activas y con los filtros generales
   ya aplicados. */
function getPendientesReporte(){
  const res={ porBodegaHom:new Map(), porHom:new Map(), bodegas:new Set(), hayReporte:false };
  if(!filteredRowsCache || !filteredRowsCache.length) return res;
  res.hayReporte=true;
  const bodegaSearch=getBodegaFiltro();
  const zonaEl=document.getElementById('fZona');
  const zona=zonaEl? zonaEl.value : '';
  const idxUltima=new Set(snapshotUltimaVersion(filteredRowsCache).map(r=>r.idx));
  filteredRowsCache.forEach(r=>{
    if(r.versionVigente===false) return;
    if(!idxUltima.has(r.idx)) return;
    if(!esEstadoActivo(r.estadoDispensa)) return;
    if(bodegaSearch && !normValue(r.bodegaDetalle).includes(bodegaSearch)) return;
    if(zona && r.zona!==zona) return;
    if(!lineaEsPendiente(r)) return;
    const und=Math.abs(toNumber(r.diferencia));
    if(!und) return;
    // Llave de cruce: código de homologación; si el código no está homologado se
    // usa el propio código para no perder la línea.
    const hom=normValue(r.homologo) || normValue(r.codigoArticulo);
    const bod=normValue(r.bodegaDetalle);
    if(!bod) return;
    res.bodegas.add(bod);
    res.porHom.set(hom, (res.porHom.get(hom)||0)+und);
    const k=bod+'||'+hom;
    res.porBodegaHom.set(k, (res.porBodegaHom.get(k)||0)+und);
  });
  return res;
}

/* Relaciona el PUNTO DE VENTA de la factura con una BODEGA DETALLE del reporte.
   Primero busca coincidencia exacta del nombre normalizado; luego que uno
   contenga al otro; por último compara el código inicial del nombre (por
   ejemplo "M15", "N11", "B05"). Devuelve '' cuando no hay ninguna bodega
   equivalente en el reporte. */
function codigoBodega(nombre){
  const t=String(nombre||'').trim().split(/[\s.\-_/]+/).filter(Boolean);
  for(const p of t){
    const s=p.replace(/[^A-Z0-9]/gi,'').toUpperCase();
    if(s.length>=2 && s.length<=6 && /[0-9]/.test(s) && /^[A-Z]*[0-9]+$/.test(s)) return s;
  }
  return '';
}
function resolverBodegaReporte(punto, bodegas, cache){
  const p=normValue(punto);
  if(!p || !bodegas || !bodegas.size) return '';
  if(cache.has(p)) return cache.get(p);
  let r='';
  if(bodegas.has(p)) r=p;
  if(!r){
    let mejor='';
    bodegas.forEach(b=>{
      if(!b || b.length<4) return;
      if(p.includes(b) || b.includes(p)){ if(b.length>mejor.length) mejor=b; }
    });
    r=mejor;
  }
  if(!r){
    const cp=codigoBodega(p);
    if(cp){
      let mejor='';
      bodegas.forEach(b=>{ if(codigoBodega(b)===cp && b.length>mejor.length) mejor=b; });
      r=mejor;
    }
  }
  cache.set(p, r);
  return r;
}

function renderFacturasDetalle(filas){
  const tb=document.querySelector('#tblFacturasDetalle tbody');
  if(!tb) return;
  const diagEl=document.getElementById('facturasDetalleDiag');
  const vaciar=(msg)=>{
    tb.innerHTML='<tr><td colspan="8" class="txt" style="text-align:center;color:#9CA9B6;">'+escHtml(msg)+'</td></tr>';
    _facturasDetalleCache=[];
    _facturasSinBodegaCache=[];
    const b=document.getElementById('btnDescargarPuntosSinBodega');
    if(b) b.style.display='none';
  };
  if(!filas || !filas.length){ if(diagEl){diagEl.style.display='none';diagEl.innerHTML='';} vaciar('No hay facturas para los filtros seleccionados.'); return; }

  /* Filtros generales de la pantalla aplicados al detalle: rango de fechas / mes
     sobre la fecha de la factura y bodega-punto sobre el punto de venta. */
  const desdeStr=(document.getElementById('fFechaDesde')||{}).value||'';
  const hastaStr=(document.getElementById('fFechaHasta')||{}).value||'';
  const desde=desdeStr? new Date(desdeStr+'T00:00:00Z'):null;
  const hasta=hastaStr? new Date(hastaStr+'T23:59:59Z'):null;
  const mesSel=(document.getElementById('fMes')||{}).value||'';
  const bodegaTxt=getBodegaFiltro();
  filas=filas.filter(r=>{
    if(bodegaTxt && !normValue(r.puntoVenta).includes(bodegaTxt)) return false;
    if(r.fechaFactura){
      if(mesSel && mesKey(r.fechaFactura)!==mesSel) return false;
      if(desde && r.fechaFactura<desde) return false;
      if(hasta && r.fechaFactura>hasta) return false;
    }
    return true;
  });
  if(!filas.length){ if(diagEl){diagEl.style.display='none';diagEl.innerHTML='';} vaciar('No hay facturas para los filtros generales seleccionados.'); return; }

  const pend=getPendientesReporte();

  // Una fila por Factura + Código + Punto de venta (se suman las cantidades repetidas).
  const g=new Map();
  filas.forEach(r=>{
    const factura=String(r.factura||'').trim() || 'SIN NÚMERO';
    const codigo=normValue(r.codigo);
    const punto=r.puntoVenta || 'SIN PUNTO DE VENTA';
    const k=factura+'||'+codigo+'||'+punto;
    if(!g.has(k)) g.set(k, {factura, codigo, homologo:normValue(r.homologo)||codigo, descripcion:r.descripcion||'', descripcionDci:String(r.descripcionDci||'').trim(), punto, cantidad:0, fecha:r.fechaFactura||null});
    const o=g.get(k);
    o.cantidad+=toNumber(r.cantidad);
    if(!o.descripcion && r.descripcion) o.descripcion=r.descripcion;
    if(!o.descripcionDci && r.descripcionDci) o.descripcionDci=String(r.descripcionDci).trim();
    if(!o.fecha && r.fechaFactura) o.fecha=r.fechaFactura;
  });
  const lista=[...g.values()];

  /* Cruce del pendiente: BODEGA DETALLE del reporte (equivalente al punto de venta
     de la factura) + CÓDIGO DE HOMOLOGACIÓN del código facturado. El reporte no trae
     el número de factura, por eso el pendiente de esa bodega + homólogo se distribuye
     entre las facturas del grupo en proporción a lo facturado. Se reparte el pendiente
     completo (puede superar lo facturado de una fila); el tope del 100% se aplica al
     mostrar el % Subsanar. */
  const cacheBodega=new Map();
  const grupos=new Map();
  const puntosSinBodega=new Map(); // punto de venta sin bodega equivalente -> códigos
  lista.forEach(o=>{
    o.bodegaReporte=resolverBodegaReporte(o.punto, pend.bodegas, cacheBodega);
    o.pendiente=0;
    if(!o.bodegaReporte){
      if(!puntosSinBodega.has(o.punto)) puntosSinBodega.set(o.punto, new Map());
      const m=puntosSinBodega.get(o.punto);
      if(!m.has(o.codigo)) m.set(o.codigo, {codigo:o.codigo, homologo:o.homologo, descripcion:o.descripcion||'', descripcionDci:o.descripcionDci||'', cantidad:0, facturas:new Set()});
      const e=m.get(o.codigo);
      e.cantidad+=toNumber(o.cantidad);
      e.facturas.add(o.factura);
      if(!e.descripcion && o.descripcion) e.descripcion=o.descripcion;
      if(!e.descripcionDci && o.descripcionDci) e.descripcionDci=o.descripcionDci;
      return;
    }
    const k=o.bodegaReporte+'||'+o.homologo;
    if(!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(o);
  });

  grupos.forEach((items, k)=>{
    const total=toNumber(pend.porBodegaHom.get(k));
    const suma=items.reduce((a,o)=>a+toNumber(o.cantidad),0);
    if(!total || !suma) return;
    let acum=0;
    items.forEach((o,i)=>{
      const parte = (i===items.length-1) ? Math.max(0, total-acum) : Math.round(total*(toNumber(o.cantidad)/suma));
      o.pendiente=parte; acum+=parte;
    });
  });

  // Códigos cuyo punto de venta no tiene bodega equivalente en el reporte.
  const sinBodegaLista=[];
  puntosSinBodega.forEach((m, punto)=>{
    m.forEach(e=>sinBodegaLista.push({
      punto, codigo:e.codigo, homologo:e.homologo===e.codigo?'':e.homologo,
      descripcion:e.descripcion, descripcionDci:e.descripcionDci||'', cantidad:e.cantidad, facturas:e.facturas.size
    }));
  });
  sinBodegaLista.sort((a,b)=> (b.cantidad-a.cantidad) || a.punto.localeCompare(b.punto,'es') || a.codigo.localeCompare(b.codigo,'es'));
  _facturasSinBodegaCache=sinBodegaLista;
  const btnSB=document.getElementById('btnDescargarPuntosSinBodega');
  if(btnSB) btnSB.style.display = sinBodegaLista.length ? '' : 'none';

  lista.forEach(o=>{ o.pctSubsanar = pctSubsanarVal(o.pendiente, o.cantidad); });
  lista.sort((a,b)=>
    (b.pendiente-a.pendiente) ||
    a.punto.localeCompare(b.punto,'es') ||
    a.factura.localeCompare(b.factura,'es') ||
    a.codigo.localeCompare(b.codigo,'es')
  );
  _facturasDetalleCache=lista;

  if(diagEl){
    let t='';
    if(!pend.hayReporte) t='<b>Sin Reporte de Dispensación calculado.</b> La <b>Cantidad Pendiente</b> aparece en 0 hasta que se calculen los indicadores con el reporte cargado.';
    else if(sinBodegaLista.length>0) t='<b>Nota:</b> '+fmtInt(sinBodegaLista.length)+' códigos quedan en 0 porque su <b>punto de venta</b> no corresponde a ninguna <b>Bodega Detalle</b> del Reporte de Dispensación. Descarga el listado con el botón <b>"Descargar códigos sin bodega equivalente"</b>.';
    diagEl.innerHTML=t;
    diagEl.style.display = t ? '' : 'none';
  }

  const MAX_FILAS=1500;
  const visibles=lista.slice(0, MAX_FILAS);
  let h=visibles.map(o=>
    '<tr><td class="txt">'+escHtml(o.factura)+'</td>'+
    '<td class="txt">'+escHtml(o.codigo)+'</td>'+
    '<td class="txt">'+escHtml(o.homologo && o.homologo!==o.codigo ? o.homologo : '—')+'</td>'+
    '<td class="txt">'+escHtml(o.descripcionDci || '—')+'</td>'+
    '<td>'+fmtInt(o.cantidad)+'</td>'+
    '<td class="txt">'+escHtml(o.punto)+'</td>'+
    '<td><b>'+fmtInt(o.pendiente)+'</b></td>'+
    '<td>'+fmtPctSubsanar(o.pendiente, o.cantidad)+'</td></tr>'
  ).join('');
  const sumCant=lista.reduce((a,o)=>a+o.cantidad,0);
  const sumPend=lista.reduce((a,o)=>a+o.pendiente,0);
  h+='<tr class="total-row"><td class="txt">TOTAL ('+fmtInt(lista.length)+' filas)</td><td>—</td><td>—</td><td>—</td>'+
     '<td>'+fmtInt(sumCant)+'</td><td>—</td><td>'+fmtInt(sumPend)+'</td>'+
     '<td>'+fmtPctSubsanar(sumPend, sumCant)+'</td></tr>';
  if(lista.length>MAX_FILAS){
    h+='<tr><td colspan="8" class="txt" style="text-align:center;color:#9CA9B6;">Se muestran las primeras '+fmtInt(MAX_FILAS)+' filas de '+fmtInt(lista.length)+'. Descarga el Excel para ver el detalle completo.</td></tr>';
  }
  tb.innerHTML=h;
}

(function(){
  const el=document.getElementById('fFacturaPunto');
  if(el) el.addEventListener('change', renderInfoPorFactura);
})();

/* ---- Excel del detalle por factura y código (mismas columnas de la tabla) ---- */
(function(){
  const btn=document.getElementById('btnDescargarFacturasDetalle');
  if(!btn) return;
  btn.addEventListener('click', ()=>{
    if(!_facturasDetalleCache.length){ showToast('No hay detalle por factura para exportar.', true); return; }
    const detalle=_facturasDetalleCache.map(o=>({
      'Factura': o.factura,
      'Código': o.codigo,
      'Código de Homologación': (o.homologo && o.homologo!==o.codigo) ? o.homologo : '',
      'Descripción DCI': o.descripcionDci||'',
      'Descripción': o.descripcion||'',
      'Cantidad': o.cantidad,
      'Punto de Venta': o.punto,
      'Bodega Detalle del Reporte': o.bodegaReporte||'',
      'Cantidad Pendiente': o.pendiente,
      '% Subsanar': Number(pctSubsanarVal(o.pendiente, o.cantidad).toFixed(1))
    }));
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalle), 'Detalle por factura');
    const punto=(document.getElementById('fFacturaPunto')||{}).value||'';
    const sufijo=(punto || 'Todos').replace(/[^A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ ]+/g,'').trim().replace(/\s+/g,'_');
    XLSX.writeFile(wb, 'Detalle_por_Factura_'+sufijo+'_'+new Date().toISOString().slice(0,10)+'.xlsx');
    showToast('Excel exportado: '+fmtInt(detalle.length)+' filas de detalle por factura.');
  });
})();

/* ---- Excel de códigos cuyo punto de venta no tiene bodega equivalente en el reporte ---- */
(function(){
  const btn=document.getElementById('btnDescargarPuntosSinBodega');
  if(!btn) return;
  btn.addEventListener('click', ()=>{
    if(!_facturasSinBodegaCache.length){ showToast('No hay códigos sin bodega equivalente para exportar.', true); return; }
    const detalle=_facturasSinBodegaCache.map(o=>({
      'Punto de Venta (factura)': o.punto,
      'Código': o.codigo,
      'Código de Homologación': o.homologo||'',
      'Descripción': o.descripcion||'',
      'Cantidad Facturada': o.cantidad,
      'Facturas': o.facturas
    }));
    const bodegas=[...getPendientesReporte().bodegas].sort().map(b=>({'Bodega Detalle en el Reporte': b}));
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalle), 'Sin bodega equivalente');
    if(bodegas.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bodegas), 'Bodegas del reporte');
    XLSX.writeFile(wb, 'Codigos_sin_bodega_equivalente_'+new Date().toISOString().slice(0,10)+'.xlsx');
    showToast('Excel exportado: '+fmtInt(detalle.length)+' códigos sin bodega equivalente.');
  });
})();

/* ---- Excel de códigos facturados SIN homólogo (un registro por código y punto de venta) ---- */
(function(){
  const btn=document.getElementById('btnDescargarSinHomologo');
  if(!btn) return;
  btn.addEventListener('click', ()=>{
    const all=getFacturasRows();
    if(!all.length){ showToast('No hay facturas cargadas para exportar.', true); return; }

    const punto=(document.getElementById('fFacturaPunto')||{}).value||'';
    const filas=all.filter(r=>{
      if(punto && r.puntoVenta!==punto) return false;
      return r.codigo && !r.tieneHomologo;
    });
    if(!filas.length){ showToast('No hay códigos sin homólogo para el filtro actual.', true); return; }

    // Sin repetir códigos: se agrupa por Codigo + Punto de venta y se suma la cantidad.
    const g=new Map();
    filas.forEach(r=>{
      const k=r.codigo+'||'+r.puntoVenta;
      if(!g.has(k)) g.set(k, {codigo:r.codigo, descripcion:r.descripcion||'', punto:r.puntoVenta, cantidad:0, lineas:0});
      const o=g.get(k);
      o.cantidad+=r.cantidad; o.lineas++;
      if(!o.descripcion && r.descripcion) o.descripcion=r.descripcion;
    });

    const detalle=[...g.values()].sort((a,b)=>
      a.punto.localeCompare(b.punto,'es') || (b.cantidad-a.cantidad) || a.codigo.localeCompare(b.codigo,'es')
    ).map(o=>({
      'Código': o.codigo,
      'Descripción': o.descripcion,
      'Cantidad total': o.cantidad,
      'Punto de venta': o.punto
    }));

    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalle), 'Codigos sin Homologo');
    const fecha=new Date().toISOString().slice(0,10);
    const sufijo=(punto || 'Todos').replace(/[^A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ ]+/g,'').trim().replace(/\s+/g,'_');
    XLSX.writeFile(wb, 'Codigos_sin_Homologo_'+sufijo+'_'+fecha+'.xlsx');
    showToast('Excel exportado: '+fmtInt(detalle.length)+' códigos sin homólogo.');
  });
})();

// ---- Comparativo PRIMER CARGUE vs ÚLTIMO CARGUE del Reporte de Dispensación ----
// El Reporte de Dispensación es acumulativo: cada cargue trae de nuevo las mismas
// líneas con su estado actualizado. Comparando la primera versión de cada línea
// (línea base) contra la última versión cargada se ven los avances del periodo.
function renderComparativos(rows){
  const hayCargues = !!(state.processed && state.processed.hasCargues && rows && rows.length);
  ['cmpDispensaRow','cmpLineaRow'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.style.display = hayCargues ? 'grid' : 'none';
  });
  if(!hayCargues) return;

  const base   = calcularEstadoHastaCorte(rows, 0);   // primer cargue de cada línea
  const actual = calcularEstadoHastaCorte(rows, 3);   // último cargue del periodo

  // --- Dispensas: entregada/pendiente por Documento, antes vs después ---
  const dispTotal = actual.docPend.size;
  const dispEntAntes = Array.from(base.docPend.entries()).filter(([,p])=>p===false).length;
  const dispEntDespues = Array.from(actual.docPend.entries()).filter(([,p])=>p===false).length;
  drawDonut('cmpDispensaInicial', [
    {label:'Entregadas', value: dispEntAntes, color:'#1E8F5E'},
    {label:'Pendientes', value: dispTotal-dispEntAntes, color:'#D98A2B'}
  ], fmtPct(dispTotal? dispEntAntes/dispTotal: null));
  document.getElementById('cmpDispensaInicialLegend').innerHTML = `
    <div class="item"><span class="sw" style="background:#1E8F5E;"></span>Entregadas<span class="val">${fmtInt(dispEntAntes)}</span></div>
    <div class="item"><span class="sw" style="background:#D98A2B;"></span>Pendientes<span class="val">${fmtInt(dispTotal-dispEntAntes)}</span></div>`;
  drawDonut('cmpDispensaActual', [
    {label:'Entregadas / Cerradas', value: dispEntDespues, color:'#1E8F5E'},
    {label:'Aún pendientes', value: dispTotal-dispEntDespues, color:'#D98A2B'}
  ], fmtPct(dispTotal? dispEntDespues/dispTotal: null));
  document.getElementById('cmpDispensaActualLegend').innerHTML = `
    <div class="item"><span class="sw" style="background:#1E8F5E;"></span>Entregadas / Cerradas<span class="val">${fmtInt(dispEntDespues)}</span></div>
    <div class="item"><span class="sw" style="background:#D98A2B;"></span>Aún pendientes<span class="val">${fmtInt(dispTotal-dispEntDespues)}</span></div>`;

  // --- Líneas: entregada/pendiente, antes vs después ---
  const lineasTotal = base.snap.length;
  const lineasEntAntes = base.snap.filter(r=>r.lineaPendiente==='NO').length;
  const lineasEntDespues = actual.snap.filter(r=>actual.lineaPend.get(r.idx)==='NO').length;
  drawDonut('cmpLineaInicial', [
    {label:'Entregadas', value: lineasEntAntes, color:'#1E8F5E'},
    {label:'Pendientes', value: lineasTotal-lineasEntAntes, color:'#D98A2B'}
  ], fmtPct(lineasTotal? lineasEntAntes/lineasTotal: null));
  document.getElementById('cmpLineaInicialLegend').innerHTML = `
    <div class="item"><span class="sw" style="background:#1E8F5E;"></span>Entregadas<span class="val">${fmtInt(lineasEntAntes)}</span></div>
    <div class="item"><span class="sw" style="background:#D98A2B;"></span>Pendientes<span class="val">${fmtInt(lineasTotal-lineasEntAntes)}</span></div>`;
  drawDonut('cmpLineaActual', [
    {label:'Entregadas', value: lineasEntDespues, color:'#1E8F5E'},
    {label:'Pendientes', value: lineasTotal-lineasEntDespues, color:'#D98A2B'}
  ], fmtPct(lineasTotal? lineasEntDespues/lineasTotal: null));
  document.getElementById('cmpLineaActualLegend').innerHTML = `
    <div class="item"><span class="sw" style="background:#1E8F5E;"></span>Entregadas<span class="val">${fmtInt(lineasEntDespues)}</span></div>
    <div class="item"><span class="sw" style="background:#D98A2B;"></span>Pendientes<span class="val">${fmtInt(lineasTotal-lineasEntDespues)}</span></div>`;
}

/* =========================================================================
   9. Utilidad de agrupación
   ========================================================================= */
let lastTables={dispensa:[], linea:[], soporte:[]};
// Contexto del Indicador Soporte Evento: guarda el MISMO dataset ya filtrado por bodega
// y zona, el estado acumulado por dispensa y el corte de trazabilidad usado en pantalla,
// para que las descargas (CSV / Excel) entreguen exactamente lo que se esta viendo.
let lastSoporteCtx=null;

function groupByBodega(rows, bodegaSearch, zona){
  const g=new Map();
  rows.forEach(r=>{
    if(bodegaSearch && !normValue(r.bodegaDetalle).includes(bodegaSearch)) return;
    if(zona && r.zona!==zona) return;
    if(!g.has(r.bodegaDetalle)) g.set(r.bodegaDetalle, {zona:r.zona, bodega:r.bodegaDetalle, rows:[]});
    g.get(r.bodegaDetalle).rows.push(r);
  });
  return Array.from(g.values()).sort((a,b)=>(a.zona+a.bodega).localeCompare(b.zona+b.bodega,'es'));
}
function sumField(arr, f){ return arr.reduce((a,b)=>a+(b[f]||0),0); }
// Texto corto para las tarjetas: indica sobre cuantas bodegas / que filtro se calculo
// el acumulado, para que se vea que las tarjetas siguen al selector de bodega.
function describirAlcanceFiltro(table, bodegaSearch, zona){
  const n = (table||[]).length;
  const partes = [];
  if(bodegaSearch) partes.push('bodega «'+bodegaSearch+'»');
  if(zona) partes.push('zona '+zona);
  const base = n===1 ? (table[0].bodega||'1 bodega') : fmtInt(n)+' bodegas';
  return partes.length ? (base+' · filtro: '+partes.join(' + ')) : (base+' (todas)');
}

/* =========================================================================
   10. Indicador de Dispensa (1.1 - 1.13)
   ========================================================================= */
function renderIndicadorDispensa(rowsAllRaw, bodegaSearch, zona){
  // Este indicador cuenta SOLO las dispensas con Estado Activo: las INACTIVO se
  // excluyen por completo (tienen su propia pestana).
  const rowsAll = soloActivas(rowsAllRaw);
  // ---- 1.1 - 1.5.3: resumen GLOBAL (sobre rowsAll, sin filtro de bodega/zona) ----
  const totalDispensas = new Set(rowsAll.map(r=>r.dispensaYPunto)).size;
  const capitaRows = rowsAll.filter(r=>r.contrato==='CAPITA');
  const eventoRows = rowsAll.filter(r=>r.contrato==='EVENTO');
  const dispCapita = new Set(capitaRows.map(r=>r.dispensaYPunto)).size;
  const dispEvento = new Set(eventoRows.map(r=>r.dispensaYPunto)).size;
  const dispConSoporte = new Set(rowsAll.filter(r=>r.tieneSoportes==='TIENE SOPORTE').map(r=>r.dispensaYPunto)).size;
  const dispSinSoporte = new Set(rowsAll.filter(r=>r.tieneSoportes==='NO TIENE SOPORTES').map(r=>r.dispensaYPunto)).size;
  const sinSoporteCapita = new Set(capitaRows.filter(r=>r.tieneSoportes==='NO TIENE SOPORTES').map(r=>r.dispensaYPunto)).size;
  const sinSoporteEvento = new Set(eventoRows.filter(r=>r.tieneSoportes==='NO TIENE SOPORTES').map(r=>r.dispensaYPunto)).size;
  const pctSinSopCapita = dispSinSoporte ? sinSoporteCapita/dispSinSoporte : null;
  const pctSinSopEvento = dispSinSoporte ? sinSoporteEvento/dispSinSoporte : null;

  document.getElementById('statsDispensa').innerHTML = `
    <div class="stat"><div class="label">1.1 Total de dispensas</div><div class="value">${fmtInt(totalDispensas)}</div></div>
    <div class="stat"><div class="label">1.2 Dispensas Capita</div><div class="value">${fmtInt(dispCapita)}</div></div>
    <div class="stat"><div class="label">1.3 Dispensas Evento</div><div class="value">${fmtInt(dispEvento)}</div></div>
    <div class="stat"><div class="label">1.4 Con soporte</div><div class="value">${fmtInt(dispConSoporte)}</div><div class="sub">${fmtPct(totalDispensas?dispConSoporte/totalDispensas:null)} del total</div></div>
    <div class="stat warn"><div class="label">1.5 Sin soporte</div><div class="value">${fmtInt(dispSinSoporte)}</div><div class="sub">${fmtPct(totalDispensas?dispSinSoporte/totalDispensas:null)} del total</div></div>
    <div class="stat"><div class="label">1.5.1 Sin soporte · Capita</div><div class="value">${fmtInt(sinSoporteCapita)}</div><div class="sub">${fmtPct(pctSinSopCapita)} de las sin soporte</div></div>
    <div class="stat"><div class="label">1.5.2 Sin soporte · Evento</div><div class="value">${fmtInt(sinSoporteEvento)}</div><div class="sub">${fmtPct(pctSinSopEvento)} de las sin soporte</div></div>
  `;

  // ---- 1.6 - 1.12: por bodega detalle (con filtro de búsqueda / zona) ----
  const groups = groupByBodega(rowsAll, bodegaSearch, zona);
  const table = groups.map(g=>{
    const rs=g.rows;
    const dispSet=new Set(), dispEntSet=new Set(), dispPenSet=new Set();
    let lineas=0, lineasEnt=0, lineasPen=0;
    rs.forEach(r=>{
      dispSet.add(r.dispensaYPunto);
      if(r.pendienteDispensa==='NO') dispEntSet.add(r.dispensaYPunto); else dispPenSet.add(r.dispensaYPunto);
      lineas++; if(r.lineaPendiente==='NO') lineasEnt++; else lineasPen++;
    });
    const dispensas=dispSet.size, ent=dispEntSet.size, pen=dispPenSet.size;
    return {
      zona:g.zona, bodega:g.bodega, dispensas, dispensasEntregadas:ent, dispensasPendientes:pen,
      lineas, lineasEntregadas:lineasEnt, lineasPendientes:lineasPen,
      efDispensa: dispensas? ent/dispensas: null, pendDispensa: dispensas? 1-ent/dispensas: null
    };
  });
  // Orden: de mayor a menor Índice de Pendientes (las bodegas más críticas primero).
  // Desempate: más dispensas pendientes primero y luego orden alfabético, para que
  // el listado sea estable entre cargues.
  table.sort((a,b)=>{
    const d=(b.pendDispensa||0)-(a.pendDispensa||0);
    if(Math.abs(d)>1e-12) return d;
    if((b.dispensasPendientes||0)!==(a.dispensasPendientes||0)) return (b.dispensasPendientes||0)-(a.dispensasPendientes||0);
    return (a.zona+a.bodega).localeCompare(b.zona+b.bodega,'es');
  });
  lastTables.dispensa=table;

  pintarTablaDispensa();

  // ---- 1.13 gráfico de pastel (por bodega o general) ----
  renderPieSelector(table);
}

// Orden configurable de la tabla del indicador por dispensa.
let dispensaOrden={col:'pendDispensa', dir:'desc'};

function pintarTablaDispensa(){
  const tbody=document.querySelector('#tblDispensa tbody');
  if(!tbody) return;
  const table=(lastTables.dispensa||[]).slice();
  const col=dispensaOrden.col, dir=(dispensaOrden.dir==='asc')?1:-1;
  table.sort((a,b)=>{
    const va=(a[col]==null)?-1:a[col], vb=(b[col]==null)?-1:b[col];
    if(va===vb){
      if((b.dispensasPendientes||0)!==(a.dispensasPendientes||0)) return (b.dispensasPendientes||0)-(a.dispensasPendientes||0);
      return String(a.zona+a.bodega).localeCompare(String(b.zona+b.bodega),'es');
    }
    return (va-vb)*dir;
  });
  let bodyHtml = table.map(t=>`
    <tr>
      <td class="txt">${t.zona}</td><td class="txt">${t.bodega}</td>
      <td>${fmtInt(t.dispensas)}</td><td>${fmtInt(t.dispensasEntregadas)}</td><td>${fmtInt(t.dispensasPendientes)}</td>
      <td class="${effClass(t.efDispensa)}">${fmtPct(t.efDispensa)}</td><td class="${pendClass(t.pendDispensa)}">${fmtPct(t.pendDispensa)}</td>
    </tr>`).join('');
  if(!table.length) bodyHtml='<tr><td colspan="7" class="txt" style="text-align:center;color:#9CA9B6;">Sin datos para el filtro seleccionado.</td></tr>';
  else{
    // 1.10 fila de totales
    const tD=sumField(table,'dispensas'), tE=sumField(table,'dispensasEntregadas'), tP=sumField(table,'dispensasPendientes');
    bodyHtml += `<tr class="total-row"><td class="txt">—</td><td class="txt">TOTAL (${table.length} bodegas)</td>
      <td>${fmtInt(tD)}</td><td>${fmtInt(tE)}</td><td>${fmtInt(tP)}</td>
      <td class="${effClass(tD?tE/tD:null)}">${fmtPct(tD?tE/tD:null)}</td><td class="${pendClass(tD?1-tE/tD:null)}">${fmtPct(tD?1-tE/tD:null)}</td></tr>`;
  }
  tbody.innerHTML=bodyHtml;
  actualizarControlesOrdenDispensa();
}

function actualizarControlesOrdenDispensa(){
  document.querySelectorAll('#tblDispensa thead th.sortable').forEach(th=>{
    const ind=th.querySelector('.sort-ind');
    const activo = th.dataset.col===dispensaOrden.col;
    th.classList.toggle('sort-active', activo);
    if(ind) ind.textContent = activo ? (dispensaOrden.dir==='asc'?'▲':'▼') : '⇅';
  });
  const selCol=document.getElementById('fDispensaOrdenCol');
  const selDir=document.getElementById('fDispensaOrdenDir');
  if(selCol) selCol.value=dispensaOrden.col;
  if(selDir) selDir.value=dispensaOrden.dir;
}

function initOrdenDispensa(){
  const selCol=document.getElementById('fDispensaOrdenCol');
  const selDir=document.getElementById('fDispensaOrdenDir');
  if(selCol) selCol.addEventListener('change', ()=>{ dispensaOrden.col=selCol.value; pintarTablaDispensa(); });
  if(selDir) selDir.addEventListener('change', ()=>{ dispensaOrden.dir=selDir.value; pintarTablaDispensa(); });
  document.querySelectorAll('#tblDispensa thead th.sortable').forEach(th=>{
    th.addEventListener('click', ()=>{
      const c=th.dataset.col;
      if(dispensaOrden.col===c) dispensaOrden.dir=(dispensaOrden.dir==='asc')?'desc':'asc';
      else { dispensaOrden.col=c; dispensaOrden.dir='desc'; }
      pintarTablaDispensa();
    });
  });
  actualizarControlesOrdenDispensa();
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', initOrdenDispensa); else initOrdenDispensa();

function renderPieSelector(table){
  const sel=document.getElementById('pieBodegaSelect');
  const prevVal=sel.value;
  sel.innerHTML = `<option value="__ALL__">Todas las bodegas (general)</option>` + table.map(t=>`<option value="${t.bodega}">${t.bodega}</option>`).join('');
  sel.value = table.some(t=>t.bodega===prevVal) ? prevVal : '__ALL__';
  sel.onchange = ()=>drawPieForSelection(table);
  drawPieForSelection(table);
}
let lastPieDispensa=null;
function drawPieForSelection(table){
  const sel=document.getElementById('pieBodegaSelect').value;
  let ef, pend, label;
  if(sel==='__ALL__'){
    const tD=sumField(table,'dispensas'), tE=sumField(table,'dispensasEntregadas');
    ef = tD? tE/tD : 0; pend = 1-ef; label='General';
  }else{
    const row=table.find(t=>t.bodega===sel);
    ef = row && row.efDispensa!==null ? row.efDispensa : 0;
    pend = row && row.pendDispensa!==null ? row.pendDispensa : 0;
    label = sel;
  }
  drawDonut('pieDispensa', [
    {label:'Indicador de eficiencia', value:ef, color:'#1E8F5E'},
    {label:'Índice de pendiente', value:pend, color:'#D98A2B'}
  ], (ef*100).toFixed(1)+'%');
  // Se guardan los valores en pantalla para poder exportar la imagen del indicador.
  lastPieDispensa={ef:ef, pend:pend, label:label, row:(sel==='__ALL__'?null:table.find(t=>t.bodega===sel)), table:table, isAll:(sel==='__ALL__')};
  document.getElementById('pieLegend').innerHTML = `
    <div class="item"><span class="sw" style="background:#1E8F5E;"></span>Eficiencia<span class="val">${fmtPct(ef)}</span></div>
    <div class="item"><span class="sw" style="background:#D98A2B;"></span>Pendiente<span class="val">${fmtPct(pend)}</span></div>
    <div class="item" style="color:#5C6C7E;font-size:11px;">${label}</div>
  `;
}
function drawDonut(svgId, slices, centerText, centerColor){
  const svg=document.getElementById(svgId);
  if(!svg) return;
  const cx=100, cy=100, r=80, rInner=48;
  const NS='http://www.w3.org/2000/svg';
  let start=-Math.PI/2;
  const total = slices.reduce((a,b)=>a+b.value,0) || 1;
  // Limpiar contenido previo (compatible con todos los navegadores)
  while(svg.firstChild) svg.removeChild(svg.firstChild);
  slices.forEach(s=>{
    const angle=(s.value/total)*Math.PI*2;
    const end=start+angle;
    const x1=cx+r*Math.cos(start), y1=cy+r*Math.sin(start);
    const x2=cx+r*Math.cos(end), y2=cy+r*Math.sin(end);
    const large = angle>Math.PI ? 1:0;
    const d=`M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${cx+rInner*Math.cos(end)} ${cy+rInner*Math.sin(end)} A ${rInner} ${rInner} 0 ${large} 0 ${cx+rInner*Math.cos(start)} ${cy+rInner*Math.sin(start)} Z`;
    const path=document.createElementNS(NS,'path');
    path.setAttribute('d',d);
    path.setAttribute('fill',s.color);
    svg.appendChild(path);
    start=end;
  });
  const text=document.createElementNS(NS,'text');
  text.setAttribute('x',cx);
  text.setAttribute('y',cy+7);
  text.setAttribute('text-anchor','middle');
  text.setAttribute('class','pie-center-label');
  if(centerColor) text.style.fill=centerColor;
  text.textContent=centerText;
  svg.appendChild(text);
}

// ---- Descargar imagen (PNG) del indicador de dispensa: dona + zona + bodega ----
function descargarImagenIndicadorDispensa(){
  if(!lastPieDispensa){ showToast('Primero calcula los indicadores.', true); return; }
  const d=lastPieDispensa;
  const zonaSel=document.getElementById('fZona').value || 'Todas las zonas';
  const bodegaSel=d.isAll ? 'Todas las bodegas (general)' : d.label;
  let disp=0, ent=0, pen=0;
  if(d.isAll){
    disp=sumField(d.table,'dispensas'); ent=sumField(d.table,'dispensasEntregadas'); pen=sumField(d.table,'dispensasPendientes');
  }else if(d.row){
    disp=d.row.dispensas; ent=d.row.dispensasEntregadas; pen=d.row.dispensasPendientes;
  }
  const W=760, H=430, scale=2;
  const cv=document.createElement('canvas');
  cv.width=W*scale; cv.height=H*scale;
  const ctx=cv.getContext('2d');
  ctx.scale(scale,scale);
  // Fondo y marco
  ctx.fillStyle='#FFFFFF'; ctx.fillRect(0,0,W,H);
  ctx.strokeStyle='#D8E2EC'; ctx.lineWidth=1; ctx.strokeRect(0.5,0.5,W-1,H-1);
  ctx.fillStyle='#063C6B'; ctx.fillRect(0,0,W,6);
  // Encabezado
  ctx.fillStyle='#063C6B'; ctx.font='bold 20px Georgia, serif';
  ctx.fillText('Indicador de dispensa', 28, 46);
  ctx.fillStyle='#5C6C7E'; ctx.font='13px Arial, sans-serif';
  ctx.fillText('Zona: '+zonaSel, 28, 70);
  ctx.fillText('Bodega: '+bodegaSel, 28, 90);
  const hoy=new Date();
  ctx.fillText('Generado: '+hoy.toISOString().slice(0,10), 28, 110);
  ctx.strokeStyle='#E6EDF4'; ctx.beginPath(); ctx.moveTo(28,126); ctx.lineTo(W-28,126); ctx.stroke();
  // Dona
  const cx=170, cy=282, rOut=100, rIn=60;
  const slices=[{v:d.ef,c:'#1E8F5E'},{v:d.pend,c:'#D98A2B'}];
  const total=slices.reduce((a,b)=>a+(b.v||0),0) || 1;
  let start=-Math.PI/2;
  slices.forEach(s=>{
    const ang=((s.v||0)/total)*Math.PI*2;
    if(ang<=0) return;
    ctx.beginPath();
    ctx.arc(cx,cy,rOut,start,start+ang,false);
    ctx.arc(cx,cy,rIn,start+ang,start,true);
    ctx.closePath();
    ctx.fillStyle=s.c; ctx.fill();
    start+=ang;
  });
  ctx.fillStyle='#063C6B'; ctx.font='bold 26px Consolas, monospace'; ctx.textAlign='center';
  ctx.fillText((d.ef*100).toFixed(1)+'%', cx, cy+9);
  ctx.font='11px Arial, sans-serif'; ctx.fillStyle='#5C6C7E';
  ctx.fillText('Eficiencia', cx, cy+26);
  ctx.textAlign='left';
  // Leyenda + cifras
  const lx=320; let ly=180;
  const linea=(color,texto,valor)=>{
    if(color){ ctx.fillStyle=color; ctx.fillRect(lx,ly-11,12,12); }
    ctx.fillStyle='#1B2733'; ctx.font='14px Arial, sans-serif';
    ctx.fillText(texto, lx+(color?22:0), ly);
    if(valor!==undefined){
      ctx.font='bold 14px Consolas, monospace'; ctx.fillStyle='#063C6B';
      ctx.textAlign='right'; ctx.fillText(valor, W-40, ly); ctx.textAlign='left';
    }
    ly+=30;
  };
  linea('#1E8F5E','Indicador de eficiencia', fmtPct(d.ef));
  linea('#D98A2B','Índice de pendiente', fmtPct(d.pend));
  ly+=6;
  ctx.strokeStyle='#E6EDF4'; ctx.beginPath(); ctx.moveTo(lx,ly-16); ctx.lineTo(W-40,ly-16); ctx.stroke();
  linea(null,'Total dispensas', fmtInt(disp));
  linea(null,'Dispensas entregadas', fmtInt(ent));
  linea(null,'Dispensas pendientes', fmtInt(pen));
  ctx.fillStyle='#9CA9B6'; ctx.font='11px Arial, sans-serif';
  ctx.fillText('Solo dispensas con estado activo.', 28, H-20);
  // Descargar
  const a=document.createElement('a');
  const slug=(bodegaSel+'_'+zonaSel).replace(/[^A-Za-z0-9\-_]+/g,'_').slice(0,60);
  a.download='Indicador_Dispensa_'+slug+'_'+hoy.toISOString().slice(0,10)+'.png';
  a.href=cv.toDataURL('image/png');
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  showToast('Imagen del indicador de dispensa descargada.');
}
document.getElementById('btnDescargarImagenDispensa').addEventListener('click', descargarImagenIndicadorDispensa);

/* ---- Imagen PNG del Top 20 de bodegas detalle (Reporte de Dispensacion) ----
   modo='eficiencia' -> mejores indicadores de eficiencia (mayor a menor)
   modo='pendiente'  -> indices de pendientes mas altos (mayor a menor)
   La imagen incluye la zona, las 20 bodegas detalle del top y el grafico
   general (dona agregada) de ese grupo de bodegas. */
function descargarImagenTopBodegasDispensa(modo){
  const tabla = (lastTables && lastTables.dispensa) ? lastTables.dispensa : null;
  if(!tabla || !tabla.length){ showToast('Primero calcula los indicadores.', true); return; }

  const esEf = (modo === 'eficiencia');
  // Solo bodegas con dispensas activas: sin dispensas no hay indicador comparable.
  // En el Top 20 de mayor índice de pendientes se excluyen además las bodegas cuya zona
  // corresponde a puntos cerrados (zona "CERRADAS"), de modo que el listado siga
  // teniendo 20 bodegas operativas.
  const esZonaCerrada = (z)=> normValue(z).indexOf('CERRAD') >= 0;
  const base = tabla.filter(t => (t.dispensas||0) > 0 && (esEf || !esZonaCerrada(t.zona)));
  if(!base.length){ showToast('No hay bodegas con dispensas activas para el filtro actual.', true); return; }

  const orden = base.slice().sort((a,b)=>{
    const va = esEf ? (a.efDispensa||0) : (a.pendDispensa||0);
    const vb = esEf ? (b.efDispensa||0) : (b.pendDispensa||0);
    if(Math.abs(vb-va) > 1e-12) return vb-va;
    if((b.dispensas||0) !== (a.dispensas||0)) return (b.dispensas||0)-(a.dispensas||0);
    return (a.zona+a.bodega).localeCompare(b.zona+b.bodega,'es');
  });
  const top = orden.slice(0, 20);

  const zonaSel = document.getElementById('fZona').value || 'Todas las zonas';
  const titulo = esEf ? 'Top 20 bodegas detalle · Mejor indicador de eficiencia'
                      : 'Top 20 bodegas detalle · Mayor índice de pendientes';
  const criterio = esEf ? 'Ordenado por indicador de eficiencia, de mayor a menor.'
                        : 'Ordenado por índice de pendientes, de mayor a menor. Se excluyen las bodegas de zonas cerradas.';
  const acento = esEf ? '#1E8F5E' : '#D98A2B';

  const tD=sumField(top,'dispensas'), tE=sumField(top,'dispensasEntregadas'), tP=sumField(top,'dispensasPendientes');
  const efG = tD ? tE/tD : 0;
  const pendG = tD ? 1-efG : 0;

  const rowH=23, headH=286, filasY=headH+34;
  const W=1020, H=filasY + rowH*top.length + 56, scale=2;
  const cv=document.createElement('canvas');
  cv.width=W*scale; cv.height=H*scale;
  const ctx=cv.getContext('2d');
  ctx.scale(scale,scale);

  ctx.fillStyle='#FFFFFF'; ctx.fillRect(0,0,W,H);
  ctx.strokeStyle='#D8E2EC'; ctx.lineWidth=1; ctx.strokeRect(0.5,0.5,W-1,H-1);
  ctx.fillStyle='#063C6B'; ctx.fillRect(0,0,W,6);

  // Recorta un texto al ancho disponible para que nunca invada otra zona
  const recorta=(txt, max)=>{
    let s=String(txt||'');
    if(ctx.measureText(s).width<=max) return s;
    while(s.length>1 && ctx.measureText(s+'…').width>max) s=s.slice(0,-1);
    return s+'…';
  };

  // Encabezado: titulo en su propia franja, ocupando todo el ancho
  let fTit=22;
  ctx.fillStyle='#063C6B'; ctx.font='bold '+fTit+'px Georgia, serif';
  while(fTit>14 && ctx.measureText(titulo).width > W-56){ fTit-=1; ctx.font='bold '+fTit+'px Georgia, serif'; }
  ctx.fillText(recorta(titulo, W-56), 28, 46);

  const hoy=new Date();
  ctx.fillStyle='#5C6C7E'; ctx.font='13px Arial, sans-serif';
  ctx.fillText(recorta('Zona: '+zonaSel+'   ·   '+criterio, W-56), 28, 72);

  ctx.strokeStyle='#E6EDF4'; ctx.beginPath(); ctx.moveTo(28,88); ctx.lineTo(W-28,88); ctx.stroke();

  // Bloque izquierdo: datos de contexto (no invade el resumen ni la dona)
  const panelTop=104;
  let my=panelTop+18;
  ctx.font='bold 12px Arial, sans-serif'; ctx.fillStyle='#063C6B';
  ctx.fillText('Contexto del reporte', 28, my); my+=21;
  ctx.font='12px Arial, sans-serif'; ctx.fillStyle='#5C6C7E';
  [['Fecha de generación', hoy.toISOString().slice(0,10)],
   ['Bodegas evaluadas', fmtInt(base.length)],
   ['Bodegas mostradas', fmtInt(top.length)]].forEach(p=>{
    ctx.fillStyle='#5C6C7E'; ctx.font='12px Arial, sans-serif';
    ctx.fillText(p[0], 28, my);
    ctx.fillStyle='#1B2733'; ctx.font='bold 12px Consolas, monospace';
    ctx.textAlign='right'; ctx.fillText(p[1], 300, my); ctx.textAlign='left';
    my+=19;
  });

  // Grafico general (dona) del grupo de bodegas del top
  const cx=W-124, cy=panelTop+78, rOut=76, rIn=46;
  const slices=[{v:efG,c:'#1E8F5E'},{v:pendG,c:'#D98A2B'}];
  const tot=slices.reduce((a,b)=>a+(b.v||0),0) || 1;
  let start=-Math.PI/2;
  slices.forEach(s=>{
    const ang=((s.v||0)/tot)*Math.PI*2;
    if(ang<=0) return;
    ctx.beginPath();
    ctx.arc(cx,cy,rOut,start,start+ang,false);
    ctx.arc(cx,cy,rIn,start+ang,start,true);
    ctx.closePath();
    ctx.fillStyle=s.c; ctx.fill();
    start+=ang;
  });
  ctx.textAlign='center';
  ctx.fillStyle='#063C6B'; ctx.font='bold 25px Consolas, monospace';
  ctx.fillText(((esEf?efG:pendG)*100).toFixed(1)+'%', cx, cy+4);
  ctx.font='11.5px Arial, sans-serif'; ctx.fillStyle='#5C6C7E';
  ctx.fillText(esEf?'Eficiencia':'Pendiente', cx, cy+24);
  ctx.textAlign='left';

  // Resumen general del top 20 (columna central, entre el contexto y la dona)
  const rx=W-616; let ry=panelTop+18;
  ctx.font='bold 12px Arial, sans-serif'; ctx.fillStyle='#063C6B';
  ctx.fillText('General del Top 20', rx, ry); ry+=21;
  ctx.font='12px Arial, sans-serif';
  const resumen=[
    ['Dispensas totales', fmtInt(tD)],
    ['Entregadas', fmtInt(tE)],
    ['Pendientes', fmtInt(tP)],
    ['Eficiencia / Pendiente', fmtPct(efG)+' / '+fmtPct(pendG)]
  ];
  resumen.forEach(p=>{
    ctx.fillStyle='#5C6C7E'; ctx.fillText(p[0], rx, ry);
    ctx.fillStyle='#1B2733'; ctx.font='bold 12px Consolas, monospace';
    ctx.textAlign='right'; ctx.fillText(p[1], rx+230, ry); ctx.textAlign='left';
    ctx.font='12px Arial, sans-serif';
    ry+=19;
  });

  // Leyenda de colores de la dona
  ry+=8;
  [['Entregadas (eficiencia)','#1E8F5E'],['Pendientes','#D98A2B']].forEach(l=>{
    ctx.fillStyle=l[1]; ctx.fillRect(rx, ry-9, 11, 11);
    ctx.fillStyle='#5C6C7E'; ctx.font='11.5px Arial, sans-serif';
    ctx.fillText(l[0], rx+18, ry);
    ry+=18;
  });

  ctx.strokeStyle='#E6EDF4'; ctx.beginPath(); ctx.moveTo(28,headH-26); ctx.lineTo(W-28,headH-26); ctx.stroke();

  // Cabecera de la tabla
  const colX=[36, 66, 210, 470, 560, 650, 750, 880];
  ctx.fillStyle='#F2F7FB'; ctx.fillRect(28, headH-16, W-56, 26);
  ctx.fillStyle='#063C6B'; ctx.font='bold 11.5px Arial, sans-serif';
  ctx.fillText('#', colX[0], headH+2);
  ctx.fillText('Zona', colX[1], headH+2);
  ctx.fillText('Bodega detalle', colX[2], headH+2);
  ctx.textAlign='right';
  ctx.fillText('Total', colX[3]+50, headH+2);
  ctx.fillText('Entregadas', colX[4]+80, headH+2);
  ctx.fillText('Pendientes', colX[5]+80, headH+2);
  ctx.fillText('Eficiencia', colX[6]+90, headH+2);
  ctx.fillText('Índice pend.', colX[7]+100, headH+2);
  ctx.textAlign='left';

  const corta=(txt, max)=>{
    let s=String(txt||'');
    if(ctx.measureText(s).width<=max) return s;
    while(s.length>3 && ctx.measureText(s+'…').width>max) s=s.slice(0,-1);
    return s+'…';
  };

  // Filas del top
  let y=filasY+11;
  top.forEach((t,i)=>{
    if(i%2===1){ ctx.fillStyle='#FAFCFE'; ctx.fillRect(28, y-15, W-56, rowH); }
    ctx.font='11.5px Arial, sans-serif';
    ctx.fillStyle='#9CA9B6'; ctx.fillText(String(i+1), colX[0], y);
    ctx.fillStyle='#5C6C7E'; ctx.fillText(corta(t.zona, 135), colX[1], y);
    ctx.fillStyle='#1B2733'; ctx.font='bold 11.5px Arial, sans-serif';
    ctx.fillText(corta(t.bodega, 250), colX[2], y);
    ctx.font='11.5px Consolas, monospace'; ctx.textAlign='right';
    ctx.fillStyle='#1B2733';
    ctx.fillText(fmtInt(t.dispensas), colX[3]+50, y);
    ctx.fillText(fmtInt(t.dispensasEntregadas), colX[4]+80, y);
    ctx.fillText(fmtInt(t.dispensasPendientes), colX[5]+80, y);
    ctx.fillStyle= esEf ? acento : '#5C6C7E';
    ctx.font=(esEf?'bold ':'')+'11.5px Consolas, monospace';
    ctx.fillText(fmtPct(t.efDispensa), colX[6]+90, y);
    ctx.fillStyle= esEf ? '#5C6C7E' : acento;
    ctx.font=(esEf?'':'bold ')+'11.5px Consolas, monospace';
    ctx.fillText(fmtPct(t.pendDispensa), colX[7]+100, y);
    ctx.textAlign='left';
    ctx.strokeStyle='#EEF3F8'; ctx.beginPath(); ctx.moveTo(28,y+8); ctx.lineTo(W-28,y+8); ctx.stroke();
    y+=rowH;
  });

  ctx.fillStyle='#9CA9B6'; ctx.font='11px Arial, sans-serif';
  ctx.fillText('Solo dispensas con estado activo. El gráfico general corresponde al agregado de las 20 bodegas mostradas.', 28, H-18);

  const a=document.createElement('a');
  const slug=zonaSel.replace(/[^A-Za-z0-9\-_]+/g,'_').slice(0,40);
  a.download='Top20_'+(esEf?'Mejor_Eficiencia':'Mayor_Indice_Pendiente')+'_'+slug+'_'+hoy.toISOString().slice(0,10)+'.png';
  a.href=cv.toDataURL('image/png');
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  showToast('Imagen del Top 20 ('+(esEf?'mejor eficiencia':'mayor índice de pendientes')+') descargada.');
}
(function(){
  const b1=document.getElementById('btnImagenTopEficiencia');
  const b2=document.getElementById('btnImagenTopPendiente');
  if(b1) b1.addEventListener('click', ()=>descargarImagenTopBodegasDispensa('eficiencia'));
  if(b2) b2.addEventListener('click', ()=>descargarImagenTopBodegasDispensa('pendiente'));
})();

// Selector genérico de gráfico de pastel: permite ver "General" (agregado de todas las
// bodegas, recalculando las razones sobre las sumas) o una bodega puntual.
function setupGenericPieSelector(selectId, svgId, legendId, table, aggregateFn, getSlices, opts){
  opts = opts || {};
  const mode = opts.mode || 'fraction';
  const sel=document.getElementById(selectId);
  const prevVal=sel.value;
  sel.innerHTML = `<option value="__ALL__">Todas las bodegas (general)</option>` + table.map(t=>`<option value="${t.bodega}">${t.bodega}</option>`).join('');
  sel.value = table.some(t=>t.bodega===prevVal) ? prevVal : '__ALL__';
  const draw=()=>{
    const selVal=sel.value;
    const row = selVal==='__ALL__' ? aggregateFn(table) : table.find(t=>t.bodega===selVal);
    const slices = row ? getSlices(row) : [];
    const sumSlices = slices.reduce((a,b)=>a+(b.value||0),0);
    // Base de referencia del gráfico. Por defecto es la suma de los segmentos, pero
    // cuando un mismo registro puede caer en varios segmentos (p. ej. una línea que
    // pertenece a dos cohortes) se indica el total REAL con opts.totalFn para que el
    // número del centro coincida con los KPIs y con la otra dona.
    const total = (opts.totalFn && row) ? (opts.totalFn(row, slices) || 0) : sumSlices;
    let centerText;
    if (opts.centerFn) centerText = opts.centerFn(slices, total);
    else if (mode==='count') centerText = fmtInt(total);
    else centerText = fmtPct(total);
    drawDonut(svgId, slices.length?slices:[{label:'',value:1,color:'#DCE4EC'}], centerText);
    const legend=document.getElementById(legendId);
    const nota = (opts.notaFn && row) ? (opts.notaFn(row, slices, total, sumSlices) || '') : '';
    legend.innerHTML = slices.map(s=>{
      const valText = mode==='count' ? (fmtInt(s.value)+' ('+fmtPct(total? s.value/total:null)+')') : fmtPct(s.value);
      return `<div class="item"><span class="sw" style="background:${s.color};"></span>${s.label}<span class="val">${valText}</span></div>`;
    }).join('') + `<div class="item" style="color:var(--ink-soft);font-size:11px;">${selVal==='__ALL__'?'General':selVal}</div>`
      + (nota ? `<div class="item" style="color:var(--ink-soft);font-size:11px;line-height:1.4;">${nota}</div>` : '');
  };
  sel.onchange=draw;
  draw();
}
// Igual que setupGenericPieSelector, pero un solo <select> maneja DOS donas a la vez
// (usado para Moléculas Pareto / No Pareto en una sola tarjeta).
function setupDualPieSelector(selectId, table, aggregateFn, chartsCfg){
  const sel=document.getElementById(selectId);
  const prevVal=sel.value;
  sel.innerHTML = `<option value="__ALL__">Todas las bodegas (general)</option>` + table.map(t=>`<option value="${t.bodega}">${t.bodega}</option>`).join('');
  sel.value = table.some(t=>t.bodega===prevVal) ? prevVal : '__ALL__';
  const draw=()=>{
    const selVal=sel.value;
    const row = selVal==='__ALL__' ? aggregateFn(table) : table.find(t=>t.bodega===selVal);
    chartsCfg.forEach(cfg=>{
      const slices = row ? cfg.getSlices(row) : [];
      const total = slices.reduce((a,b)=>a+(b.value||0),0);
      const efPunto = slices.find(s=>s.label==='Efic. en el punto');
      const efBodega = slices.find(s=>s.label==='Efic. en bodega');
      const efFinal = (efPunto? efPunto.value:0) + (efBodega? efBodega.value:0);
      drawDonut(cfg.svgId, slices.length?slices:[{label:'',value:1,color:'#DCE4EC'}],
        fmtPct(efFinal), '#0B5FA5');
      document.getElementById(cfg.legendId).innerHTML = slices.map(s=>`<div class="item"><span class="sw" style="background:${s.color};"></span>${s.label}<span class="val" style="color:${s.color};">${fmtPct(s.value)}</span></div>`).join('')
        + `<div class="item" style="color:var(--ink-soft);font-size:11px;">${selVal==='__ALL__'?'General':selVal}</div>`;
    });
  };
  sel.onchange=draw;
  draw();
}

// Color según el mismo semáforo (verde >98%, amarillo 80-98%, rojo <80%) usado en las tablas.
function effColor(v){
  if(v===null||v===undefined||isNaN(v)) return '#B7C4D1';
  if(v>0.98) return '#1E8F5E';
  if(v>=0.80) return '#D98A2B';
  return '#C0392B';
}
function drawBarChartHTML(containerId, bars, contextLabel){
  const el=document.getElementById(containerId);
  if(!el) return;
  el.innerHTML = `
    <div class="bar-chart-inner">
      ${bars.map(b=>`
        <div class="bar-col">
          <div class="bar-value" style="color:${b.color};">${fmtPct(b.value)}</div>
          <div class="bar-track"><div class="bar-fill" style="height:${Math.max(0,Math.min(100,(b.value||0)*100))}%;background:${b.color};"></div></div>
          <div class="bar-label">${b.label}</div>
        </div>`).join('')}
    </div>
    <div class="bar-chart-context">${contextLabel||''}</div>
  `;
}
// Selector genérico de gráfico de BARRAS: misma mecánica de "General vs bodega puntual"
// que setupGenericPieSelector, pero renderizado como barras (para métricas que no se
// deben sumar entre sí, como eficiencia de entregadas vs pendientes).
function setupBarSelector(selectId, containerId, table, aggregateFn, getBars){
  const sel=document.getElementById(selectId);
  const prevVal=sel.value;
  sel.innerHTML = `<option value="__ALL__">Todas las bodegas (general)</option>` + table.map(t=>`<option value="${t.bodega}">${t.bodega}</option>`).join('');
  sel.value = table.some(t=>t.bodega===prevVal) ? prevVal : '__ALL__';
  const draw=()=>{
    const selVal=sel.value;
    const row = selVal==='__ALL__' ? aggregateFn(table) : table.find(t=>t.bodega===selVal);
    const bars = row ? getBars(row) : [];
    drawBarChartHTML(containerId, bars, selVal==='__ALL__'?'General':selVal);
  };
  sel.onchange=draw;
  draw();
}

/* =========================================================================
   11. Indicador por Línea (Subsanar) — 2.1 - 2.8
   ========================================================================= */
/* ---- Conciliación del Indicador por Línea con el conteo manual del Excel -------
   Cuando el usuario cuenta las filas directamente en el archivo casi siempre le sale un
   total un poco mayor que el del tablero. La razón es que el tablero muestra el ESTADO
   ACTUAL y por eso deja por fuera:
     · las versiones de una línea que ya fueron reemplazadas por un recargue posterior, y
     · las líneas de dispensas con Estado INACTIVO.
   Además hay líneas que no caen ni en entregadas ni en pendientes (sin unidades y sin
   faltante, o con sobrante). En cambio, las filas repetidas del mismo artículo dentro de
   un mismo documento y bodega SÍ se cuentan por separado (cada renglón del archivo es una
   línea). Este aviso deja esas cifras a la vista para que el usuario pueda cuadrar el
   número contra su propio conteo. */
function renderDiagLinea(bodegaSearch, zona, totalLin, totalEnt, totalPend){
  const el = document.getElementById('lineaDiag');
  if(!el) return;
  const enAlcance = (r)=>{
    if(bodegaSearch && !normValue(r.bodegaDetalle).includes(bodegaSearch)) return false;
    if(zona && r.zona!==zona) return false;
    return true;
  };
  const base = (filteredRowsCache||[]).filter(enAlcance);
  if(!base.length){ el.style.display='none'; el.innerHTML=''; return; }
  const superadas = base.filter(r=>r.versionVigente===false).length;
  const inactivas = base.filter(r=>r.versionVigente!==false && esEstadoInactivo(r.estadoDispensa)).length;
  const otras = Math.max(0, totalLin - totalEnt - totalPend);
  // Filas repetidas: mismo documento + bodega + artículo que aparece más de una vez.
  // Se calculan con la misma función que alimenta el botón de descarga, para que el número
  // del aviso y el número de filas del Excel siempre coincidan.
  const grupos = gruposLineasRepetidas(bodegaSearch, zona);
  const repetidas = grupos.reduce((a,g)=>a+g.length, 0);
  const btnRep = document.getElementById('btnDescargarRepetidas');
  if(btnRep) btnRep.style.display = repetidas ? '' : 'none';
  if(!superadas && !inactivas && !otras && !repetidas){ el.style.display='none'; el.innerHTML=''; return; }
  const partes = [];
  if(superadas) partes.push('<b>'+fmtInt(superadas)+'</b> líneas corresponden a versiones antiguas que un recargue posterior ya reemplazó (el Reporte de Dispensación es acumulativo, así que la misma línea puede estar varias veces en el archivo)');
  if(inactivas) partes.push('<b>'+fmtInt(inactivas)+'</b> líneas pertenecen a dispensas con Estado <b>INACTIVO</b>');
  if(otras) partes.push('<b>'+fmtInt(otras)+'</b> líneas no cuentan como entregadas ni como pendientes (sin unidades entregadas y sin faltante, o con sobrante)');
  el.style.display='';
  let html = '';
  if(partes.length){
    html = '<b>¿Por qué el total no coincide con el conteo del Excel?</b> De las '
      + fmtInt(base.length) + ' filas del archivo en este alcance, el indicador trabaja con '
      + fmtInt(totalLin) + ' líneas activas y vigentes porque: ' + partes.join('; ') + '.';
  } else {
    html = '<b>Conteo de líneas:</b> el indicador trabaja con ' + fmtInt(totalLin)
      + ' líneas activas y vigentes de las ' + fmtInt(base.length) + ' filas del archivo en este alcance.';
  }
  if(repetidas) html += ' Se incluyen <b>'+fmtInt(repetidas)+'</b> filas repetidas (mismo artículo pedido varias veces dentro de una misma dispensa y bodega, en '
    + fmtInt(grupos.length) + ' casos): cada renglón del archivo cuenta como una línea independiente.'
    + ' Puedes revisarlas una por una con el botón <b>Descargar Líneas Repetidas (Excel)</b>.';
  el.innerHTML = html;
}

/* ---- Líneas repetidas: mismo documento + bodega + código más de una vez ----------
   Una dispensa puede traer el mismo medicamento en varios renglones (por ejemplo dos
   presentaciones, dos entregas parciales o dos cargues del formulario). El tablero las
   cuenta por separado, así que aquí se agrupan para poder revisarlas y confirmar si son
   repeticiones legítimas o un error de digitación en el archivo.
   Se toma solo la versión vigente de cada renglón y solo dispensas activas, igual que el
   indicador, para que el aviso y la descarga muestren siempre el mismo número. */
function gruposLineasRepetidas(bodegaSearch, zona){
  const vigentes = (filteredRowsCache||[]).filter(r=>{
    if(r.versionVigente===false) return false;             // versión superada por un recargue
    if(!esEstadoActivo(r.estadoDispensa)) return false;    // se excluyen las dispensas INACTIVO
    if(!r.documento) return false;
    if(bodegaSearch && !normValue(r.bodegaDetalle).includes(bodegaSearch)) return false;
    if(zona && r.zona!==zona) return false;
    return true;
  });
  const mapa = new Map();
  vigentes.forEach(r=>{
    const k = r.documento+'|'+r.bodegaNorm+'|'+r.codigoArticulo;
    if(!mapa.has(k)) mapa.set(k, []);
    mapa.get(k).push(r);
  });
  const grupos = [];
  mapa.forEach(filas=>{
    if(filas.length < 2) return;
    filas.sort((a,b)=>(a.ocurrenciaLinea||1)-(b.ocurrenciaLinea||1) || a.idx-b.idx);
    grupos.push(filas);
  });
  // Primero los casos con más repeticiones, luego por bodega, dispensa y código.
  grupos.sort((a,b)=> b.length-a.length
    || String(a[0].bodegaDetalle).localeCompare(String(b[0].bodegaDetalle),'es')
    || String(a[0].documento).localeCompare(String(b[0].documento),'es')
    || String(a[0].codigoArticulo).localeCompare(String(b[0].codigoArticulo),'es'));
  return grupos;
}

// Descarga en Excel de las líneas repetidas: una fila por renglón repetido, con la dispensa,
// el código del artículo y las cantidades, para poder verificar por qué está repetida.
const _btnRepetidas = document.getElementById('btnDescargarRepetidas');
if(_btnRepetidas) _btnRepetidas.addEventListener('click', ()=>{
  if(!(filteredRowsCache||[]).length){ showToast('No hay datos calculados para exportar.', true); return; }
  const bodegaSearch = getBodegaFiltro();
  const zona = (document.getElementById('fZona')||{}).value || '';
  const grupos = gruposLineasRepetidas(bodegaSearch, zona);
  if(!grupos.length){
    showToast('No hay líneas repetidas con los filtros actuales: ninguna dispensa trae el mismo código dos veces.', true);
    return;
  }
  const filas = [];
  grupos.forEach(g=>{
    const total = g.length;
    // Si todos los renglones del grupo traen exactamente los mismos números, es muy
    // probable que sea un duplicado del archivo; si cambian, son pedidos distintos.
    const iguales = g.every(r=>r.cantidadAutorizada===g[0].cantidadAutorizada
      && r.unidades===g[0].unidades && r.diferencia===g[0].diferencia);
    g.forEach((r,i)=>{
      filas.push({
        'Dispensa (Documento)': r.documento,
        'Bodega': r.bodegaDetalle,
        'Código': r.codigoArticulo,
        'Descripción': String(r.descripcionDci||'').trim() || String(r.descripcionReporte||'').trim(),
        'Cantidad autorizada': r.cantidadAutorizada,
        'Cantidad entregada': r.unidades,
        'Cantidad pendiente': r.diferencia<0 ? Math.abs(r.diferencia) : 0,
        'Repetición': (i+1)+' de '+total,
        'Veces en la dispensa': total,
        'Estado línea': lineaEsEntregada(r) ? 'ENTREGADA' : (lineaEsPendiente(r) ? 'PENDIENTE' : 'SIN ENTREGA / SOBRANTE'),
        'Estado molécula': String(r.estado||'').trim(),
        'Posible causa': iguales ? 'Renglones idénticos (revisar posible duplicado de digitación)' : 'Cantidades distintas (parecen pedidos o entregas parciales diferentes)',
        'Fecha dispensación': (r.fecha instanceof Date && !isNaN(r.fecha)) ? r.fecha.toISOString().slice(0,10) : '',
        'Fecha de cargue': r.fechaCargue || ''
      });
    });
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), 'LINEAS REPETIDAS');
  XLSX.writeFile(wb, 'Lineas_Repetidas_'+new Date().toISOString().slice(0,10)+'.xlsx');
  showToast('Excel descargado: '+fmtInt(filas.length)+' líneas repetidas en '+fmtInt(grupos.length)+' dispensas/códigos.');
});

function renderIndicadorLinea(rowsAllRaw, bodegaSearch, zona){
  // Solo dispensas con Estado Activo (se excluyen las INACTIVO).
  const rowsAll = soloActivas(rowsAllRaw);
  const groups=groupByBodega(rowsAll, bodegaSearch, zona);
  const table=groups.map(g=>{
    const rs=g.rows;
    let lineas=0, lineasEnt=0, lineasPen=0, sinHomologar=0;
    let molParetoPend=0, paretoAgotado=0, molNoParetoPend=0, noParetoAgotado=0;
    let cantPuntoPareto=0, cantBodegaPareto=0, cantPuntoNoPareto=0, cantBodegaNoPareto=0;
    // pendAgotadas: todas las lineas pendientes con molecula AGOTADA (incluidas las
    // sin clasificacion Pareto), se usa para las tarjetas resumen de esta bodega.
    let pendAgotadas=0;
    rs.forEach(r=>{
      // Total: todas las líneas válidas/activas cargadas para la bodega.
      lineas++;
      // Entregada: se entregó algo (Unidades > 0) y no quedó faltante (Diferencia = 0).
      if(lineaEsEntregada(r)) lineasEnt++;
      // Pendiente: quedó faltante frente a lo autorizado (Diferencia < 0).
      if(!lineaEsPendiente(r)) return;
      lineasPen++;
      const agotado = r.estado==='TECNOLOGIA EN SALUD AGOTADO';
      if(agotado) pendAgotadas++;
      if(r.moleculaPareto==='PARETO'){
        molParetoPend++;
        if(agotado) paretoAgotado++;
        if(r.existenciaPunto>0 && r.sePuedeSubsanarPunto==='SI') cantPuntoPareto++;
        else if(r.existenciaBodega>0 && r.sePuedeSubsanarPunto==='NO' && r.sePuedeSubsanarBodega==='SI') cantBodegaPareto++;
      }else if(r.moleculaPareto==='NO PARETO'){
        molNoParetoPend++;
        if(agotado) noParetoAgotado++;
        if(r.existenciaPunto>0 && r.sePuedeSubsanarPunto==='SI') cantPuntoNoPareto++;
        else if(r.existenciaBodega>0 && r.sePuedeSubsanarPunto==='NO' && r.sePuedeSubsanarBodega==='SI') cantBodegaNoPareto++;
      }else{
        // Línea pendiente cuyo código no tiene clasificación Pareto/No Pareto en el catálogo Homólogo
        sinHomologar++;
      }
    });
    const totalAgotadas=paretoAgotado+noParetoAgotado;
    const pctCierre = lineasPen ? totalAgotadas/lineasPen : null;
    const efPuntoPareto = molParetoPend ? cantPuntoPareto/molParetoPend : null;
    const efBodegaPareto = molParetoPend ? cantBodegaPareto/molParetoPend : null;
    const efFinalPareto = (efPuntoPareto||0)+(efBodegaPareto||0);
    const pctComprasPareto = molParetoPend ? Math.max(0, 1-efFinalPareto) : null;
    const efPuntoNoPareto = molNoParetoPend ? cantPuntoNoPareto/molNoParetoPend : null;
    const efBodegaNoPareto = molNoParetoPend ? cantBodegaNoPareto/molNoParetoPend : null;
    const efFinalNoPareto = (efPuntoNoPareto||0)+(efBodegaNoPareto||0);
    const pctComprasNoPareto = molNoParetoPend ? Math.max(0, 1-efFinalNoPareto) : null;
    return { zona:g.zona, bodega:g.bodega, lineas, lineasEnt, lineasPen, sinHomologar, pendAgotadas,
      // Porcentajes de entregas y pendientes de la propia bodega: se guardan en la fila para
      // que la dona pueda mostrarlos al seleccionar una bodega puntual (antes solo existian
      // en el agregado general y la dona quedaba en 0,0%).
      efLineas: lineas ? lineasEnt/lineas : null,
      pendLineas: lineas ? lineasPen/lineas : null,
      molParetoPend, paretoAgotado, molNoParetoPend, noParetoAgotado, totalAgotadas, pctCierre,
      cantPuntoPareto, cantBodegaPareto, efPuntoPareto, efBodegaPareto, efFinalPareto, pctComprasPareto,
      cantPuntoNoPareto, cantBodegaNoPareto, efPuntoNoPareto, efBodegaNoPareto, efFinalNoPareto, pctComprasNoPareto };
  });
  // Orden: de mayor a menor Eficiencia Final Pareto (columna "Efic. final" del bloque
  // Eficiencia Pareto (cantidad)). Desempate: más moléculas Pareto pendientes primero
  // y luego orden alfabético, para que el listado sea estable.
  table.sort((a,b)=>{
    const d=(b.efFinalPareto||0)-(a.efFinalPareto||0);
    if(Math.abs(d)>1e-12) return d;
    if((b.molParetoPend||0)!==(a.molParetoPend||0)) return (b.molParetoPend||0)-(a.molParetoPend||0);
    return (a.zona+a.bodega).localeCompare(b.zona+b.bodega,'es');
  });
  lastTables.linea=table;

  pintarTablaLinea();

  // Las tarjetas se calculan SOBRE LA MISMA TABLA ya filtrada (bodega + zona), así al
  // cambiar el buscador de bodega o la zona los acumulados se recalculan igual que la
  // tabla y los gráficos, y coinciden con la fila TOTAL.
  const totalPend = sumField(table,'lineasPen');
  const totalLin = sumField(table,'lineas');
  const totalEnt = sumField(table,'lineasEnt');
  const pctCumpl = totalLin ? totalEnt/totalLin : null;   // % Cumplimiento = Entregadas / Total
  const totalAgot = sumField(table,'pendAgotadas');
  const totalPareto = sumField(table,'molParetoPend');
  const totalNoPareto = sumField(table,'molNoParetoPend');
  const alcanceLinea = describirAlcanceFiltro(table, bodegaSearch, zona);
  document.getElementById('statsLinea').innerHTML = `
    <div class="stat"><div class="label">% Cumplimiento de líneas</div><div class="value">${fmtPct(pctCumpl)}</div><div class="sub">${fmtInt(totalEnt)} entregadas de ${fmtInt(totalLin)} líneas activas · ${alcanceLinea}</div></div>
    <div class="stat"><div class="label">Líneas pendientes</div><div class="value">${fmtInt(totalPend)}</div><div class="sub">${fmtInt(totalAgot)} por molécula agotada · ${alcanceLinea}</div></div>
    <div class="stat"><div class="label">Pareto pendientes</div><div class="value">${fmtInt(totalPareto)}</div><div class="sub">${alcanceLinea}</div></div>
    <div class="stat"><div class="label">No Pareto pendientes</div><div class="value">${fmtInt(totalNoPareto)}</div><div class="sub">${alcanceLinea}</div></div>
  `;

  // Conciliación con el conteo manual del Excel (por qué el total puede no coincidir).
  renderDiagLinea(bodegaSearch, zona, totalLin, totalEnt, totalPend);

  // ---- dona: % de líneas ENTREGADAS vs % de líneas PENDIENTES ----
  // Funciona tanto en "Todas las bodegas (general)" como al elegir una bodega puntual: en
  // ambos casos los porcentajes se calculan sobre el total de líneas activas de ese alcance.
  // Con las reglas actuales una línea sin faltante pero sin unidades entregadas no cuenta ni
  // como entregada ni como pendiente, por eso puede aparecer un tercer grupo "Otras".
  function aggregateLineasGeneral(tbl){
    const s=(f)=>sumField(tbl,f);
    const tL=s('lineas'), tE=s('lineasEnt'), tP=s('lineasPen');
    return { bodega:'__ALL__', lineas:tL, lineasEnt:tE, lineasPen:tP,
      efLineas: tL? tE/tL: null, pendLineas: tL? tP/tL: null };
  }
  setupGenericPieSelector('pieLineasGeneralSelect','pieLineasGeneral','pieLineasGeneralLegend', table, aggregateLineasGeneral, row=>{
    const tot=row.lineas||0;
    const ent=row.lineasEnt||0, pen=row.lineasPen||0;
    // Si la fila trae los conteos se recalcula el porcentaje aquí mismo, para que la dona
    // nunca dependa de un campo ausente.
    const pEnt = tot ? ent/tot : (row.efLineas||0);
    const pPen = tot ? pen/tot : (row.pendLineas||0);
    const pOtras = Math.max(0, 1 - pEnt - pPen);
    const slices = [
      {label:'% Líneas entregadas', value: pEnt, color:'#1E8F5E'},
      {label:'% Líneas pendientes', value: pPen, color:'#D98A2B'}
    ];
    // Solo se muestra el tercer grupo si realmente existe (evita una porción vacía).
    if(pOtras > 1e-9) slices.push({label:'% Otras líneas', value: pOtras, color:'#9CA9B6'});
    return slices;
  }, {
    centerFn:(slices)=>{
      const ef = slices.find(s=>s.label==='% Líneas entregadas');
      return fmtPct(ef ? ef.value : null);
    },
    // Nota con las cantidades que sustentan los porcentajes mostrados.
    notaFn:(row)=>{
      const tot=row.lineas||0;
      if(!tot) return 'Sin líneas en el alcance seleccionado.';
      const ent=row.lineasEnt||0, pen=row.lineasPen||0;
      const otras = Math.max(0, tot-ent-pen);
      let txt='Total líneas: '+fmtInt(tot)+' · entregadas: '+fmtInt(ent)+' · pendientes: '+fmtInt(pen);
      if(otras>0) txt += ' · otras: '+fmtInt(otras)+' (sin faltante y sin unidades entregadas)';
      return txt;
    }
  });

  // ---- gráficos de pastel: Eficiencia Cantidad en el Punto vs en Bodega, Pareto y No Pareto ----
  function aggregateLineaTotals(tbl){
    const s=(f)=>sumField(tbl,f);
    const molP=s('molParetoPend'), molNP=s('molNoParetoPend');
    const cp=s('cantPuntoPareto'), cb=s('cantBodegaPareto'), cpnp=s('cantPuntoNoPareto'), cbnp=s('cantBodegaNoPareto');
    return {
      bodega:'__ALL__',
      efPuntoPareto: molP? cp/molP: null, efBodegaPareto: molP? cb/molP: null,
      efPuntoNoPareto: molNP? cpnp/molNP: null, efBodegaNoPareto: molNP? cbnp/molNP: null
    };
  }
  setupDualPieSelector('pieParetoSelect', table, aggregateLineaTotals, [
    { svgId:'pieParetoCant', legendId:'pieParetoLegend', getSlices: row=>{
      const compras = Math.max(0, 1 - ((row.efPuntoPareto||0)+(row.efBodegaPareto||0)));
      return [
        {label:'Efic. en el punto', value: row.efPuntoPareto||0, color:'#0B5FA5'},
        {label:'Efic. en bodega', value: row.efBodegaPareto||0, color:'#1E8F5E'},
        {label:'% Compras', value: compras, color:'#C0392B'}
      ];
    }},
    { svgId:'pieNoParetoCant', legendId:'pieNoParetoLegend', getSlices: row=>{
      const compras = Math.max(0, 1 - ((row.efPuntoNoPareto||0)+(row.efBodegaNoPareto||0)));
      return [
        {label:'Efic. en el punto', value: row.efPuntoNoPareto||0, color:'#0B5FA5'},
        {label:'Efic. en bodega', value: row.efBodegaNoPareto||0, color:'#1E8F5E'},
        {label:'% Compras', value: compras, color:'#C0392B'}
      ];
    }}
  ]);

  // ---- gráfico de pastel: % de líneas PENDIENTE cuyo estado es TECNOLOGIA EN SALUD AGOTADO ----
  function aggregateAgotadoPend(tbl){
    const s=(f)=>sumField(tbl,f);
    return { bodega:'__ALL__', lineasPen:s('lineasPen'), totalAgotadas:s('totalAgotadas') };
  }
  setupGenericPieSelector('pieAgotadoPendienteSelect','pieAgotadoPendiente','pieAgotadoPendienteLegend', table, aggregateAgotadoPend, row=>{
    const pen = row.lineasPen||0;
    const agot = Math.min(pen, row.totalAgotadas||0);
    return [
      {label:'Pendientes AGOTADO', value: agot, color:'#C0392B'},
      {label:'Pendientes otras causas', value: Math.max(0, pen-agot), color:'#0B5FA5'}
    ];
  }, {
    mode:'count',
    centerFn:(slices,total)=>{
      const ag = slices.find(s=>s.label==='Pendientes AGOTADO');
      return fmtPct(total ? (ag? ag.value:0)/total : null);
    }
  });
}

// Orden configurable de la tabla del indicador por línea.
// Por defecto: Eficiencia final Pareto de mayor a menor (igual que antes).
let lineaOrden={col:'efFinalPareto', dir:'desc'};

function pintarTablaLinea(){
  const tbody=document.querySelector('#tblLinea tbody');
  if(!tbody) return;
  const table=(lastTables.linea||[]).slice();
  const col=lineaOrden.col, dir=(lineaOrden.dir==='asc')?1:-1;
  const esTexto = (col==='zona' || col==='bodega');
  table.sort((a,b)=>{
    if(esTexto){
      const c=String(a[col]||'').localeCompare(String(b[col]||''),'es')*dir;
      if(c!==0) return c;
      return String(a.zona+a.bodega).localeCompare(String(b.zona+b.bodega),'es');
    }
    const va=(a[col]==null)?-1:a[col], vb=(b[col]==null)?-1:b[col];
    if(va===vb){
      // Desempate estable: más moléculas Pareto pendientes primero y luego alfabético.
      if((b.molParetoPend||0)!==(a.molParetoPend||0)) return (b.molParetoPend||0)-(a.molParetoPend||0);
      return String(a.zona+a.bodega).localeCompare(String(b.zona+b.bodega),'es');
    }
    return (va-vb)*dir;
  });
  let bodyHtml = table.map(t=>`
    <tr>
      <td class="txt">${t.zona}</td><td class="txt">${t.bodega}</td>
      <td>${fmtInt(t.lineas)}</td><td>${fmtInt(t.lineasEnt)}</td><td>${fmtInt(t.lineasPen)}</td>
      <td class="${effClass(t.efLineas)}">${fmtPct(t.efLineas)}</td>
      <td>${fmtInt(t.sinHomologar)}</td>
      <td>${fmtInt(t.molParetoPend)}</td><td>${fmtInt(t.paretoAgotado)}</td>
      <td>${fmtInt(t.molNoParetoPend)}</td><td>${fmtInt(t.noParetoAgotado)}</td>
      <td>${fmtInt(t.totalAgotadas)}</td><td class="${pctClass(1-(t.pctCierre||0))}">${fmtPct(t.pctCierre)}</td>
      <td>${fmtInt(t.cantPuntoPareto)}</td><td class="${effClass(t.efPuntoPareto)}">${fmtPct(t.efPuntoPareto)}</td><td>${fmtInt(t.cantBodegaPareto)}</td><td class="${effClass(t.efBodegaPareto)}">${fmtPct(t.efBodegaPareto)}</td><td class="${effClass(t.efFinalPareto)}">${fmtPct(t.efFinalPareto)}</td><td class="pct-bad">${fmtPct(t.pctComprasPareto)}</td>
      <td>${fmtInt(t.cantPuntoNoPareto)}</td><td class="${effClass(t.efPuntoNoPareto)}">${fmtPct(t.efPuntoNoPareto)}</td><td>${fmtInt(t.cantBodegaNoPareto)}</td><td class="${effClass(t.efBodegaNoPareto)}">${fmtPct(t.efBodegaNoPareto)}</td><td class="${effClass(t.efFinalNoPareto)}">${fmtPct(t.efFinalNoPareto)}</td><td class="pct-bad">${fmtPct(t.pctComprasNoPareto)}</td>
    </tr>`).join('');
  if(!table.length) bodyHtml='<tr><td colspan="25" class="txt" style="text-align:center;color:#9CA9B6;">Sin datos para el filtro seleccionado.</td></tr>';
  else{
    const s=(f)=>sumField(table,f);
    const tLineas=s('lineas'), tEnt=s('lineasEnt'), tPen=s('lineasPen'), tSinHom=s('sinHomologar');
    const tMolP=s('molParetoPend'), tParAg=s('paretoAgotado'), tMolNP=s('molNoParetoPend'), tNoParAg=s('noParetoAgotado');
    const tAgot=s('totalAgotadas'), tCP=s('cantPuntoPareto'), tCBP=s('cantBodegaPareto'), tCNP=s('cantPuntoNoPareto'), tCBNP=s('cantBodegaNoPareto');
    const tEfPP=tMolP?tCP/tMolP:null, tEfBP=tMolP?tCBP/tMolP:null, tEfFP=(tEfPP||0)+(tEfBP||0);
    const tEfPNP=tMolNP?tCNP/tMolNP:null, tEfBNP=tMolNP?tCBNP/tMolNP:null, tEfFNP=(tEfPNP||0)+(tEfBNP||0);
    const tComprasP = tMolP? Math.max(0,1-tEfFP): null, tComprasNP = tMolNP? Math.max(0,1-tEfFNP): null;
    bodyHtml += `<tr class="total-row"><td class="txt">—</td><td class="txt">TOTAL (${table.length} bodegas)</td>
      <td>${fmtInt(tLineas)}</td><td>${fmtInt(tEnt)}</td><td>${fmtInt(tPen)}</td>
      <td class="${effClass(tLineas?tEnt/tLineas:null)}">${fmtPct(tLineas?tEnt/tLineas:null)}</td>
      <td>${fmtInt(tSinHom)}</td>
      <td>${fmtInt(tMolP)}</td><td>${fmtInt(tParAg)}</td><td>${fmtInt(tMolNP)}</td><td>${fmtInt(tNoParAg)}</td>
      <td>${fmtInt(tAgot)}</td><td>${fmtPct(tPen?tAgot/tPen:null)}</td>
      <td>${fmtInt(tCP)}</td><td class="${effClass(tEfPP)}">${fmtPct(tEfPP)}</td><td>${fmtInt(tCBP)}</td><td class="${effClass(tEfBP)}">${fmtPct(tEfBP)}</td><td class="${effClass(tEfFP)}">${fmtPct(tEfFP)}</td><td class="pct-bad">${fmtPct(tComprasP)}</td>
      <td>${fmtInt(tCNP)}</td><td class="${effClass(tEfPNP)}">${fmtPct(tEfPNP)}</td><td>${fmtInt(tCBNP)}</td><td class="${effClass(tEfBNP)}">${fmtPct(tEfBNP)}</td><td class="${effClass(tEfFNP)}">${fmtPct(tEfFNP)}</td><td class="pct-bad">${fmtPct(tComprasNP)}</td></tr>`;
  }
  tbody.innerHTML=bodyHtml;
  actualizarControlesOrdenLinea();
}

function actualizarControlesOrdenLinea(){
  document.querySelectorAll('#tblLinea thead th.sortable').forEach(th=>{
    const ind=th.querySelector('.sort-ind');
    const activo = th.dataset.col===lineaOrden.col;
    th.classList.toggle('sort-active', activo);
    if(ind) ind.textContent = activo ? (lineaOrden.dir==='asc'?'▲':'▼') : '⇅';
  });
  const selCol=document.getElementById('fLineaOrdenCol');
  const selDir=document.getElementById('fLineaOrdenDir');
  if(selCol) selCol.value=lineaOrden.col;
  if(selDir) selDir.value=lineaOrden.dir;
}

function initOrdenLinea(){
  const selCol=document.getElementById('fLineaOrdenCol');
  const selDir=document.getElementById('fLineaOrdenDir');
  if(selCol) selCol.addEventListener('change', ()=>{ lineaOrden.col=selCol.value; pintarTablaLinea(); });
  if(selDir) selDir.addEventListener('change', ()=>{ lineaOrden.dir=selDir.value; pintarTablaLinea(); });
  // Cualquier encabezado de las dos filas del thead puede usarse para ordenar.
  document.querySelectorAll('#tblLinea thead th.sortable').forEach(th=>{
    th.addEventListener('click', ()=>{
      const c=th.dataset.col;
      if(lineaOrden.col===c) lineaOrden.dir=(lineaOrden.dir==='asc')?'desc':'asc';
      else { lineaOrden.col=c; lineaOrden.dir=(c==='zona'||c==='bodega')?'asc':'desc'; }
      pintarTablaLinea();
    });
  });
  actualizarControlesOrdenLinea();
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', initOrdenLinea); else initOrdenLinea();

/* =========================================================================
   12. Indicador Soporte Evento — 3.1 - 3.7
   ========================================================================= */
// Orden configurable de la tabla de Soporte Evento (Total / Con soporte / Sin soporte / % con soporte).
let soporteOrden={col:'efEnt', dir:'asc'};

function pintarTablaSoporte(){
  const tbody=document.querySelector('#tblSoporte tbody');
  if(!tbody) return;
  const table=(lastTables.soporte||[]).slice();
  const col=soporteOrden.col, dir=(soporteOrden.dir==='asc')?1:-1;
  table.sort((a,b)=>{
    const va=(a[col]==null)?-1:a[col], vb=(b[col]==null)?-1:b[col];
    if(va===vb) return String(a.bodega||'').localeCompare(String(b.bodega||''));
    return (va-vb)*dir;
  });
  let bodyHtml = table.map(t=>`
    <tr>
      <td class="txt">${t.zona}</td><td class="txt">${t.bodega}</td>
      <td>${fmtInt(t.ent)}</td><td>${fmtInt(t.entCon)}</td><td>${fmtInt(t.entSin)}</td>
      <td class="${effClass(t.efEnt)}">${fmtPct(t.efEnt)}</td>
    </tr>`).join('');
  if(!table.length) bodyHtml='<tr><td colspan="6" class="txt" style="text-align:center;color:#9CA9B6;">Sin datos (este indicador solo aplica a contrato EVENTO).</td></tr>';
  else{
    const sf=(f)=>sumField(table,f);
    const tE=sf('ent'), tEC=sf('entCon'), tES=sf('entSin');
    bodyHtml += `<tr class="total-row"><td class="txt">—</td><td class="txt">TOTAL (${table.length} bodegas)</td>
      <td>${fmtInt(tE)}</td><td>${fmtInt(tEC)}</td><td>${fmtInt(tES)}</td>
      <td class="${effClass(tE?tEC/tE:null)}">${fmtPct(tE?tEC/tE:null)}</td></tr>`;
  }
  tbody.innerHTML=bodyHtml;
  actualizarControlesOrdenSoporte();
}

function actualizarControlesOrdenSoporte(){
  document.querySelectorAll('#tblSoporte thead th.sortable').forEach(th=>{
    const ind=th.querySelector('.sort-ind');
    const activo = th.dataset.col===soporteOrden.col;
    th.classList.toggle('sort-active', activo);
    if(ind) ind.textContent = activo ? (soporteOrden.dir==='asc'?'▲':'▼') : '⇅';
  });
  const selCol=document.getElementById('fSoporteOrdenCol');
  const selDir=document.getElementById('fSoporteOrdenDir');
  if(selCol) selCol.value=soporteOrden.col;
  if(selDir) selDir.value=soporteOrden.dir;
}

function initOrdenSoporte(){
  const selCol=document.getElementById('fSoporteOrdenCol');
  const selDir=document.getElementById('fSoporteOrdenDir');
  if(selCol) selCol.addEventListener('change', ()=>{ soporteOrden.col=selCol.value; pintarTablaSoporte(); });
  if(selDir) selDir.addEventListener('change', ()=>{ soporteOrden.dir=selDir.value; pintarTablaSoporte(); });
  document.querySelectorAll('#tblSoporte thead th.sortable').forEach(th=>{
    th.addEventListener('click', ()=>{
      const c=th.dataset.col;
      if(soporteOrden.col===c) soporteOrden.dir=(soporteOrden.dir==='asc')?'desc':'asc';
      else { soporteOrden.col=c; soporteOrden.dir='desc'; }
      pintarTablaSoporte();
    });
  });
  actualizarControlesOrdenSoporte();
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', initOrdenSoporte); else initOrdenSoporte();

function renderIndicadorSoporteEvento(rowsEventoRaw, bodegaSearch, zona){
  // Solo dispensas con Estado Activo (se excluyen las INACTIVO).
  const rowsEvento = soloActivas(rowsEventoRaw);
  /* BASE UNICA del indicador: dispensas de EVENTO con TODAS sus lineas entregadas,
     identificadas por Documento + Bodega y evaluadas sobre la ultima version cargada
     de cada linea. Es la MISMA base del Reporte Comparativo Periodico (pestana de
     soporte), por lo que las cifras de las tres zonas del visor coinciden.
     Todo (tarjetas, tabla, dona y descargas) se calcula sobre esta base. */
  const rowsEntregadas = filasSoporteEvento(rowsEvento);
  const groups = groupByBodega(rowsEntregadas, bodegaSearch, zona);
  const rowsBase = groups.reduce((acc,g)=>acc.concat(g.rows), []);
  // Corte de trazabilidad: el corte global de los filtros, ajustado al ultimo corte con
  // cargue real dentro de la base filtrada. El soporte es ACUMULATIVO: una dispensa que
  // ya llego con soporte en un corte anterior o igual sigue contando como "con soporte".
  const corteGlobalSop = getCorteGlobal();
  const corteFinalSop = corteVigenteHasta(cortesConCargue(rowsBase), corteGlobalSop);
  const etqCorteSop = corteFinalSop===0 ? 'línea base' : 'corte '+corteFinalSop;
  // Estado por dispensa (bodega + documento) acumulado hasta el corte.
  const estadoDisp = new Map();
  rowsBase.forEach(r=>{
    const k = claveDocBodega(r);
    if(!k) return;
    const con = tieneSoporteHastaCorte(r, corteFinalSop);
    if(!estadoDisp.has(k)) estadoDisp.set(k, con);
    else if(con) estadoDisp.set(k, true);   // acumulativo: no vuelve atras
  });
  let totalEnt=0, conSoporte=0;
  estadoDisp.forEach(v=>{ totalEnt++; if(v) conSoporte++; });
  const sinSoporte = totalEnt - conSoporte;
  const alcanceSop = describirAlcanceFiltro(groups.map(g=>({bodega:g.bodega})), bodegaSearch, zona);
  const subAlcance = alcanceSop+' · acumulado a '+etqCorteSop;
  document.getElementById('statsSoporte').innerHTML = `
    <div class="stat"><div class="label">Dispensas entregadas (Evento)</div><div class="value">${fmtInt(totalEnt)}</div><div class="sub">${subAlcance}</div></div>
    <div class="stat"><div class="label">Entregado con soporte</div><div class="value">${fmtInt(conSoporte)}</div><div class="sub">${fmtPct(totalEnt?conSoporte/totalEnt:null)} · ${subAlcance}</div>
      <div class="bar"><i style="width:${totalEnt?(conSoporte/totalEnt*100).toFixed(0):0}%;"></i></div></div>
    <div class="stat warn"><div class="label">Entregado sin soporte</div><div class="value">${fmtInt(sinSoporte)}</div><div class="sub">${fmtPct(totalEnt?sinSoporte/totalEnt:null)} · ${subAlcance}</div>
      <div class="bar"><i style="width:${totalEnt?(sinSoporte/totalEnt*100).toFixed(0):0}%;"></i></div></div>
  `;

  // ---- por bodega: misma base filtrada y mismo corte acumulativo ----
  const table=groups.map(g=>{
    const estado=new Map();
    g.rows.forEach(r=>{
      const k=claveDocBodega(r);
      if(!k) return;
      const con=tieneSoporteHastaCorte(r, corteFinalSop);
      if(!estado.has(k)) estado.set(k, con);
      else if(con) estado.set(k, true);
    });
    let ent=0, entCon=0;
    estado.forEach(v=>{ ent++; if(v) entCon++; });
    const entSin = ent-entCon;
    return { zona:g.zona, bodega:g.bodega, ent, entCon, entSin,
      efEnt: ent? entCon/ent: null };
  });
  table.sort((a,b)=>(a.efEnt||0)-(b.efEnt||0));
  lastTables.soporte=table;
  // Contexto para las descargas: mismo dataset filtrado + corte de trazabilidad.
  lastSoporteCtx={ rows:rowsBase, estadoDisp, corteFinal:corteFinalSop, corteGlobal:corteGlobalSop,
    etqCorte:etqCorteSop, alcance:alcanceSop, bodegaSearch, zona };
  const txtAlcance=document.getElementById('soporteAlcanceTxt');
  if(txtAlcance) txtAlcance.innerHTML = '<b>Alcance de este indicador y de sus descargas:</b> '+alcanceSop
    + ' · estado <b>acumulado a '+etqCorteSop+'</b> (corte global '+corteGlobalSop+'). '
    + 'Las tarjetas, la gráfica, la tabla y los archivos descargados usan el mismo conjunto de datos.';
  pintarTablaSoporte();

  // ---- Dona filtrable por bodega: CON vs SIN soporte ----
  // Usa exactamente la misma tabla por bodega que se muestra abajo, por lo que los
  // porcentajes de la dona y de la tabla siempre coinciden.
  if(table.length){
    const aggSop=(tbl)=>({
      bodega:'__ALL__',
      ent: tbl.reduce((a,b)=>a+(b.ent||0),0),
      entCon: tbl.reduce((a,b)=>a+(b.entCon||0),0),
      entSin: tbl.reduce((a,b)=>a+(b.entSin||0),0)
    });
    setupGenericPieSelector('pieSoporteSelect','pieSoporte','pieSoporteLegend', table, aggSop, row=>[
      {label:'Con soporte', value: row.entCon||0, color:'#1E8F5E'},
      {label:'Sin soporte', value: row.entSin||0, color:'#C0392B'}
    ], {
      mode:'count',
      totalFn:(row)=>row.ent||0,
      // En el centro se muestra el % con soporte, que es la lectura principal del indicador.
      centerFn:(slices,total)=>{
        const con=slices.find(s=>s.label==='Con soporte');
        return fmtPct(total ? (con? con.value:0)/total : null);
      },
      notaFn:(row)=>'Sobre '+fmtInt(row.ent||0)+' dispensas de evento entregadas · acumulado a '+etqCorteSop+'.'
    });
  } else {
    drawDonut('pieSoporte', [{label:'',value:1,color:'#DCE4EC'}], '—');
    const lg=document.getElementById('pieSoporteLegend'); if(lg) lg.innerHTML='';
    const sl=document.getElementById('pieSoporteSelect'); if(sl) sl.innerHTML='<option value="__ALL__">Sin datos</option>';
  }
}

// ---- Detalle descargable del Indicador Soporte Evento --------------------
// Construye UNA fila por dispensa a partir del MISMO contexto que se ve en pantalla
// (base filtrada por bodega/zona + estado acumulado hasta el corte vigente).
function construirDetalleSoporteEvento(){
  if(!lastSoporteCtx || !lastSoporteCtx.rows || !lastSoporteCtx.rows.length) return [];
  const ctx=lastSoporteCtx;
  const porDisp=new Map();
  ctx.rows.forEach(r=>{
    const k=claveDocBodega(r);
    if(!k) return;
    const prev=porDisp.get(k);
    // Se conserva la version mas reciente de la dispensa (ultimo cargue) para los datos de
    // referencia; el estado con/sin soporte viene del acumulado del indicador.
    if(!prev || esVersionPosterior(r, prev)) porDisp.set(k, r);
  });
  const det=[];
  porDisp.forEach((r,k)=>{
    const con = ctx.estadoDisp.get(k)===true;
    const corteRec = con ? corteRecuperacionSoporte(r) : null;
    det.push({
      'Zona': r.zona||'',
      'Bodega': r.bodegaDetalle||'',
      'Documento': r.documento||'',
      'Contrato': r.contrato||'',
      'Estado dispensa': r.estadoDispensa||'',
      'Estado soporte': con ? 'CON SOPORTE' : 'SIN SOPORTE',
      'Estado al': ctx.etqCorte,
      'Corte global filtrado': ctx.corteGlobal,
      'Corte en que llego el soporte': con ? (corteRec===null ? 'Linea base' : 'Corte '+corteRec) : '',
      // Dos ejes: la dispensacion fecha el origen del pendiente; el CARGUE fecha el soporte.
      'Fecha Dispensacion (origen)': diaDispensacion(r),
      'Fecha de cargue del soporte': con ? (diaSoporte(r)||diaCargue(r)) : ''
    });
  });
  det.sort((a,b)=> String(a['Bodega']).localeCompare(String(b['Bodega']),'es')
    || String(a['Estado soporte']).localeCompare(String(b['Estado soporte']))
    || String(a['Documento']).localeCompare(String(b['Documento'])));
  return det;
}

// Resumen por bodega tal como se muestra en la tabla, con la marca del corte usado.
function construirResumenSoporteEvento(){
  const etq = lastSoporteCtx ? lastSoporteCtx.etqCorte : '';
  const cg = lastSoporteCtx ? lastSoporteCtx.corteGlobal : '';
  return (lastTables.soporte||[]).map(t=>({
    'Zona':t.zona,'Bodega':t.bodega,'Dispensas Entregadas':t.ent,'Con Soporte':t.entCon,'Sin Soporte':t.entSin,
    'Indicador Eficiencia Soporte':t.efEnt,'Estado al':etq,'Corte global filtrado':cg
  }));
}

function hayContextoSoporte(){
  if(lastSoporteCtx && lastSoporteCtx.rows && lastSoporteCtx.rows.length) return true;
  showToast('No hay datos de Soporte Evento para descargar con los filtros actuales.', true);
  return false;
}

(function initDescargasSoporteEvento(){
  const bx=document.getElementById('btnSoporteExportXlsx');
  const bs=document.getElementById('btnSoporteSinSoporte');
  const fecha=()=>new Date().toISOString().slice(0,10);
  if(bx) bx.addEventListener('click', ()=>{
    if(!hayContextoSoporte()) return;
    const resumen=construirResumenSoporteEvento();
    const detalle=construirDetalleSoporteEvento();
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen.length?resumen:[{'Sin datos':''}]), 'RESUMEN POR BODEGA');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalle.length?detalle:[{'Sin datos':''}]), 'DETALLE POR DISPENSA');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{
      'Alcance': lastSoporteCtx.alcance,
      'Estado al': lastSoporteCtx.etqCorte,
      'Corte global filtrado': lastSoporteCtx.corteGlobal,
      'Filtro de bodega': lastSoporteCtx.bodegaSearch || '(todas)',
      'Zona': lastSoporteCtx.zona || '(todas)',
      'Dispensas incluidas': detalle.length
    }]), 'ALCANCE');
    XLSX.writeFile(wb, `Soporte_Evento_${fecha()}.xlsx`);
    showToast('Excel de Soporte Evento descargado.');
  });
  // Descarga SOLO las dispensas de evento entregadas que siguen SIN soporte,
  // con el mismo alcance (bodega/zona y corte) que se ve en pantalla.
  if(bs) bs.addEventListener('click', ()=>{
    if(!hayContextoSoporte()) return;
    const sinSoporte=construirDetalleSoporteEvento().filter(d=>d['Estado soporte']==='SIN SOPORTE');
    if(!sinSoporte.length){ showToast('No hay dispensas SIN soporte con los filtros actuales.', true); return; }
    // Las columnas propias del soporte recuperado no aplican aqui: se omiten.
    const filas=sinSoporte.map(d=>({
      'Zona':d['Zona'],'Bodega':d['Bodega'],'Documento':d['Documento'],'Contrato':d['Contrato'],
      'Estado dispensa':d['Estado dispensa'],'Estado soporte':d['Estado soporte'],
      'Estado al':d['Estado al'],'Corte global filtrado':d['Corte global filtrado'],
      'Fecha de dispensacion':d['Fecha de dispensacion']
    }));
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), 'DISPENSAS SIN SOPORTE');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{
      'Alcance': lastSoporteCtx.alcance,
      'Estado al': lastSoporteCtx.etqCorte,
      'Corte global filtrado': lastSoporteCtx.corteGlobal,
      'Filtro de bodega': lastSoporteCtx.bodegaSearch || '(todas)',
      'Zona': lastSoporteCtx.zona || '(todas)',
      'Dispensas SIN soporte': filas.length
    }]), 'ALCANCE');
    XLSX.writeFile(wb, `Dispensas_SIN_soporte_${fecha()}.xlsx`);
    showToast(fmtInt(filas.length)+' dispensas SIN soporte descargadas.');
  });
})();

/* =========================================================================
   13. Exportar a Excel
   ========================================================================= */
document.getElementById('btnExportar').addEventListener('click', ()=>{
  if(!lastTables.dispensa.length && !lastTables.linea.length && !lastTables.soporte.length){
    showToast('No hay indicadores calculados para exportar.', true); return;
  }
  const wb=XLSX.utils.book_new();

  const wsD=XLSX.utils.json_to_sheet(lastTables.dispensa.map(t=>({
    'Zona':t.zona,'Bodega':t.bodega,'Dispensas':t.dispensas,'Dispensas Entregadas':t.dispensasEntregadas,'Dispensas Pendientes':t.dispensasPendientes,
    'Indicador de Eficiencia':t.efDispensa,'Índice de Pendiente':t.pendDispensa
  })));
  XLSX.utils.book_append_sheet(wb, wsD, 'INDICADOR DE DISPENSA');

  const wsL=XLSX.utils.json_to_sheet(lastTables.linea.map(t=>({
    'Zona':t.zona,'Bodega':t.bodega,'Lineas':t.lineas,'Lineas Entregadas':t.lineasEnt,'Lineas Pendientes':t.lineasPen,'% Cumplimiento':t.efLineas,'Sin Homologar':t.sinHomologar,
    'Moleculas Pareto':t.molParetoPend,'Pareto Agotado':t.paretoAgotado,'Moleculas No Pareto':t.molNoParetoPend,'No Pareto Agotado':t.noParetoAgotado,
    'Total Lineas Agotadas':t.totalAgotadas,'% Cierre de Lineas':t.pctCierre,
    'Cant. en el Punto (Pareto)':t.cantPuntoPareto,'Cant. en Bodega (Pareto)':t.cantBodegaPareto,
    'Indicador Eficiencia Punto (Pareto)':t.efPuntoPareto,'Indicador Eficiencia Bodega (Pareto)':t.efBodegaPareto,'Eficiencia Final Pareto':t.efFinalPareto,
    'Cant. en el Punto (No Pareto)':t.cantPuntoNoPareto,'Cant. en Bodega (No Pareto)':t.cantBodegaNoPareto,
    'Indicador Eficiencia Punto (No Pareto)':t.efPuntoNoPareto,'Indicador Eficiencia Bodega (No Pareto)':t.efBodegaNoPareto,'Eficiencia Final No Pareto':t.efFinalNoPareto
  })));
  XLSX.utils.book_append_sheet(wb, wsL, 'INDICADOR POR LINEA (SUBSANAR)');

  // Mismo dataset filtrado y mismo corte acumulativo que se ve en pantalla.
  const wsS=XLSX.utils.json_to_sheet(construirResumenSoporteEvento());
  XLSX.utils.book_append_sheet(wb, wsS, 'INDICADOR SOPORTE EVENTO');
  const detSop=construirDetalleSoporteEvento();
  if(detSop.length){
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detSop), 'SOPORTE EVENTO DETALLE');
  }

  // --- Seguimiento de Dispensación por Bodega (cargue vs cargue) ---
  if(state.processed && filteredRowsCache.length){
    const cmAll = buildCorteMetrics(filteredRowsCache);
    // Los cortes sin dispensaciones se exportan vacíos (no repiten cifras del corte anterior).
    const cortesActivosExp = cortesConCargue(filteredRowsCache);
    const corteFinalExp = corteVigenteHasta(cortesActivosExp, 3);
    const bodegaSet = new Set();
    [1,2,3].forEach(c => (cmAll[c]||[]).forEach(bm => bodegaSet.add(bm.bodega)));
    const bodegas = Array.from(bodegaSet).sort((a,b) => a.localeCompare(b,'es'));
    const bodegaMetrics = {};
    bodegas.forEach(b => { bodegaMetrics[b] = {}; });
    [1,2,3].forEach(c => {
      (cmAll[c]||[]).forEach(bm => { bodegaMetrics[bm.bodega][c] = bm; });
    });
    const segRows = bodegas.map(b => {
      const cF = bodegaMetrics[b][corteFinalExp] || {docsEnt:0,docsPend:0};
      const row = {'Bodega':b,'Entregas totales':cF.docsEnt,'Pendientes totales':cF.docsPend};
      for(let c=1;c<=3;c++){
        const sin = !cortesActivosExp.has(c);
        const cd = bodegaMetrics[b][c] || {docsEnt:0,docsPend:0};
        row['Entregas Corte '+c] = sin ? '' : cd.docsEnt;
        row['Pendientes Corte '+c] = sin ? '' : cd.docsPend;
      }
      return row;
    });
    // Totals
    const totRow = {};
    for(let c=1;c<=3;c++){
      let dE=0,dP=0;
      if(cortesActivosExp.has(c)) bodegas.forEach(b=>{const cd=bodegaMetrics[b][c];if(cd){dE+=cd.docsEnt;dP+=cd.docsPend;}});
      totRow[c]={docsEnt:dE,docsPend:dP};
    }
    const t3 = totRow[corteFinalExp]||{docsEnt:0,docsPend:0};
    const totExcel = {'Bodega':'TOTAL','Entregas totales':t3.docsEnt,'Pendientes totales':t3.docsPend};
    for(let c=1;c<=3;c++){
      const sin = !cortesActivosExp.has(c);
      const cd=totRow[c]||{docsEnt:0,docsPend:0};
      totExcel['Entregas Corte '+c]= sin ? '' : cd.docsEnt;
      totExcel['Pendientes Corte '+c]= sin ? '' : cd.docsPend;
    }
    segRows.push(totExcel);
    const wsSeg = XLSX.utils.json_to_sheet(segRows);
    XLSX.utils.book_append_sheet(wb, wsSeg, 'SEGUIMIENTO POR BODEGA');
  }

  const fecha=new Date().toISOString().slice(0,10);
  XLSX.writeFile(wb, `Indicadores_Dispensacion_${fecha}.xlsx`);
  showToast('Excel exportado.');
});

/* ---- Análisis ABC por Bodega Detalle -----------------------------------------
   Clasifica cada bodega según su NIVEL DE DISPENSACIÓN (cantidad de dispensas),
   ordenadas de MAYOR a MENOR. Se usa el criterio ABC clásico (Pareto) sobre el
   porcentaje ACUMULADO de dispensas del total filtrado:
     · A : bodegas de mayor volumen que acumulan hasta el 80% de las dispensas
     · B : las siguientes, hasta acumular el 95%
     · C : el resto (último 5%), bodegas de menor volumen
   La bodega que cruza cada umbral se incluye en esa misma categoría, de modo que
   A siempre tiene al menos una bodega.
   Respeta todos los filtros activos en pantalla (fecha, modalidad, EPS, EPS
   consolidada, diagnóstico, bodega y zona) y excluye las dispensas INACTIVO.     */
document.getElementById('btnExportarABC').addEventListener('click', ()=>{
 try{
  // Si aún no se han aplicado filtros, se usan directamente las filas procesadas.
  let baseRows = (filteredRowsCache && filteredRowsCache.length)
    ? filteredRowsCache
    : ((state && state.processed && state.processed.rows) ? state.processed.rows : []);
  if(!baseRows.length){ showToast('Primero pulsa "Calcular indicadores" para tener datos del Análisis ABC.', true); return; }
  if(typeof XLSX==='undefined'){ showToast('No se pudo cargar la librería de Excel. Revisa tu conexión a internet y recarga.', true); return; }
  const bodegaSearch = getBodegaFiltro();
  const zonaSel = document.getElementById('fZona');
  const zona = zonaSel ? zonaSel.value : '';
  // Estado ACTUAL: solo la última versión de cada línea y solo dispensas activas.
  const vigentes = soloActivas(baseRows.filter(r=>r.versionVigente!==false));
  const grupos = groupByBodega(vigentes, bodegaSearch, zona);
  if(!grupos.length){ showToast('No hay bodegas que cumplan los filtros actuales.', true); return; }

  const filas = grupos.map(g=>{
    const rs = g.rows;
    const dispensas = new Set(rs.map(r=>claveDocBodega(r)).filter(Boolean)).size;
    const lineas = rs.length;
    const lineasEnt = rs.filter(r=>lineaEsEntregada(r)).length;
    const efic = lineas ? (lineasEnt/lineas)*100 : 0;
    // Soportes de dispensas EVENTO: dispensas de contrato EVENTO que ya tienen soporte.
    const soportesEvento = new Set(
      rs.filter(r=>r.contrato==='EVENTO' && r.tieneSoportes==='TIENE SOPORTE')
        .map(r=>claveDocBodega(r)).filter(Boolean)
    ).size;
    return { bodega:g.bodega, zona:g.zona, dispensas, lineas, lineasEnt, efic, soportesEvento, cat:'C', part:0, acum:0 };
  });
  // MAYOR -> MENOR nivel de dispensación. Desempate: más líneas y luego alfabético.
  filas.sort((a,b)=>{
    if(b.dispensas !== a.dispensas) return b.dispensas - a.dispensas;
    if(b.lineas !== a.lineas) return b.lineas - a.lineas;
    return a.bodega.localeCompare(b.bodega,'es');
  });

  // Clasificación ABC por participación acumulada de dispensas (80% / 95% / resto).
  const totalDisp = filas.reduce((s,f)=>s+f.dispensas, 0);
  let acumulado = 0;
  filas.forEach((f,i)=>{
    acumulado += f.dispensas;
    f.part = totalDisp ? (f.dispensas/totalDisp)*100 : 0;
    f.acum = totalDisp ? (acumulado/totalDisp)*100 : 0;
    const acumAnterior = totalDisp ? ((acumulado - f.dispensas)/totalDisp)*100 : 0;
    // La bodega que cruza el umbral queda dentro de la categoría que lo cruza.
    if(i === 0 || acumAnterior < 80) f.cat = 'A';
    else if(acumAnterior < 95) f.cat = 'B';
    else f.cat = 'C';
  });

  const datos = filas.map((f,i)=>({
    'Ranking': i+1,
    'Categoría ABC': f.cat,
    'Zona': f.zona || '',
    'Bodega Detalle': f.bodega,
    'Cantidad de Dispensas': f.dispensas,
    '% Participación': Math.round(f.part*100)/100,
    '% Acumulado': Math.round(f.acum*100)/100,
    'Líneas Totales': f.lineas,
    'Líneas Entregadas': f.lineasEnt,
    'Índice de Eficiencia (%)': Math.round(f.efic*100)/100,
    'Soportes de Dispensas Evento': f.soportesEvento
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(datos);
  ws['!cols'] = [{wch:9},{wch:14},{wch:16},{wch:34},{wch:22},{wch:16},{wch:14},{wch:14},{wch:18},{wch:22},{wch:28}];
  XLSX.utils.book_append_sheet(wb, ws, 'ANALISIS ABC');
  const nA = filas.filter(f=>f.cat==='A').length;
  const nB = filas.filter(f=>f.cat==='B').length;
  const nC = filas.filter(f=>f.cat==='C').length;
  const dispDe = c => filas.filter(f=>f.cat===c).reduce((s,f)=>s+f.dispensas, 0);
  const pct = n => totalDisp ? Math.round((n/totalDisp)*10000)/100 : 0;
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{
    'Criterio': 'ABC por nivel de dispensación (cantidad de dispensas), de mayor a menor',
    'Regla': 'A: hasta 80% acumulado | B: hasta 95% acumulado | C: resto',
    'Total de dispensas': totalDisp,
    'Bodegas categoría A': nA,
    'Dispensas categoría A': dispDe('A'),
    '% dispensas A': pct(dispDe('A')),
    'Bodegas categoría B': nB,
    'Dispensas categoría B': dispDe('B'),
    '% dispensas B': pct(dispDe('B')),
    'Bodegas categoría C': nC,
    'Dispensas categoría C': dispDe('C'),
    '% dispensas C': pct(dispDe('C')),
    'Bodegas evaluadas': filas.length,
    'Filtro de bodega': bodegaSearch || '(todas)',
    'Zona': zona || '(todas)',
    'Alcance': 'Solo dispensas activas (se excluye INACTIVO), última versión de cada línea'
  }]), 'CRITERIO');
  XLSX.writeFile(wb, `Analisis_ABC_Bodegas_${new Date().toISOString().slice(0,10)}.xlsx`);
  showToast('Análisis ABC por nivel de dispensación descargado: '+fmtInt(filas.length)+' bodegas · '+fmtInt(totalDisp)+' dispensas (A: '+nA+' · B: '+nB+' · C: '+nC+').');
 }catch(err){
  // Cualquier fallo se informa en pantalla para no dejar el botón "muerto".
  console.error('Error al generar el Análisis ABC:', err);
  showToast('Error al generar el Análisis ABC: '+(err && err.message ? err.message : err), true);
 }
});

document.getElementById('btnDescargarParetoExistencias').addEventListener('click', ()=>{
  if(!filteredRowsCache.length){ showToast('No hay datos calculados para exportar.', true); return; }
  // Incluye PARETO y NO PARETO, respetando todos los filtros activos en pantalla
  // (fecha, modalidad, EPS, EPS consolidada, bodega, zona) porque parte de filteredRowsCache.
  const bodegaSearch = getBodegaFiltro();
  const zona = document.getElementById('fZona').value;
  const base = filteredRowsCache.filter(r=>{
    if(r.versionVigente===false) return false;          // versión superada por un recargue
    if(!esEstadoActivo(r.estadoDispensa)) return false;
    if(bodegaSearch && !normValue(r.bodegaDetalle).includes(bodegaSearch)) return false;
    if(zona && r.zona!==zona) return false;
    // Misma regla del Indicador por Línea: pendiente = Diferencia < 0.
    return lineaEsPendiente(r) && (r.moleculaPareto==='PARETO'||r.moleculaPareto==='NO PARETO');
  });
  const rowShape = r => ({
    'Zona':r.zona,'Bodega Detalle':r.bodegaDetalle,'Tipo':r.moleculaPareto,'Ubicación':r.sePuedeSubsanarPunto==='SI' ? 'Punto' : 'Bodega Principal','Documento':r.documento,
    'Código Articulo':r.codigoArticulo,'Descripción DCI':r.descripcionDci,'Homólogo':r.homologo,'Diferencia (pendiente)':r.diferencia,
    'Existencia Disponible':r.sePuedeSubsanarPunto==='SI' ? r.existenciaPunto : r.existenciaBodega
  });
  const enElPunto = base.filter(r=>r.sePuedeSubsanarPunto==='SI' && r.existenciaPunto>0).map(rowShape);
  const enBodegaPrincipal = base.filter(r=>r.sePuedeSubsanarPunto==='NO' && r.sePuedeSubsanarBodega==='SI' && r.existenciaBodega>0).map(rowShape);
  if(!enElPunto.length && !enBodegaPrincipal.length){ showToast('No hay moléculas Pareto/No Pareto con existencia para subsanar en el filtro actual.', true); return; }
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(enElPunto.length?enElPunto:[{'Sin datos':''}]), 'Existencia en el Punto');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(enBodegaPrincipal.length?enBodegaPrincipal:[{'Sin datos':''}]), 'Existencia en Bodega Principal');
  const fecha=new Date().toISOString().slice(0,10);
  XLSX.writeFile(wb, `Pareto_NoPareto_Existencias_${fecha}.xlsx`);
  showToast('Excel de Pareto/No Pareto exportado.');
});

// ---- Códigos a Comprar: líneas pendientes que NO se pueden subsanar ni con lo que hay
// en el punto ni en la bodega principal (no hay existencia en ningún lado) ----
document.getElementById('btnDescargarCodigosComprar').addEventListener('click', ()=>{
  if(!filteredRowsCache.length){ showToast('No hay datos calculados para exportar.', true); return; }
  const bodegaSearch = getBodegaFiltro();
  const zona = document.getElementById('fZona').value;
  const _idxUltimaVersionComprar = new Set(snapshotUltimaVersion(filteredRowsCache).map(r=>r.idx));
  const aComprar = filteredRowsCache.filter(r=>{
    // El Reporte de Dispensación es acumulativo: se considera solo la ÚLTIMA versión cargada
    // de cada línea, para no contar como pendiente algo que un cargue posterior ya entregó.
    if(r.versionVigente===false) return false;
    if(!_idxUltimaVersionComprar.has(r.idx)) return false;
    if(!esEstadoActivo(r.estadoDispensa)) return false;
    if(bodegaSearch && !normValue(r.bodegaDetalle).includes(bodegaSearch)) return false;
    if(zona && r.zona!==zona) return false;
    // Aún pendiente según el último cargue (Diferencia < 0) y sin existencia disponible en ningún lado.
    const aunPendiente = lineaEsPendiente(r);
    return aunPendiente && r.sePuedeSubsanarPunto==='NO' && r.sePuedeSubsanarBodega==='NO';
  }).map(r=>({
    'Código a comprar': r.codigoArticulo,
    'Homólogo': r.homologo,
    'Descripción DCI': r.descripcionDci,
    'Bodega detalle': r.bodegaDetalle,
    'Cantidad a comprar': Math.abs(r.diferencia)
  }));
  if(!aComprar.length){ showToast('No hay códigos a comprar en el filtro actual (todo se puede subsanar con existencia).', true); return; }
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(aComprar), 'Codigos a Comprar');
  const fecha=new Date().toISOString().slice(0,10);
  XLSX.writeFile(wb, `Codigos_a_Comprar_${fecha}.xlsx`);
  showToast('Excel de Códigos a Comprar exportado: '+fmtInt(aComprar.length)+' líneas.');
});

// ---- Sin Homologar: líneas pendientes cuyo código no está clasificado como PARETO ni NO PARETO ----
document.getElementById('btnDescargarSinHomologar').addEventListener('click', ()=>{
  if(!filteredRowsCache.length){ showToast('No hay datos calculados para exportar.', true); return; }
  const bodegaSearch = getBodegaFiltro();
  const zona = document.getElementById('fZona').value;
  const sinHom = filteredRowsCache.filter(r=>{
    if(r.versionVigente===false) return false;          // versión superada por un recargue
    if(!esEstadoActivo(r.estadoDispensa)) return false;
    if(bodegaSearch && !normValue(r.bodegaDetalle).includes(bodegaSearch)) return false;
    if(zona && r.zona!==zona) return false;
    if(!lineaEsPendiente(r)) return false;               // pendiente = Diferencia < 0
    return r.moleculaPareto!=='PARETO' && r.moleculaPareto!=='NO PARETO';
  }).map(r=>({
    'Código Artículo': r.codigoArticulo,
    'Descripción': String(r.descripcionReporte||r.descripcion||'').trim(),
    'Bodega Detalle': r.bodegaDetalle,
    'Documento': r.documento,
    'Cantidad Pendiente': Math.abs(r.diferencia)
  }));
  if(!sinHom.length){ showToast('No hay líneas sin homologar en el filtro actual.', true); return; }
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sinHom), 'Sin Homologar');
  const fecha=new Date().toISOString().slice(0,10);
  XLSX.writeFile(wb, 'Sin_Homologar_'+fecha+'.xlsx');
  showToast('Excel de Sin Homologar exportado: '+fmtInt(sinHom.length)+' líneas.');
});

// ---- Líneas Agotadas: líneas pendientes cuyo estado indica AGOTADO ----
// El estado se compara buscando "AGOTAD" dentro del texto (por ejemplo "TECNOLOGIA EN SALUD
// AGOTADO", "AGOTADA", "AGOTADO TEMPORAL"), así el archivo puede traer variantes de redacción.
// Se indica además si la molécula es Pareto o No Pareto (o si no está clasificada).
document.getElementById('btnDescargarAgotadas').addEventListener('click', ()=>{
  if(!filteredRowsCache.length){ showToast('No hay datos calculados para exportar.', true); return; }
  const info = state.agotadosInfo || {filas:0, codigos:0, agotados:0};
  if(!info.codigos){ showToast('La tabla Estado de la Molécula (Tabla_7) no está cargada: cárgala en el panel de cargue y vuelve a calcular los indicadores.', true); return; }
  if(!info.agotados){ showToast('La tabla Estado de la Molécula no tiene ningún código marcado como AGOTADO.', true); return; }
  const bodegaSearch = getBodegaFiltro();
  const zona = document.getElementById('fZona').value;
  let hayAgotadasSinFiltro=false;
  const agotadas = filteredRowsCache.filter(r=>{
    if(r.versionVigente===false) return false;          // versión superada por un recargue
    if(!esEstadoActivo(r.estadoDispensa)) return false;
    if(!lineaEsPendiente(r)) return false;               // pendiente = Diferencia < 0
    if(!normValue(r.estado).includes('AGOTAD')) return false;
    hayAgotadasSinFiltro=true;                          // hay agotadas, aunque no en este filtro
    if(bodegaSearch && !normValue(r.bodegaDetalle).includes(bodegaSearch)) return false;
    if(zona && r.zona!==zona) return false;
    return true;
  }).map(r=>({
    'Código': r.codigoArticulo,
    'Descripción': String(r.descripcionDci||'').trim() || String(r.descripcionReporte||r.descripcion||'').trim(),
    'Bodega': r.bodegaDetalle,
    'Documento': r.documento,
    'Cant. pendiente': Math.abs(r.diferencia),
    'Pareto / No Pareto': (r.moleculaPareto==='PARETO'||r.moleculaPareto==='NO PARETO') ? r.moleculaPareto : 'SIN CLASIFICAR'
  }));
  if(!agotadas.length){
    showToast(hayAgotadasSinFiltro
      ? 'Hay líneas agotadas, pero ninguna en la bodega o zona filtrada: limpia el filtro y vuelve a descargar.'
      : 'Ninguna línea pendiente corresponde a códigos agotados con los datos cargados.', true);
    return;
  }
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(agotadas), 'Lineas Agotadas');
  XLSX.writeFile(wb, 'Lineas_Agotadas_'+new Date().toISOString().slice(0,10)+'.xlsx');
  showToast('Excel de Líneas Agotadas exportado: '+fmtInt(agotadas.length)+' líneas.');
});

// ---- Detalle por bodega: líneas del Reporte de Dispensación con las columnas clave ----
// Respeta la bodega escrita en el filtro (y la zona); si no hay filtro, exporta todas.
document.getElementById('btnDescargarDetalleBodega').addEventListener('click', ()=>{
  if(!filteredRowsCache.length){ showToast('No hay datos calculados para exportar.', true); return; }
  const bodegaTexto = getBodegaFiltroTexto();
  const bodegaSearch = normValue(bodegaTexto);
  const zona = document.getElementById('fZona').value;
  // Solo la última versión cargada de cada línea (el reporte es acumulativo).
  const _idxUltima = new Set(snapshotUltimaVersion(filteredRowsCache).map(r=>r.idx));
  const detalle = filteredRowsCache.filter(r=>{
    if(r.versionVigente===false) return false;
    if(!_idxUltima.has(r.idx)) return false;
    if(!esEstadoActivo(r.estadoDispensa)) return false;
    if(bodegaSearch && !normValue(r.bodegaDetalle).includes(bodegaSearch)) return false;
    if(zona && r.zona!==zona) return false;
    return true;
  }).map(r=>({
    'Bodega detalle': r.bodegaDetalle,
    'Dispensa': r.documento,
    'Codigo': r.codigoArticulo,
    'Descripción DCI': r.descripcionDci,
    'Cantidad': r.cantidadAutorizada,
    'Unidades Entregadas': r.unidades,
    'Diferencia': r.diferencia,
    // Mismo criterio del Indicador por Línea: ENTREGADA (Unidades>0 y Diferencia=0),
    // PENDIENTE (Diferencia<0) y OTRA para el resto de casos.
    'Estado de la línea': lineaEsEntregada(r) ? 'ENTREGADA' : (lineaEsPendiente(r) ? 'PENDIENTE' : 'OTRA'),
    'Usuario Creación': r.usuarioCreacion
  }));
  if(!detalle.length){ showToast('No hay líneas para el filtro actual.', true); return; }
  // Resumen por bodega con las mismas reglas del Indicador por Línea
  // (Total = líneas activas, Entregadas = Unidades>0 y Diferencia=0, Pendientes = Diferencia<0).
  const porBod=new Map();
  detalle.forEach(d=>{
    const k=d['Bodega detalle']||'N/D';
    if(!porBod.has(k)) porBod.set(k, {bodega:k, total:0, ent:0, pen:0});
    const g=porBod.get(k);
    g.total++;
    if(d['Estado de la línea']==='ENTREGADA') g.ent++;
    else if(d['Estado de la línea']==='PENDIENTE') g.pen++;
  });
  const resumenBod=[...porBod.values()]
    .sort((a,b)=>String(a.bodega).localeCompare(String(b.bodega),'es'))
    .map(g=>({
      'Bodega detalle': g.bodega,
      'Total líneas activas': g.total,
      'Líneas entregadas': g.ent,
      'Líneas pendientes': g.pen,
      '% Cumplimiento': g.total ? g.ent/g.total : ''
    }));
  const totGen = resumenBod.reduce((a,g)=>({t:a.t+g['Total líneas activas'], e:a.e+g['Líneas entregadas'], p:a.p+g['Líneas pendientes']}), {t:0,e:0,p:0});
  resumenBod.push({'Bodega detalle':'TOTAL','Total líneas activas':totGen.t,'Líneas entregadas':totGen.e,'Líneas pendientes':totGen.p,'% Cumplimiento': totGen.t ? totGen.e/totGen.t : ''});
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumenBod), 'Cumplimiento por Bodega');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalle), 'Detalle por Bodega');
  const fecha=new Date().toISOString().slice(0,10);
  const sufijo = (bodegaTexto || zona || 'Todas').replace(/[^A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ ]+/g,'').trim().replace(/\s+/g,'_');
  XLSX.writeFile(wb, 'Detalle_Dispensa_'+sufijo+'_'+fecha+'.xlsx');
  showToast('Excel de detalle por bodega exportado: '+fmtInt(detalle.length)+' líneas.');
});

// ---- Dispensas inactivas por bodega: resumen + detalle (Documento y Usuario Creación) ----
document.getElementById('btnDescargarInactivasBodega').addEventListener('click', ()=>{
  if(!filteredRowsCache.length){ showToast('No hay datos calculados para exportar.', true); return; }
  const disp = _inactivasDispCache || [];
  if(!disp.length){ showToast('No hay dispensas inactivas para el filtro actual.', true); return; }

  // Resumen por bodega (mismo orden que la tabla en pantalla)
  const porBodega=new Map();
  disp.forEach(d=>{
    const k=d.bodega||'N/D';
    if(!porBodega.has(k)) porBodega.set(k, {zona:d.zona||'N/D', bodega:k, cant:0});
    porBodega.get(k).cant++;
  });
  const totalInact = disp.length;
  const resumen=[...porBodega.values()].sort((a,b)=>b.cant-a.cant).map(b=>({
    'Zona': b.zona,
    'Bodega Detalle': b.bodega,
    'Dispensas inactivas': b.cant,
    '% del total': totalInact ? b.cant/totalInact : 0
  }));

  // Detalle: una fila por dispensa inactiva con Documento y Usuario Creación
  const detalle=disp.slice().sort((a,b)=>
    String(a.bodega||'').localeCompare(String(b.bodega||''),'es') ||
    String(a.usuario||'').localeCompare(String(b.usuario||''),'es')
  ).map(d=>({
    'Zona': d.zona||'N/D',
    'Bodega Detalle': d.bodega||'N/D',
    'Documento': d.documento||'',
    'Usuario Creación': d.usuario||'SIN USUARIO',
    'Fecha de Dispensación': d.fecha ? dateToISO(d.fecha) : '',
    'Líneas': d.lineas
  }));

  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), 'Resumen por Bodega');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalle), 'Detalle Inactivas');
  const fecha=new Date().toISOString().slice(0,10);
  XLSX.writeFile(wb, 'Dispensas_Inactivas_por_Bodega_'+fecha+'.xlsx');
  showToast('Excel de dispensas inactivas exportado: '+fmtInt(detalle.length)+' dispensas.');
});

// ---- Dispensas inactivas creadas SIN USUARIO: descarga en Excel ----
// Toma las dispensas inactivas del filtro actual y deja solo aquellas cuyo
// Usuario Creación viene vacío (se muestra como 'SIN USUARIO').
(function(){
  const btn=document.getElementById('btnDescargarInactivasSinUsuario');
  if(!btn) return;
  btn.addEventListener('click', ()=>{
    if(!filteredRowsCache.length){ showToast('No hay datos calculados para exportar.', true); return; }
    const disp = _inactivasDispCache || [];
    const sinUsuario = disp.filter(d=>String(d.usuario||'SIN USUARIO').trim().toUpperCase()==='SIN USUARIO');
    if(!sinUsuario.length){ showToast('No hay dispensas inactivas sin usuario de creación para el filtro actual.', true); return; }

    // Resumen por bodega para ubicar rápido dónde se concentran
    const porBodega=new Map();
    sinUsuario.forEach(d=>{
      const k=d.bodega||'N/D';
      if(!porBodega.has(k)) porBodega.set(k, {zona:d.zona||'N/D', bodega:k, cant:0, lineas:0});
      const g=porBodega.get(k); g.cant++; g.lineas+=Number(d.lineas)||0;
    });
    const total=sinUsuario.length;
    const resumen=[...porBodega.values()].sort((a,b)=>b.cant-a.cant).map(b=>({
      'Zona': b.zona,
      'Bodega Detalle': b.bodega,
      'Dispensas sin usuario': b.cant,
      'Líneas': b.lineas,
      '% del total': total ? b.cant/total : 0
    }));
    resumen.push({'Zona':'TOTAL','Bodega Detalle':'','Dispensas sin usuario':total,'Líneas':sinUsuario.reduce((a,d)=>a+(Number(d.lineas)||0),0),'% del total': total?1:0});

    // Detalle: una fila por ARTÍCULO de cada dispensa sin usuario, con código y Descripción por DCI
    const clavesSinUsuario=new Set(sinUsuario.map(d=>String(d.documento||'')+'|'+String(d.bodega||'')));
    const lineas=(_inactivasLineasCache||[]).filter(r=>
      !String(r.usuarioCreacion||'').trim() &&
      clavesSinUsuario.has(String(r.documento||'')+'|'+String(r.bodegaDetalle||''))
    );
    const detalle=lineas.slice().sort((a,b)=>
      String(a.bodegaDetalle||'').localeCompare(String(b.bodegaDetalle||''),'es') ||
      String(a.documento||'').localeCompare(String(b.documento||''),'es') ||
      String(a.codigoArticulo||'').localeCompare(String(b.codigoArticulo||''),'es')
    ).map(r=>({
      'Zona': r.zona||'N/D',
      'Bodega Detalle': r.bodegaDetalle||'N/D',
      'Documento': r.documento||'',
      'Código de Artículo': r.codigoArticulo||'',
      'Descripción por DCI': r.descripcionDci || r.descripcionReporte || '',
      'Unidades': Number(r.unidades)||0,
      'Cantidad Autorizada': Number(r.cantidadAutorizada)||0,
      'Estado de la línea': lineaEsEntregada(r) ? 'ENTREGADA' : (lineaEsPendiente(r) ? 'PENDIENTE' : 'SIN CLASIFICAR'),
      'Usuario Creación': 'SIN USUARIO',
      'Fecha de Dispensación': r.fecha ? dateToISO(r.fecha) : ''
    }));

    // Consolidado por artículo: cuáles medicamentos concentran estas dispensas
    const porArt=new Map();
    lineas.forEach(r=>{
      const k=String(r.codigoArticulo||'N/D');
      if(!porArt.has(k)) porArt.set(k, {codigo:k, dci:(r.descripcionDci||r.descripcionReporte||''), lineas:0, und:0, docs:new Set()});
      const g=porArt.get(k); g.lineas++; g.und+=Number(r.unidades)||0; g.docs.add(String(r.documento||''));
      if(!g.dci && (r.descripcionDci||r.descripcionReporte)) g.dci=r.descripcionDci||r.descripcionReporte;
    });
    const resumenArt=[...porArt.values()].sort((a,b)=>b.lineas-a.lineas).map(g=>({
      'Código de Artículo': g.codigo,
      'Descripción por DCI': g.dci||'',
      'Líneas': g.lineas,
      'Documentos': g.docs.size,
      'Unidades': g.und
    }));

    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalle), 'Detalle Sin Usuario');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumenArt), 'Resumen por Artículo');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), 'Resumen por Bodega');
    const fecha=new Date().toISOString().slice(0,10);
    XLSX.writeFile(wb, 'Dispensas_Inactivas_Sin_Usuario_'+fecha+'.xlsx');
    showToast('Excel exportado: '+fmtInt(total)+' dispensas sin usuario ('+fmtInt(detalle.length)+' líneas con código y DCI).');
  });
})();

/* Descarga el conteo de traslados RECIBIDOS por bodega destino, agrupado por Zona.
   Respeta los filtros de la sección: zona (o todas) y bodega destino específica.
   Se cuentan traslados ÚNICOS: un mismo número de traslado con varias líneas = 1. */
(function(){
  const btn=document.getElementById('btnDescargarTrasladosDestino');
  if(!btn) return;
  btn.addEventListener('click', ()=>{
    const p=state.processed;
    const all=(p && p.traslados) ? p.traslados : [];
    if(!all.length){ showToast('No hay traslados cargados para exportar.', true); return; }

    const zona=(document.getElementById('fTrasladoZona')||{}).value||'';
    const origen=(document.getElementById('fTrasladoOrigen')||{}).value||'';
    const destino=(document.getElementById('fTrasladoDestino')||{}).value||'';

    const filas=all.filter(r=>{
      if(zona && r.zonaDestino!==zona) return false;
      if(origen && r.bodegaOrigen!==origen) return false;
      if(destino && r.bodegaDestino!==destino) return false;
      return true;
    });
    if(!filas.length){ showToast('No hay traslados para los filtros actuales.', true); return; }

    // Agrupa por Zona + Bodega Destino contando números de traslado sin repetir.
    const grupos=new Map();
    filas.forEach((r,i)=>{
      const bd=r.bodegaDestino||'SIN BODEGA DESTINO';
      const zn=r.zonaDestino||'N/D';
      const k=zn+'||'+bd;
      if(!grupos.has(k)) grupos.set(k, {zona:zn, bodega:bd, ids:new Set(), lineas:0});
      const g=grupos.get(k);
      g.ids.add(r.traslado ? 'T:'+r.traslado : 'F:'+i);
      g.lineas++;
    });

    const lista=[...grupos.values()].map(g=>({zona:g.zona, bodega:g.bodega, cant:g.ids.size, lineas:g.lineas}))
      .sort((a,b)=> a.zona.localeCompare(b.zona,'es') || (b.cant-a.cant) || a.bodega.localeCompare(b.bodega,'es'));
    const total=lista.reduce((a,g)=>a+g.cant,0);

    const hoja=lista.map(g=>({
      'Zona': g.zona,
      'Bodega Destino': g.bodega,
      'Traslados realizados': g.cant,
      'Líneas de artículo': g.lineas,
      '% del total': total ? g.cant/total : 0
    }));
    hoja.push({
      'Zona': '', 'Bodega Destino': 'TOTAL ('+lista.length+(lista.length===1?' bodega)':' bodegas)'),
      'Traslados realizados': total,
      'Líneas de artículo': lista.reduce((a,g)=>a+g.lineas,0),
      '% del total': total ? 1 : 0
    });

    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hoja), 'Traslados por Bodega Destino');
    const fecha=new Date().toISOString().slice(0,10);
    const suf = destino ? '_'+String(destino).replace(/[^\w\-]+/g,'_') : (zona ? '_'+String(zona).replace(/[^\w\-]+/g,'_') : '');
    XLSX.writeFile(wb, 'Traslados_por_Bodega_Destino'+suf+'_'+fecha+'.xlsx');
    showToast('Excel exportado: '+fmtInt(lista.length)+' bodegas destino, '+fmtInt(total)+' traslados.');
  });
})();

/* Descarga solo las LÍNEAS NO HOMOLOGADAS de traslados (código que no existe en la
   tabla Homólogo), con las columnas pedidas: Código, Bodega Origen, Bodega Destino,
   Descripcion, Cantidad y Usuario. Respeta los filtros propios de la sección. */
(function(){
  const btn=document.getElementById('btnDescargarTrasladosNoHom');
  if(!btn) return;
  btn.addEventListener('click', ()=>{
    const p=state.processed;
    const all=(p && p.traslados) ? p.traslados : [];
    if(!all.length){ showToast('No hay traslados cargados para exportar.', true); return; }

    const origen=(document.getElementById('fTrasladoOrigen')||{}).value||'';
    const destino=(document.getElementById('fTrasladoDestino')||{}).value||'';
    const zonaNH=(document.getElementById('fTrasladoZona')||{}).value||'';
    const busca=normValue((document.getElementById('fTrasladoUsuario')||{}).value||'');

    const filas=all.filter(r=>{
      if(zonaNH && r.zonaDestino!==zonaNH) return false;
      if(origen && r.bodegaOrigen!==origen) return false;
      if(destino && r.bodegaDestino!==destino) return false;
      if(busca && !normValue(r.usuario).includes(busca)) return false;
      return r.moleculaPareto!=='PARETO' && r.moleculaPareto!=='NO PARETO';
    });

    if(!filas.length){ showToast('No hay líneas no homologadas para los filtros actuales.', true); return; }

    const detalle=filas.map(r=>({
      'Codigo': r.codigo,
      'Bodega Origen': r.bodegaOrigen,
      'Bodega Destino': r.bodegaDestino,
      'Descripcion': r.descripcion||'',
      'Cantidad': r.cantidad||0,
      'Usuario': r.usuario
    }));

    const porCodigo=new Map();
    filas.forEach(r=>{
      if(!porCodigo.has(r.codigo)) porCodigo.set(r.codigo, {codigo:r.codigo, descripcion:r.descripcion||'', lineas:0, cantidad:0, usuarios:new Set()});
      const g=porCodigo.get(r.codigo);
      g.lineas++; g.cantidad+=(r.cantidad||0); g.usuarios.add(r.usuario);
      if(!g.descripcion && r.descripcion) g.descripcion=r.descripcion;
    });
    const resumenCod=[...porCodigo.values()].sort((a,b)=> (b.lineas-a.lineas) || String(a.codigo).localeCompare(String(b.codigo),'es')).map(g=>({
      'Codigo': g.codigo,
      'Descripcion': g.descripcion,
      'Líneas no homologadas': g.lineas,
      'Cantidad total': g.cantidad,
      'Usuarios distintos': g.usuarios.size
    }));

    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalle), 'Líneas no homologadas');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumenCod), 'Resumen por Codigo');
    const fecha=new Date().toISOString().slice(0,10);
    XLSX.writeFile(wb, 'Traslados_Lineas_No_Homologadas_'+fecha+'.xlsx');

    const sinDesc=detalle.every(d=>!d['Descripcion']);
    showToast('Excel exportado: '+fmtInt(detalle.length)+' líneas no homologadas.'+(sinDesc?' Sincroniza de nuevo la tarjeta Traslados para traer Descripcion y Cantidad.':''));
  });
})();

/* =========================================================================
   13c. Comparativo Inventario Sistema vs. Físico
   El inventario del sistema se lee de la tabla "Inventario del Punto".
   El inventario físico se lee EXCLUSIVAMENTE de la carpeta de Google Drive
   "Inventario Físico" (dataset invfisico): columnas Codigo, Bodega Detalle y
   Unidades en fisico. El cruce es por Bodega Detalle + Código.
   ========================================================================= */
let _invFisicoRows=[];            // conteo físico traído de Drive
let _invFisicoFileName='';
let _invFisicoUpdatedAt='';
let _invSistemaCache=null;        // inventario del sistema agregado por bodega+codigo
let _invFisicoResumen=[];         // cache para exportar
let _invFisicoDetalle=[];

/* Lee el conteo físico sincronizado desde Drive (almacén local del navegador). */
async function ensureInvFisicoData(){
  const rec=await idbGet('invfisico');
  const filas=(rec && rec.rows) ? rec.rows : [];
  const rows=[];
  filas.forEach(r=>{
    const cod=normValue(r.codigoArticulo);
    if(!cod) return;
    const bodega=String(r.bodegaDetalle||'').trim() || 'SIN BODEGA';
    rows.push({ codigo:cod, bodega, bodegaNorm:normValue(bodega),
      unidades:toNumber(r.unidades), descripcion:'' });
  });
  _invFisicoRows=rows;
  _invFisicoFileName=(rec && rec.fileName) || '';
  _invFisicoUpdatedAt=(rec && rec.updatedAt) || '';
  return rows;
}

async function ensureInvSistemaData(force){
  if(_invSistemaCache && !force) return _invSistemaCache;
  const recI=await idbGet('inventario');
  const rowsI=(recI && recI.rows) ? recI.rows : [];
  const recH=await idbGet('homologo');
  const descMap=new Map();
  ((recH && recH.rows)?recH.rows:[]).forEach(r=>{
    const c=normValue(r.codigo);
    if(c && !descMap.has(c)) descMap.set(c, String(r.descripcionDci||r.articulo||'').trim());
  });
  const recB=await idbGet('bodegas');
  const zonaMap=new Map();
  ((recB && recB.rows)?recB.rows:[]).forEach(r=>{
    const b=normValue(r.bodega);
    if(b && !zonaMap.has(b)) zonaMap.set(b, String(r.zona||'').trim() || 'N/D');
  });
  // Un mismo código puede venir varias veces (lotes / vencimientos): se suman las unidades.
  const sistema=new Map();
  rowsI.forEach(r=>{
    const cod=normValue(r.codigoArticulo);
    if(!cod) return;
    const bodega=String(r.bodegaDetalle||'').trim();
    const bn=normValue(bodega);
    const k=bn+'|'+cod;
    if(!sistema.has(k)) sistema.set(k, {bodega: bodega || 'SIN BODEGA', bodegaNorm:bn, codigo:cod, unidades:0});
    sistema.get(k).unidades += toNumber(r.unidades);
  });
  _invSistemaCache={ sistema, descMap, zonaMap, filas:rowsI.length, fileName:(recI && recI.fileName) || '' };
  return _invSistemaCache;
}

function invFisicoMensaje(html){
  const el=document.getElementById('invFisicoDiag');
  if(!el) return;
  if(!html){ el.style.display='none'; el.innerHTML=''; return; }
  el.style.display=''; el.innerHTML=html;
}
function invFisicoVaciar(msg){
  const tbB=document.querySelector('#tblInvFisicoBodega tbody');
  const tbD=document.querySelector('#tblInvFisicoDetalle tbody');
  const st=document.getElementById('statsInvFisico');
  if(st) st.innerHTML='';
  if(tbB) tbB.innerHTML='<tr><td colspan="14" class="txt" style="text-align:center;color:#9CA9B6;">'+escHtml(msg)+'</td></tr>';
  if(tbD) tbD.innerHTML='<tr><td colspan="7" class="txt" style="text-align:center;color:#9CA9B6;">'+escHtml(msg)+'</td></tr>';
  ['pieInvFisico','pieInvFisicoDif'].forEach(id=>{
    const svg=document.getElementById(id);
    if(svg) drawDonut(id, [{label:'',value:1,color:'#DCE4EC'}], '—');
  });
  ['pieInvFisicoLegend','pieInvFisicoDifLegend'].forEach(id=>{
    const l=document.getElementById(id); if(l) l.innerHTML='';
  });
  _invFisicoResumen=[]; _invFisicoDetalle=[];
}

function construirComparativoInvFisico(){
  const cache=_invSistemaCache;
  const sistema=cache ? cache.sistema : new Map();
  const descMap=cache ? cache.descMap : new Map();
  const zonaMap=cache ? cache.zonaMap : new Map();
  // El comparativo se limita a las bodegas que vienen en el conteo físico:
  // así no aparecen como "faltantes" bodegas que simplemente no se contaron.
  const bodegasFisico=new Map();   // bodegaNorm -> nombre visible
  const fisico=new Map();          // bodegaNorm|codigo -> unidades
  const descFisico=new Map();
  _invFisicoRows.forEach(r=>{
    if(!r.codigo) return;
    if(!bodegasFisico.has(r.bodegaNorm)) bodegasFisico.set(r.bodegaNorm, r.bodega);
    const k=r.bodegaNorm+'|'+r.codigo;
    fisico.set(k, (fisico.get(k)||0) + r.unidades);
    if(r.descripcion && !descFisico.has(r.codigo)) descFisico.set(r.codigo, r.descripcion);
  });

  const porBodega=new Map();
  const detalle=[];
  const getGrupo=(bn, nombre)=>{
    if(!porBodega.has(bn)){
      porBodega.set(bn, { bodega: nombre || bn || 'SIN BODEGA', bodegaNorm:bn, zona: zonaMap.get(bn) || 'N/D',
        codSis:0, codFis:0, comparados:0, iguales:0, sobrantes:0, faltantes:0, soloSis:0, soloFis:0,
        undSis:0, undFis:0 });
    }
    return porBodega.get(bn);
  };
  const desc=(cod)=> descMap.get(cod) || descFisico.get(cod) || '';

  // 1) Todo lo que el sistema tiene en las bodegas contadas
  const vistos=new Set();
  sistema.forEach(v=>{
    if(!bodegasFisico.has(v.bodegaNorm)) return;
    const g=getGrupo(v.bodegaNorm, bodegasFisico.get(v.bodegaNorm) || v.bodega);
    const k=v.bodegaNorm+'|'+v.codigo;
    vistos.add(k);
    const uSis=v.unidades;
    const hayFis=fisico.has(k);
    const uFis=hayFis ? fisico.get(k) : 0;
    g.codSis++; g.undSis+=uSis;
    if(hayFis){ g.codFis++; g.undFis+=uFis; }
    let estado;
    if(!hayFis){ estado='SOLO EN SISTEMA'; g.soloSis++; }
    else {
      g.comparados++;
      if(uFis===uSis){ estado='IGUAL'; g.iguales++; }
      else if(uFis>uSis){ estado='SOBRANTE'; g.sobrantes++; }
      else { estado='FALTANTE'; g.faltantes++; }
    }
    detalle.push({ bodega:g.bodega, zona:g.zona, codigo:v.codigo, descripcion:desc(v.codigo),
      undSis:uSis, undFis:uFis, dif:uFis-uSis, estado });
  });
  // 2) Códigos que solo aparecen en el conteo físico
  fisico.forEach((uFis,k)=>{
    if(vistos.has(k)) return;
    const bn=k.slice(0, k.lastIndexOf('|'));
    const cod=k.slice(k.lastIndexOf('|')+1);
    const g=getGrupo(bn, bodegasFisico.get(bn));
    g.codFis++; g.undFis+=uFis; g.soloFis++;
    detalle.push({ bodega:g.bodega, zona:g.zona, codigo:cod, descripcion:desc(cod),
      undSis:0, undFis:uFis, dif:uFis, estado:'SOLO EN FISICO' });
  });

  const resumen=[...porBodega.values()].map(g=>{
    g.difUnd = g.undFis - g.undSis;
    g.exactitud = g.comparados ? g.iguales/g.comparados : null;
    return g;
  }).sort((a,b)=>(a.zona+a.bodega).localeCompare(b.zona+b.bodega,'es'));

  detalle.sort((a,b)=> Math.abs(b.dif)-Math.abs(a.dif) || a.bodega.localeCompare(b.bodega,'es') || a.codigo.localeCompare(b.codigo,'es'));
  return {resumen, detalle};
}

const INVFIS_MAX_FILAS=1000;
// Orden configurable del detalle: por defecto la mayor diferencia en unidades primero.
let invFisOrden={col:'difAbs', dir:'desc'};

/* Llena el filtro de bodega con las bodegas presentes en el detalle. */
function poblarBodegasInvFisico(){
  const sel=document.getElementById('fInvFisicoBodega');
  if(!sel) return;
  const previo=sel.value;
  const bodegas=[...new Set(_invFisicoDetalle.map(r=>r.bodega||'SIN BODEGA'))].sort((a,b)=>a.localeCompare(b,'es'));
  sel.innerHTML='<option value="__ALL__">Todas las bodegas</option>'+
    bodegas.map(b=>'<option value="'+escHtml(b)+'">'+escHtml(b)+'</option>').join('');
  sel.value = bodegas.includes(previo) ? previo : '__ALL__';
}

/* Marca en los encabezados y en los selectores cual es el orden activo. */
function actualizarControlesOrdenInvFisico(){
  document.querySelectorAll('#tblInvFisicoDetalle thead th.sortable').forEach(th=>{
    const ind=th.querySelector('.sort-ind');
    const activo = th.dataset.col===invFisOrden.col;
    th.classList.toggle('sort-active', activo);
    if(ind) ind.textContent = activo ? (invFisOrden.dir==='asc'?'▲':'▼') : '⇅';
  });
  const selCol=document.getElementById('fInvFisicoOrdenCol');
  const selDir=document.getElementById('fInvFisicoOrdenDir');
  if(selCol && selCol.value!==invFisOrden.col) selCol.value=invFisOrden.col;
  if(selDir && selDir.value!==invFisOrden.dir) selDir.value=invFisOrden.dir;
}

function pintarDetalleInvFisico(){
  const tb=document.querySelector('#tblInvFisicoDetalle tbody');
  if(!tb) return;
  const tipo=(document.getElementById('fInvFisicoTipo')||{}).value || 'DIF';
  const bod=(document.getElementById('fInvFisicoBodega')||{}).value || '__ALL__';
  let filas=_invFisicoDetalle;
  if(bod!=='__ALL__') filas=filas.filter(r=>(r.bodega||'SIN BODEGA')===bod);
  if(tipo==='DIF') filas=filas.filter(r=>r.dif!==0 || r.estado==='SOLO EN SISTEMA' || r.estado==='SOLO EN FISICO');
  else if(tipo!=='TODOS') filas=filas.filter(r=>r.estado===tipo.replace('_',' ').replace('SOLO SISTEMA','SOLO EN SISTEMA').replace('SOLO FISICO','SOLO EN FISICO'));
  if(!filas.length){
    tb.innerHTML='<tr><td colspan="7" class="txt" style="text-align:center;color:#9CA9B6;">No hay códigos para los filtros seleccionados.</td></tr>';
    actualizarControlesOrdenInvFisico();
    return;
  }
  // Ordenamiento configurable (texto alfabetico, numeros por valor).
  const col=invFisOrden.col, dir=(invFisOrden.dir==='asc')?1:-1;
  const esTexto=(col==='codigo'||col==='descripcion'||col==='estado');
  const val=(r)=> col==='difAbs' ? Math.abs(r.dif||0) : (r[col]==null?0:r[col]);
  filas=filas.slice().sort((a,b)=>{
    if(esTexto){
      const c=String(a[col]||'').localeCompare(String(b[col]||''),'es')*dir;
      return c!==0 ? c : String(a.codigo||'').localeCompare(String(b.codigo||''),'es');
    }
    const va=val(a), vb=val(b);
    if(va===vb) return String(a.codigo||'').localeCompare(String(b.codigo||''),'es');
    return (va-vb)*dir;
  });
  const vista=filas.slice(0, INVFIS_MAX_FILAS);
  const colorEstado=(e)=> e==='IGUAL' ? 'pct-good' : (e==='SOBRANTE' ? 'pct-mid' : 'pct-bad');
  let h=vista.map((r,i)=>
    '<tr><td>'+(i+1)+'</td>'+
    '<td class="txt">'+escHtml(r.codigo)+'</td>'+
    '<td class="txt wrapcell">'+escHtml(r.descripcion||'—')+'</td>'+
    '<td>'+fmtInt(r.undSis)+'</td>'+
    '<td>'+fmtInt(r.undFis)+'</td>'+
    '<td class="'+(r.dif===0?'':(r.dif>0?'pct-mid':'pct-bad'))+'"><b>'+(r.dif>0?'+':'')+fmtInt(r.dif)+'</b></td>'+
    '<td class="txt '+colorEstado(r.estado)+'">'+escHtml(r.estado)+'</td></tr>'
  ).join('');
  if(filas.length>vista.length){
    h+='<tr class="total-row"><td colspan="7" class="txt">Se muestran las primeras '+fmtInt(vista.length)+' de '+fmtInt(filas.length)+' filas. Usa el botón de exportar para ver el listado completo.</td></tr>';
  }
  tb.innerHTML=h;
  actualizarControlesOrdenInvFisico();
}

function renderComparativoInvFisico(){
  const tbB=document.querySelector('#tblInvFisicoBodega tbody');
  if(!tbB) return;
  const haySistema = _invSistemaCache && _invSistemaCache.sistema.size>0;
  if(!haySistema){
    invFisicoMensaje('<b>Falta el inventario del sistema.</b> Ve a la pestaña de cargue y sincroniza la tarjeta <b>Inventario del Punto</b> desde Google Drive.');
    invFisicoVaciar('Sin inventario del sistema cargado.');
    return;
  }
  if(!_invFisicoRows.length){
    invFisicoMensaje('<b>Falta el inventario físico.</b> Ve a la pestaña de cargue y sincroniza la tarjeta <b>Inventario Físico (conteo)</b> desde Google Drive (columnas <b>Codigo</b>, <b>Bodega Detalle</b> y <b>Unidades en fisico</b>). Inventario del sistema disponible: <b>'+fmtInt(_invSistemaCache.sistema.size)+'</b> combinaciones de bodega y código.');
    invFisicoVaciar('Sin inventario físico sincronizado desde Google Drive.');
    return;
  }

  const {resumen, detalle}=construirComparativoInvFisico();
  _invFisicoResumen=resumen; _invFisicoDetalle=detalle;
  poblarBodegasInvFisico();

  const tot=(f)=>resumen.reduce((a,b)=>a+(b[f]||0),0);
  const comparados=tot('comparados'), iguales=tot('iguales');
  const exactitudGlobal = comparados ? iguales/comparados : null;
  const bodegasSinCruce=resumen.filter(g=>g.codSis===0).length;

  let sincro='';
  if(_invFisicoUpdatedAt){
    const d=new Date(_invFisicoUpdatedAt);
    if(!isNaN(d)) sincro=' · sincronizado el <b>'+d.toLocaleDateString('es')+' '+d.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})+'</b>';
  }
  invFisicoMensaje('Conteo físico desde Drive: <b>'+escHtml(_invFisicoFileName||'(sin nombre)')+'</b> · '+fmtInt(_invFisicoRows.length)+' filas leídas · '+fmtInt(resumen.length)+' bodega(s) contada(s)'+sincro+'.'+
    (bodegasSinCruce ? ' <b>Ojo:</b> '+fmtInt(bodegasSinCruce)+' bodega(s) del conteo físico no existen en el inventario del sistema (revisa que el nombre de la bodega sea igual).' : ''));

  const st=document.getElementById('statsInvFisico');
  if(st){
    // Las cifras muy largas reciben la clase "long" para reducir el tamaño y no desbordar la tarjeta.
    const valLargo=(txt)=> '<div class="value'+(String(txt).length>11?' long':'')+'">'+txt+'</div>';
    const difNeta=((tot('undFis')-tot('undSis'))>0?'+':'')+fmtInt(tot('undFis')-tot('undSis'));
    const sobFal=fmtInt(tot('sobrantes'))+' / '+fmtInt(tot('faltantes'));
    const sisFis=fmtInt(tot('soloSis'))+' / '+fmtInt(tot('soloFis'));
    st.innerHTML =
      '<div class="stat"><div class="label">Bodegas comparadas</div><div class="value">'+fmtInt(resumen.length)+'</div>'+
      '<div class="sub">según el archivo físico</div></div>'+
      '<div class="stat"><div class="label">Códigos comparados</div>'+valLargo(fmtInt(comparados))+
      '<div class="sub">presentes en sistema y físico</div></div>'+
      '<div class="stat"><div class="label">% Exactitud de inventario</div><div class="value '+effClass(exactitudGlobal)+'">'+fmtPct(exactitudGlobal)+'</div>'+
      '<div class="sub">'+fmtInt(iguales)+' códigos sin diferencia</div></div>'+
      '<div class="stat"><div class="label">Sobrantes / Faltantes</div>'+valLargo(sobFal)+
      '<div class="sub">códigos con diferencia</div></div>'+
      '<div class="stat"><div class="label">Solo sistema / Solo físico</div>'+valLargo(sisFis)+
      '<div class="sub">códigos que no cruzan</div></div>'+
      '<div class="stat"><div class="label">Diferencia neta en unidades</div>'+valLargo(difNeta)+
      '<div class="sub">físico '+fmtInt(tot('undFis'))+' vs sistema '+fmtInt(tot('undSis'))+'</div></div>';
  }

  // ---- Tabla por bodega ----
  let h=resumen.map(g=>
    '<tr><td class="txt">'+escHtml(g.bodega)+'</td><td class="txt">'+escHtml(g.zona)+'</td>'+
    '<td>'+fmtInt(g.codSis)+'</td><td>'+fmtInt(g.codFis)+'</td><td><b>'+fmtInt(g.comparados)+'</b></td>'+
    '<td>'+fmtInt(g.iguales)+'</td><td>'+fmtInt(g.sobrantes)+'</td><td>'+fmtInt(g.faltantes)+'</td>'+
    '<td>'+fmtInt(g.soloSis)+'</td><td>'+fmtInt(g.soloFis)+'</td>'+
    '<td>'+fmtInt(g.undSis)+'</td><td>'+fmtInt(g.undFis)+'</td>'+
    '<td class="'+(g.difUnd===0?'':(g.difUnd>0?'pct-mid':'pct-bad'))+'">'+(g.difUnd>0?'+':'')+fmtInt(g.difUnd)+'</td>'+
    '<td class="'+effClass(g.exactitud)+'"><b>'+fmtPct(g.exactitud)+'</b></td></tr>'
  ).join('');
  h+='<tr class="total-row"><td class="txt">TOTAL ('+resumen.length+')</td><td>—</td>'+
     '<td>'+fmtInt(tot('codSis'))+'</td><td>'+fmtInt(tot('codFis'))+'</td><td>'+fmtInt(comparados)+'</td>'+
     '<td>'+fmtInt(iguales)+'</td><td>'+fmtInt(tot('sobrantes'))+'</td><td>'+fmtInt(tot('faltantes'))+'</td>'+
     '<td>'+fmtInt(tot('soloSis'))+'</td><td>'+fmtInt(tot('soloFis'))+'</td>'+
     '<td>'+fmtInt(tot('undSis'))+'</td><td>'+fmtInt(tot('undFis'))+'</td>'+
     '<td>'+((tot('undFis')-tot('undSis'))>0?'+':'')+fmtInt(tot('undFis')-tot('undSis'))+'</td>'+
     '<td>'+fmtPct(exactitudGlobal)+'</td></tr>';
  tbB.innerHTML=h;

  // ---- Donas ----
  const aggInv=(tbl)=>{
    const s=(f)=>tbl.reduce((a,b)=>a+(b[f]||0),0);
    return { bodega:'__ALL__', comparados:s('comparados'), iguales:s('iguales'), sobrantes:s('sobrantes'),
      faltantes:s('faltantes'), soloSis:s('soloSis'), soloFis:s('soloFis') };
  };
  setupGenericPieSelector('pieInvFisicoSelect','pieInvFisico','pieInvFisicoLegend', resumen, aggInv, row=>[
    {label:'Códigos iguales', value: row.iguales||0, color:'#1E8F5E'},
    {label:'Códigos con diferencia', value: Math.max(0,(row.comparados||0)-(row.iguales||0)), color:'#C0392B'}
  ], { mode:'count', centerFn:(slices,total)=>{
      const ig=slices.find(s=>s.label==='Códigos iguales');
      return fmtPct(total ? (ig? ig.value:0)/total : null);
  }});
  setupGenericPieSelector('pieInvFisicoDifSelect','pieInvFisicoDif','pieInvFisicoDifLegend', resumen, aggInv, row=>[
    {label:'Sobrantes', value: row.sobrantes||0, color:'#D98A2B'},
    {label:'Faltantes', value: row.faltantes||0, color:'#C0392B'},
    {label:'Solo en sistema', value: row.soloSis||0, color:'#0B5FA5'},
    {label:'Solo en físico', value: row.soloFis||0, color:'#7C5CBF'}
  ], { mode:'count' });

  pintarDetalleInvFisico();
}

/* Recarga desde el almacén local (Drive) y repinta toda la subvista. */
async function refrescarInvFisico(force){
  try{
    await ensureInvSistemaData(force);
    await ensureInvFisicoData();
    renderComparativoInvFisico();
  }catch(err){
    console.error('Inventario físico:', err);
    invFisicoMensaje('<b>No se pudo preparar el comparativo:</b> '+escHtml(err.message||String(err)));
  }
}

(function initInvFisico(){
  const selTipo=document.getElementById('fInvFisicoTipo');
  if(selTipo) selTipo.addEventListener('change', pintarDetalleInvFisico);
  const selBod=document.getElementById('fInvFisicoBodega');
  if(selBod) selBod.addEventListener('change', pintarDetalleInvFisico);
  const selOC=document.getElementById('fInvFisicoOrdenCol');
  if(selOC) selOC.addEventListener('change', ()=>{ invFisOrden.col=selOC.value; pintarDetalleInvFisico(); });
  const selOD=document.getElementById('fInvFisicoOrdenDir');
  if(selOD) selOD.addEventListener('change', ()=>{ invFisOrden.dir=selOD.value; pintarDetalleInvFisico(); });
  // Cualquier encabezado de la tabla sirve para ordenar (un clic alterna mayor→menor / menor→mayor).
  document.querySelectorAll('#tblInvFisicoDetalle thead th.sortable').forEach(th=>{
    th.addEventListener('click', ()=>{
      const c=th.dataset.col;
      if(invFisOrden.col===c) invFisOrden.dir=(invFisOrden.dir==='asc')?'desc':'asc';
      else { invFisOrden.col=c; invFisOrden.dir=(c==='codigo'||c==='descripcion'||c==='estado')?'asc':'desc'; }
      pintarDetalleInvFisico();
    });
  });
  actualizarControlesOrdenInvFisico();
  const btnExp=document.getElementById('btnExportInvFisico');
  if(btnExp) btnExp.addEventListener('click', ()=>{
    if(!_invFisicoDetalle.length){ showToast('Primero sincroniza el inventario físico desde Google Drive.', true); return; }
    const resumen=_invFisicoResumen.map(g=>({
      'Bodega':g.bodega, 'Zona':g.zona, 'Codigos sistema':g.codSis, 'Codigos fisico':g.codFis,
      'Comparados':g.comparados, 'Iguales':g.iguales, 'Sobrantes':g.sobrantes, 'Faltantes':g.faltantes,
      'Solo en sistema':g.soloSis, 'Solo en fisico':g.soloFis,
      'Unidades sistema':g.undSis, 'Unidades fisico':g.undFis, 'Diferencia unidades':g.difUnd,
      '% Exactitud':g.exactitud===null?'':+(g.exactitud*100).toFixed(1)
    }));
    const detalle=_invFisicoDetalle.map(r=>({
      'Bodega':r.bodega, 'Zona':r.zona, 'Codigo':r.codigo, 'Descripcion DCI':r.descripcion,
      'Unidades sistema':r.undSis, 'Unidades fisico':r.undFis, 'Diferencia':r.dif, 'Estado':r.estado
    }));
    const fecha=new Date().toISOString().slice(0,10);
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen.length?resumen:[{'Sin datos':''}]), 'RESUMEN POR BODEGA');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalle), 'DETALLE SISTEMA VS FISICO');
    XLSX.writeFile(wb, 'Comparativo_Inventario_Sistema_vs_Fisico_'+fecha+'.xlsx');
    showToast('Excel exportado: '+fmtInt(detalle.length)+' códigos comparados.');
  });
})();

/* =========================================================================
   13d. Indicador e informe de Cohortes
   Cada línea se clasifica según el diagnóstico (DESCRIPCION CIE 10). Para la
   cohorte de Antibióticos también se revisa la molecula dispensada, porque el
   diagnóstico no siempre menciona la infección.
   ========================================================================= */
const COHORTES_DEF=[
  { key:'MATERNAS', label:'Maternas', color:'#C2529B', dx:[
    'EMBARAZO','GESTACION','GESTANTE','PRENATAL','PARTO','PUERPERIO','OBSTETRIC','PREECLAMPSIA','ECLAMPSIA',
    'ABORTO','MATERNA','MATERNO','SUPERVISION DE EMBARAZO','ATENCION MATERNA','TRABAJO DE PARTO','PLACENTA',
    'AMENAZA DE PARTO','MULTIGESTANTE','PRIMIGESTANTE','LACTANCIA','PUERPERAL'] },
  { key:'NUTRICION', label:'Nutrición', color:'#1E8F5E', dx:[
    'DESNUTRICION','MALNUTRICION','NUTRICION','NUTRICIONAL','OBESIDAD','SOBREPESO','BAJO PESO','PESO INSUFICIENTE',
    'DEFICIENCIA DE VITAMINA','AVITAMINOSIS','CARENCIA','ANEMIA POR DEFICIENCIA','ANEMIA FERROPENICA',
    'DEFICIENCIA DE HIERRO','RAQUITISMO','CAQUEXIA','PERDIDA DE PESO','TALLA BAJA','RETARDO DEL CRECIMIENTO',
    'FALLA DE MEDRO','TRASTORNO DE LA ALIMENTACION'] },
  { key:'CARDIOVASCULAR', label:'Cardiovascular / HTA', color:'#C0392B', dx:[
    'HIPERTENSION','HIPERTENSIVA','HIPERTENSIVO','CARDIOPATIA','CARDIACA','CARDIACO','CORAZON','INFARTO',
    'ANGINA','ARRITMIA','FIBRILACION','INSUFICIENCIA CARDIACA','ATEROSCLEROSIS','ARTERIOSCLEROSIS',
    'DISLIPIDEMIA','HIPERLIPIDEMIA','HIPERCOLESTEROLEMIA','CEREBROVASCULAR','ISQUEMIC','VALVULA MITRAL',
    'AORTIC','TROMBOSIS','ENFERMEDAD VASCULAR','VENA','MIOCARDIO','HIPERTENSION ARTERIAL','FALLA CARDIACA'] },
  { key:'TRASPLANTADOS', label:'Trasplantados', color:'#7C5CBF', dx:[
    'TRASPLANT','TRANSPLANT','INJERTO','RECHAZO DEL ORGANO','RECHAZO DE ORGANO','PORTADOR DE ORGANO',
    'DONANTE','POSTRASPLANTE','POST TRASPLANTE','INMUNOSUPRESION'] },
  { key:'DIABETICOS', label:'Diabéticos', color:'#0B5FA5', dx:[
    'DIABETES','DIABETIC','MELLITUS','HIPERGLUCEMIA','INSULINODEPENDIENTE','NO INSULINODEPENDIENTE',
    'INTOLERANCIA A LA GLUCOSA','PREDIABETES','GLUCEMIA ALTERADA'] },
  { key:'ANTIBIOTICOS', label:'Antibióticos', color:'#D98A2B', dx:[
    'INFECCION','INFECCIOSA','INFECCIOSO','SEPSIS','SEPTICEMIA','NEUMONIA','TUBERCULOSIS','BACTERI',
    'ABSCESO','CELULITIS','AMIGDALITIS','FARINGITIS','FARINGOAMIGDALITIS','OTITIS','SINUSITIS','BRONQUITIS',
    'CISTITIS','URINARIA','PIELONEFRITIS','GASTROENTERITIS','OSTEOMIELITIS','ENDOCARDITIS','MENINGITIS',
    'ERISIPELA','IMPETIGO','APENDICITIS','COLANGITIS','VAGINOSIS','URETRITIS','SIFILIS','SALMONEL','ESTAFILOC',
    'ESTREPTOC','HERIDA INFECTADA'],
    med:['AMOXICILINA','AMPICILINA','PENICILINA','CEFALEXINA','CEFRADINA','CEFAZOLIN','CEFTRIAXONA','CEFTAZIDIMA',
    'CEFEPIME','CEFUROXIMA','CIPROFLOXACIN','LEVOFLOXACIN','MOXIFLOXACIN','NORFLOXACIN','AZITROMICINA',
    'CLARITROMICINA','ERITROMICINA','CLINDAMICINA','METRONIDAZOL','DOXICICLINA','TETRACICLINA','GENTAMICINA',
    'AMIKACINA','VANCOMICINA','MEROPENEM','IMIPENEM','ERTAPENEM','PIPERACILINA','TAZOBACTAM','LINEZOLID',
    'NITROFURANTOINA','TRIMETOPRIM','SULFAMETOXAZOL','OXACILINA','DICLOXACILINA','CLAVULANICO','FOSFOMICINA',
    'RIFAMPICINA','ISONIAZIDA','ETAMBUTOL','PIRAZINAMIDA','COLISTINA','TIGECICLINA','CLORANFENICOL'] }
];
const COHORTE_LABEL=new Map(COHORTES_DEF.map(c=>[c.key,c.label]));
let _cohortesResumen=[];
let _cohortesTop=[];
let _cohortesDetalle=[];
let _cohortesGlobalCodigos=[];   // consolidado de todas las cohortes juntas (sin duplicar lineas)
let _cohortesBodegas=[];
// Listado línea a línea de las dispensas clasificadas en alguna cohorte, con su diagnóstico
// (DESCRIPCION CIE 10). Se usa para la descarga "cohorte con diagnóstico (listado completo)".
let _cohortesLineas=[];

function clasificarCohortesLinea(r){
  const dx=normValue(r.codigoCie10);
  const med=normValue(r.descripcionDci)+' '+normValue(r.homologo);
  const out=[];
  for(let i=0;i<COHORTES_DEF.length;i++){
    const c=COHORTES_DEF[i];
    let hit = !!dx && c.dx.some(k=>dx.indexOf(k)>=0);
    if(!hit && c.med) hit = c.med.some(k=>med.indexOf(k)>=0);
    if(hit) out.push(c.key);
  }
  return out;
}

function renderCohortes(rowsAllRaw, bodegaSearch, zona){
  const tb=document.querySelector('#tblCohortes tbody');
  const tbTop=document.querySelector('#tblCohortesTop tbody');
  if(!tb || !tbTop) return;
  const statsEl=document.getElementById('statsCohortes');
  const diagEl=document.getElementById('cohortesDiag');
  const base=(rowsAllRaw && rowsAllRaw.length) ? rowsAllRaw : [];

  if(!base.length){
    if(statsEl) statsEl.innerHTML='';
    if(diagEl){ diagEl.style.display=''; diagEl.innerHTML='<b>Sin datos.</b> Carga las tablas y pulsa <b>Calcular indicadores</b> para ver el informe de cohortes.'; }
    tb.innerHTML='<tr><td colspan="10" class="txt" style="text-align:center;color:#9CA9B6;">No hay datos calculados.</td></tr>';
    tbTop.innerHTML='<tr><td colspan="6" class="txt" style="text-align:center;color:#9CA9B6;">No hay datos calculados.</td></tr>';
    _cohortesResumen=[]; _cohortesTop=[]; _cohortesDetalle=[]; _cohortesGlobalCodigos=[]; _cohortesLineas=[];
    ['pieCohortes','pieCohortesPend'].forEach(id=>drawDonut(id, [{label:'',value:1,color:'#DCE4EC'}], '—'));
    ['pieCohortesLegend','pieCohortesPendLegend'].forEach(id=>{ const l=document.getElementById(id); if(l) l.innerHTML=''; });
    return;
  }

  // Solo dispensas con Estado Activo, respetando los filtros de bodega y zona de la barra superior.
  const rows=soloActivas(base).filter(r=>{
    if(bodegaSearch && !normValue(r.bodegaDetalle).includes(bodegaSearch)) return false;
    if(zona && r.zona!==zona) return false;
    return true;
  });

  const resumen=new Map();
  COHORTES_DEF.forEach(c=>resumen.set(c.key, { key:c.key, label:c.label, color:c.color,
    pacientes:new Set(), lineas:0, ent:0, pen:0, unidades:0, codigos:new Set(), sinHomologar:new Set(), bodegas:new Set() }));
  const porBodega=new Map();      // para las donas (un renglon por bodega)
  const porCodigo=new Map();      // cohorte|bodega|codigo
  const porCodigoGlobal=new Map(); // bodega|codigo  (una sola vez por linea, para "Todas las cohortes")
  let lineasClasificadas=0, sinDx=0;
  const lineasCoh=[];             // una fila por línea clasificada, con su diagnóstico

  // Descripción a usar: la del catálogo de Homólogos y, si el código no está homologado,
  // la descripción que trae el propio Reporte de Dispensación.
  const descLinea=(r)=>String(r.descripcionDci||'').trim() || String(r.descripcionReporte||r.descripcion||'').trim();
  const sinHomologarLinea=(r)=>!(r.enHomologos===true || String(r.homologo||'').trim()!=='');

  rows.forEach(r=>{
    if(!normValue(r.codigoCie10)) sinDx++;
    const cohortes=clasificarCohortesLinea(r);
    if(!cohortes.length) return;
    lineasClasificadas++;
    const bodega=r.bodegaDetalle||'SIN BODEGA';
    // Fila del listado completo: se guarda tal como viene la línea, con su diagnóstico.
    lineasCoh.push({
      cohortes, bodega, zona:r.zona||'N/D', eps:r.eps||'', epsGrupo:r.epsGrupo||'N/D',
      documento:String(r.documento||'').trim(), fecha:(r.fecha instanceof Date && !isNaN(r.fecha)) ? dateToISO(r.fecha) : '',
      codigo:r.codigoArticulo||'SIN CODIGO', descripcion:descLinea(r),
      homologado:!sinHomologarLinea(r), diagnostico:String(r.codigoCie10||'').trim(),
      autorizada:r.cantidadAutorizada||0, unidades:r.unidades||0, diferencia:r.diferencia||0,
      pendiente:r.lineaPendiente==='SI', undPend:Math.abs(r.diferencia||0)
    });
    if(!porBodega.has(bodega)){
      const fila={ bodega, zona:r.zona||'N/D', lineas:0, ent:0, pen:0 };
      COHORTES_DEF.forEach(c=>{ fila['c_'+c.key]=0; });
      porBodega.set(bodega, fila);
    }
    const fb=porBodega.get(bodega);
    const entregada = r.lineaPendiente==='NO';
    fb.lineas++; if(entregada) fb.ent++; else fb.pen++;
    cohortes.forEach(k=>{
      fb['c_'+k]++;
      const g=resumen.get(k);
      if(r.documento) g.pacientes.add(r.documento);
      g.lineas++; if(entregada) g.ent++; else g.pen++;
      g.unidades += (r.unidades||0);
      if(r.codigoArticulo) g.codigos.add(r.codigoArticulo);
      if(r.codigoArticulo && sinHomologarLinea(r)) g.sinHomologar.add(r.codigoArticulo);
      g.bodegas.add(bodega);
      const ck=k+'|'+bodega+'|'+(r.codigoArticulo||'SIN CODIGO');
      if(!porCodigo.has(ck)) porCodigo.set(ck, { cohorte:k, bodega, zona:r.zona||'N/D',
        codigo:r.codigoArticulo||'SIN CODIGO', descripcion:descLinea(r),
        homologado:!sinHomologarLinea(r),
        unidades:0, lineas:0, pendientes:0, unidadesPend:0, pacientes:new Set(), docsPend:new Map() });
      const gc=porCodigo.get(ck);
      gc.unidades += (r.unidades||0);
      gc.lineas++;
      // Además de las líneas pendientes se acumulan las UNIDADES pendientes (lo que falta por entregar)
      // y se guarda el pendiente de cada documento (dispensa) para poder detallarlo en el Excel.
      if(!entregada){
        gc.pendientes++; gc.unidadesPend += Math.abs(r.diferencia||0);
        const doc=String(r.documento||'').trim() || 'SIN DOCUMENTO';
        gc.docsPend.set(doc, (gc.docsPend.get(doc)||0) + Math.abs(r.diferencia||0));
      }
      if(r.documento) gc.pacientes.add(r.documento);
      if(!gc.descripcion) gc.descripcion=descLinea(r);
    });
    // Consolidado global: la linea se cuenta UNA sola vez aunque pertenezca a varias cohortes.
    const gk=bodega+'|'+(r.codigoArticulo||'SIN CODIGO');
    if(!porCodigoGlobal.has(gk)) porCodigoGlobal.set(gk, { cohorte:'', bodega, zona:r.zona||'N/D',
      codigo:r.codigoArticulo||'SIN CODIGO', descripcion:descLinea(r),
      homologado:!sinHomologarLinea(r), cohortesSet:new Set(),
      unidades:0, lineas:0, pendientes:0, unidadesPend:0, pacientes:new Set(), docsPend:new Map() });
    const gg=porCodigoGlobal.get(gk);
    gg.unidades += (r.unidades||0);
    gg.lineas++;
    if(!entregada){
      gg.pendientes++; gg.unidadesPend += Math.abs(r.diferencia||0);
      const docG=String(r.documento||'').trim() || 'SIN DOCUMENTO';
      gg.docsPend.set(docG, (gg.docsPend.get(docG)||0) + Math.abs(r.diferencia||0));
    }
    if(r.documento) gg.pacientes.add(r.documento);
    if(!gg.descripcion) gg.descripcion=descLinea(r);
    cohortes.forEach(k=>gg.cohortesSet.add(k));
  });
  _cohortesLineas=lineasCoh;

  const tabla=[...resumen.values()].map(g=>({
    key:g.key, label:g.label, color:g.color,
    pacientes:g.pacientes.size, lineas:g.lineas, ent:g.ent, pen:g.pen,
    cumpl: g.lineas ? g.ent/g.lineas : null,
    unidades:g.unidades, codigos:g.codigos.size, sinHomologar:g.sinHomologar.size, bodegas:g.bodegas.size
  }));
  _cohortesResumen=tabla;

  const tablaBodega=[...porBodega.values()].sort((a,b)=>(a.zona+a.bodega).localeCompare(b.zona+b.bodega,'es'));

  // ---- KPIs ----
  const pacientesCoh=new Set();
  rows.forEach(r=>{ if(r.documento && clasificarCohortesLinea(r).length) pacientesCoh.add(r.documento); });
  const lineasCohTot=tablaBodega.reduce((a,b)=>a+b.lineas,0);
  const penCohTot=tablaBodega.reduce((a,b)=>a+b.pen,0);
  const entCohTot=lineasCohTot-penCohTot;
  const mayor=tabla.slice().sort((a,b)=>b.lineas-a.lineas)[0];
  if(statsEl){
    statsEl.innerHTML =
      '<div class="stat"><div class="label">Líneas en cohortes</div><div class="value">'+fmtInt(lineasCohTot)+'</div>'+
      '<div class="sub">'+fmtPct(rows.length?lineasCohTot/rows.length:null)+' de '+fmtInt(rows.length)+' líneas activas</div></div>'+
      '<div class="stat"><div class="label">Dispensas en Cohortes</div><div class="value">'+fmtInt(pacientesCoh.size)+'</div>'+
      '<div class="sub">pacientes con dispensas (documentos distintos)</div></div>'+
      '<div class="stat"><div class="label">% Cumplimiento en cohortes</div><div class="value '+effClass(lineasCohTot?entCohTot/lineasCohTot:null)+'">'+fmtPct(lineasCohTot?entCohTot/lineasCohTot:null)+'</div>'+
      '<div class="sub">'+fmtInt(entCohTot)+' entregadas</div></div>'+
      '<div class="stat"><div class="label">Líneas pendientes</div><div class="value">'+fmtInt(penCohTot)+'</div>'+
      '<div class="sub">dentro de las cohortes</div></div>'+
      '<div class="stat"><div class="label">Cohorte con más líneas</div><div class="value" style="font-size:18px;">'+escHtml(mayor && mayor.lineas ? mayor.label : '—')+'</div>'+
      '<div class="sub">'+fmtInt(mayor?mayor.lineas:0)+' líneas</div></div>'+
      '<div class="stat"><div class="label">Bodegas con cohortes</div><div class="value">'+fmtInt(tablaBodega.length)+'</div></div>';
  }
  if(diagEl){
    if(!lineasClasificadas){
      diagEl.style.display='';
      diagEl.innerHTML='<b>Ninguna línea pudo clasificarse en una cohorte.</b> Revisa que el Reporte de Dispensación traiga la columna <b>DESCRIPCION CIE 10</b> con el nombre del diagnóstico.';
    } else if(sinDx>0){
      diagEl.style.display='';
      diagEl.innerHTML='<b>Nota:</b> '+fmtInt(sinDx)+' de '+fmtInt(rows.length)+' líneas activas no traen diagnóstico (DESCRIPCION CIE 10), por lo que solo pueden clasificarse por la molécula dispensada.';
    } else { diagEl.style.display='none'; diagEl.innerHTML=''; }
  }

  // ---- Tabla de cohortes ----
  const tablaOrden=tabla.slice().sort((a,b)=>b.lineas-a.lineas || a.label.localeCompare(b.label,'es'));
  let h=tablaOrden.map(t=>
    '<tr><td class="txt"><span class="sw" style="display:inline-block;width:10px;height:10px;border-radius:2px;background:'+t.color+';margin-right:6px;"></span>'+escHtml(t.label)+'</td>'+
    '<td>'+fmtInt(t.pacientes)+'</td><td><b>'+fmtInt(t.lineas)+'</b></td>'+
    '<td>'+fmtInt(t.ent)+'</td><td>'+fmtInt(t.pen)+'</td>'+
    '<td class="'+effClass(t.cumpl)+'"><b>'+fmtPct(t.cumpl)+'</b></td>'+
    '<td>'+fmtInt(t.unidades)+'</td><td>'+fmtInt(t.codigos)+'</td>'+
    '<td class="'+(t.sinHomologar?'pct-bad':'')+'">'+fmtInt(t.sinHomologar)+'</td>'+
    '<td>'+fmtInt(t.bodegas)+'</td></tr>'
  ).join('');
  h+='<tr class="total-row"><td class="txt">TOTAL EN COHORTES (sin duplicar líneas)</td>'+
     '<td>'+fmtInt(pacientesCoh.size)+'</td><td>'+fmtInt(lineasCohTot)+'</td>'+
     '<td>'+fmtInt(entCohTot)+'</td><td>'+fmtInt(penCohTot)+'</td>'+
     '<td>'+fmtPct(lineasCohTot?entCohTot/lineasCohTot:null)+'</td>'+
     '<td>—</td><td>—</td><td>—</td><td>'+fmtInt(tablaBodega.length)+'</td></tr>';
  tb.innerHTML=h;

  // ---- Donas ----
  const aggCoh=(tbl)=>{
    const fila={ bodega:'__ALL__', lineas:0, ent:0, pen:0 };
    COHORTES_DEF.forEach(c=>{ fila['c_'+c.key]=tbl.reduce((a,b)=>a+(b['c_'+c.key]||0),0); });
    fila.lineas=tbl.reduce((a,b)=>a+(b.lineas||0),0);
    fila.ent=tbl.reduce((a,b)=>a+(b.ent||0),0);
    fila.pen=tbl.reduce((a,b)=>a+(b.pen||0),0);
    return fila;
  };
  if(tablaBodega.length){
    // El centro de la dona muestra las LÍNEAS de la bodega (mismo total que la dona de
    // entregadas/pendientes). La suma de los segmentos puede ser mayor porque una línea
    // con dos diagnósticos cuenta en dos cohortes; en ese caso se avisa en la leyenda.
    setupGenericPieSelector('pieCohortesSelect','pieCohortes','pieCohortesLegend', tablaBodega, aggCoh,
      row=>COHORTES_DEF.map(c=>({label:c.label, value: row['c_'+c.key]||0, color:c.color})).filter(s=>s.value>0),
      { mode:'count',
        totalFn:(row)=>row.lineas||0,
        notaFn:(row, slices, total, sumSlices)=> sumSlices>total
          ? ('Los porcentajes se calculan sobre '+fmtInt(total)+' líneas. '+fmtInt(sumSlices-total)+' líneas pertenecen a más de una cohorte y se cuentan en cada una, por eso la suma de las cohortes ('+fmtInt(sumSlices)+') es mayor.')
          : '' });
    setupGenericPieSelector('pieCohortesPendSelect','pieCohortesPend','pieCohortesPendLegend', tablaBodega, aggCoh, row=>[
      {label:'Entregadas', value: row.ent||0, color:'#1E8F5E'},
      {label:'Pendientes', value: row.pen||0, color:'#D98A2B'}
    ], { mode:'count', centerFn:(slices,total)=>{
        const e=slices.find(s=>s.label==='Entregadas');
        return fmtPct(total ? (e? e.value:0)/total : null);
    }});
  } else {
    ['pieCohortes','pieCohortesPend'].forEach(id=>drawDonut(id, [{label:'',value:1,color:'#DCE4EC'}], '—'));
    ['pieCohortesLegend','pieCohortesPendLegend'].forEach(id=>{ const l=document.getElementById(id); if(l) l.innerHTML=''; });
  }

  // ---- Top 10 por cohorte y bodega ----
  const todos=[...porCodigo.values()].map(g=>({
    cohorte:g.cohorte, cohorteLabel:COHORTE_LABEL.get(g.cohorte)||g.cohorte, bodega:g.bodega, zona:g.zona,
    codigo:g.codigo, descripcion:g.descripcion, homologado:g.homologado!==false, unidades:g.unidades, lineas:g.lineas,
    pendientes:g.pendientes, unidadesPend:g.unidadesPend||0, pacientes:g.pacientes.size, pacientesSet:g.pacientes,
    docsPendMap:g.docsPend
  }));
  const grupos=new Map();
  todos.forEach(r=>{
    const k=r.cohorte+'|'+r.bodega;
    if(!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(r);
  });
  const top=[];
  grupos.forEach(arr=>{
    arr.sort((a,b)=> b.unidades-a.unidades || b.lineas-a.lineas || a.codigo.localeCompare(b.codigo,'es'));
    arr.slice(0,10).forEach((r,i)=>top.push(Object.assign({pos:i+1}, r)));
  });
  top.sort((a,b)=> a.cohorteLabel.localeCompare(b.cohorteLabel,'es') || a.bodega.localeCompare(b.bodega,'es') || a.pos-b.pos);
  _cohortesTop=top;
  _cohortesDetalle=todos.sort((a,b)=> a.cohorteLabel.localeCompare(b.cohorteLabel,'es') || a.bodega.localeCompare(b.bodega,'es') || b.unidades-a.unidades);

  // Consolidado de las 6 cohortes juntas: cada linea cuenta una sola vez.
  _cohortesGlobalCodigos=[...porCodigoGlobal.values()].map(g=>({
    cohorte:'', cohorteLabel:'Todas las cohortes', bodega:g.bodega, zona:g.zona,
    codigo:g.codigo, descripcion:g.descripcion, homologado:g.homologado!==false,
    unidades:g.unidades, lineas:g.lineas, pendientes:g.pendientes, unidadesPend:g.unidadesPend||0,
    pacientes:g.pacientes.size, pacientesSet:g.pacientes, docsPendMap:g.docsPend,
    cohortes:[...g.cohortesSet].map(k=>COHORTE_LABEL.get(k)||k).sort((a,b)=>a.localeCompare(b,'es'))
  }));

  // Selectores propios de esta vista
  const selC=document.getElementById('fCohorte');
  if(selC && selC.options.length<=1){
    selC.innerHTML='<option value="">Todas las cohortes</option>'+COHORTES_DEF.map(c=>'<option value="'+c.key+'">'+escHtml(c.label)+'</option>').join('');
  }
  const selB=document.getElementById('fCohorteBodega');
  _cohortesBodegas=tablaBodega.map(t=>t.bodega);
  if(selB){
    const prev=selB.value||'';
    selB.innerHTML='<option value="">Todas las bodegas</option>'+_cohortesBodegas.map(b=>'<option value="'+escHtml(b)+'">'+escHtml(b)+'</option>').join('');
    selB.value=_cohortesBodegas.indexOf(prev)>=0 ? prev : '';
  }
  pintarTopCohortes();
}

const COHORTES_TOP_MAX=10;
function pintarTopCohortes(){
  const tb=document.querySelector('#tblCohortesTop tbody');
  if(!tb) return;
  const coh=(document.getElementById('fCohorte')||{}).value || '';
  const bod=(document.getElementById('fCohorteBodega')||{}).value || '';
  if(!_cohortesDetalle.length){
    tb.innerHTML='<tr><td colspan="6" class="txt" style="text-align:center;color:#9CA9B6;">No hay datos calculados.</td></tr>';
    return;
  }
  const filas=cohortesTopFiltrado(coh, bod);
  if(!filas.length){
    tb.innerHTML='<tr><td colspan="6" class="txt" style="text-align:center;color:#9CA9B6;">No hay dispensas de cohortes para los filtros seleccionados.</td></tr>';
    return;
  }
  tb.innerHTML=filas.slice(0, COHORTES_TOP_MAX).map((r,i)=>
    '<tr><td>'+(i+1)+'</td>'+
    '<td class="txt">'+escHtml(r.codigo)+'</td>'+
    '<td class="txt wrapcell">'+escHtml(r.descripcion||'—')+(r.homologado?'':' <span style="color:#B4451F;font-size:11px;">(sin homologar)</span>')+'</td>'+
    '<td>'+fmtInt(r.lineas)+'</td>'+
    '<td>'+fmtInt(r.pacientes)+'</td>'+
    '<td class="'+(r.pendientes?'pct-bad':'')+'">'+fmtInt(r.pendientes)+'</td></tr>'
  ).join('');
}

// Fuente de datos del Top 10: por cohorte concreta usa el detalle; sin cohorte usa el
// consolidado global (cada linea cuenta una sola vez aunque pertenezca a varias cohortes).
function cohortesFuente(coh){
  if(coh) return _cohortesDetalle;
  return _cohortesGlobalCodigos.length ? _cohortesGlobalCodigos : _cohortesDetalle;
}

// Agrupa el detalle por código según los filtros de cohorte y bodega, ordenado por unidades.
function cohortesTopFiltrado(coh, bod){
  const acum=new Map();
  cohortesFuente(coh).forEach(r=>{
    if(coh && r.cohorte!==coh) return;
    if(bod && r.bodega!==bod) return;
    if(!acum.has(r.codigo)) acum.set(r.codigo, { codigo:r.codigo, descripcion:r.descripcion,
      homologado:r.homologado, unidades:0, lineas:0, pendientes:0, unidadesPend:0, pacientes:new Set(),
      docsPend:new Map() });
    const g=acum.get(r.codigo);
    if(!g.descripcion && r.descripcion) g.descripcion=r.descripcion;
    g.unidades+=r.unidades; g.lineas+=r.lineas; g.pendientes+=r.pendientes; g.unidadesPend+=(r.unidadesPend||0);
    if(r.pacientesSet) r.pacientesSet.forEach(d=>g.pacientes.add(d));
    // Se conserva el pendiente por documento (dispensa) para poder detallarlo en las descargas.
    if(r.docsPendMap) r.docsPendMap.forEach((v,doc)=>g.docsPend.set(doc, (g.docsPend.get(doc)||0)+v));
  });
  return [...acum.values()].map(g=>Object.assign({}, g, {pacientes:g.pacientes.size}))
    .sort((a,b)=> b.unidades-a.unidades || b.lineas-a.lineas || a.codigo.localeCompare(b.codigo,'es'));
}

(function initCohortes(){
  ['fCohorte','fCohorteBodega'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.addEventListener('change', pintarTopCohortes);
  });
  const btn=document.getElementById('btnExportCohortes');
  if(btn) btn.addEventListener('click', ()=>{
    if(!_cohortesResumen.length || !_cohortesDetalle.length){ showToast('Primero calcula los indicadores.', true); return; }
    const resumen=_cohortesResumen.map(t=>({
      'Cohorte':t.label, 'Pacientes':t.pacientes, 'Lineas':t.lineas, 'Entregadas':t.ent, 'Pendientes':t.pen,
      '% Cumplimiento':t.cumpl===null?'':+(t.cumpl*100).toFixed(1),
      'Unidades dispensadas':t.unidades, 'Codigos distintos':t.codigos,
      'Codigos sin homologar':t.sinHomologar, 'Bodegas':t.bodegas
    }));
    const mapTop=r=>({
      'Cohorte':r.cohorteLabel, 'Zona':r.zona, 'Bodega':r.bodega, 'Puesto':r.pos||'', 'Codigo':r.codigo,
      'Descripcion DCI':r.descripcion, 'Homologado':r.homologado===false?'NO':'SI',
      'Unidades':r.unidades, 'Lineas':r.lineas,
      'Pacientes':r.pacientes, 'Pendientes':r.pendientes
    });
    const fecha=new Date().toISOString().slice(0,10);
    const tipoC=exportarInforme('Informe_Cohortes_'+fecha, [
      { nombre:'RESUMEN COHORTES', filas:resumen },
      { nombre:'TOP 10 COHORTE Y BODEGA', filas:_cohortesTop.map(mapTop) }
    ]);
    if(!tipoC){ showToast('No se pudo generar la descarga.', true); return; }
    showToast((tipoC==='xlsx'?'Excel exportado: ':'Exportado en CSV (abre en Excel): ')+fmtInt(_cohortesTop.length)+' filas en el Top 10 por cohorte y bodega.');
  });

  // Descarga de la zona del Top: Cohorte, Bodega, Codigo, Descripcion DCI y Unidades,
  // respetando los filtros de cohorte y bodega seleccionados en pantalla.
  const btnTop=document.getElementById('btnExportCohortesTop');
  if(btnTop) btnTop.addEventListener('click', ()=>{
    if(!_cohortesDetalle.length){ showToast('Primero calcula los indicadores.', true); return; }
    const coh=(document.getElementById('fCohorte')||{}).value || '';
    const bod=(document.getElementById('fCohorteBodega')||{}).value || '';
    const filas=cohortesFuente(coh)
      .filter(r=>(r.pendientes||0)>0 && (!coh || r.cohorte===coh) && (!bod || r.bodega===bod))
      .sort((a,b)=> (b.pendientes||0)-(a.pendientes||0) || a.codigo.localeCompare(b.codigo,'es'))
      .map(r=>({ 'Cohorte':(r.cohortes&&r.cohortes.length? r.cohortes.join(' / ') : r.cohorteLabel), 'Bodega':r.bodega, 'Codigo':r.codigo,
        'Descripcion DCI':r.descripcion||'', 'Pendientes':r.pendientes }));
    if(!filas.length){ showToast('No hay códigos con pendientes para los filtros seleccionados.', true); return; }
    const tipoT=exportarInforme('Codigos_Cohortes_Pendientes_'+new Date().toISOString().slice(0,10),
      [{ nombre:'CODIGOS CON PENDIENTES', filas:filas }]);
    if(!tipoT){ showToast('No se pudo generar la descarga.', true); return; }
    showToast((tipoT==='xlsx'?'Excel descargado: ':'Descargado en CSV (abre en Excel): ')+fmtInt(filas.length)+' códigos con pendientes.');
  });

  // Descarga de pendientes de la cohorte y bodega seleccionadas, detallado por DOCUMENTO:
  // Cohorte, Bodega, Código, Descripción DCI, Documento y Cantidad pendiente. Ya no se muestra
  // el conteo de dispensas: cada fila es el documento (dispensa) que tiene el pendiente.
  const btnPS=document.getElementById('btnExportCohortesPendSimple');
  if(btnPS) btnPS.addEventListener('click', ()=>{
    if(!_cohortesDetalle.length){ showToast('Primero calcula los indicadores.', true); return; }
    const coh=(document.getElementById('fCohorte')||{}).value || '';
    const bod=(document.getElementById('fCohorteBodega')||{}).value || '';
    const nombreCoh=coh ? (COHORTE_LABEL.get(coh)||coh) : 'Todas las cohortes';
    const base=cohortesTopFiltrado(coh, bod);
    // Si el filtro no deja ninguna fila, el problema es la combinación cohorte + bodega.
    if(!base.length){
      showToast('No hay dispensas de '+nombreCoh+(bod?' en la bodega '+bod:'')+': cambia la cohorte o la bodega.', true);
      return;
    }
    // Una fila por DOCUMENTO pendiente, indicando su cohorte y su bodega. Se recorre el detalle
    // (cohorte + bodega + código) para no perder de dónde viene cada documento.
    const filas=[];
    cohortesFuente(coh).forEach(r=>{
      if(coh && r.cohorte!==coh) return;
      if(bod && r.bodega!==bod) return;
      if(!(r.pendientes||0)) return;
      const etiquetaCoh = (r.cohortes && r.cohortes.length) ? r.cohortes.join(' / ') : (r.cohorteLabel||nombreCoh);
      const docs = r.docsPendMap && r.docsPendMap.size ? [...r.docsPendMap.entries()] : [];
      if(!docs.length){
        // Respaldo: si por algún motivo no se guardó el documento, se exporta el total del código.
        filas.push({ 'Cohorte':etiquetaCoh, 'Bodega':r.bodega, 'Código':r.codigo,
          'Descripción DCI':r.descripcion||'', 'Documento':'',
          'Cant. pendiente': r.unidadesPend||r.pendientes||0 });
        return;
      }
      docs.forEach(([doc, cant])=>{
        filas.push({ 'Cohorte':etiquetaCoh, 'Bodega':r.bodega, 'Código':r.codigo,
          'Descripción DCI':r.descripcion||'', 'Documento':doc, 'Cant. pendiente':cant });
      });
    });
    // Orden: mayor pendiente primero y, a igual cantidad, por bodega, código y documento.
    filas.sort((a,b)=> b['Cant. pendiente']-a['Cant. pendiente']
      || String(a.Bodega).localeCompare(String(b.Bodega),'es')
      || String(a['Código']).localeCompare(String(b['Código']),'es')
      || String(a.Documento).localeCompare(String(b.Documento),'es'));
    if(!filas.length){
      showToast('Todo está entregado: '+nombreCoh+(bod?' · '+bod:'')+' no tiene líneas pendientes.', true);
      return;
    }
    const sufijo=(nombreCoh+(bod?'_'+bod:'')).replace(/[^A-Za-z0-9]+/g,'_').slice(0,60);
    const tipoP=exportarInforme('Pendientes_'+sufijo+'_'+new Date().toISOString().slice(0,10),
      [{ nombre:'PENDIENTES', filas:filas }]);
    if(!tipoP){ showToast('No se pudo generar la descarga.', true); return; }
    const docsUnicos=new Set(filas.map(f=>f.Documento)).size;
    showToast((tipoP==='xlsx'?'Excel descargado: ':'Descargado en CSV (abre en Excel): ')+fmtInt(filas.length)+' líneas pendientes de '+fmtInt(docsUnicos)+' documentos ('+nombreCoh+(bod?' · '+bod:'')+').');
  });

  // Descarga solo de los códigos que NO estan en la tabla Homólogo, respetando los filtros.
  const btnSH=document.getElementById('btnExportCohortesSinHom');
  if(btnSH) btnSH.addEventListener('click', ()=>{
    if(!_cohortesDetalle.length){ showToast('Primero calcula los indicadores.', true); return; }
    const coh=(document.getElementById('fCohorte')||{}).value || '';
    const bod=(document.getElementById('fCohorteBodega')||{}).value || '';
    const filas=cohortesFuente(coh)
      .filter(r=>r.homologado===false && (!coh || r.cohorte===coh) && (!bod || r.bodega===bod))
      .map(r=>({ 'Cohorte':(r.cohortes&&r.cohortes.length? r.cohortes.join(' / ') : r.cohorteLabel), 'Bodega':r.bodega, 'Codigo':r.codigo,
        'Descripcion (Reporte de Dispensacion)':r.descripcion||'',
        'Unidades':r.unidades, 'Lineas':r.lineas, 'Pendientes':r.pendientes }));
    if(!filas.length){ showToast('No hay códigos sin homologar para los filtros seleccionados.', true); return; }
    const tipoSH=exportarInforme('Codigos_Cohortes_Sin_Homologar_'+new Date().toISOString().slice(0,10),
      [{ nombre:'CODIGOS SIN HOMOLOGAR', filas:filas }]);
    if(!tipoSH){ showToast('No se pudo generar la descarga.', true); return; }
    showToast((tipoSH==='xlsx'?'Excel descargado: ':'Descargado en CSV (abre en Excel): ')+fmtInt(filas.length)+' códigos sin homologar.');
  });

  // Descarga del LISTADO COMPLETO línea a línea de la cohorte seleccionada, con el
  // diagnóstico (DESCRIPCION CIE 10) de cada dispensa. Respeta los filtros de cohorte y bodega.
  const btnDx=document.getElementById('btnExportCohortesDx');
  if(btnDx) btnDx.addEventListener('click', ()=>{ try{ exportarCohorteConDiagnostico(); }
    catch(err){ showToast('No se pudo generar la descarga: '+(err && err.message ? err.message : err), true); } });

  function exportarCohorteConDiagnostico(){
    if(!_cohortesLineas.length){ showToast('Primero calcula los indicadores.', true); return; }
    const coh=(document.getElementById('fCohorte')||{}).value || '';
    const bod=(document.getElementById('fCohorteBodega')||{}).value || '';
    const nombreCoh=coh ? (COHORTE_LABEL.get(coh)||coh) : 'Todas las cohortes';
    const seleccion=_cohortesLineas.filter(l=>(!coh || l.cohortes.indexOf(coh)>=0) && (!bod || l.bodega===bod));
    if(!seleccion.length){
      showToast('No hay dispensas de '+nombreCoh+(bod?' en la bodega '+bod:'')+': cambia la cohorte o la bodega.', true);
      return;
    }
    // Aviso inmediato y el trabajo pesado se hace después, para que el mensaje se vea
    // y el navegador no parezca congelado con listados de miles de líneas.
    showToast('Generando el listado de '+fmtInt(seleccion.length)+' líneas… espera unos segundos.');
    setTimeout(()=>{
      try{ generarArchivoCohorteDx(seleccion, coh, bod, nombreCoh); }
      catch(err){ showToast('No se pudo generar la descarga: '+(err && err.message ? err.message : err), true); }
    }, 80);
  }

  function generarArchivoCohorteDx(seleccion, coh, bod, nombreCoh){
    const filas=seleccion
      .map(l=>({
        'Cohorte': coh ? nombreCoh : l.cohortes.map(k=>COHORTE_LABEL.get(k)||k).join(' / '),
        'Zona':l.zona, 'Bodega':l.bodega, 'EPS':l.eps, 'EPS consolidada':l.epsGrupo,
        'Documento':l.documento, 'Fecha dispensación':l.fecha,
        'Diagnóstico (CIE 10)':l.diagnostico||'SIN DIAGNOSTICO',
        'Código':l.codigo, 'Descripción DCI':l.descripcion||'',
        'Homologado':l.homologado?'SI':'NO',
        'Cant. autorizada':l.autorizada, 'Unidades dispensadas':l.unidades,
        'Estado línea': l.pendiente?'PENDIENTE':'ENTREGADA',
        'Und. pendientes': l.pendiente ? l.undPend : 0
      }));
    // Orden: bodega, diagnóstico, documento y código, para revisar paciente por paciente.
    filas.sort((a,b)=> String(a.Bodega).localeCompare(String(b.Bodega),'es')
      || String(a['Diagnóstico (CIE 10)']).localeCompare(String(b['Diagnóstico (CIE 10)']),'es')
      || String(a.Documento).localeCompare(String(b.Documento),'es')
      || String(a['Código']).localeCompare(String(b['Código']),'es'));
    // Resumen por diagnóstico para leer rápido de qué se compone la cohorte.
    const porDx=new Map();
    filas.forEach(f=>{
      const k=f['Diagnóstico (CIE 10)'];
      if(!porDx.has(k)) porDx.set(k, { 'Diagnóstico (CIE 10)':k, 'Líneas':0, 'Pacientes':new Set(),
        'Entregadas':0, 'Pendientes':0, 'Und. pendientes':0 });
      const g=porDx.get(k);
      g['Líneas']++;
      if(f.Documento) g['Pacientes'].add(f.Documento);
      if(f['Estado línea']==='PENDIENTE'){ g['Pendientes']++; g['Und. pendientes']+=f['Und. pendientes']; }
      else g['Entregadas']++;
    });
    const resumenDx=[...porDx.values()]
      .map(g=>Object.assign({}, g, {'Pacientes':g['Pacientes'].size}))
      .sort((a,b)=> b['Líneas']-a['Líneas'] || String(a['Diagnóstico (CIE 10)']).localeCompare(String(b['Diagnóstico (CIE 10)']),'es'));
    const sufijoDx=(nombreCoh+(bod?'_'+bod:'')).replace(/[^A-Za-z0-9]+/g,'_').slice(0,60);
    const fechaDx=new Date().toISOString().slice(0,10);
    const pac=new Set(filas.map(f=>f.Documento).filter(Boolean)).size;
    const tipo=exportarInforme('Cohorte_Diagnostico_'+sufijoDx+'_'+fechaDx, [
      { nombre:'LISTADO CON DIAGNOSTICO', filas:filas },
      { nombre:'RESUMEN POR DIAGNOSTICO', filas:resumenDx }
    ]);
    if(!tipo){ showToast('No se pudo generar la descarga. Vuelve a calcular los indicadores.', true); return; }
    const detalle=fmtInt(filas.length)+' líneas de '+fmtInt(pac)+' pacientes con diagnóstico ('+nombreCoh+(bod?' · '+bod:'')+')';
    if(tipo==='xlsx') showToast('Excel descargado: '+detalle+'.');
    else showToast('Listado descargado en CSV (abre en Excel, son 2 archivos): '+detalle+'.');
  }
})();

/* =========================================================================
   13c. BASE CUENTAS — Un líder por EPS consolidada
   Cada dispensación se asigna a la cuenta de su EPS consolidada y cada cuenta
   tiene UN solo líder, así que ninguna EPS ni ninguna línea se repite entre
   filas. Reglas de asignación:
   · La EPS se compara SIEMPRE por la EPS consolidada (la sigla “madre”), así
     los regímenes (contributivo / subsidiado / tutelas) quedan en la misma cuenta.
   · Ya no se separa por zona ni por bodega: el tablero muestra la cuenta
     completa de cada EPS (el desglose por zona y bodega sigue en la tabla de
     detalle).
   · Las EPS sin líder definido quedan reportadas como “líneas sin líder”.
   ========================================================================= */
const RESPONSABLES_CUENTA = [
  {nombre:'Sebastian Morales',  cargo:'Líder',         eps:['ASMET SALUD','CRUZ VERDE']},
  {nombre:'Astrid Salinas',     cargo:'Líder',         eps:['ASMET SALUD']},
  {nombre:'Kelly Cardenas',     cargo:'Líder',         eps:['ASMET SALUD']},
  {nombre:'Neysa Correa',       cargo:'Líder',         eps:['COOSALUD']},
  {nombre:'Valentina Franco',   cargo:'Gestor cuenta', eps:['COOSALUD']},
  {nombre:'Angela Paredes',     cargo:'Gestor cuenta', eps:['CRUZ VERDE']},
  {nombre:'Paola Ascuntar',     cargo:'Líder',         eps:['FAMISANAR']},
  {nombre:'Karol Martinez',     cargo:'Gestor cuenta', eps:['FAMISANAR']},
  {nombre:'Juan Carlos Mendez', cargo:'Líder',         eps:['FIDEICOMISOS','MAISFEN']},
  {nombre:'Daniela Carvajal',   cargo:'Gestor cuenta', eps:['NUEVA EPS']},
  {nombre:'Sara Cruz',          cargo:'Gestor cuenta', eps:['NUEVA EPS']},
  {nombre:'Yenifer Pulgarin',   cargo:'Gestor cuenta', eps:['NUEVA EPS']},
  {nombre:'Edwin Salcedo',      cargo:'Gestor cuenta', eps:['NUEVA EPS']},
  {nombre:'Lida Victoria',      cargo:'Líder',         eps:['NUEVA EPS']},
  {nombre:'Julian Ramirez',     cargo:'Líder',         eps:['NUEVA EPS']},
  {nombre:'Noemy Durasovic',    cargo:'Líder',         eps:['NUEVA EPS']},
  {nombre:'Nataly Hernandez',   cargo:'Gestor cuenta', eps:['SANITAS']},
  {nombre:'Laura Gonzalez',     cargo:'Líder',         eps:['SANITAS','FAMILIAR']},
  {nombre:'Marinela Amaya',     cargo:'Gestor cuenta', eps:['SANITAS','FAMILIAR']},
  {nombre:'Valentina Vargas',   cargo:'Gestor cuenta', eps:['S.O.S']}
];
// Nombre bonito para mostrar la EPS a cargo (la clave técnica es la EPS consolidada).
const CUENTA_EPS_LABEL = {
  'FIDEICOMISOS':'FOMAG (Fideicomisos La Previsora)',
  'MAISFEN':'MAISFEN',
  'FAMILIAR':'EPS FAMILIAR DE COLOMBIA',
  'S.O.S':'S.O.S (Servicio Occidental de Salud)'
};
function cuentaEpsLabel(k){ return CUENTA_EPS_LABEL[k] || k; }
// El tablero trabaja por CUENTA = EPS consolidada, con un único líder por EPS.
// De la matriz interna solo se toman las EPS que tienen Líder (los gestores de
// cuenta no generan filas: sus líneas quedan en la cuenta de la EPS).
const CUENTAS_EPS = [...new Set(RESPONSABLES_CUENTA.filter(r=>r.cargo==='Líder').flatMap(r=>r.eps))]
  .sort((a,b)=>cuentaEpsLabel(a).localeCompare(cuentaEpsLabel(b),'es'));
// Una fila por EPS: la clave interna ya es la etiqueta pública (no hay nombres de personas).
const LIDERES_CUENTA = CUENTAS_EPS.map(e=>({nombre:'Líder '+cuentaEpsLabel(e), cargo:'Líder', eps:[e]}));
// Índice EPS consolidada -> líder de esa cuenta (uno solo, sin repetir).
const _CUENTAS_POR_EPS = (function(){
  const m=new Map();
  LIDERES_CUENTA.forEach(resp=>{ m.set(normValue(resp.eps[0]), resp); });
  return m;
})();
// Líder que se hace cargo de la línea: el de su EPS consolidada (0 o 1).
function cuentaResponsablesDeLinea(r){
  const eps = r.epsGrupo || epsAGrupo(r.eps);
  const resp = _CUENTAS_POR_EPS.get(normValue(eps));
  return resp ? [resp] : [];
}
function cuentaAlcanceTxt(resp){
  return resp.eps.map(cuentaEpsLabel).join(' + ');
}
// Etiqueta pública de cada cuenta: "Líder <EPS consolidada>", sin nombres de personas.
function cuentaLiderLabel(nombre){ return nombre; }

// Caches del último cálculo, para que los filtros y la descarga usen lo ya calculado.
let _cuentasMatriz=[], _cuentasDetalle=[], _cuentasEvol=[], _cuentasCortesAct=[], _cuentasGlobal=null;

function renderBaseCuentas(rowsVigentes, bodegaSearch, zona, rowsHist){
  const tb=document.querySelector('#tblCuentasResp tbody');
  if(!tb) return;
  const statsEl=document.getElementById('statsCuentas');
  const diagEl=document.getElementById('cuentasDiag');
  const base=(rowsVigentes && rowsVigentes.length) ? rowsVigentes : [];

  if(!base.length){
    _cuentasMatriz=[]; _cuentasDetalle=[]; _cuentasEvol=[]; _cuentasGlobal=null;
    if(statsEl) statsEl.innerHTML='';
    if(diagEl){ diagEl.style.display=''; diagEl.innerHTML='<b>Sin datos.</b> Carga las tablas y pulsa <b>Calcular indicadores</b> para ver la base de cuentas.'; }
    pintarBaseCuentas();
    return;
  }

  // Mismo alcance que el resto del visor: solo dispensas con Estado Activo y
  // respetando los filtros de bodega y zona de la barra superior.
  const enFiltro=(r)=>{
    if(bodegaSearch && !normValue(r.bodegaDetalle).includes(bodegaSearch)) return false;
    if(zona && r.zona!==zona) return false;
    return true;
  };
  const rows=soloActivas(base).filter(enFiltro);

  const acc=new Map();
  LIDERES_CUENTA.forEach(resp=>acc.set(resp.nombre, {
    resp, lineas:0, ent:0, pen:0, und:0, undPend:0,
    docs:new Set(), bodegas:new Set(), epsSet:new Set()
  }));
  const det=new Map();
  let lineasAsignadas=0, entGlobal=0, penGlobal=0, undPendGlobal=0, sinResp=0;
  const docsGlobal=new Set(), epsSinResp=new Set();

  rows.forEach(r=>{
    const lista=cuentaResponsablesDeLinea(r);
    const entregada = r.lineaPendiente==='NO';
    const pendUnd = Math.abs(r.diferencia||0);
    if(!lista.length){ sinResp++; epsSinResp.add(r.epsGrupo||'N/D'); return; }
    // El TOTAL cuenta la línea una sola vez, aunque la atiendan varios líderes.
    lineasAsignadas++;
    if(entregada) entGlobal++; else { penGlobal++; undPendGlobal+=pendUnd; }
    if(r.documento) docsGlobal.add(r.bodegaDetalle+'|'+r.documento);
    lista.forEach(resp=>{
      const g=acc.get(resp.nombre);
      g.lineas++;
      if(entregada) g.ent++; else { g.pen++; g.undPend+=pendUnd; }
      g.und += (r.unidades||0);
      if(r.documento) g.docs.add(r.bodegaDetalle+'|'+r.documento);
      g.bodegas.add(r.bodegaDetalle||'SIN BODEGA');
      g.epsSet.add(r.epsGrupo||'N/D');
      // El detalle abre la cuenta por la EPS tal como llega en el reporte
      // (regimenes, tutelas, etc.) sin separar por zona ni bodega.
      const epsRaw=r.eps||'N/D';
      const k=resp.nombre+'|'+epsRaw;
      if(!det.has(k)) det.set(k, {nombre:resp.nombre, cargo:resp.cargo, eps:epsRaw, epsGrupo:r.epsGrupo||'N/D',
        lineas:0, ent:0, pen:0, und:0, undPend:0, docs:new Set()});
      const d=det.get(k);
      d.lineas++;
      if(entregada) d.ent++; else { d.pen++; d.undPend+=pendUnd; }
      d.und += (r.unidades||0);
      if(r.documento) d.docs.add(r.documento);
    });
  });

  _cuentasMatriz=LIDERES_CUENTA.map(resp=>{
    const g=acc.get(resp.nombre);
    return {
      nombre:resp.nombre, cargo:resp.cargo,
      epsTxt:cuentaAlcanceTxt(resp),
      epsKeys:resp.eps.slice(),
      dispensas:g.docs.size, lineas:g.lineas, ent:g.ent, pen:g.pen,
      cumpl: g.lineas ? g.ent/g.lineas : null,
      und:g.und, undPend:g.undPend, bodegas:g.bodegas.size, epsVistas:g.epsSet.size
    };
  });

  _cuentasDetalle=[...det.values()].map(d=>({
    nombre:d.nombre, cargo:d.cargo, eps:d.eps, epsKeys:[d.epsGrupo],
    dispensas:d.docs.size, lineas:d.lineas, ent:d.ent, pen:d.pen,
    cumpl: d.lineas ? d.ent/d.lineas : null, und:d.und, undPend:d.undPend
  })).sort((a,b)=> b.pen-a.pen || b.lineas-a.lineas || a.nombre.localeCompare(b.nombre,'es'));

  _cuentasGlobal={
    lineasTotales:rows.length, lineasAsignadas, ent:entGlobal, pen:penGlobal,
    undPend:undPendGlobal, sinResp, dispensas:docsGlobal.size,
    epsSinResp:[...epsSinResp].sort((a,b)=>a.localeCompare(b,'es'))
  };

  /* ---- Evolución por cortes -------------------------------------------------
     Usa el historial completo de versiones: en cada corte se toma el estado
     vigente de la línea al cierre de ese corte. Un corte sin dispensaciones
     queda en “—” para no repetir la cifra del corte anterior.               */
  const hist=soloActivas((rowsHist && rowsHist.length ? rowsHist : base)).filter(enFiltro);
  const activos=cortesConCargue(hist);
  _cuentasCortesAct=[1,2,3].map(c=>corteVigenteHasta(activos, c));
  const porCorte={};
  const yaCalculado=new Map();
  _cuentasCortesAct.forEach(cEff=>{
    if(!cEff || yaCalculado.has(cEff)) return;
    const snap=snapshotHastaCorte(hist, cEff);
    const m=new Map();
    LIDERES_CUENTA.forEach(resp=>m.set(resp.nombre, {lineas:0, ent:0, pen:0}));
    snap.forEach(r=>{
      const entregada = r.lineaPendiente==='NO';
      cuentaResponsablesDeLinea(r).forEach(resp=>{
        const g=m.get(resp.nombre);
        g.lineas++; if(entregada) g.ent++; else g.pen++;
      });
    });
    yaCalculado.set(cEff, m);
  });
  [1,2,3].forEach((c,i)=>{ porCorte[c]=yaCalculado.get(_cuentasCortesAct[i]) || null; });
  _cuentasEvol=LIDERES_CUENTA.map(resp=>({
    nombre:resp.nombre, cargo:resp.cargo,
    cortes:[1,2,3].map(c=>{
      const m=porCorte[c];
      if(!m) return null;
      const g=m.get(resp.nombre);
      return {lineas:g.lineas, ent:g.ent, pen:g.pen, cumpl: g.lineas ? g.ent/g.lineas : null};
    })
  }));

  if(diagEl){
    const avisos=[];
    if(sinResp>0){
      avisos.push('<b>'+fmtInt(sinResp)+'</b> líneas activas no tienen líder asignado en la matriz'+
        (_cuentasGlobal.epsSinResp.length ? ' (EPS: '+escHtml(_cuentasGlobal.epsSinResp.join(', '))+')' : '')+'.');
    }
    const vacios=_cuentasMatriz.filter(t=>t.lineas===0).map(t=>cuentaLiderLabel(t.nombre));
    if(vacios.length) avisos.push('Sin líneas dentro del filtro actual: '+escHtml(vacios.join(', '))+'.');
    if(avisos.length){ diagEl.style.display=''; diagEl.innerHTML='<b>Nota:</b> '+avisos.join(' '); }
    else { diagEl.style.display='none'; diagEl.innerHTML=''; }
  }

  // Selectores de la pestaña (se llenan con lo que existe en la matriz).
  const selR=document.getElementById('fCuentaResponsable');
  if(selR){
    const prev=selR.value;
    const nombres=LIDERES_CUENTA.map(r=>r.nombre)
      .sort((a,b)=>cuentaLiderLabel(a).localeCompare(cuentaLiderLabel(b),'es'));
    selR.innerHTML='<option value="">Todos los líderes</option>'+
      nombres.map(n=>'<option value="'+escHtml(n)+'">'+escHtml(cuentaLiderLabel(n))+'</option>').join('');
    if(prev && nombres.includes(prev)) selR.value=prev;
  }
  const selE=document.getElementById('fCuentaEps');
  if(selE){
    const prev=selE.value;
    const eps=[...new Set(LIDERES_CUENTA.flatMap(r=>r.eps))].sort((a,b)=>a.localeCompare(b,'es'));
    selE.innerHTML='<option value="">Todas las EPS</option>'+
      eps.map(e=>'<option value="'+escHtml(e)+'">'+escHtml(cuentaEpsLabel(e))+'</option>').join('');
    if(prev && eps.includes(prev)) selE.value=prev;
  }

  pintarBaseCuentas();
}

// Filtros de la pestaña: líder y EPS a cargo.
function _cuentasFiltrosActuales(){
  return {
    resp:(document.getElementById('fCuentaResponsable')||{}).value || '',
    eps:(document.getElementById('fCuentaEps')||{}).value || ''
  };
}
function _cuentasFilaVisible(t, f){
  if(f.resp && t.nombre!==f.resp) return false;
  if(f.eps){
    const keys=t.epsKeys || (t.eps ? [t.eps] : []);
    if(!keys.includes(f.eps)) return false;
  }
  return true;
}

function pintarBaseCuentas(){
  const tb=document.querySelector('#tblCuentasResp tbody');
  const tbCor=document.querySelector('#tblCuentasCortes tbody');
  if(!tb) return;
  const statsEl=document.getElementById('statsCuentas');
  const f=_cuentasFiltrosActuales();

  if(!_cuentasMatriz.length){
    tb.innerHTML='<tr><td colspan="9" class="txt" style="text-align:center;color:#9CA9B6;">No hay datos calculados.</td></tr>';
    if(tbCor) tbCor.innerHTML='<tr><td colspan="12" class="txt" style="text-align:center;color:#9CA9B6;">No hay datos calculados.</td></tr>';
    if(statsEl) statsEl.innerHTML='';
    return;
  }

  const matriz=_cuentasMatriz.filter(t=>_cuentasFilaVisible(t, f));
  const nombresVis=new Set(matriz.map(t=>t.nombre));

  // ---- KPIs ----
  const G=_cuentasGlobal || {lineasTotales:0, lineasAsignadas:0, ent:0, pen:0, undPend:0, sinResp:0, dispensas:0};
  const sumL=matriz.reduce((a,b)=>a+b.lineas,0);
  const sumE=matriz.reduce((a,b)=>a+b.ent,0);
  const sumP=matriz.reduce((a,b)=>a+b.pen,0);
  const sumUP=matriz.reduce((a,b)=>a+b.undPend,0);
  const critico=matriz.slice().sort((a,b)=>b.pen-a.pen)[0];
  const hayFiltro=!!(f.resp||f.eps);
  if(statsEl){
    statsEl.innerHTML =
      '<div class="stat"><div class="label">Líneas de la selección</div><div class="value">'+fmtInt(sumL)+'</div>'+
      '<div class="sub">'+(hayFiltro ? 'líderes filtrados' : 'suma por líder')+' · '+fmtInt(G.lineasAsignadas)+' líneas sin duplicar</div></div>'+
      '<div class="stat"><div class="label">Entregadas</div><div class="value">'+fmtInt(sumE)+'</div>'+
      '<div class="sub">de '+fmtInt(sumL)+' líneas a cargo</div></div>'+
      '<div class="stat"><div class="label">Pendientes</div><div class="value">'+fmtInt(sumP)+'</div>'+
      '<div class="sub">'+fmtInt(sumUP)+' unidades por entregar</div></div>'+
      '<div class="stat"><div class="label">% Cumplimiento</div><div class="value '+effClass(sumL?sumE/sumL:null)+'">'+fmtPct(sumL?sumE/sumL:null)+'</div>'+
      '<div class="sub">líneas entregadas sobre líneas a cargo</div></div>'+
      '<div class="stat"><div class="label">Líder con más pendientes</div><div class="value" style="font-size:18px;">'+escHtml(critico && critico.pen ? cuentaLiderLabel(critico.nombre) : '—')+'</div>'+
      '<div class="sub">'+fmtInt(critico?critico.pen:0)+' líneas pendientes</div></div>'+
      '<div class="stat"><div class="label">Líneas sin líder</div><div class="value '+(G.sinResp?'pct-bad':'')+'">'+fmtInt(G.sinResp)+'</div>'+
      '<div class="sub">EPS sin líder asignado en la matriz</div></div>';
  }

  // ---- Matriz de líderes ----
  const orden=matriz.slice().sort((a,b)=>
    a.epsTxt.localeCompare(b.epsTxt,'es') || cuentaLiderLabel(a.nombre).localeCompare(cuentaLiderLabel(b.nombre),'es'));
  let h=orden.map(t=>
    '<tr><td class="txt"><b>'+escHtml(cuentaLiderLabel(t.nombre))+'</b></td>'+
    '<td class="txt">'+escHtml(t.epsTxt)+'</td>'+
    '<td>'+fmtInt(t.dispensas)+'</td>'+
    '<td><b>'+fmtInt(t.lineas)+'</b></td>'+
    '<td>'+fmtInt(t.ent)+'</td>'+
    '<td class="'+(t.pen?'pct-bad':'')+'">'+fmtInt(t.pen)+'</td>'+
    '<td class="'+effClass(t.cumpl)+'"><b>'+fmtPct(t.cumpl)+'</b></td>'+
    '<td>'+fmtInt(t.undPend)+'</td>'+
    '<td>'+fmtInt(t.bodegas)+'</td></tr>'
  ).join('');
  if(!orden.length) h='<tr><td colspan="9" class="txt" style="text-align:center;color:#9CA9B6;">Ningún líder cumple los filtros elegidos.</td></tr>';
  else h+='<tr class="total-row"><td class="txt">TOTAL (líneas sin duplicar entre líderes)</td>'+
    '<td>—</td>'+
    '<td>'+fmtInt(G.dispensas)+'</td><td>'+fmtInt(G.lineasAsignadas)+'</td>'+
    '<td>'+fmtInt(G.ent)+'</td><td>'+fmtInt(G.pen)+'</td>'+
    '<td>'+fmtPct(G.lineasAsignadas?G.ent/G.lineasAsignadas:null)+'</td>'+
    '<td>'+fmtInt(G.undPend)+'</td><td>—</td></tr>';
  tb.innerHTML=h;

  // ---- Detalle por líder y EPS ----
  // (La tabla en pantalla se retiró; el desglose por EPS sigue disponible en el Excel.)

  // ---- Evolución por cortes ----
  if(tbCor){
    const evol=_cuentasEvol.filter(e=>nombresVis.has(e.nombre));
    const celdas=(c)=> c===null
      ? '<td>—</td><td>—</td><td>—</td>'
      : '<td>'+fmtInt(c.ent)+'</td><td class="'+(c.pen?'pct-bad':'')+'">'+fmtInt(c.pen)+'</td>'+
        '<td class="'+effClass(c.cumpl)+'">'+fmtPct(c.cumpl)+'</td>';
    let hc=evol.map(e=>
      '<tr><td class="txt"><b>'+escHtml(cuentaLiderLabel(e.nombre))+'</b></td>'+
      celdas(e.cortes[0])+celdas(e.cortes[1])+celdas(e.cortes[2])+
      '<td>'+(e.cortes[2] && e.cortes[0] ? fmtInt((e.cortes[0].pen||0)-(e.cortes[2].pen||0)) : '—')+'</td></tr>'
    ).join('');
    if(!evol.length) hc='<tr><td colspan="11" class="txt" style="text-align:center;color:#9CA9B6;">No hay evolución para los filtros elegidos.</td></tr>';
    tbCor.innerHTML=hc;
  }
}

(function initBaseCuentas(){
  ['fCuentaResponsable','fCuentaEps'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.addEventListener('change', pintarBaseCuentas);
  });
  const btn=document.getElementById('btnExportCuentas');
  if(btn) btn.addEventListener('click', ()=>{
    if(!_cuentasMatriz.length){ showToast('Primero calcula los indicadores.', true); return; }
    const f=_cuentasFiltrosActuales();
    const matriz=_cuentasMatriz.filter(t=>_cuentasFilaVisible(t, f));
    const nombresVis=new Set(matriz.map(t=>t.nombre));
    const hojaMatriz=matriz.map(t=>({
      'Lider':cuentaLiderLabel(t.nombre), 'EPS a cargo':t.epsTxt,
      'Dispensas':t.dispensas, 'Lineas':t.lineas, 'Entregadas':t.ent, 'Pendientes':t.pen,
      '% Cumplimiento':t.cumpl===null?'':+(t.cumpl*100).toFixed(1),
      'Unidades pendientes':t.undPend, 'Unidades dispensadas':t.und, 'Bodegas':t.bodegas
    }));
    const hojaDet=_cuentasDetalle.filter(d=>nombresVis.has(d.nombre) && _cuentasFilaVisible(d, f)).map(d=>({
      'Lider':cuentaLiderLabel(d.nombre), 'EPS':d.eps,
      'Dispensas':d.dispensas, 'Lineas':d.lineas, 'Entregadas':d.ent, 'Pendientes':d.pen,
      '% Cumplimiento':d.cumpl===null?'':+(d.cumpl*100).toFixed(1),
      'Unidades pendientes':d.undPend
    }));
    const val=(c,campo)=> c===null ? '' : c[campo];
    const pct=(c)=> (c===null || c.cumpl===null) ? '' : +(c.cumpl*100).toFixed(1);
    const hojaEvol=_cuentasEvol.filter(e=>nombresVis.has(e.nombre)).map(e=>({
      'Lider':cuentaLiderLabel(e.nombre),
      'Entregadas Corte 1':val(e.cortes[0],'ent'), 'Pendientes Corte 1':val(e.cortes[0],'pen'), '% Cumpl. Corte 1':pct(e.cortes[0]),
      'Entregadas Corte 2':val(e.cortes[1],'ent'), 'Pendientes Corte 2':val(e.cortes[1],'pen'), '% Cumpl. Corte 2':pct(e.cortes[1]),
      'Entregadas Corte 3':val(e.cortes[2],'ent'), 'Pendientes Corte 3':val(e.cortes[2],'pen'), '% Cumpl. Corte 3':pct(e.cortes[2]),
      'Pendientes recuperados (C1 a C3)':(e.cortes[0] && e.cortes[2]) ? (e.cortes[0].pen-e.cortes[2].pen) : ''
    }));
    if(!hojaMatriz.length){ showToast('No hay líderes para los filtros elegidos.', true); return; }
    const fecha=new Date().toISOString().slice(0,10);
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hojaMatriz), 'BASE CUENTAS');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hojaDet), 'DETALLE POR EPS');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hojaEvol), 'EVOLUCION POR CORTES');
    XLSX.writeFile(wb, 'Base_Cuentas_Responsables_'+fecha+'.xlsx');
    showToast('Excel exportado: '+fmtInt(hojaMatriz.length)+' cuentas y '+fmtInt(hojaDet.length)+' filas de detalle.');
  });
})();

/* =========================================================================
   13c. Base Supervisores: requerimiento por homologo y plan de redistribucion
   -------------------------------------------------------------------------
   Un supervisor por ZONA (11 zonas). Para cada homologo se estima el consumo
   promedio mensual con Suavizacion Exponencial Simple (SES, alfa optimo por
   homologo minimizando MAD) sobre la serie mensual de Cantidad Autorizada y se
   compara contra la existencia y las unidades pendientes, para saber cuanto se
   necesita. Con ese resultado se arma un plan de traslados entre bodegas de la
   MISMA zona: las bodegas con excedente le pasan unidades a las que quedan cortas.
   ========================================================================= */

// Zonas oficiales de la operacion: cada una tiene un unico supervisor.
const ZONAS_SUPERVISOR = [
  'BOYACA','CAQUETA','CAUCA CENTRO','CAUCA NORTE','CAUCA SUR','COSTA NORTE',
  'CUNDINAMARCA','EJE CAFETERO','NARIÑO','TOLIMA','VALLE'
];
// Matriz Supervisor - Zona (sin nombres de personas: la etiqueta publica es el cargo).
const SUPERVISORES_ZONA = ZONAS_SUPERVISOR.map(z=>({nombre:'Supervisor '+z, zona:z}));
/* Normalizador de zonas: el archivo escribe la zona con el prefijo "ZONA "
   (ZONA VALLE, ZONA BOYACA, ZONA CAUCA NORTE...), a veces con tildes, guiones
   o espacios dobles. Se limpia todo eso para poder cruzarla con la matriz.  */
function _supNormZona(v){
  let s=normValue(v);
  if(!s) return '';
  s=s.replace(/[-_\/]+/g,' ').replace(/\s+/g,' ').trim();
  s=s.replace(/^ZONAS?\s+/,'').trim();          // quita el prefijo "ZONA "
  s=s.replace(/^(REGIONAL|REG\.?)\s+/,'').trim(); // y variantes tipo "REGIONAL X"
  return s;
}
// Indice zona normalizada -> zona oficial, para tolerar tildes y variantes del archivo.
const _SUP_ZONA_CANON = (function(){
  const m=new Map();
  ZONAS_SUPERVISOR.forEach(z=>{
    m.set(_supNormZona(z), z);
    m.set(normValue(z), z);
    m.set(normValue('ZONA '+z), z);
  });
  return m;
})();
// Zona oficial de una linea (o cadena vacia si su zona no esta en la matriz).
function supZonaDeLinea(r){
  const raw=r && r.zona;
  return _SUP_ZONA_CANON.get(_supNormZona(raw)) || _SUP_ZONA_CANON.get(normValue(raw)) || '';
}
function supervisorDeZona(zona){ return zona ? ('Supervisor '+zona) : ''; }

/* ---- Historia acumulativa: el mes en curso llega incompleto -----------------
   El visor se alimenta con cargues ACUMULATIVOS: cada reporte nuevo agrega dias
   al mes que todavia esta corriendo. Si ese mes entra crudo a la serie, el
   pronostico lee una caida que no existe y subestima el consumo. Regla:
     · mes con 60% o mas del calendario cargado -> se proyecta a mes completo
       (se divide por la fraccion de dias observada) y se usa en la serie;
     · mes con menos del 60% cargado            -> se saca de la serie y solo
       se informa, para no pronosticar sobre 3 o 4 dias de datos.
   Un mes se considera cerrado cuando ya trae dispensaciones del ultimo dia.  */
const SUP_FRACCION_MES_MINIMA=0.6;   // minimo del mes cargado para poder proyectarlo
const SUP_ALFAS=(()=>{                // rejilla de alfa a probar: 0.05 ... 1.00
  const a=[]; for(let v=5; v<=100; v+=5) a.push(v/100); return a;
})();
// Dias del calendario de un mes 'AAAA-MM'.
function _diasDelMes(key){
  const m=/^(\d{4})-(\d{2})$/.exec(String(key||''));
  if(!m) return 30;
  return new Date(Date.UTC(+m[1], +m[2], 0)).getUTCDate();
}
// Estado de cierre de un mes segun el ultimo dia con dispensacion cargada.
function _cierreDelMes(key, diaMax){
  const dias=_diasDelMes(key);
  const dia=Math.max(0, Math.min(dias, Number(diaMax)||0));
  const frac=dias>0 ? dia/dias : 0;
  return {
    dias, dia, frac,
    cerrado: dia>=dias-1,                    // ya llego el final del mes
    proyectable: frac>=SUP_FRACCION_MES_MINIMA,
    factor: frac>0 ? 1/frac : 0
  };
}

/* ---- Pronostico del consumo mensual: Suavizacion Exponencial Simple -------
   Se usa SES (Simple Exponential Smoothing) sobre la serie mensual de Cantidad
   Autorizada ya normalizada a meses completos:

     Pronostico(t+1) = Pronostico(t) + alfa * ( Real(t) - Pronostico(t) )

   El alfa NO es fijo: para CADA homologo + bodega se prueba una rejilla de
   alfa (0.05 a 1.00 de 0.05 en 0.05) y se elige el que deja el menor error de
   ajuste sobre su propia historia:
     · criterio principal: MAD  (error absoluto medio, en unidades)
     · desempate:          MAPE (error porcentual absoluto medio)
     · segundo desempate:  el alfa mas bajo (pronostico mas estable)
   Asi un producto de consumo estable recibe un alfa bajo (mucha memoria) y uno
   con cambios de nivel recibe un alfa alto (reacciona rapido).
   El resultado nunca es negativo.                                          */
// SES con un alfa dado. Devuelve el pronostico del mes siguiente y los errores
// de ajuste (MAD y MAPE) medidos sobre la propia historia.
function _sesPronostico(serie, alfa){
  const n=serie.length;
  let nivel=serie[0];          // arranque: primer mes observado
  let sumAbs=0, cAbs=0;        // acumuladores de MAD
  let sumPct=0, cPct=0;        // acumuladores de MAPE (solo reales > 0)
  for(let t=1;t<n;t++){
    const error=serie[t]-nivel;             // el pronostico del mes t es "nivel"
    sumAbs+=Math.abs(error); cAbs++;
    if(serie[t]>0){ sumPct+=Math.abs(error)/serie[t]; cPct++; }
    nivel = nivel + alfa*error;             // actualizacion SES
  }
  return {
    valor: Math.max(0, nivel),
    mad:  cAbs ? sumAbs/cAbs : 0,
    mape: cPct ? (sumPct/cPct)*100 : null
  };
}
// Busca el alfa de la rejilla que minimiza MAD; empata por MAPE y luego por el
// alfa mas bajo. Se corre por homologo + bodega, con su propia historia.
function _optimizarAlfa(serie){
  let mejor=null;
  for(const alfa of SUP_ALFAS){
    const r=_sesPronostico(serie, alfa);
    if(!mejor){ mejor={alfa, ...r}; continue; }
    const dMad=r.mad-mejor.mad;
    if(dMad < -1e-9){ mejor={alfa, ...r}; continue; }
    if(Math.abs(dMad) <= 1e-9){
      const a=r.mape==null?Infinity:r.mape, b=mejor.mape==null?Infinity:mejor.mape;
      if(a < b-1e-9){ mejor={alfa, ...r}; }   // empate en MAD -> gana menor MAPE
    }
  }
  return mejor;
}
function pronosticoConsumoMensual(serie){
  const s=(serie||[]).map(v=>Number(v)||0);
  const n=s.length;
  if(!n) return {valor:0, metodo:'Sin datos', alfa:null, mad:null, mape:null};
  if(n===1){
    return {valor:Math.max(0,s[0]), metodo:'Promedio (1 mes completo)', alfa:null, mad:null, mape:null};
  }
  const r=_optimizarAlfa(s);
  return {
    valor: r.valor,
    metodo:'SES alfa='+r.alfa.toFixed(2)+' ('+n+' meses completos)',
    alfa: r.alfa,
    mad: r.mad,
    mape: r.mape
  };
}

// Caches del ultimo calculo, para que filtros y descarga reusen lo ya procesado.
let _supBodegas=[], _supHomologos=[], _supPlan=[], _supGlobal=null;
const SUP_MAX_FILAS=250;   // tope de filas en pantalla (el Excel siempre sale completo)

function renderBaseSupervisores(rowsVigentes, bodegaSearch, zona){
  const tb=document.querySelector('#tblSupReq tbody');
  if(!tb) return;
  const diagEl=document.getElementById('supDiag');
  const base=(rowsVigentes && rowsVigentes.length) ? rowsVigentes : [];

  if(!base.length){
    _supBodegas=[]; _supHomologos=[]; _supPlan=[]; _supGlobal=null;
    const st=document.getElementById('statsSup'); if(st) st.innerHTML='';
    if(diagEl){ diagEl.style.display=''; diagEl.innerHTML='<b>Sin datos.</b> Carga las tablas y pulsa <b>Calcular indicadores</b> para ver la base de supervisores.'; }
    pintarBaseSupervisores();
    return;
  }

  // Mismo alcance que el resto del visor: solo dispensas activas y respetando
  // los filtros de bodega y zona de la barra superior.
  const rows=soloActivas(base).filter(r=>{
    if(bodegaSearch && !normValue(r.bodegaDetalle).includes(bodegaSearch)) return false;
    if(zona && r.zona!==zona) return false;
    return true;
  });

  /* ---- Cruces auxiliares para la Tabla 1 ---------------------------------
     homologo -> Descripcion DCI y codigo -> homologo se arman con el propio
     reporte enriquecido (cada linea ya trae ambos datos). El codigo sirve para
     llevar las cantidades de Traslados y de Facturas al homologo correcto.  */
  const homDci=new Map();
  const codHom=new Map();
  base.forEach(r=>{
    if(!r.homologo) return;
    if(!homDci.get(r.homologo) && r.descripcionDci) homDci.set(r.homologo, r.descripcionDci);
    if(r.codigoArticulo && !codHom.has(r.codigoArticulo)) codHom.set(r.codigoArticulo, r.homologo);
    /* Segunda llave del mismo codigo sin guiones ni ceros a la izquierda: la
       tabla Traslados y la de Facturas suelen escribirlo distinto. */
    const ck=claveCodigo(r.codigoArticulo);
    if(ck && !codHom.has(ck)) codHom.set(ck, r.homologo);
  });
  // Homologo de un codigo venido de otra tabla (exacto y luego llave suelta).
  const homDeCodigo=(cod)=>codHom.get(normValue(cod)) || codHom.get(claveCodigo(cod)) || '';

  /* Unidades de traslado NO RECIBIDAS (tabla Traslados, columna "Recibido", por
     bodega DESTINO) y unidades compradas (tabla Facturas, por punto de venta).
     Solo interesan las lineas "No Recibido": son las que estan en camino y
     todavia no entraron a la existencia de la bodega.                       */
  const proc=(typeof state!=='undefined' && state && state.processed) ? state.processed : {};
  /* Los nombres de bodega de Traslados y de Facturas casi nunca vienen escritos
     igual que la Bodega Detalle del reporte. Se emparejan con la misma logica
     difusa que usa el resto del visor (nombre exacto, contenido o codigo M/N/B). */
  const bodegasReporte=new Set();
  base.forEach(r=>{ const b=normValue(r.bodegaDetalle); if(b) bodegasReporte.add(b); });
  const cacheBodegaSup=new Map();
  const bodegaDeNombre=(nombre)=>{
    const n=normValue(nombre);
    if(!n) return '';
    if(bodegasReporte.has(n)) return n;
    return resolverBodegaReporte(nombre, bodegasReporte, cacheBodegaSup);
  };
  const trasMap=new Map();
  let trasNoRecib=0, trasSinHom=0, trasSinBodega=0, trasUnidades=0;
  const trasBodegasSinCruce=new Set();
  /* Regla estricta: la columna Traslados SOLO suma las lineas cuyo estado dice
     explicitamente que no se han recibido ("No Recibido", "Sin recibir",
     "Pendiente", "En transito"). Las lineas Recibido y las lineas SIN estado
     quedan fuera: no se asume nada, si el archivo no trae el estado la columna
     queda en cero y el aviso lo explica.                                       */
  let trasSinEstado=0;
  (proc.traslados||[]).forEach(t=>{
    const est=('estadoRecibido' in t) ? t.estadoRecibido : estadoTraslado(t.recibido);
    if(est!=='PENDIENTE'){ if(!est) trasSinEstado++; return; }
    trasNoRecib++;
    // Homologo: primero el que ya trae la fila; si no, el cruce por codigo del reporte.
    const hom=t.homologo || homDeCodigo(t.codigo);
    const bod=bodegaDeNombre(t.bodegaDestino);
    if(!hom){ trasSinHom++; return; }
    if(!bod){ trasSinBodega++; if(t.bodegaDestino) trasBodegasSinCruce.add(String(t.bodegaDestino).trim()); return; }
    const k=hom+'|'+bod;
    const u=Number(t.cantidad)||0;
    trasUnidades+=u;
    trasMap.set(k, (trasMap.get(k)||0) + u);
  });
  const compMap=new Map();
  /* Unidades compradas: se suman por homologo + bodega (punto de venta).      */
  (proc.facturas||[]).forEach(fa=>{
    const bod=bodegaDeNombre(fa.puntoVenta);
    if(!bod) return;
    const hom=fa.homologo || homDeCodigo(fa.codigo);
    if(!hom) return;
    const k=hom+'|'+bod;
    compMap.set(k, (compMap.get(k)||0) + (Number(fa.cantidad)||0));
  });

  /* ---- Acumulado por homologo + bodega -----------------------------------
     meses: serie mensual de Cantidad Autorizada (el consumo que se debio cubrir).
     existencia: se lee una sola vez por homologo+bodega (viene repetida en cada
     linea, sumarla en todas las lineas inflaria el inventario).             */
  const agg=new Map();
  const mesesGlobal=new Set();
  const diaMaxMes=new Map();   // ultimo dia con dispensacion cargada en cada mes
  let sinZona=0;
  const zonasFuera=new Set();
  rows.forEach(r=>{
    const hom=r.homologo;
    if(!hom) return;                       // codigo sin homologar: no entra al requerimiento
    const zn=supZonaDeLinea(r);
    if(!zn){ sinZona++; if(r.zona) zonasFuera.add(r.zona); return; }
    const bod=r.bodegaDetalle || 'SIN BODEGA';
    const k=hom+'|'+normValue(bod);
    let g=agg.get(k);
    if(!g){
      g={hom, bodega:bod, zona:zn, existencia:null, pend:0, lineas:0, lineasPend:0, meses:new Map(),
         pendMes:new Map(), pendLinMes:new Map()};
      agg.set(k,g);
    }
    if(g.existencia===null) g.existencia=Number(r.existenciaPunto)||0;
    const mes=mesDeDispensacion(r);
    if(mes){
      g.meses.set(mes, (g.meses.get(mes)||0) + (Number(r.cantidadAutorizada)||0));
      mesesGlobal.add(mes);
      // Se guarda el dia mas avanzado del mes para saber si ya esta cerrado.
      const dt=toDateSafe(r.fecha);
      if(dt && !isNaN(dt)){
        const d=dt.getUTCDate();
        if(d>(diaMaxMes.get(mes)||0)) diaMaxMes.set(mes, d);
      }
    }
    g.lineas++;
    /* Los pendientes se guardan por mes de dispensacion: mas abajo solo se suman
       los de los DOS ULTIMOS meses cargados (los viejos ya no son gestionables). */
    if(r.lineaPendiente==='SI' && mes){
      g.pendMes.set(mes, (g.pendMes.get(mes)||0) + Math.abs(Number(r.diferencia)||0));
      g.pendLinMes.set(mes, (g.pendLinMes.get(mes)||0) + 1);
    }
  });

  /* ---- Normalizacion de la historia acumulativa ---------------------------
     Se recorren los meses en orden y solo se toman los meses COMPLETOS (ya
     cerrados). El ultimo mes casi siempre viene incompleto porque el reporte es
     acumulativo: ese mes se DESCARTA por completo y no se proyecta, para que el
     consumo promedio salga unicamente de meses reales y cerrados.            */
  const mesesTodos=[...mesesGlobal].sort();
  const mesesInfo=mesesTodos.map((k,i)=>{
    const c=_cierreDelMes(k, diaMaxMes.get(k)||0);
    const esUltimo=(i===mesesTodos.length-1);
    // Solo el mes mas reciente puede estar abierto; los anteriores ya cerraron.
    const abierto = esUltimo && !c.cerrado;
    return {
      mes:k, dias:c.dias, dia:c.dia, frac:c.frac, abierto,
      factor: 1,                 // nunca se proyecta: los meses entran tal cual
      usable: !abierto           // el mes abierto no alimenta el promedio
    };
  });
  // Meses que efectivamente alimentan el promedio (solo meses cerrados).
  // Si el unico mes cargado esta abierto no se puede descartar: se usa tal cual
  // (sin proyectar), porque de lo contrario la tabla quedaria en cero.
  let mesesUsados=mesesInfo.filter(m=>m.usable);
  if(!mesesUsados.length && mesesInfo.length){
    mesesUsados=mesesInfo.map(m=>Object.assign({}, m, {usable:true, factor:1}));
  }
  const mesesOrden=mesesUsados.map(m=>m.mes);
  const factorMes=new Map(mesesUsados.map(m=>[m.mes, m.factor]));
  const mesParcial=mesesInfo.find(m=>m.abierto) || null;
  // Un mes solo se declara "excluido" si de verdad no entro a la serie final.
  const mesExcluido=mesesTodos.find(k=>!factorMes.has(k)) || '';
  const parcialEnSerie = !!(mesParcial && factorMes.has(mesParcial.mes));

  /* Serie mensual de un homologo+bodega: se completa con ceros en los meses sin
     dispensacion. Todos los meses de la serie son meses cerrados.            */
  const serieDe=(mapMeses)=>{
    if(!mesesOrden.length) return [];
    const propios=mesesOrden.filter(k=>mapMeses.has(k));
    if(!propios.length) return [];
    const desde=mesesOrden.indexOf(propios[0]);
    const out=[];
    for(let i=Math.max(0,desde); i<mesesOrden.length; i++){
      const k=mesesOrden[i];
      const v=mapMeses.get(k)||0;
      out.push(Math.round(v*(factorMes.get(k)||1)));
    }
    return out;
  };

  // ---- Nivel bodega: consumo pronosticado, existencia, pendiente, requerido ----
  // Esta es la base de la Tabla 1: una fila por homologo y bodega detalle.
  /* Los pendientes solo se cuentan de los DOS ULTIMOS meses cargados (incluido el
     mes en curso): un pendiente mas viejo ya no refleja la necesidad actual.  */
  const mesesPend=new Set(mesesTodos.slice(-2));
  _supBodegas=[...agg.values()].map(g=>{
    const serie=serieDe(g.meses);
    const pr=pronosticoConsumoMensual(serie);
    const consumo=Math.round(pr.valor);
    const existencia=g.existencia||0;
    let pend=0, lineasPend=0;
    mesesPend.forEach(m=>{ pend += g.pendMes.get(m)||0; lineasPend += g.pendLinMes.get(m)||0; });
    g.pend=pend; g.lineasPend=lineasPend;
    const requerido=consumo + pend;
    const k=g.hom+'|'+normValue(g.bodega);
    const traslados=trasMap.get(k) || 0;   // unidades de traslado aun NO recibidas
    /* Disponible = lo que hay en la bodega MAS lo que viene en camino (traslados
       no recibidos consolidados por codigo de homologacion).                   */
    const disponible=existencia + traslados;
    /* Balance = Total requerido - Disponible:
       positivo = unidades que faltan / negativo = excedente.                   */
    const balance=requerido - disponible;
    return {
      supervisor:supervisorDeZona(g.zona), zona:g.zona, hom:g.hom, bodega:g.bodega,
      bodegaNorm:normValue(g.bodega),   // llave normalizada de la bodega
      descripcionDci: homDci.get(g.hom) || '',
      meses:serie.length, metodo:pr.metodo, consumo, existencia, pend,
      alfa:pr.alfa, mad:pr.mad, mape:pr.mape,   // parametros del ajuste SES
      traslados,
      compras: compMap.get(k) || 0,        // unidades compradas (facturas)
      disponible,
      requerido, balance, faltante: balance>0 ? balance : 0,
      cobertura: requerido>0 ? disponible/requerido : null,
      lineas:g.lineas, lineasPend
    };
  });

  // ---- Nivel zona: una fila por supervisor + homologo (Tabla 1) ----
  const porZonaHom=new Map();
  _supBodegas.forEach(b=>{
    const k=b.zona+'|'+b.hom;
    let z=porZonaHom.get(k);
    if(!z){ z={supervisor:b.supervisor, zona:b.zona, hom:b.hom, descripcionDci:b.descripcionDci,
               consumo:0, existencia:0, pend:0, requerido:0, traslados:0, compras:0,
               disponible:0,
               bodegas:0, bodegasDeficit:0, bodegasExced:0, faltante:0, excedente:0, meses:0, metodo:b.metodo};
            porZonaHom.set(k,z); }
    z.consumo+=b.consumo; z.existencia+=b.existencia; z.pend+=b.pend; z.requerido+=b.requerido;
    z.traslados+=b.traslados; z.compras+=b.compras;
    z.disponible+=b.disponible;
    z.bodegas++;
    // balance positivo = faltante; negativo = excedente
    if(b.balance>0){ z.bodegasDeficit++; z.faltante += b.balance; }
    else if(b.balance<0){ z.bodegasExced++; z.excedente += -b.balance; }
    z.meses=Math.max(z.meses, b.meses);
  });
  _supHomologos=[...porZonaHom.values()].map(z=>{
    z.balance = z.requerido - z.disponible;
    z.cobertura = z.requerido>0 ? z.disponible/z.requerido : null;
    // Cuanto se puede tapar moviendo inventario dentro de la zona y cuanto habria que comprar.
    z.cubreConTraslado = Math.min(z.faltante, z.excedente);
    z.porComprar = Math.max(0, z.faltante - z.excedente);
    return z;
  });

  /* ---- Tabla 2: plan de redistribucion dentro de la misma zona -------------
     Por cada zona y homologo, las bodegas con excedente (Total requerido -
     disponible < 0) le entregan unidades a las bodegas con faltante, de mayor a
     menor, hasta agotar el excedente. Nunca se cruza informacion entre zonas.  */
  const porZonaHomBodegas=new Map();
  _supBodegas.forEach(b=>{
    const k=b.zona+'|'+b.hom;
    if(!porZonaHomBodegas.has(k)) porZonaHomBodegas.set(k, []);
    porZonaHomBodegas.get(k).push(b);
  });
  _supPlan=[];
  porZonaHomBodegas.forEach(lista=>{
    const origen=lista.filter(b=>b.balance<0).map(b=>({bodega:b.bodega, disp:-b.balance, exi:b.existencia}))
      .sort((a,b)=>b.disp-a.disp);
    const destino=lista.filter(b=>b.balance>0).map(b=>({bodega:b.bodega, falta:b.balance, req:b.requerido, exi:b.existencia}))
      .sort((a,b)=>b.falta-a.falta);
    if(!origen.length || !destino.length) return;
    const ref=lista[0];
    let i=0;
    destino.forEach(d=>{
      let falta=d.falta;
      while(falta>0 && i<origen.length){
        const o=origen[i];
        if(o.disp<=0){ i++; continue; }
        const mov=Math.min(o.disp, falta);
        if(mov>0){
          _supPlan.push({
            supervisor:ref.supervisor, zona:ref.zona, hom:ref.hom,
            origen:o.bodega, destino:d.bodega, unidades:mov,
            faltaDestino:d.falta, requeridoDestino:d.req, existenciaDestino:d.exi,
            existenciaOrigen:o.exi,          // existencia total de la bodega que entrega
            sobranteOrigen:o.disp-mov
          });
          o.disp-=mov; falta-=mov;
        }
        if(o.disp<=0) i++;
      }
    });
  });
  _supPlan.sort((a,b)=> a.zona.localeCompare(b.zona,'es') || b.unidades-a.unidades || a.hom.localeCompare(b.hom,'es'));

  _supGlobal={
    lineas:rows.length, sinZona, zonasFuera:[...zonasFuera].sort((a,b)=>a.localeCompare(b,'es')),
    meses:mesesOrden.length, desde:mesesOrden[0]||'', hasta:mesesOrden[mesesOrden.length-1]||'',
    mesesCargados:mesesTodos.length,
    mesesPend:[...mesesPend].sort(),
    parcial: mesParcial ? {mes:mesParcial.mes, dia:mesParcial.dia, dias:mesParcial.dias,
                           pct:Math.round(mesParcial.frac*100), usado:parcialEnSerie} : null,
    excluido: mesExcluido || ''
  };

  if(diagEl){
    const avisos=[];
    if(sinZona>0){
      avisos.push('<b>'+fmtInt(sinZona)+'</b> líneas activas no quedaron en ninguna de las 11 zonas de la matriz'+
        (_supGlobal.zonasFuera.length ? ' (zona en el archivo: '+escHtml(_supGlobal.zonasFuera.join(', '))+')' : '')+'.');
    }
    // La historia es acumulativa: se explica que paso con el mes que sigue abierto.
    if(mesParcial){
      const et=mesLabel(mesParcial.mes)+' va al día '+fmtInt(mesParcial.dia)+' de '+fmtInt(mesParcial.dias)+
               ' ('+fmtInt(_supGlobal.parcial.pct)+'% del mes)';
      if(parcialEnSerie){
        avisos.push(et+': es el único mes cargado, así que se usa tal cual (sin proyectar) y el consumo puede quedar subestimado.');
      } else {
        avisos.push(et+': queda <b>fuera del consumo promedio</b> porque el mes aún no ha cerrado. '+
          'El promedio se calcula solo con los '+fmtInt(mesesOrden.length)+' mes(es) completos y no se proyecta ningún mes.');
      }
    }
    // Los pendientes se limitan a la ventana de los dos ultimos meses.
    if(_supGlobal.mesesPend && _supGlobal.mesesPend.length){
      avisos.push('Los <b>pendientes</b> corresponden solo a los <b>2 últimos meses</b> ('+
        escHtml(_supGlobal.mesesPend.map(m=>mesLabel(m)).join(' y '))+'); los pendientes más antiguos no suman al requerimiento.');
    }
    if(mesesOrden.length<2){
      avisos.push('Con <b>'+fmtInt(mesesOrden.length)+'</b> mes(es) completo(s) el consumo se toma tal cual. '+
        'Desde 2 meses se aplica <b>Suavización Exponencial Simple (SES)</b> con el alfa que mejor ajusta cada homólogo; la historia crece con cada cargue.');
    } else {
      avisos.push('El <b>consumo promedio mensual</b> se pronostica con <b>Suavización Exponencial Simple (SES)</b>: para cada homólogo y bodega se prueba alfa de <b>0,05 a 1,00</b> y se elige el que deja el menor <b>MAD</b> (desempate por <b>MAPE</b>). El alfa, el MAD y el MAPE de cada fila quedan en el Excel.');
    }
    // La columna Traslados depende de una tabla que se carga aparte.
    const totTras=(proc.traslados||[]).length;
    if(!totTras) avisos.push('La tabla <b>Traslados</b> no está cargada: la columna <b>Traslados (no recibidos)</b> queda en cero.');
    else if(!trasNoRecib && trasSinEstado>=totTras) avisos.push('Ninguna de las <b>'+fmtInt(totTras)+'</b> líneas de <b>Traslados</b> trae la columna de estado (<b>No Recibido</b> / <b>Recibido</b>), así que la columna <b>Traslados</b> queda en cero: solo se suman las líneas marcadas expresamente como <b>No Recibido</b>.');
    else if(!trasNoRecib) avisos.push('Ninguna línea de la tabla <b>Traslados</b> está marcada como <b>No Recibido</b> ('+fmtInt(totTras)+' línea(s) revisadas), así que la columna <b>Traslados</b> queda en cero: no hay unidades en camino.');
    else if(!trasMap.size){
      let m='Hay <b>'+fmtInt(trasNoRecib)+'</b> línea(s) de traslado <b>No Recibido</b>, pero ninguna se pudo llevar a un homólogo: ';
      const causas=[];
      if(trasSinHom) causas.push(fmtInt(trasSinHom)+' con el <b>código sin homologar</b>');
      if(trasSinBodega) causas.push(fmtInt(trasSinBodega)+' con una <b>bodega destino</b> que no coincide con la Bodega Detalle del reporte'+
        (trasBodegasSinCruce.size? ' (ej.: '+escHtml([...trasBodegasSinCruce].slice(0,3).join(', '))+')':''));
      m+= causas.length? causas.join(' y ')+'.' : 'revisa las columnas Codigo y Bodega Destino.';
      avisos.push(m);
    } else {
      const partes=[];
      if(trasSinHom) partes.push(fmtInt(trasSinHom)+' línea(s) con el código sin homologar');
      if(trasSinBodega) partes.push(fmtInt(trasSinBodega)+' línea(s) con bodega destino sin equivalencia'+
        (trasBodegasSinCruce.size? ' (ej.: '+escHtml([...trasBodegasSinCruce].slice(0,3).join(', '))+')':''));
      if(trasSinEstado) partes.push(fmtInt(trasSinEstado)+' línea(s) sin estado en la columna Recibido (no se cuentan)');
      let m='La columna <b>Traslados</b> suma <b>'+fmtInt(trasUnidades)+'</b> unidad(es) en camino de '+fmtInt(trasNoRecib)+' línea(s) <b>No Recibido</b>';
      m+= partes.length? '; quedaron por fuera '+partes.join(' y ')+'.' : '.';
      avisos.push(m);
    }
    // Compras ya no se muestra en la tabla; solo se avisa por el dato del Excel.
    if(!(proc.facturas||[]).length) avisos.push('La tabla <b>Facturas</b> no está cargada: las <b>compras (facturas)</b> del Excel quedan en cero.');
    if(avisos.length){ diagEl.style.display=''; diagEl.innerHTML='<b>Nota:</b> '+avisos.join(' '); }
    else { diagEl.style.display='none'; diagEl.innerHTML=''; }
  }

  // Selectores de la pestana.
  const selS=document.getElementById('fSupSupervisor');
  if(selS){
    const prev=selS.value;
    selS.innerHTML='<option value="">Todos los supervisores</option>'+
      SUPERVISORES_ZONA.map(s=>'<option value="'+escHtml(s.nombre)+'">'+escHtml(s.nombre)+'</option>').join('');
    if(prev) selS.value=prev;
  }
  const selZ=document.getElementById('fSupZona');
  if(selZ){
    const prev=selZ.value;
    selZ.innerHTML='<option value="">Todas las zonas</option>'+
      ZONAS_SUPERVISOR.map(z=>'<option value="'+escHtml(z)+'">'+escHtml(z)+'</option>').join('');
    if(prev) selZ.value=prev;
  }

  pintarBaseSupervisores();
}

// Filtros de la pestana: supervisor, zona y busqueda por homologo.
function _supFiltrosActuales(){
  return {
    sup:(document.getElementById('fSupSupervisor')||{}).value || '',
    zona:(document.getElementById('fSupZona')||{}).value || '',
    hom:normValue((document.getElementById('fSupHomologo')||{}).value || ''),
    soloFalta:!!(document.getElementById('fSupSoloFaltante')||{}).checked
  };
}
function _supVisible(t, f){
  if(f.sup && t.supervisor!==f.sup) return false;
  if(f.zona && t.zona!==f.zona) return false;
  if(f.hom && !normValue(t.hom).includes(f.hom)) return false;
  return true;
}

/* Semaforo del % Cobertura de la Tabla 1:
   mayor a 100% -> verde y se muestra "100%+" (no tiene sentido pasar de la meta),
   entre 90% y 100% -> amarillo, menor a 90% -> rojo.                          */
function cobClass(n){ if(n===null||n===undefined||isNaN(n)) return ''; if(n>1) return 'cob-good'; if(n>=0.90) return 'cob-mid'; return 'cob-bad'; }
function fmtCob(n){ if(n===null||n===undefined||isNaN(n)) return '—'; if(n>1) return '100%+'; return (n*100).toFixed(1)+'%'; }

function pintarBaseSupervisores(){
  const tb=document.querySelector('#tblSupReq tbody');
  const tbPlan=document.querySelector('#tblSupPlan tbody');
  if(!tb) return;
  const statsEl=document.getElementById('statsSup');
  const f=_supFiltrosActuales();

  if(!_supBodegas.length){
    tb.innerHTML='<tr><td colspan="12" class="txt" style="text-align:center;color:#9CA9B6;">No hay datos calculados.</td></tr>';
    if(tbPlan) tbPlan.innerHTML='<tr><td colspan="7" class="txt" style="text-align:center;color:#9CA9B6;">No hay datos calculados.</td></tr>';
    if(statsEl) statsEl.innerHTML='';
    return;
  }

  // La Tabla 1 se muestra al detalle: una fila por homologo y bodega detalle.
  let filas=_supBodegas.filter(t=>_supVisible(t, f));
  if(f.soloFalta) filas=filas.filter(t=>t.faltante>0);
  let homs=_supHomologos.filter(t=>_supVisible(t, f));
  if(f.soloFalta) homs=homs.filter(t=>t.faltante>0);
  const plan=_supPlan.filter(p=>_supVisible(p, f));

  // ---- KPIs ----
  const zonas=new Set(filas.map(t=>t.zona));
  const conFalta=filas.filter(t=>t.faltante>0);
  const totFalta=conFalta.reduce((a,b)=>a+b.faltante,0);
  const totTraslado=plan.reduce((a,b)=>a+b.unidades,0);
  const totComprar=homs.reduce((a,b)=>a+b.porComprar,0);
  const totReq=filas.reduce((a,b)=>a+b.requerido,0);
  const totExi=filas.reduce((a,b)=>a+b.existencia,0);
  if(statsEl){
    const G=_supGlobal||{meses:0,desde:'',hasta:''};
    const per=G.desde ? (mesLabel(G.desde)+' a '+mesLabel(G.hasta)) : 'sin periodo';
    // La historia es acumulativa: se aclara cuantos meses COMPLETOS alimentan el promedio.
    const notaMes = G.parcial
      ? (G.parcial.usado ? ' · '+mesLabel(G.parcial.mes)+' es el único mes cargado (aún abierto)'
                         : ' · '+mesLabel(G.parcial.mes)+' aún abierto (excluido, sin proyectar)')
      : '';
    statsEl.innerHTML =
      '<div class="stat"><div class="label">Zonas en la selección</div><div class="value">'+fmtInt(zonas.size)+'</div>'+
      '<div class="sub">de '+fmtInt(ZONAS_SUPERVISOR.length)+' zonas con supervisor</div></div>'+
      '<div class="stat"><div class="label">Homólogos por bodega</div><div class="value">'+fmtInt(filas.length)+'</div>'+
      '<div class="sub">'+fmtInt(G.meses)+' meses completos en el promedio · '+escHtml(per)+escHtml(notaMes)+'</div></div>'+
      '<div class="stat"><div class="label">Total requerido</div><div class="value">'+fmtInt(totReq)+'</div>'+
      '<div class="sub">'+fmtInt(totExi)+' unidades en existencia</div></div>'+
      '<div class="stat"><div class="label">Unidades faltantes</div><div class="value '+(totFalta?'pct-bad':'')+'">'+fmtInt(totFalta)+'</div>'+
      '<div class="sub">'+fmtInt(conFalta.length)+' filas por debajo de lo requerido</div></div>'+
      '<div class="stat"><div class="label">Se cubre con traslados</div><div class="value">'+fmtInt(totTraslado)+'</div>'+
      '<div class="sub">'+fmtInt(plan.length)+' movimientos dentro de la misma zona</div></div>'+
      '<div class="stat"><div class="label">Habría que comprar</div><div class="value '+(totComprar?'pct-mid':'')+'">'+fmtInt(totComprar)+'</div>'+
      '<div class="sub">unidades que la zona no alcanza a cubrir</div></div>';
  }

  // ---- Tabla 1: requerimiento por homologo ----
  const orden=filas.slice().sort((a,b)=>
    b.faltante-a.faltante || b.requerido-a.requerido ||
    a.bodega.localeCompare(b.bodega,'es') || a.hom.localeCompare(b.hom,'es'));
  const vista=orden.slice(0, SUP_MAX_FILAS);
  let h=vista.map(t=>
    '<tr><td class="txt"><b>'+escHtml(t.supervisor)+'</b></td>'+
    '<td class="txt">'+escHtml(t.bodega)+'</td>'+
    '<td class="txt">'+escHtml(t.hom)+'</td>'+
    '<td class="txt">'+escHtml(t.descripcionDci||'—')+'</td>'+
    '<td>'+fmtInt(t.consumo)+'</td>'+
    '<td>'+fmtInt(t.existencia)+'</td>'+
    '<td>'+fmtInt(t.traslados)+'</td>'+
    '<td class="'+(t.pend?'pct-bad':'')+'">'+fmtInt(t.pend)+'</td>'+
    '<td><b>'+fmtInt(t.requerido)+'</b></td>'+
    '<td class="'+(t.balance>0?'pct-bad':'pct-good')+'">'+fmtInt(t.balance)+'</td>'+
    '<td class="'+cobClass(t.cobertura)+'">'+fmtCob(t.cobertura)+'</td></tr>'
  ).join('');
  if(!vista.length) h='<tr><td colspan="11" class="txt" style="text-align:center;color:#9CA9B6;">Ningún homólogo cumple los filtros elegidos.</td></tr>';
  else if(orden.length>vista.length) h+='<tr class="total-row"><td class="txt" colspan="11">Se muestran las '+fmtInt(vista.length)+
    ' filas con mayor faltante de '+fmtInt(orden.length)+'. El Excel trae la lista completa.</td></tr>';
  tb.innerHTML=h;

  // ---- Tabla 2: plan de redistribucion ----
  if(tbPlan){
    const vistaPlan=plan.slice(0, SUP_MAX_FILAS);
    let hp=vistaPlan.map(p=>
      '<tr><td class="txt">'+escHtml(p.zona)+'</td>'+
      '<td class="txt">'+escHtml(p.hom)+'</td>'+
      '<td class="txt">'+escHtml(p.origen)+'</td>'+
      '<td>'+fmtInt(p.existenciaOrigen||0)+'</td>'+
      '<td class="txt">'+escHtml(p.destino)+'</td>'+
      '<td><b>'+fmtInt(p.unidades)+'</b></td>'+
      '<td>'+fmtInt(p.faltaDestino)+'</td>'+
      '<td>'+fmtInt(p.sobranteOrigen)+'</td></tr>'
    ).join('');
    if(!vistaPlan.length) hp='<tr><td colspan="8" class="txt" style="text-align:center;color:#9CA9B6;">No hay traslados posibles: dentro de la zona no hay bodegas con excedente para las que están cortas.</td></tr>';
    else if(plan.length>vistaPlan.length) hp+='<tr class="total-row"><td class="txt" colspan="8">Se muestran '+fmtInt(vistaPlan.length)+
      ' de '+fmtInt(plan.length)+' movimientos. El Excel trae el plan completo.</td></tr>';
    tbPlan.innerHTML=hp;
  }
}

(function initBaseSupervisores(){
  ['fSupSupervisor','fSupZona','fSupSoloFaltante'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.addEventListener('change', pintarBaseSupervisores);
  });
  const inp=document.getElementById('fSupHomologo');
  if(inp) inp.addEventListener('input', pintarBaseSupervisores);
  // Al elegir supervisor se sincroniza la zona (hay un supervisor por zona) y viceversa.
  const selS=document.getElementById('fSupSupervisor');
  const selZ=document.getElementById('fSupZona');
  if(selS && selZ){
    selS.addEventListener('change', ()=>{
      const s=SUPERVISORES_ZONA.find(x=>x.nombre===selS.value);
      selZ.value = s ? s.zona : '';
      pintarBaseSupervisores();
    });
    selZ.addEventListener('change', ()=>{
      selS.value = selZ.value ? supervisorDeZona(selZ.value) : '';
      pintarBaseSupervisores();
    });
  }
  const btn=document.getElementById('btnExportSup');
  if(btn) btn.addEventListener('click', ()=>{
    if(!_supBodegas.length){ showToast('Primero calcula los indicadores.', true); return; }
    const f=_supFiltrosActuales();
    let filas=_supBodegas.filter(t=>_supVisible(t, f));
    if(f.soloFalta) filas=filas.filter(t=>t.faltante>0);
    if(!filas.length){ showToast('No hay homólogos para los filtros elegidos.', true); return; }
    const plan=_supPlan.filter(p=>_supVisible(p, f));
    let resumen=_supHomologos.filter(t=>_supVisible(t, f));
    if(f.soloFalta) resumen=resumen.filter(t=>t.faltante>0);

    // Hoja 1: la misma Tabla 1 de pantalla (homólogo por bodega detalle).
    const hoja1=filas.slice().sort((a,b)=> b.faltante-a.faltante || b.requerido-a.requerido).map(t=>({
      'Supervisor':t.supervisor, 'Bodega Detalle':t.bodega, 'Homologo':t.hom,
      'Descripcion DCI':t.descripcionDci,
      'Consumo promedio mensual (SES)':t.consumo,
      'Existencia':t.existencia, 'Traslados no recibidos':t.traslados, 'Compras (facturas)':t.compras,
      'Unidades pendientes (2 ultimos meses)':t.pend,
      'Total requerido':t.requerido, 'Disponible (existencia + traslado)':t.disponible,
      'Balance (requerido - disponible)':t.balance,
      '% Cobertura':t.cobertura===null?'':(t.cobertura>1?'100%+':+(t.cobertura*100).toFixed(1)),
      'Zona':t.zona, 'Metodo de pronostico':t.metodo, 'Meses de historia':t.meses,
      'Alfa optimo':t.alfa===null||t.alfa===undefined?'':+t.alfa.toFixed(2),
      'MAD (error absoluto medio)':t.mad===null||t.mad===undefined?'':+t.mad.toFixed(2),
      'MAPE %':t.mape===null||t.mape===undefined?'':+t.mape.toFixed(1)
    }));
    const hoja2=plan.map(p=>({
      'Supervisor':p.supervisor, 'Zona':p.zona, 'Homologo':p.hom,
      'Bodega origen (excedente)':p.origen, 'Existencia bodega origen':p.existenciaOrigen||0,
      'Bodega destino (faltante)':p.destino,
      'Unidades a trasladar':p.unidades,
      'Faltante del destino':p.faltaDestino, 'Total requerido destino':p.requeridoDestino,
      'Existencia destino':p.existenciaDestino, 'Excedente que queda en origen':p.sobranteOrigen
    }));
    // Hoja 3: resumen por zona y homólogo (consolidado de la zona).
    const hoja3=resumen.slice().sort((a,b)=>
      a.zona.localeCompare(b.zona,'es') || a.hom.localeCompare(b.hom,'es')).map(z=>({
      'Supervisor':z.supervisor, 'Zona':z.zona, 'Homologo':z.hom, 'Descripcion DCI':z.descripcionDci,
      'Consumo promedio mensual':z.consumo, 'Existencia':z.existencia,
      'Traslados no recibidos':z.traslados, 'Compras (facturas)':z.compras,
      'Unidades pendientes (2 ultimos meses)':z.pend, 'Total requerido':z.requerido,
      'Disponible (existencia + traslado)':z.disponible, 'Balance':z.balance,
      '% Cobertura':z.cobertura===null?'':(z.cobertura>1?'100%+':+(z.cobertura*100).toFixed(1)),
      'Bodegas':z.bodegas, 'Bodegas cortas':z.bodegasDeficit,
      'Unidades faltantes':z.faltante, 'Se cubre con traslado':z.cubreConTraslado,
      'Por comprar':z.porComprar, 'Meses de historia':z.meses
    }));
    const fecha=new Date().toISOString().slice(0,10);
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hoja1), 'REQUERIMIENTO POR HOMOLOGO');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hoja2), 'PLAN DE REDISTRIBUCION');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(hoja3), 'RESUMEN POR ZONA');
    XLSX.writeFile(wb, 'Base_Supervisores_'+fecha+'.xlsx');
    showToast('Excel exportado: '+fmtInt(hoja1.length)+' filas de requerimiento y '+fmtInt(hoja2.length)+' traslados sugeridos.');
  });
})();

/* =========================================================================
   14. Navegación entre los tableros de resultados
   ========================================================================= */
document.querySelectorAll('.result-tabs button').forEach(b=>{
  b.addEventListener('click', ()=>{
    document.querySelectorAll('.result-tabs button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    document.querySelectorAll('.subview').forEach(v=>v.classList.remove('active'));
    document.getElementById('sub-'+b.dataset.sub).classList.add('active');
    if(b.dataset.sub==='facturas' && typeof renderInfoPorFactura==='function'){
      renderInfoPorFactura();
      if(typeof ensureFacturasData==='function') ensureFacturasData().then(()=>renderInfoPorFactura());
    }
    if(b.dataset.sub==='traslados' && typeof renderIndicadorTraslados==='function') renderIndicadorTraslados();
    if(b.dataset.sub==='invfisico' && typeof refrescarInvFisico==='function') refrescarInvFisico(true);
    if(b.dataset.sub==='cuentas' && typeof pintarBaseCuentas==='function') pintarBaseCuentas();
    if(b.dataset.sub==='supervisores' && typeof pintarBaseSupervisores==='function') pintarBaseSupervisores();
  });
});

/* =========================================================================
   14b. Reporte Comparativo Periódico (cargue vs cargue del Reporte de Dispensación)
   ========================================================================= */
/* Corte al que pertenece una fecha: día 1-10 = Corte 1, día 11-20 = Corte 2,
   día 21-31 = Corte 3. Sirve para cualquier fecha (dispensación o soporte).   */
function getPeriodoDeCarga(iso){
  if(!iso) return null;
  const d=new Date(iso);
  if(isNaN(d)) return null;
  const day=d.getUTCDate();
  return day<=10 ? 1 : (day<=20 ? 2 : 3);
}
/* REGLA GENERAL DE CORTES Y PERIODOS:
   el corte y el mes de una dispensa se miden por su FECHA DE DISPENSACIÓN, no por la
   fecha en que se subió el archivo. Así una dispensa siempre queda contada en el corte
   y el mes en que realmente ocurrió, aunque el archivo se cargue días después.
   Devuelve 0 cuando la fila no tiene fecha de dispensación válida.              */
function corteDeDispensacion(r){
  const p=getPeriodoDeCarga(r && r.fecha);
  return p===null ? 0 : p;
}
// Mes (AAAA-MM) de la fecha de dispensación de la fila.
function mesDeDispensacion(r){
  return mesKey(r && r.fecha) || '';
}
/* DOS EJES DE TIEMPO (regla del visor):
   1) ORIGEN DEL PENDIENTE → se fecha con la FECHA DE DISPENSACIÓN: define el mes y el
      corte en el que nació el pendiente.
   2) CUMPLIMIENTO (entrega y soporte) → se fecha con el CARGUE en el que la línea
      vuelve a subirse ya cumpliendo la condición. Una entrega o un soporte solo se
      reconocen cuando llegan en un cargue posterior al del pendiente.
   Corte del CARGUE de la fila (0 = la fila no trae fecha de cargue).            */
function corteDeCargueArchivo(r){
  const p=getPeriodoDeCarga((r && r.fechaCargue) || '');
  return p===null ? 0 : p;
}
// Mes (AAAA-MM) del cargue en que llegó esta versión de la línea.
function mesDeCargue(r){
  return mesKey((r && r.fechaCargue) || '') || '';
}
// Corte del cargue en el que llegó el soporte (o del cargue de la versión, si el
// archivo no informa una fecha propia del soporte).
function corteDeSoporte(r){
  const p=getPeriodoDeCarga((r && (r.fechaSoporte || r.fechaCargue)) || '');
  return p===null ? 0 : p;
}
/* NÚMERO del cargue (orden real: 1º, 2º, 3º...) en el que llegó esta versión de la
   línea y en el que llegó su soporte. Es la forma más confiable de saber qué llegó
   antes y qué después: no depende de la fecha del archivo, así que funciona incluso
   si dos cargues se hicieron el mismo día o si los archivos se subieron desordenados.
   Vale 0 en acumulados antiguos que todavía no guardaban este dato; en ese caso se
   sigue usando la fecha del cargue como respaldo.                               */
function numCargue(r){ return Number(r && r.secCargue) || 0; }
function numSoporte(r){ return Number(r && (r.secSoporte || r.secCargue)) || 0; }
/* Identidad de una DISPENSA: Documento + Bodega. El mismo documento puede atenderse
   en más de un punto de entrega, por eso la bodega hace parte de la clave: cada punto
   maneja su propia dispensa y su propio estado de entrega.                      */
function claveDocBodega(r){
  if(!r || !r.documento) return '';
  return r.bodegaDetalle+'|'+r.documento;
}
/* ¿La dispensa/línea ya tenía soporte al cierre del corte indicado?
   El soporte es un CUMPLIMIENTO: se acredita en el corte del CARGUE en el que la línea
   se volvió a subir ya con el soporte (o en la fecha propia del soporte, si el archivo
   la informa). La fecha de dispensación NO se usa aquí: esa solo fecha el pendiente.
   Una fila sin fecha de cargue (acumulados antiguos) conserva su soporte en cualquier
   corte para no perder información.                                             */
function tieneSoporteHastaCorte(r, corteMax){
  if(r.tieneSoportes!=='TIENE SOPORTE') return false;
  const p = corteDeSoporte(r);
  return p===0 ? true : p<=corteMax;
}
// Corte (por el CARGUE del soporte) en el que la fila aporta el soporte.
function corteRecuperacionSoporte(r){
  if(r.tieneSoportes!=='TIENE SOPORTE') return null;
  const p = corteDeSoporte(r);
  return p>0 ? p : null;
}
// Identidad de una línea a través de los distintos cargues del Reporte de Dispensación.
// Incluye el número de repetición dentro del cargue: si un documento trae dos filas del
// mismo artículo en la misma bodega, cada una se cuenta y se sigue por separado.
function claveLineaCargue(r){
  return r.documento+'|'+r.bodegaNorm+'|'+r.codigoArticulo+'|'+(r.ocurrenciaLinea||1);
}
/* Corte en el que se conoce esta VERSIÓN de la línea. El estado (entregada / con
   soporte) solo puede acreditarse en el corte del CARGUE en que llegó esa versión.
   Si la fila no trae fecha de cargue (acumulados antiguos) se usa como respaldo su
   fecha de dispensación para no perderla del cálculo.                            */
function corteDeCargue(r){
  const p=getPeriodoDeCarga((r && r.fechaCargue) || '');
  return p===null ? corteDeDispensacion(r) : p;
}
function esVersionPosterior(a, b){
  // Primero manda el NÚMERO de cargue (orden real de los cargues); si alguno de los dos
  // no lo trae (acumulado antiguo) se compara por la fecha del cargue, y en última
  // instancia por el orden en que las filas quedaron guardadas.
  const na=numCargue(a), nb=numCargue(b);
  if(na && nb && na!==nb) return na>nb;
  const fa=String(a.fechaCargue||''), fb=String(b.fechaCargue||'');
  if(fa!==fb) return fa>fb;
  return a.idx>b.idx;
}
// Día (AAAA-MM-DD) del cargue en que llegó esta versión de la línea (para mostrar).
function diaCargue(r){ return String((r && r.fechaCargue) || '').slice(0,10); }
// Marca completa de la FECHA DE DISPENSACIÓN: fecha el ORIGEN del pendiente.
function marcaDispensacion(r){
  const f = r && r.fecha;
  if(!f) return '';
  const d = f instanceof Date ? f : new Date(f);
  return isNaN(d) ? '' : d.toISOString();
}
// Día (AAAA-MM-DD) de dispensación de la fila.
function diaDispensacion(r){ return marcaDispensacion(r).slice(0,10); }
// Día en que llegó el soporte de la dispensa (o el del cargue de esa versión).
function diaSoporte(r){ return String((r && (r.fechaSoporte || r.fechaCargue)) || '').slice(0,10); }
// Marca completa (fecha + hora) del cargue: sirve para saber si dos registros vienen
// del MISMO cargue o de cargues distintos, incluso si se subieron el mismo día.
function marcaCargue(r){ return String((r && r.fechaCargue) || ''); }
// Marca completa del soporte (o del cargue en que llegó esa versión).
function marcaSoporte(r){ return String((r && (r.fechaSoporte || r.fechaCargue)) || ''); }
/* REGLA ÚNICA para acreditar un cambio de estado (pendiente → entregado y
   sin soporte → con soporte):
   El cumplimiento se acredita SIEMPRE por el CARGUE. La línea debe volver a subirse en
   un cargue POSTERIOR al del registro que estaba pendiente / sin soporte, ya cumpliendo
   la condición. La fecha de dispensación no interviene: esa solo dice a qué mes y corte
   pertenece el pendiente de origen.
   Nunca se acredita hacia atrás: un cargue anterior o el mismo cargue no es recuperación. */
function cambioAcreditado(rAnt, rNue){
  if(!rAnt || !rNue) return false;
  // Vía principal: el NÚMERO de cargue. El cumplimiento debe llegar en un cargue con
  // número mayor. Funciona aunque los dos cargues sean del mismo día.
  const nAnt=numCargue(rAnt), nNue=numCargue(rNue);
  if(nAnt && nNue) return nNue>nAnt;
  const cAnt=marcaCargue(rAnt), cNue=marcaCargue(rNue);
  if(cAnt && cNue) return cNue>cAnt;                  // respaldo: fecha del cargue
  return esVersionPosterior(rNue, rAnt);              // respaldo: orden de versiones
}
/* ¿El SOPORTE llegó en un cargue posterior al del registro que estaba sin soporte?
   Misma regla que las entregas, pero fechada con el cargue en que apareció el soporte. */
function soporteAcreditado(rSin, rCon){
  if(!rSin || !rCon) return false;
  const nSin=numCargue(rSin), nCon=numSoporte(rCon);
  if(nSin && nCon) return nCon>nSin;
  const cSin=marcaCargue(rSin), cCon=marcaSoporte(rCon);
  if(cSin && cCon) return cCon>cSin;
  return cambioAcreditado(rSin, rCon);
}
/* Cortes con movimiento real. Un corte cuenta cuando tuvo DISPENSACIONES (nacieron
   pendientes en esos días) o cuando hubo un CARGUE en esos días (pudo acreditar
   entregas y soportes). Un corte sin nada de eso queda en cero / “—” para no repetir
   las cifras del corte anterior.                                                 */
function cortesConCargue(rows){
  const s=new Set();
  (rows||[]).forEach(r=>{
    const pd=getPeriodoDeCarga(r.fecha);              // origen del pendiente
    if(pd) s.add(pd);
    const pc=getPeriodoDeCarga(r.fechaCargue||'');    // cargue que acredita cumplimiento
    if(pc) s.add(pc);
  });
  return s;
}
// Cortes con dispensaciones pero calculados BODEGA POR BODEGA.
// Una bodega puede no haber dispensado en unos días en los que otras sí lo hicieron:
// para esa bodega el corte no tiene información y debe quedar en “—”.
function cortesConCarguePorBodega(rows){
  const m=new Map();
  (rows||[]).forEach(r=>{
    const b=r.bodegaDetalle;
    const pd=getPeriodoDeCarga(r.fecha);
    const pc=getPeriodoDeCarga(r.fechaCargue||'');
    if(!pd && !pc) return;
    if(!m.has(b)) m.set(b, new Set());
    if(pd) m.get(b).add(pd);
    if(pc) m.get(b).add(pc);
  });
  return m;
}
// Último corte con dispensaciones anterior o igual a `corte` (0 = línea base).
function corteVigenteHasta(activos, corte){
  for(let c=corte;c>=1;c--) if(activos.has(c)) return c;
  return 0;
}
// GESTIÓN ACUMULADA con universo COMÚN en los 3 cortes.
// El total de líneas/dispensas es el MISMO en todos los cortes (todas las líneas
// conocidas del periodo). Lo que cambia corte a corte es su estado:
// - Estado inicial de una línea = la PRIMERA versión con la que apareció (línea base, corte 0).
// - En cada corte se toma la MEJOR versión conocida hasta ese corte: si en algún cargue
//   anterior o igual ya llegó entregada (o ya trajo soporte), no vuelve atrás.
// - Si la línea todavía no se había cargado en ese corte, conserva su estado inicial.
// Resultado: las entregas solo pueden SUBIR y los pendientes solo pueden BAJAR de un
// corte al siguiente (ej. 14/7 → 15/6), nunca al contrario.
function _puntajeGestion(r){
  return (r.lineaPendiente==='NO' ? 2 : 0) + (r.tieneSoportes==='TIENE SOPORTE' ? 1 : 0);
}
function snapshotHastaCorte(rows, corteMax){
  const primera=new Map(), mejor=new Map();
  rows.forEach(r=>{
    const k=claveLineaCargue(r);
    const ini=primera.get(k);
    if(!ini || esVersionPosterior(ini, r)) primera.set(k, r);   // versión más antigua
    if(corteMax>0 && corteDeCargue(r)<=corteMax){
      const m=mejor.get(k);
      if(!m){ mejor.set(k, r); return; }
      const dif=_puntajeGestion(r)-_puntajeGestion(m);
      if(dif>0 || (dif===0 && esVersionPosterior(r, m))) mejor.set(k, r);
    }
  });
  if(corteMax===0) return Array.from(primera.values());
  const out=[];
  primera.forEach((rIni,k)=>{ out.push(mejor.get(k) || rIni); });
  return out;
}
// Última versión cargada de cada línea (para exportables de estado actual).
function snapshotUltimaVersion(rows){
  const porLinea=new Map();
  (rows||[]).forEach(r=>{
    const k=claveLineaCargue(r);
    const prev=porLinea.get(k);
    if(!prev || esVersionPosterior(r, prev)) porLinea.set(k, r);
  });
  return Array.from(porLinea.values());
}
/* Dispensas de EVENTO con TODAS sus líneas ENTREGADAS (según la última versión cargada
   de cada línea). El Indicador Soporte Evento solo trabaja con estas dispensas: si una
   dispensa de evento todavía tiene alguna línea pendiente NO entra al indicador de
   soportes (ni como “con soporte” ni como “sin soporte”), porque el soporte se exige
   cuando la entrega ya está completa.
   La identidad es dispensa + punto de entrega (bodega + documento).             */
function clavesEventoEntregadas(rows){
  const est=new Map();
  snapshotUltimaVersion(rows).forEach(r=>{
    if(r.contrato!=='EVENTO' || !r.documento) return;
    const k=claveDocBodega(r);
    if(r.lineaPendiente==='SI') est.set(k, false);          // queda pendiente => se excluye
    else if(!est.has(k)) est.set(k, true);
  });
  const out=new Set();
  est.forEach((completa,k)=>{ if(completa) out.add(k); });
  return out;
}
// Solo las filas de EVENTO cuyas dispensas están 100% entregadas.
function filasSoporteEvento(rows){
  const ok=clavesEventoEntregadas(rows);
  return (rows||[]).filter(r=>r.contrato==='EVENTO' && r.documento && ok.has(claveDocBodega(r)));
}
// Estado ACUMULADO de líneas y documentos al cierre del corte indicado.
function calcularEstadoHastaCorte(rows, corteMax){
  const snap=snapshotHastaCorte(rows, corteMax);
  const lineaPend=new Map();
  snap.forEach(r=>{ lineaPend.set(r.idx, r.lineaPendiente==='SI' ? 'SI':'NO'); });
  /* Estado por DISPENSA (Documento + Bodega): la dispensa solo cuenta como entregada
     cuando TODAS sus líneas están entregadas.                                      */
  const docPend=new Map();
  snap.forEach(r=>{
    if(!r.documento) return;
    const k=claveDocBodega(r);
    if(lineaPend.get(r.idx)==='SI') docPend.set(k,true);
    else if(!docPend.has(k)) docPend.set(k,false);
  });
  return {snap, lineaPend, docPend};
}
function buildCorteMetrics(rows){
  const out={};
  // Universo del Indicador Soporte Evento: solo dispensas de evento totalmente entregadas.
  const eventoOk=clavesEventoEntregadas(rows);
  // El corte 0 es la foto inicial (primer cargue de cada línea): sirve de línea base
  // para medir qué se recuperó en cada corte posterior.
  [0,1,2,3].forEach(corte=>{
    const {snap, lineaPend, docPend} = calcularEstadoHastaCorte(rows, corte);
    const byBodega=new Map();
    const ensureG=(r)=>{
      if(!byBodega.has(r.bodegaDetalle)) byBodega.set(r.bodegaDetalle, {
        bodega:r.bodegaDetalle, zona:r.zona, docsSet:new Set(), docsEntSet:new Set(),
        lineas:0, lineasEnt:0, eventoSet:new Set(), eventoConSet:new Set(),
        eventoRecSet:new Set(), eventoRecAcumSet:new Set()
      });
      return byBodega.get(r.bodegaDetalle);
    };
    snap.forEach(r=>{
      const g=ensureG(r);
      if(r.documento){
        const kd=claveDocBodega(r);
        g.docsSet.add(kd);
        if(docPend.get(kd)===false) g.docsEntSet.add(kd);
      }
      g.lineas++;
      if(lineaPend.get(r.idx)==='NO') g.lineasEnt++;
    });
    // Soportes de EVENTO: el universo son las dispensas de evento con TODAS sus líneas
    // ENTREGADAS (mismo total en los 3 cortes). “Con soporte” solo puede crecer: un
    // soporte que llegó en un cargue suma en ese corte y ya no se pierde después.
    rows.forEach(r=>{
      if(r.contrato!=='EVENTO' || !r.documento) return;
      const kd=claveDocBodega(r);
      if(!eventoOk.has(kd)) return;   // aún con líneas pendientes
      const g=ensureG(r);
      g.eventoSet.add(kd);
      if(tieneSoporteHastaCorte(r, corte)) g.eventoConSet.add(kd);
      if(corte>0 && tieneSoporteHastaCorte(r, corte) && !tieneSoporteHastaCorte(r, corte-1)){
        g.eventoRecSet.add(kd);
      }
      if(corte>0 && tieneSoporteHastaCorte(r, corte) && !tieneSoporteHastaCorte(r, 0)){
        g.eventoRecAcumSet.add(kd);
      }
    });
    out[corte]=Array.from(byBodega.values()).map(g=>({
      bodega:g.bodega,
      bodegaNorm:normValue(g.bodega), zona:g.zona,
      docsTotal:g.docsSet.size, docsEnt:g.docsEntSet.size, docsPend:g.docsSet.size-g.docsEntSet.size,
      lineasTotal:g.lineas, lineasEnt:g.lineasEnt, lineasPend:g.lineas-g.lineasEnt,
      eventoTotal:g.eventoSet.size, eventoCon:g.eventoConSet.size, eventoSin:g.eventoSet.size-g.eventoConSet.size,
      eventoRec:g.eventoRecSet.size, eventoRecAcum:g.eventoRecAcumSet.size
    })).sort((a,b)=>(a.zona+a.bodega).localeCompare(b.zona+b.bodega,'es'));
  });
  return out;
}
/* RECUPERACIONES validadas — FUENTE ÚNICA para la tabla del Reporte Comparativo
   Periódico y para sus descargas de Excel, para que las cifras coincidan.
   Una recuperación exige:
   - que en la línea base (primer cargue de cada línea) estuviera pendiente / sin soporte,
   - que al cierre del corte final ya esté entregada / con soporte,
   - y que el cumplimiento llegue en un CARGUE POSTERIOR al del pendiente: si ambos
     vienen del mismo cargue es la información de ese mismo momento y no hay entrega
     real que reconocer.
   tipo: 'docs' (dispensas) | 'lineas' | 'soporte'. Devuelve una lista de items con
   `bodega` y `corteRec` para poder agrupar por bodega y por corte.                */
function recuperadasEnCortes(filtered, corteFinal, tipo){
  if(!filtered || !filtered.length || !corteFinal || corteFinal<1) return [];
  const estadoDe = (c)=>{
    const e=calcularEstadoHastaCorte(filtered, c);
    const lp=new Map(), byKey=new Map();
    e.snap.forEach(r=>{
      const k=claveLineaCargue(r);
      lp.set(k, e.lineaPend.get(r.idx)==='SI' ? 'SI':'NO');
      byKey.set(k, r);
    });
    return {lp, byKey, docPend:e.docPend, snap:e.snap};
  };
  const estados=[]; for(let c=0;c<=corteFinal;c++) estados.push(estadoDe(c));
  const base=estados[0], fin=estados[corteFinal];
  // Corte en el que una línea se acredita como ENTREGADA (null = no aplica).
  const corteRecuperacionLinea = (k)=>{
    if(base.lp.get(k)!=='SI') return null;         // nunca estuvo pendiente
    const rb=base.byKey.get(k); if(!rb) return null;
    for(let c=1;c<=corteFinal;c++){
      if(estados[c].lp.get(k)!=='NO') continue;
      const rc=estados[c].byKey.get(k);
      if(rc && cambioAcreditado(rb, rc)) return c;
    }
    return null;
  };

  if(tipo==='soporte'){
    // Solo cuentan los soportes cargados para dispensas de evento YA entregadas por completo.
    const eventoOk=clavesEventoEntregadas(filtered);
    /* Se comparan dos filas de la MISMA dispensa (documento + bodega): la más antigua sin
       soporte y la que ya trae soporte. La recuperación se acredita con la misma regla de
       las entregas: el soporte debe llegar en un CARGUE POSTERIOR al del registro que
       estaba sin soporte. El corte de la recuperación es el del cargue en que llegó el
       soporte.
       Ojo: cuando una línea vuelve a cargarse y ahora sí trae soporte, la aplicación de
       cargue ACTUALIZA la misma fila (guarda el soporte y el número del cargue en que
       llegó), así que la fila “sin soporte” y la fila “con soporte” pueden ser la MISMA.
       Por eso la comparación se hace entre el cargue de la línea y el cargue del soporte,
       y no entre dos filas distintas.                                              */
    const sinSopBase=new Map(), conSopFin=new Map(), info=new Map(), filaSinSop=new Map(), filaConSop=new Map();
    filtered.forEach(r=>{
      if(r.contrato!=='EVENTO' || !r.documento) return;
      const kd=claveDocBodega(r);                                  // dispensa = documento + bodega
      if(!eventoOk.has(kd)) return;   // aún con líneas pendientes
      if(!info.has(kd) || esVersionPosterior(r, info.get(kd))) info.set(kd, r);
      if(tieneSoporteHastaCorte(r, 0)) sinSopBase.set(kd, false);
      else {
        if(!sinSopBase.has(kd)) sinSopBase.set(kd, true);
        const prev=filaSinSop.get(kd);
        // se guarda la fila sin soporte más antigua según el orden de los CARGUES
        if(!prev || cambioAcreditado(r, prev)) filaSinSop.set(kd, r);
      }
      if(tieneSoporteHastaCorte(r, corteFinal)){
        const c=corteRecuperacionSoporte(r);
        const cc=(c && c>=1 && c<=corteFinal) ? c : 0;
        const prev=conSopFin.get(kd);
        if(prev===undefined || cc<prev){ conSopFin.set(kd, cc); filaConSop.set(kd, r); }
      }
    });
    const out=[];
    conSopFin.forEach((corteRec, doc)=>{
      if(sinSopBase.get(doc)!==true) return;      // ya tenía soporte desde el inicio
      if(!corteRec) return;                      // sin corte de recuperación identificable
      const rCon=filaConSop.get(doc), rSin=filaSinSop.get(doc);
      // El soporte debe llegar en un CARGUE POSTERIOR al del registro sin soporte.
      if(!soporteAcreditado(rSin, rCon)) return;
      const r=info.get(doc);
      // dSop = día del cargue del soporte · dSin = día del cargue en que estaba sin soporte.
      if(r) out.push({bodega:r.bodegaDetalle, corteRec, r, dSop:diaSoporte(rCon), dSin:diaCargue(rSin), dDisp:diaDispensacion(r)});
    });
    return out;
  }

  if(tipo==='lineas'){
    const out=[];
    fin.lp.forEach((est,k)=>{
      if(est!=='NO') return;                       // hoy sigue pendiente
      const corteRec=corteRecuperacionLinea(k);    // valida estado + fechas distintas
      if(!corteRec) return;
      const r=estados[corteRec].byKey.get(k) || fin.byKey.get(k), rb=base.byKey.get(k);
      if(!r) return;
      out.push({bodega:r.bodegaDetalle, corteRec, r, rb});
    });
    return out;
  }

  // ---- dispensas (documento + bodega) ----
  const porDoc=new Map();
  fin.snap.forEach(r=>{
    if(!r.documento) return;
    const kd=claveDocBodega(r);
    if(!porDoc.has(kd)) porDoc.set(kd, {
      documento:r.documento, zona:r.zona, bodega:r.bodegaDetalle, eps:r.eps, epsGrupo:r.epsGrupo,
      contrato:r.contrato, fecha:r.fecha, lineas:0, unidades:0, soporte:r.tieneSoportes,
      cargue:r.fechaCargue||'', dispEntrega:diaCargue(r)
    });
    const g=porDoc.get(kd);
    g.lineas++; g.unidades+=(Number(r.unidades)||0);
    if(String(r.fechaCargue||'')>String(g.cargue)) g.cargue=r.fechaCargue||'';
    // La ENTREGA se fecha con el CARGUE: se guarda el día del cargue más reciente.
    const dd=diaCargue(r);
    if(dd>String(g.dispEntrega||'')) g.dispEntrega=dd;
  });
  const pendBase=new Map(), recLineas=new Map();
  base.snap.forEach(r=>{
    if(!r.documento) return;
    const k=claveLineaCargue(r), kd=claveDocBodega(r);
    if(base.lp.get(k)!=='SI') return;
    pendBase.set(kd,(pendBase.get(kd)||0)+1);
    if(corteRecuperacionLinea(k)) recLineas.set(kd,(recLineas.get(kd)||0)+1);
  });
  const out=[];
  fin.docPend.forEach((pend, doc)=>{
    if(pend!==false) return;                       // sigue pendiente
    if(base.docPend.get(doc)!==true) return;       // ya estaba entregada desde el inicio
    if(!recLineas.get(doc)) return;                // ninguna línea se entregó en fecha posterior
    let corteRec=null;
    for(let c=1;c<=corteFinal;c++){ if(estados[c].docPend.get(doc)===false){ corteRec=c; break; } }
    if(!corteRec) return;
    const g=porDoc.get(doc);
    if(g) out.push({bodega:g.bodega, corteRec, g, pendBase:pendBase.get(doc)||0, recLineas:recLineas.get(doc)||0});
  });
  return out;
}
// Recuperaciones agrupadas por bodega y corte: Map bodega -> [c1, c2, c3].
function recuperadasPorBodega(filtered, corteFinal, tipo){
  const m=new Map();
  recuperadasEnCortes(filtered, corteFinal, tipo).forEach(it=>{
    if(!m.has(it.bodega)) m.set(it.bodega, [0,0,0]);
    if(it.corteRec>=1 && it.corteRec<=3) m.get(it.bodega)[it.corteRec-1]++;
  });
  return m;
}
let periodicoTabActual='documento';

/* ===================== Acceso con clave universal =====================
   El Reporte Comparativo Periódico queda protegido: al hacer clic en el botón
   se abre primero una ventana de acceso y solo se muestra el reporte cuando el
   usuario y la contraseña son correctos. La validación aprobada se recuerda
   mientras la pestaña del navegador siga abierta (sessionStorage), para no
   pedirla de nuevo al navegar por los otros indicadores.                  */
const PERIODICO_USUARIO = 'reportes';
const PERIODICO_CLAVE   = 'MedisfarmaReportes2026';
const PERIODICO_AUTH_FLAG = 'periodico_auth_ok';

// Pestaña que se debe abrir cuando el acceso quede autorizado.
let _periodicoTabPendiente = null;

function periodicoAccesoAutorizado(){
  try { return sessionStorage.getItem(PERIODICO_AUTH_FLAG) === '1'; }
  catch(e){ return false; } // navegador sin almacenamiento: siempre pedirá la clave
}

function guardarAccesoPeriodico(){
  try { sessionStorage.setItem(PERIODICO_AUTH_FLAG, '1'); } catch(e){}
}

function mostrarErrorAuth(msg){
  const box = document.getElementById('authError');
  if(!box) return;
  box.textContent = msg || '';
  box.classList.toggle('show', !!msg);
}

function limpiarCamposAuth(){
  const u = document.getElementById('authUser');
  const p = document.getElementById('authPass');
  if(u) u.value='';
  if(p) p.value='';
}

function abrirModalAcceso(tab){
  _periodicoTabPendiente = tab || 'documento';
  const modal = document.getElementById('authModal');
  if(!modal){ // sin ventana de acceso no se abre el reporte
    showToast('No se pudo cargar la ventana de acceso.', true);
    return;
  }
  limpiarCamposAuth();
  mostrarErrorAuth('');
  modal.classList.add('show');
  const u = document.getElementById('authUser');
  if(u) setTimeout(()=>u.focus(), 60);
}

function cerrarModalAcceso(){
  const modal = document.getElementById('authModal');
  if(modal) modal.classList.remove('show');
  limpiarCamposAuth();
  mostrarErrorAuth('');
}

// Valida las credenciales; si son correctas abre el reporte, si no bloquea el acceso.
function validarAccesoPeriodico(){
  const usuario = (document.getElementById('authUser')?.value || '').trim();
  const clave   = document.getElementById('authPass')?.value || '';

  // Usuario sin distinguir mayúsculas; la contraseña sí es sensible a mayúsculas.
  if(usuario.toLowerCase() === PERIODICO_USUARIO && clave === PERIODICO_CLAVE){
    guardarAccesoPeriodico();
    const tab = _periodicoTabPendiente || 'documento';
    _periodicoTabPendiente = null;
    cerrarModalAcceso();
    mostrarReportePeriodico(tab);
    return;
  }

  // Credenciales incorrectas: aviso, campos limpios y la sección sigue bloqueada.
  mostrarErrorAuth('Usuario o contraseña incorrectos');
  limpiarCamposAuth();
  const u = document.getElementById('authUser');
  if(u) u.focus();
}

// Punto de entrada del botón: primero el control de acceso, luego el reporte.
function abrirReportePeriodico(tab){
  if(!periodicoAccesoAutorizado()){ abrirModalAcceso(tab); return; }
  mostrarReportePeriodico(tab);
}

// Despliegue real del reporte (solo se llama con el acceso ya autorizado).
function mostrarReportePeriodico(tab){
  if(!state.processed){ showToast('Primero calcula los indicadores.', true); return; }
  if(!state.processed.rows || !state.processed.rows.length){
    showToast('Aún no hay datos del Reporte de Dispensación para comparar entre cargues.', true);
    return;
  }
  periodicoTabActual = tab || 'documento';
  document.querySelectorAll('.periodico-tab-btn').forEach(b=>b.classList.toggle('active', b.dataset.tab===periodicoTabActual));
  document.getElementById('periodicModal').classList.add('show');
  populatePeriodicoFilters();
  renderReportePeriodico();
}
function cerrarReportePeriodico(){ document.getElementById('periodicModal').classList.remove('show'); }
document.getElementById('btnCerrarPeriodico').addEventListener('click', cerrarReportePeriodico);
document.getElementById('periodicModal').addEventListener('click', e=>{ if(e.target.id==='periodicModal') cerrarReportePeriodico(); });
document.querySelectorAll('[data-open-periodico]').forEach(btn=>{
  btn.addEventListener('click', ()=>abrirReportePeriodico(btn.dataset.openPeriodico));
});

/* Eventos de la ventana de acceso */
document.getElementById('authForm')?.addEventListener('submit', e=>{
  e.preventDefault();
  validarAccesoPeriodico();
});
document.getElementById('btnAuthCancelar')?.addEventListener('click', cerrarModalAcceso);
document.getElementById('btnCerrarAuth')?.addEventListener('click', cerrarModalAcceso);
document.getElementById('authModal')?.addEventListener('click', e=>{ if(e.target.id==='authModal') cerrarModalAcceso(); });
// Al escribir de nuevo se oculta el mensaje de error anterior.
['authUser','authPass'].forEach(id=>{
  document.getElementById(id)?.addEventListener('input', ()=>mostrarErrorAuth(''));
});
document.addEventListener('keydown', e=>{
  if(e.key==='Escape' && document.getElementById('authModal')?.classList.contains('show')) cerrarModalAcceso();
});
document.querySelectorAll('.periodico-tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    periodicoTabActual=btn.dataset.tab;
    document.querySelectorAll('.periodico-tab-btn').forEach(b=>b.classList.toggle('active', b===btn));
    renderReportePeriodico();
  });
});
function populatePeriodicoFilters(){
  const p=state.processed; if(!p) return;
  const selEG=document.getElementById('pfEpsGrupo');
  const selM=document.getElementById('pfModalidad');
  const selZ=document.getElementById('pfZona');
  const selB=document.getElementById('pfBodega');
  // Filtro por mes: se arman las opciones con los meses (fecha de dispensación) presentes
  // en el histórico activo, ordenados cronológicamente.
  const selMes=document.getElementById('pfMes');
  if(selMes){
    const activas=soloActivas(p.rows);
    const mesesSet=new Set();
    for(let i=0;i<activas.length;i++){ const k=mesKey(activas[i].fecha); if(k) mesesSet.add(k); }
    const meses=Array.from(mesesSet).sort();
    const prev=selMes.value;
    selMes.innerHTML='<option value="">Todos</option>'+meses.map(k=>`<option value="${k}">${escHtml(mesLabel(k))}</option>`).join('');
    selMes.value = meses.indexOf(prev)>=0 ? prev : '';
  }
  selEG.innerHTML='<option value="">Todas</option>'+p.epsGrupos.map(c=>`<option value="${c}">${c}</option>`).join('');
  selM.innerHTML='<option value="">Todas</option>'+p.contratos.map(c=>`<option value="${c}">${c}</option>`).join('');
  selZ.innerHTML='<option value="">Todas</option>'+p.zonas.map(z=>`<option value="${z}">${z}</option>`).join('');
  // Solo bodegas con dispensas activas: las INACTIVO no entran en este reporte.
  const bodegas=[...new Set(soloActivas(p.rows).map(r=>r.bodegaDetalle).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
  selB.innerHTML='<option value="">Todas</option>'+bodegas.map(b=>`<option value="${b}">${b}</option>`).join('');
}
['pfMes','pfEpsGrupo','pfModalidad','pfZona','pfBodega'].forEach(id=>{
  document.getElementById(id).addEventListener('change', renderReportePeriodico);
});

/* Filas del histórico que cumplen los filtros del modal periódico.
   Alcance: solo dispensas con Estado ACTIVO. Las marcadas como INACTIVO se excluyen,
   igual que en los indicadores de la pantalla principal, para que las cifras del
   Reporte Comparativo Periódico coincidan con el Indicador Soporte Evento.        */
function getPeriodicoFilteredRows(){
  const allRows = soloActivas((state.processed && state.processed.rows) || []);
  const selMes=document.getElementById('pfMes');
  const fMesRP = selMes ? selMes.value : '';
  const fEG = document.getElementById('pfEpsGrupo').value;
  const fMod = document.getElementById('pfModalidad').value;
  const fZ = document.getElementById('pfZona').value;
  const fBod = document.getElementById('pfBodega').value;
  return allRows.filter(r => {
    if(fMesRP && mesKey(r.fecha)!==fMesRP) return false;
    if(fEG && r.epsGrupo!==fEG) return false;
    if(fMod && r.contrato!==fMod) return false;
    if(fZ && r.zona!==fZ) return false;
    if(fBod && r.bodegaDetalle!==fBod) return false;
    return true;
  });
}
function renderReportePeriodico(){
  const filtered = getPeriodicoFilteredRows();
  const metrics = buildCorteMetrics(filtered);
  /* En la pestaña “Indicador Soporte Evento” los cortes se miden únicamente con las filas
     de dispensas de EVENTO que ya tienen TODAS sus líneas entregadas: un cargue que no
     trajo información de esas dispensas no debe abrir corte con cifras. */
  const baseCortes = periodicoTabActual==='soporte' ? filasSoporteEvento(filtered) : filtered;
  // Cortes con cargue real: los demás quedan en cero (“—”) y no repiten cifras.
  const cortesActivos = cortesConCargue(baseCortes);
  // Cargues por bodega: una bodega puede no tener movimiento en un corte que sí tuvo
  // cargue general; en ese caso sus celdas de ese corte quedan en “—”.
  const cargueBodega = cortesConCarguePorBodega(baseCortes);
  // Corte global elegido en los filtros: los cortes posteriores no se tienen en cuenta.
  const corteGlobalRP = getCorteGlobal();
  const fuera = c => c > corteGlobalRP;
  const activo = c => cortesActivos.has(c) && !fuera(c);
  const activoBod = (c, bodega) => { const s=cargueBodega.get(bodega); return !!s && s.has(c) && !fuera(c); };
  const DASH = '—';
  const cortesLabels={1:'Corte 1 (día 1-10)',2:'Corte 2 (día 11-20)',3:'Corte 3 (día 21-31)'};
  const labelEnt = periodicoTabActual==='documento' ? 'Entregadas' : periodicoTabActual==='linea' ? 'Entregadas' : 'Con soporte';
  const labelPend = periodicoTabActual==='documento' ? 'Pendientes' : periodicoTabActual==='linea' ? 'Pendientes' : 'Sin soporte';
  const fieldA = periodicoTabActual==='documento' ? 'docsEnt' : periodicoTabActual==='linea' ? 'lineasEnt' : 'eventoCon';
  const fieldB = periodicoTabActual==='documento' ? 'docsPend' : periodicoTabActual==='linea' ? 'lineasPend' : 'eventoSin';
  const fieldTot = periodicoTabActual==='documento' ? 'docsTotal' : periodicoTabActual==='linea' ? 'lineasTotal' : 'eventoTotal';
  const labelRec = periodicoTabActual==='soporte' ? 'Soportes recuperados' : (periodicoTabActual==='documento' ? 'Dispensas recuperadas' : 'Líneas recuperadas');
  const explicaRec = periodicoTabActual==='soporte'
    ? 'Este indicador solo tiene en cuenta <strong>dispensas de EVENTO con todas sus líneas entregadas</strong> (con o sin soporte); las dispensas de evento que aún tienen líneas pendientes no entran. Recuperado = dispensas de EVENTO ya entregadas por completo que venían con Soportes en 0 / “NO TIENE” y <strong>en un cargue posterior</strong> ya llegaron con soporte, por lo que cada corte refleja únicamente el cargue de soportes de esas dispensas. Si el soporte viene en el mismo cargue que el registro sin soporte no se cuenta (es la información de ese mismo momento); si llega en un cargue posterior sí se acredita, aunque los dos cargues sean del mismo día.'
    : (periodicoTabActual==='documento'
        ? 'Recuperado = dispensas que estaban pendientes y quedaron entregadas <strong>en un cargue posterior</strong>. No se cuenta si el pendiente y la entrega vienen del mismo cargue; sí se cuenta cuando la entrega llega en un cargue posterior, aunque sea del mismo día.'
        : 'Recuperado = líneas que estaban pendientes y quedaron entregadas <strong>en un cargue posterior</strong>. No se cuenta si el pendiente y la entrega vienen del mismo cargue; sí se cuenta cuando la entrega llega en un cargue posterior, aunque sea del mismo día.');
  const explicaCoincide = ' Estas cifras usan exactamente el mismo cálculo que el botón de descarga, por lo que el número de la columna “'+labelRec+'” coincide con la cantidad de filas del Excel.';

  // ---- helpers de lectura de métricas ----
  const findEntry=(corte,bodega)=>metrics[corte].find(x=>x.bodega===bodega);
  const valA=(corte,bodega)=>{ const e=findEntry(corte,bodega); return e?e[fieldA]:0; };
  const valB=(corte,bodega)=>{ const e=findEntry(corte,bodega); return e?e[fieldB]:0; };
  const valT=(corte,bodega)=>{ const e=findEntry(corte,bodega); return e?e[fieldTot]:0; };

  // ---- totales acumulados por corte (para los 3 gráficos) ----
  // Solo los cortes con dispensaciones tienen cifras; un corte sin dispensaciones queda en cero.
  const accA=[0,0,0,0], accB=[0,0,0,0];
  [0,1,2,3].forEach(c=>{
    if(c>0 && !activo(c)) return;
    metrics[c].forEach(t=>{ accA[c]+=t[fieldA]; accB[c]+=t[fieldB]; });
  });

  // ---- una sola tabla con los 3 cortes ----
  // Las columnas “totales” muestran el último estado con dispensaciones reales (no el corte 3 vacío).
  const corteFinal = corteVigenteHasta(cortesActivos, corteGlobalRP);
  /* Referencia "Anterior": se calcula BODEGA POR BODEGA, no con un único corte para
     toda la tabla. Antes se elegía un solo corte de referencia a partir de los totales:
     si otra bodega se había movido en el último cargue, la referencia quedaba en ese
     corte y las bodegas que se movieron antes aparecían como "sin cambio" al ver todas
     las bodegas, aunque al filtrarlas sí mostraban variación. Ahora, para cada bodega se
     retrocede hasta el último estado con cifras distintas a las actuales (incluida la
     línea base), de modo que la variación real se ve siempre, con o sin filtro. */
  const estadosPrevios = [0].concat([1,2,3].filter(c=>c<corteFinal && activo(c)));
  const etqCorto = c => c===0 ? 'base' : 'C'+c;
  const etqLargo = c => c===0 ? 'estado inicial (línea base)' : 'corte '+c;
  const refPrevBodega = (bodega) => {
    if(corteFinal===0 || !estadosPrevios.length) return null;
    const aNow=valA(corteFinal,bodega), bNow=valB(corteFinal,bodega);
    for(let i=estadosPrevios.length-1; i>=0; i--){
      const c=estadosPrevios[i];
      if(valA(c,bodega)!==aNow || valB(c,bodega)!==bNow) return c;
    }
    return estadosPrevios[estadosPrevios.length-1];
  };
  const notaPrevio = (corteFinal===0 || !estadosPrevios.length) ? ''
    : 'La columna <strong>Anterior</strong> se calcula por bodega: compara contra el último cargue en el que <strong>esa</strong> bodega tuvo cifras distintas (<strong>base</strong> = primer cargue, <strong>C1/C2/C3</strong> = corte), y esa referencia se indica en cada celda. Así la variación se ve igual con o sin filtro de bodega.';
  const bodegas=[...new Set([].concat(metrics[0],metrics[1],metrics[2],metrics[3]).map(t=>t.bodega))];
  /* Recuperadas: se toman de la MISMA función que alimenta las descargas de Excel
     (`recuperadasEnCortes`), de modo que el número de la tabla y el número de filas
     del archivo descargado siempre coincidan. Ya no se estima por diferencia de
     pendientes entre cortes, porque esa resta contaba también movimientos que no son
     entregas reales (por ejemplo, información del mismo día). */
  const tipoRec = periodicoTabActual==='soporte' ? 'soporte' : (periodicoTabActual==='documento' ? 'docs' : 'lineas');
  const mapRec = recuperadasPorBodega(filtered, corteFinal, tipoRec);
  const filas=bodegas.map(bodega=>{
    const total=valT(corteFinal,bodega);
    const entFinal=valA(corteFinal,bodega), pendFinal=valB(corteFinal,bodega);
    const cPrevB=refPrevBodega(bodega);
    const entPrev=cPrevB===null?null:valA(cPrevB,bodega);
    const pendPrev=cPrevB===null?null:valB(cPrevB,bodega);
    const base={ent:valA(0,bodega), pend:valB(0,bodega)};
    /* Un corte solo muestra cifras si ESTA bodega recibió cargue en ese corte: si el
       cargue del corte no trajo líneas de la bodega, no hay información nueva y la
       celda queda en “—” en lugar de repetir el estado acumulado. */
    const cortes=[1,2,3].map(c=>activoBod(c,bodega)
      ? {ent:valA(c,bodega), pend:valB(c,bodega), sin:false, fuera:false, sinBod:false}
      : {ent:0, pend:0, sin:!fuera(c), fuera:fuera(c), sinBod:!fuera(c)&&activo(c)});
    /* Se cuenta cada recuperación en el corte en que ocurrió, sin descartar cortes:
       así el total de la columna coincide exactamente con las filas del Excel. */
    const rec=(mapRec.get(bodega)||[0,0,0]).slice(0,3).map(v=>v||0);
    const recTotal=rec.reduce((a,b)=>a+b,0);
    return {bodega, total, entFinal, pendFinal, entPrev, pendPrev, refPrev:cPrevB, base, cortes, rec, recTotal, indice: total? pendFinal/total : null};
  }).filter(f=>f.total||f.entFinal||f.pendFinal||f.recTotal)
    .sort((a,b)=>{
      const ia=a.indice===null?-1:a.indice, ib=b.indice===null?-1:b.indice;
      if(ib!==ia) return ib-ia;
      if(b.pendFinal!==a.pendFinal) return b.pendFinal-a.pendFinal;
      return String(a.bodega).localeCompare(String(b.bodega),'es');
    });

  const tot={total:0, ent:0, pend:0, entPrev:0, pendPrev:0, c:[{ent:0,pend:0},{ent:0,pend:0},{ent:0,pend:0}], rec:[0,0,0], recTotal:0};
  let totBaseEnt=0, totBasePend=0;
  filas.forEach(f=>{ totBaseEnt+=f.base.ent; totBasePend+=f.base.pend; }); // base inicial (corte 0) de referencia
  filas.forEach(f=>{
    tot.total+=f.total; tot.ent+=f.entFinal; tot.pend+=f.pendFinal; tot.recTotal+=f.recTotal;
    /* Variación del TOTAL: solo aportan referencia anterior las bodegas que realmente
       registraron entregas/soportes nuevos (columna de recuperadas mayor que cero).
       Una bodega sin entregas reales aporta su valor actual como “anterior”, de modo que
       la diferencia del TOTAL refleja únicamente lo efectivamente entregado y coincide
       con el Excel de descarga (antes se sumaba la referencia de todas las bodegas y la
       diferencia salía inflada). */
    const aportaRef = f.recTotal>0 && f.refPrev!==null && f.refPrev!==undefined;
    tot.entPrev+=(aportaRef && f.entPrev!==null && f.entPrev!==undefined) ? f.entPrev : f.entFinal;
    tot.pendPrev+=(aportaRef && f.pendPrev!==null && f.pendPrev!==undefined) ? f.pendPrev : f.pendFinal;
    [0,1,2].forEach(i=>{ tot.rec[i]+=f.rec[i]; });
  });
  const hayPrev = filas.some(f=>f.recTotal>0 && f.refPrev!==null && f.refPrev!==undefined);
  /* Celda con el valor actual y, debajo en gris, el valor de referencia anterior, de qué
     cargue proviene esa referencia y la diferencia, para que la variación quede explícita. */
  const celdaAntPrev = (actual, previo, mejorSiSube, refTxt, refLong) => {
    if(previo===null || previo===undefined) return '<td>'+fmtInt(actual)+'</td>';
    const d = (actual||0)-(previo||0);
    const bueno = mejorSiSube ? d>0 : d<0;
    const color = d===0 ? '#9CA9B6' : (bueno ? '#1E8F5E' : '#C0392B');
    const delta = d===0
      ? '<span style="color:#9CA9B6;"> · sin cambio</span>'
      : '<span style="color:'+color+';"> · '+(d>0?'+':'')+fmtInt(d)+'</span>';
    const ref = refTxt ? '<span style="color:#B3BFCB;"> ('+refTxt+')</span>' : '';
    return '<td>'+fmtInt(actual)
      + '<span class="prev-val" title="Valor de esta bodega en el '+(refLong||'estado anterior')+' y diferencia frente al valor actual">Ant.: '+fmtInt(previo)+ref+delta+'</span>'
      + '</td>';
  };

  const dim='style="color:#9CA9B6;"';
  const tdSinCargue='<td '+dim+' title="Corte sin dispensaciones: no hubo dispensaciones en estas fechas">'+DASH+'</td>';
  const tdSinCargueBod='<td '+dim+' title="Esta bodega no tuvo movimientos (entrega ni dispensación) en este corte">'+DASH+'</td>';
  /* Un corte solo muestra cifras si en ese corte hubo ENTREGAS REALES para esa bodega,
     usando exactamente la misma validación del Excel de descarga (recuperadasEnCortes).
     Si la bodega no entregó nada en el corte, sus celdas quedan en “—” en lugar de
     repetir el acumulado: así la tabla nunca muestra números donde el Excel no trae filas. */
  const palabraEnt = periodicoTabActual==='soporte' ? 'soportes nuevos' : (periodicoTabActual==='documento' ? 'dispensas entregadas' : 'líneas entregadas');
  const tdSinEntregaBod='<td '+dim+' title="Esta bodega no registró '+palabraEnt+' en este corte (0 en '+labelRec+'): las celdas quedan en “—” para no repetir el acumulado. Coincide con el Excel de descarga.">'+DASH+'</td>';
  const tdSinEntregaTot='<td '+dim+' title="Ninguna bodega registró '+palabraEnt+' en este corte (0 en '+labelRec+')">'+DASH+'</td>';
  const tdFueraRP='<td style="color:#C3CCD6;" title="Corte posterior al corte global seleccionado en los filtros">'+DASH+'</td>';
  const tdSinCambioRP='<td '+dim+' title="Sin cambios frente al corte anterior: esta bodega no presentó movimientos nuevos en este corte">'+DASH+'</td>';
  // Solo se muestran cifras cuando el corte trae cambios reales frente al corte previo mostrado.
  const marcaSinCambio = (arr, base) => {
    let ref = base || null;
    return arr.map(cc=>{
      if(cc.fuera || cc.sin) return Object.assign({}, cc, {igual:false});
      const igual = !!ref && ref.ent===cc.ent && ref.pend===cc.pend;
      ref = cc;
      return Object.assign({}, cc, {igual:igual});
    });
  };
  const filasMk = filas.map(f=>marcaSinCambio(f.cortes, f.base));
  /* La fila TOTAL de cada corte suma ÚNICAMENTE las celdas que sí quedan visibles en la
     tabla, es decir las bodegas con entregas reales y con cambio en ese corte. Antes se
     usaba el acumulado general del corte (todas las bodegas), por lo que el TOTAL mostraba
     cifras muy superiores a lo realmente entregado en el periodo. */
  [0,1,2].forEach(i=>{
    let e=0, p=0;
    filas.forEach((f,fi)=>{
      const cc=filasMk[fi][i];
      if(cc.fuera || cc.sin) return;   // corte fuera del filtro o bodega sin dispensaciones
      if(!f.rec[i]) return;            // la bodega no entregó nada en el corte
      if(cc.igual) return;             // sin cambios frente al corte anterior
      e+=cc.ent; p+=cc.pend;
    });
    tot.c[i].ent=e; tot.c[i].pend=p;
  });
  // Un corte solo se rotula con cifras si al menos una bodega cambió en ese corte.
  const rpCambio = [0,1,2].map(i=>filasMk.some((mk,fi)=>!mk[i].fuera && !mk[i].sin && !mk[i].igual && !!filas[fi].rec[i]));
  let cuerpo=filas.map((f,fi)=>{
    const cortesMk = filasMk[fi];
    let tds='<td class="txt">'+escHtml(f.bodega)+'</td>'
      +'<td>'+fmtInt(f.total)+'</td>'
      +celdaAntPrev(f.entFinal, f.entPrev, true, f.refPrev===null||f.refPrev===undefined?'':etqCorto(f.refPrev), f.refPrev===null||f.refPrev===undefined?'':etqLargo(f.refPrev))
      +celdaAntPrev(f.pendFinal, f.pendPrev, false, f.refPrev===null||f.refPrev===undefined?'':etqCorto(f.refPrev), f.refPrev===null||f.refPrev===undefined?'':etqLargo(f.refPrev))
      +'<td class="'+effClass(f.indice===null?null:1-f.indice)+'">'+fmtPct(f.indice)+'</td>';
    [0,1,2].forEach(i=>{
      if(cortesMk[i].fuera){ tds+=tdFueraRP+tdFueraRP; return; }
      if(cortesMk[i].sin){ tds+=(cortesMk[i].sinBod?tdSinCargueBod+tdSinCargueBod:tdSinCargue+tdSinCargue); return; }
      if(!f.rec[i]){ tds+=tdSinEntregaBod+tdSinEntregaBod; return; }
      if(cortesMk[i].igual){ tds+=tdSinCambioRP+tdSinCambioRP; return; }
      tds+='<td>'+fmtInt(cortesMk[i].ent)+'</td><td>'+fmtInt(cortesMk[i].pend)+'</td>';
    });
    tds+='<td>'+fmtInt(f.recTotal)+'</td>';
    return '<tr>'+tds+'</tr>';
  }).join('');
  let filaTotal='<tr class="total-row"><td class="txt">TOTAL</td>'
    +'<td>'+fmtInt(tot.total)+'</td>'
    +celdaAntPrev(tot.ent, hayPrev?tot.entPrev:null, true, 'ref. por bodega', 'estado anterior de cada bodega')
    +celdaAntPrev(tot.pend, hayPrev?tot.pendPrev:null, false, 'ref. por bodega', 'estado anterior de cada bodega')
    +'<td>'+fmtPct(tot.total?tot.pend/tot.total:null)+'</td>';
  /* La fila TOTAL replica exactamente el criterio de las celdas visibles: solo muestra
     cifras cuando hubo entregas reales y cambios en el corte; en caso contrario queda en
     “—” igual que las bodegas. */
  [0,1,2].forEach(i=>{
    if(fuera(i+1)){ filaTotal+=tdFueraRP+tdFueraRP; return; }
    if(!activo(i+1)){ filaTotal+=tdSinCargue+tdSinCargue; return; }
    if(!tot.rec[i]){ filaTotal+=tdSinEntregaTot+tdSinEntregaTot; return; }
    if(!rpCambio[i]){ filaTotal+=tdSinCambioRP+tdSinCambioRP; return; }
    filaTotal+='<td>'+fmtInt(tot.c[i].ent)+'</td><td>'+fmtInt(tot.c[i].pend)+'</td>';
  });
  filaTotal+='<td>'+fmtInt(tot.recTotal)+'</td></tr>';

  const etiqCorte = (c, txt) => fuera(c)
    ? '<th colspan="2" style="color:#C3CCD6;">'+txt+' <span style="font-weight:600;">· fuera del corte</span></th>'
    : (activo(c) && !tot.rec[c-1])
      ? '<th colspan="2" style="color:#9CA9B6;">'+txt+' <span style="font-weight:600;">· sin entregas</span></th>'
      : (activo(c) && !rpCambio[c-1])
        ? '<th colspan="2" style="color:#9CA9B6;">'+txt+' <span style="font-weight:600;">· sin cambios</span></th>'
        : '<th colspan="2">'+txt+(activo(c)?'':' <span style="color:#9CA9B6;font-weight:600;">· sin dispensaciones</span>')+'</th>';
  let ths1='<tr><th rowspan="2">Bodega</th><th rowspan="2">Total</th>'
    +'<th rowspan="2">'+labelEnt+' totales<br><span style="font-weight:600;color:#9CA9B6;font-size:10.5px;">Actual / Anterior (dif.)</span></th>'
    +'<th rowspan="2">'+labelPend+' totales<br><span style="font-weight:600;color:#9CA9B6;font-size:10.5px;">Actual / Anterior (dif.)</span></th>'
    +'<th rowspan="2">Índice de Pendientes</th>'
    +etiqCorte(1,'Corte 1 (1-10)')
    +etiqCorte(2,'Corte 2 (11-20)')
    +etiqCorte(3,'Corte 3 (21-31)')
    +'<th rowspan="2">'+labelRec+'</th></tr>';
  const subCorte = (c) => fuera(c)
    ? '<th style="color:#C3CCD6;">Fuera del corte</th><th style="color:#C3CCD6;">Fuera del corte</th>'
    : !activo(c)
      ? '<th style="color:#9CA9B6;">Sin dispensaciones</th><th style="color:#9CA9B6;">Sin dispensaciones</th>'
      : !tot.rec[c-1]
        ? '<th style="color:#9CA9B6;">Sin entregas</th><th style="color:#9CA9B6;">Sin entregas</th>'
        : !rpCambio[c-1]
          ? '<th style="color:#9CA9B6;">Sin cambios</th><th style="color:#9CA9B6;">Sin cambios</th>'
          : '<th>'+labelEnt+'</th><th>'+labelPend+'</th>';
  let ths2='<tr>'+subCorte(1)+subCorte(2)+subCorte(3)+'</tr>';

  // ---- 3 gráficos, uno por corte (acumulado al cierre de cada corte) ----
  // Un corte sin dispensaciones se muestra vacío: no hereda ni repite las cifras del corte anterior.
  let html='<div class="corte-grid">';
  [1,2,3].forEach(corte=>{
    if(fuera(corte)){
      html+='<div class="corte-card">'
        +'<h4 style="color:#C3CCD6;">'+cortesLabels[corte]+'</h4>'
        +'<svg width="150" height="150" viewBox="0 0 200 200" id="periodicoDonut'+corte+'"></svg>'
        +'<div class="legend" style="margin:10px 0 8px;">'
        +'<div class="item" style="color:#C3CCD6;">'+labelEnt+'<span class="val">'+DASH+'</span></div>'
        +'<div class="item" style="color:#C3CCD6;">'+labelPend+'<span class="val">'+DASH+'</span></div>'
        +'<div class="item" style="color:#C3CCD6;">'+labelRec+' en el corte<span class="val">'+DASH+'</span></div>'
        +'</div>'
        +'<p style="margin:0;font-size:11.5px;line-height:1.45;color:#C3CCD6;">Fuera del corte global seleccionado en los filtros (corte '+corteGlobalRP+'). Cambia el corte en los filtros para incluirlo.</p>'
        +'</div>';
      return;
    }
    if(!activo(corte)){
      html+='<div class="corte-card">'
        +'<h4 style="color:#9CA9B6;">'+cortesLabels[corte]+'</h4>'
        +'<svg width="150" height="150" viewBox="0 0 200 200" id="periodicoDonut'+corte+'"></svg>'
        +'<div class="legend" style="margin:10px 0 8px;">'
        +'<div class="item" style="color:#9CA9B6;">'+labelEnt+'<span class="val">'+DASH+'</span></div>'
        +'<div class="item" style="color:#9CA9B6;">'+labelPend+'<span class="val">'+DASH+'</span></div>'
        +'<div class="item" style="color:#9CA9B6;">'+labelRec+' en el corte<span class="val">'+DASH+'</span></div>'
        +'</div>'
        +'<p style="margin:0;font-size:11.5px;line-height:1.45;color:#9CA9B6;">Sin dispensaciones en estas fechas. El corte queda en cero y se actualizará cuando se registren dispensaciones.</p>'
        +'</div>';
      return;
    }
    const a=accA[corte], b=accB[corte];
    const cPrev=corteVigenteHasta(cortesActivos, corte-1);
    const aPrev=accA[cPrev], bPrev=accB[cPrev];
    const dA=a-accA[cPrev], dB=b-accB[cPrev];
    const sinCambio = dA===0 && dB===0;
    const refPrev = cPrev===0 ? 'al estado inicial (línea base)' : 'al corte '+cPrev;
    const nota = sinCambio
      ? 'Sin variación frente '+refPrev+': este corte no trajo cambios.'
      : 'Variación frente '+refPrev+': '+labelEnt+' '+(dA>=0?'+':'')+fmtInt(dA)+' · '+labelPend+' '+(dB>=0?'+':'')+fmtInt(dB)+'.';
    html+='<div class="corte-card">'
      +'<h4>'+cortesLabels[corte]+'</h4>'
      +'<svg width="150" height="150" viewBox="0 0 200 200" id="periodicoDonut'+corte+'"></svg>'
      +'<div class="legend" style="margin:10px 0 8px;">'
      +'<div class="item"><span class="sw" style="background:#1E8F5E;"></span>'+labelEnt+' totales<span class="val">'+fmtInt(a)+' <span class="prev-val-inline" title="Valor '+refPrev+'">('+fmtInt(aPrev)+')</span></span></div>'
      +'<div class="item"><span class="sw" style="background:#D98A2B;"></span>'+labelPend+' totales<span class="val">'+fmtInt(b)+' <span class="prev-val-inline" title="Valor '+refPrev+'">('+fmtInt(bPrev)+')</span></span></div>'
      +'<div class="item"><span class="sw" style="background:#063C6B;"></span>'+labelRec+' en el corte<span class="val">'+fmtInt(tot.rec[corte-1])+'</span></div>'
      +'</div>'
      +'<p style="margin:0;font-size:11.5px;line-height:1.45;color:'+(sinCambio?'#9CA9B6':'var(--ink-soft)')+';">'+nota+'</p>'
      +'</div>';
  });
  html+='</div>';

  html+='<div class="corte-card" style="margin-top:14px;">'
    +'<h4>Comparativo por bodega — acumulado en los 3 cortes</h4>'
    +'<p style="margin:0 0 10px;color:var(--ink-soft);font-size:12px;line-height:1.5;">Cada corte muestra el estado ACUMULADO al cierre de ese corte, pero <strong>solo si esa bodega registró movimiento real en ese corte</strong>: si no hubo cargue de la bodega o no hubo ninguna entrega/soporte nuevo (columna “'+labelRec+'” en 0), sus celdas quedan en “—” y no repiten las cifras del corte anterior. Así las celdas con números coinciden siempre con lo que trae el Excel de descarga. Se respeta el <strong>corte global de los filtros (corte '+corteGlobalRP+')</strong>: los cortes posteriores aparecen como “fuera del corte”. Las columnas de totales corresponden al último corte con cargue incluido. Si una bodega <strong>no presentó cambios frente al corte anterior</strong>, ese corte se muestra como “—” en lugar de repetir las mismas cifras. '+notaPrevio+' '+explicaRec+explicaCoincide+'</p>'
    +'<div class="table-wrap" style="max-height:min(70vh,760px);">'
    +'<table class="data" id="tblPeriodico"><thead>'+ths1+ths2+'</thead>'
    +'<tbody>'+(cuerpo ? cuerpo+filaTotal : '<tr><td colspan="12" class="txt" style="text-align:center;color:#9CA9B6;">Sin datos para los filtros seleccionados</td></tr>')+'</tbody></table>'
    +'</div></div>';

  document.getElementById('periodicoContent').innerHTML=html;

  // ---- pintar los 3 donuts (uno por corte) ----
  [1,2,3].forEach(corte=>{
    if(!activo(corte)){
      drawDonut('periodicoDonut'+corte, [{label:'',value:1,color:'#E8EEF4'}], DASH, fuera(corte)?'#C3CCD6':'#9CA9B6');
      return;
    }
    const a=accA[corte], b=accB[corte];
    drawDonut('periodicoDonut'+corte, [{label:'',value:a,color:'#1E8F5E'},{label:'',value:b,color:'#D98A2B'}], fmtPct(a+b?a/(a+b):null));
  });
}

/* ---- Descargas Excel del Reporte Comparativo Periódico -------------------
   Respetan los filtros del modal y el corte global del tablero: se toma el
   estado ACUMULADO al cierre del último corte con cargue incluido.
   Para las descargas de soporte de EVENTO el último corte con cargue se mide solo
   con las dispensas de evento totalmente entregadas, igual que la tabla del modal,
   para que el corte del Excel sea el mismo que el de la pantalla.            */
function periodicoContextoExport(soloSoporteEvento){
  if(!state.processed || !state.processed.rows || !state.processed.rows.length){
    showToast('Primero calcula los indicadores.', true); return null;
  }
  const filtered = getPeriodicoFilteredRows();
  if(!filtered.length){ showToast('No hay datos para los filtros seleccionados.', true); return null; }
  const corteGlobal = getCorteGlobal();
  const baseCortes = soloSoporteEvento ? filasSoporteEvento(filtered) : filtered;
  const corteFinal = corteVigenteHasta(cortesConCargue(baseCortes), corteGlobal);
  const estado = calcularEstadoHastaCorte(filtered, corteFinal);
  const etqCorte = corteFinal===0 ? 'linea base' : 'corte '+corteFinal;
  return {filtered, corteFinal, corteGlobal, estado, etqCorte};
}
function periodicoFechaTxt(f){
  const d = f instanceof Date ? f : (f ? new Date(f) : null);
  return (d && !isNaN(d)) ? d.toISOString().slice(0,10) : '';
}
// 1) Dispensas (documentos) que siguen NO entregadas al cierre del corte.
document.getElementById('btnPeriodicoDocsPend').addEventListener('click', ()=>{
  const ctx=periodicoContextoExport(); if(!ctx) return;
  const {estado, corteFinal, etqCorte} = ctx;
  const porDoc=new Map();
  estado.snap.forEach(r=>{
    if(!r.documento) return;
    const kd=claveDocBodega(r);                 // dispensa = documento + bodega
    if(estado.docPend.get(kd)!==true) return;
    if(!porDoc.has(kd)) porDoc.set(kd, {
      documento:r.documento, zona:r.zona, bodega:r.bodegaDetalle, eps:r.eps, epsGrupo:r.epsGrupo,
      contrato:r.contrato, fecha:r.fecha, lineas:0, pend:0, unidadesPend:0, soporte:r.tieneSoportes
    });
    const g=porDoc.get(kd);
    g.lineas++;
    if(estado.lineaPend.get(r.idx)==='SI'){ g.pend++; g.unidadesPend+=Math.abs(r.diferencia||0); }
  });
  const filas=[...porDoc.values()]
    .sort((a,b)=>(b.pend-a.pend)||String(a.bodega).localeCompare(String(b.bodega),'es'))
    .map(g=>({
      'Zona':g.zona, 'Bodega Detalle':g.bodega, 'Documento':g.documento,
      'EPS':g.eps, 'EPS Consolidada':g.epsGrupo, 'Modalidad':g.contrato,
      'Fecha Dispensación':periodicoFechaTxt(g.fecha),
      'Líneas de la dispensa':g.lineas, 'Líneas pendientes':g.pend,
      'Unidades pendientes':g.unidadesPend, 'Soportes':g.soporte,
      'Estado al':etqCorte
    }));
  if(!filas.length){ showToast('No hay dispensas no entregadas con los filtros y el corte actuales.', true); return; }
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), 'Dispensas no entregadas');
  XLSX.writeFile(wb, 'Periodico_Dispensas_No_Entregadas_corte'+corteFinal+'_'+new Date().toISOString().slice(0,10)+'.xlsx');
  showToast('Excel exportado: '+fmtInt(filas.length)+' dispensas no entregadas ('+etqCorte+').');
});
// 2) Líneas pendientes al cierre del corte.
document.getElementById('btnPeriodicoLineasPend').addEventListener('click', ()=>{
  const ctx=periodicoContextoExport(); if(!ctx) return;
  const {estado, corteFinal, etqCorte} = ctx;
  const filas=estado.snap.filter(r=>estado.lineaPend.get(r.idx)==='SI')
    .sort((a,b)=>String(a.bodegaDetalle+a.documento).localeCompare(String(b.bodegaDetalle+b.documento),'es'))
    .map(r=>({
      'Zona':r.zona, 'Bodega Detalle':r.bodegaDetalle, 'Documento':r.documento,
      'EPS':r.eps, 'EPS Consolidada':r.epsGrupo, 'Modalidad':r.contrato,
      'Fecha Dispensación':periodicoFechaTxt(r.fecha),
      'Código Artículo':r.codigoArticulo,
      'Descripción':String(r.descripcionDci||'').trim() || String(r.descripcionReporte||'').trim(),
      'Molécula':r.moleculaPareto,
      'Cantidad Autorizada':r.cantidadAutorizada, 'Unidades Entregadas':r.unidades,
      'Diferencia':r.diferencia, 'Cantidad Pendiente':Math.abs(r.diferencia||0),
      'Existencia en el Punto':r.existenciaPunto, 'Existencia Bodega Principal':r.existenciaBodega,
      'Soportes':r.tieneSoportes, 'Estado al':etqCorte
    }));
  if(!filas.length){ showToast('No hay líneas pendientes con los filtros y el corte actuales.', true); return; }
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), 'Líneas pendientes');
  XLSX.writeFile(wb, 'Periodico_Lineas_Pendientes_corte'+corteFinal+'_'+new Date().toISOString().slice(0,10)+'.xlsx');
  showToast('Excel exportado: '+fmtInt(filas.length)+' líneas pendientes ('+etqCorte+').');
});
// 3) Dispensas de EVENTO ya entregadas por completo que al cierre del corte siguen sin soporte.
document.getElementById('btnPeriodicoEventoSinSop').addEventListener('click', ()=>{
  const ctx=periodicoContextoExport(true); if(!ctx) return;
  const {filtered, corteFinal, etqCorte} = ctx;
  // Mismo universo del indicador: solo dispensas de evento con TODAS sus líneas entregadas.
  const eventoOk=clavesEventoEntregadas(filtered);
  const conSoporte=new Set(), info=new Map();
  filtered.forEach(r=>{
    if(r.contrato!=='EVENTO' || !r.documento) return;
    const kd=claveDocBodega(r);
    if(!eventoOk.has(kd)) return;
    if(tieneSoporteHastaCorte(r, corteFinal)) conSoporte.add(kd);
    if(!info.has(kd) || esVersionPosterior(r, info.get(kd))) info.set(kd, r);
  });
  const filas=[...info.entries()].filter(([kd])=>!conSoporte.has(kd)).map(([,r])=>r)
    .sort((a,b)=>String(a.bodegaDetalle+a.documento).localeCompare(String(b.bodegaDetalle+b.documento),'es'))
    .map(r=>({
      'Zona':r.zona, 'Bodega Detalle':r.bodegaDetalle, 'Documento':r.documento,
      'EPS':r.eps, 'EPS Consolidada':r.epsGrupo, 'Modalidad':r.contrato,
      'Fecha Dispensación':periodicoFechaTxt(r.fecha),
      'Entrega de la dispensa':'Todas las líneas entregadas',
      'Soportes':r.tieneSoportes,
      // Dos ejes: la dispensación fecha el origen; el cargue fecha la entrega/soporte.
      'Fecha Dispensación del último registro':diaDispensacion(r),
      'Fecha de cargue del último registro':diaCargue(r),
      'Estado al':etqCorte
    }));
  if(!filas.length){ showToast('No hay dispensas de evento entregadas y sin soporte con los filtros y el corte actuales.', true); return; }
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), 'Evento sin soporte');
  XLSX.writeFile(wb, 'Periodico_Evento_Entregadas_Sin_Soporte_corte'+corteFinal+'_'+new Date().toISOString().slice(0,10)+'.xlsx');
  showToast('Excel exportado: '+fmtInt(filas.length)+' dispensas de evento entregadas sin soporte ('+etqCorte+').');
});
/* 4) Descarga de lo RECUPERADO durante los cortes. No exporta todo lo que llega
      cumplido en los cargues: solo lo que CAMBIÓ de estado frente a la línea base
      (primer cargue de cada línea) y quedó cumplido al cierre del corte.
      - docs    : dispensas que estaban pendientes y ya quedaron entregadas
      - lineas  : líneas que estaban pendientes y ya quedaron entregadas
      - soporte : dispensas de evento que no tenían soporte y ya lo tienen        */
document.getElementById('btnPeriodicoEntregadas').addEventListener('click', ()=>{
  const tipo=(document.getElementById('pfEntregadasTipo')||{}).value || 'docs';
  // Para soporte de EVENTO el corte se mide con las dispensas ya entregadas por completo.
  const ctx=periodicoContextoExport(tipo==='soporte'); if(!ctx) return;
  const {filtered, corteFinal, etqCorte} = ctx;
  if(corteFinal===0){
    showToast('Aún no hay cargues en los cortes: no hay recuperaciones que descargar.', true); return;
  }
  // Las recuperaciones se calculan con la MISMA función que alimenta la tabla del
  // modal, para que el número mostrado y las filas descargadas coincidan siempre.
  const etqRec = c => 'corte '+c;
  let filas=[], hoja='', archivo='', etqMsg='';

  if(tipo==='lineas'){
    hoja='Líneas recuperadas'; archivo='Periodico_Lineas_Entregadas_Recuperadas';
    etqMsg='líneas que pasaron de pendientes a entregadas en un cargue posterior';
    const out=recuperadasEnCortes(filtered, corteFinal, 'lineas');
    filas=out
      .sort((a,b)=>(a.corteRec-b.corteRec)||String(a.r.bodegaDetalle+a.r.documento).localeCompare(String(b.r.bodegaDetalle+b.r.documento),'es'))
      .map(({r, rb, corteRec})=>({
        'Zona':r.zona, 'Bodega Detalle':r.bodegaDetalle, 'Documento':r.documento,
        'EPS':r.eps, 'EPS Consolidada':r.epsGrupo, 'Modalidad':r.contrato,
        'Fecha Dispensación':periodicoFechaTxt(r.fecha),
        'Código Artículo':r.codigoArticulo,
        'Descripción':String(r.descripcionDci||'').trim() || String(r.descripcionReporte||'').trim(),
        'Molécula':r.moleculaPareto,
        'Cantidad Autorizada':r.cantidadAutorizada,
        'Cantidad pendiente inicial':rb?Math.abs(rb.diferencia||0):'',
        'Unidades Entregadas':r.unidades, 'Diferencia':r.diferencia,
        'Recuperada en':etqRec(corteRec),
        /* La FECHA DISPENSACIÓN fecha el pendiente (mes/corte de origen); la ENTREGA se
           fecha con el CARGUE en que la línea volvió a subirse ya entregada. */
        'Fecha Dispensación del pendiente':diaDispensacion(rb),
        'Fecha de cargue de la entrega':diaCargue(r),
        'Soportes':r.tieneSoportes, 'Estado al':etqCorte
      }));
  } else if(tipo==='soporte'){
    hoja='Soportes recuperados'; archivo='Periodico_Evento_Soporte_Recuperado';
    etqMsg='dispensas de evento que cargaron el soporte en un cargue posterior';
    // El soporte solo se acredita como recuperado si llegó en un CARGUE POSTERIOR al del
    // registro que estaba sin soporte (misma regla que usa la tabla del modal).
    const out=recuperadasEnCortes(filtered, corteFinal, 'soporte');
    filas=out
      .sort((a,b)=>(a.corteRec-b.corteRec)||String(a.r.bodegaDetalle+a.r.documento).localeCompare(String(b.r.bodegaDetalle+b.r.documento),'es'))
      .map(({r, corteRec, dSop, dSin, dDisp})=>({
        'Zona':r.zona, 'Bodega Detalle':r.bodegaDetalle, 'Documento':r.documento,
        'EPS':r.eps, 'EPS Consolidada':r.epsGrupo, 'Modalidad':r.contrato,
        'Fecha Dispensación':periodicoFechaTxt(r.fecha),
        'Soportes':r.tieneSoportes,
        'Soporte acreditado en':etqRec(corteRec),
        /* La dispensación fecha el origen; el soporte se fecha con el CARGUE. */
        'Fecha Dispensación (origen)':dDisp||diaDispensacion(r),
        'Fecha de cargue sin soporte':dSin,
        'Fecha de cargue con soporte':dSop,
        'Estado al':etqCorte
      }));
  } else {
    hoja='Dispensas recuperadas'; archivo='Periodico_Dispensas_Entregadas_Recuperadas';
    etqMsg='dispensas que pasaron de pendientes a entregadas en un cargue posterior';
    // Detalle de cada dispensa recuperada (misma regla que usa la tabla del modal).
    const out=recuperadasEnCortes(filtered, corteFinal, 'docs');
    filas=out
      .sort((a,b)=>(a.corteRec-b.corteRec)||String(a.g.bodega+a.g.documento).localeCompare(String(b.g.bodega+b.g.documento),'es'))
      .map(({g, corteRec, pendBase, recLineas})=>({
        'Zona':g.zona, 'Bodega Detalle':g.bodega, 'Documento':g.documento,
        'EPS':g.eps, 'EPS Consolidada':g.epsGrupo, 'Modalidad':g.contrato,
        'Fecha Dispensación':periodicoFechaTxt(g.fecha),
        'Líneas de la dispensa':g.lineas,
        'Líneas pendientes al inicio':pendBase||0,
        'Líneas entregadas en un cargue posterior':recLineas||0,
        'Unidades entregadas':g.unidades,
        'Entregada en':etqRec(corteRec),
        // La ENTREGA se fecha con el CARGUE en que la dispensa volvió a subirse cumpliendo.
        'Fecha de cargue de la entrega':g.dispEntrega||'',
        'Soportes':g.soporte, 'Estado al':etqCorte
      }));
  }

  if(!filas.length){ showToast('No hay '+etqMsg+' con los filtros y el corte actuales.', true); return; }
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), hoja);
  XLSX.writeFile(wb, archivo+'_corte'+corteFinal+'_'+new Date().toISOString().slice(0,10)+'.xlsx');
  showToast('Excel exportado: '+fmtInt(filas.length)+' '+etqMsg+' ('+etqCorte+').');
});

/* =========================================================================
   Init del visor: lee lo que ya está guardado y escucha cambios de la nube.
   ========================================================================= */
(async function init(){
  restoreDriveFileLists();
  await refreshStatusFromDB();
  await loadDriveOnlyFromLocal();
  // Si este navegador ya abrio un paquete del panel, se recupera tal cual.
  const hayPaquete = await paqueteCargarGuardado();
  if(hayPaquete){ try{ stopFirestoreListener(); }catch(e){} }
  updateTopStatus();
  if(!hayPaquete) startFirestoreListener();
  showEmptyResults();
  const hayDatos = Object.keys(state.loaded).length>0;
  if(hayDatos){
    try{ await calcularIndicadores(); }catch(e){ console.warn(e); }
  }
  if(typeof ensureFacturasData==='function'){
    await ensureFacturasData();
    if(typeof renderInfoPorFactura==='function') renderInfoPorFactura();
  }
})();
