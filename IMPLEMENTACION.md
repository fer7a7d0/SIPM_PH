# Implementacion - Control de Produccion de Cilindros

## 1) Archivos del proyecto

1. index.html
2. styles.css
3. app.js
4. Code.gs
5. IMPLEMENTACION.md

## 2) Arquitectura del sistema

Operador
-> Web App (HTML, CSS, JS)
-> API Google Apps Script
-> Google Sheets

Persistencia doble:
1. Google Sheets (base principal)
2. Descarga local CSV desde la Web App

## 3) Estructura de Google Sheets

Crear un Google Sheets y vincularlo al proyecto Apps Script.

### Hoja: Produccion
Encabezados exactos:

1. id_registro
2. fecha
3. hora
4. operador
5. turno
6. actividad
7. cantidad
8. observaciones
9. usuario_captura
10. timestamp_servidor
11. clave_duplicado
12. origen_dispositivo
13. estado_registro

### Hoja: Operadores
Encabezados exactos:

1. id_operador
2. nombre_operador
3. activo
4. turno_preferente
5. fecha_alta
6. fecha_baja
7. observaciones

### Hoja: Dashboard
Encabezados exactos:

1. fecha
2. total_dia
3. total_desvalvulado
4. total_ph
5. total_lavado
6. total_valvulado
7. total_pintura
8. total_reparaciones_minimas
9. top_operador_1
10. top_operador_2
11. top_operador_3
12. total_matutino
13. total_vespertino
14. total_nocturno
15. ultima_actualizacion

### Hoja: Configuracion
Encabezados exactos:

1. clave
2. valor
3. descripcion
4. activo

El script crea automaticamente hojas y encabezados si no existen.

## 4) Despliegue backend (Apps Script)

1. En Google Sheets, abrir Extensiones > Apps Script.
2. Pegar el contenido de Code.gs.
3. Guardar proyecto.
4. Ejecutar manualmente initializeSystem una vez (aceptar permisos).
5. Ir a Implementar > Nueva implementacion.
6. Tipo: Aplicacion web.
7. Ejecutar como: tu cuenta.
8. Acceso: Cualquiera con el enlace (o restringido segun politica interna).
9. Copiar URL de la Web App desplegada.

## 5) Configuracion frontend

1. Abrir app.js.
2. Reemplazar API_BASE_URL por la URL de Apps Script.
3. Abrir index.html en navegador o publicar en hosting interno.

## 6) Flujo de captura

1. Operador selecciona operador, turno, actividad.
2. Ingresa cantidad y observaciones.
3. Ingresa usuario que captura.
4. Presiona Guardar.
5. Sistema valida y guarda.
6. Se muestra: Registro guardado correctamente.
7. Boton Descargar CSV genera respaldo local.

## 7) Validaciones implementadas

1. Operador obligatorio.
2. Turno obligatorio y valido.
3. Actividad obligatoria y valida.
4. Cantidad obligatoria, positiva y entera.
5. Cantidad maxima configurable.
6. Usuario que captura obligatorio.
7. Bloqueo de duplicados por ventana de tiempo.

## 8) Dashboard gerencial incluido

1. Produccion total del dia.
2. Produccion por actividad.
3. Produccion por operador (ranking).
4. Produccion por turno.

## 9) Parametros configurables

En la hoja Configuracion:

1. DUPLICADO_VENTANA_SEGUNDOS
2. MAX_CANTIDAD_POR_REGISTRO
3. ZONA_HORARIA
4. APP_NOMBRE
5. EMPRESA_NOMBRE
6. VERSION_APP

## 10) Escalabilidad futura (ya considerada)

La arquitectura esta preparada para agregar:

1. Login y permisos
2. Supervisores
3. Evidencia fotografica
4. Firma digital
5. Escaneo QR
6. Lotes y trazabilidad
7. Rechazos y calidad
8. PDF y correo
9. KPI y OEE
10. Productividad por estacion

## 11) Recomendaciones de operacion

1. Mantener catalogo Operadores actualizado (activo = SI/NO).
2. Revisar diariamente hoja Dashboard.
3. Respaldar libro Google Sheets con versionado.
4. Definir propietario tecnico del Apps Script.
5. Documentar cambios de configuracion en una bitacora.
