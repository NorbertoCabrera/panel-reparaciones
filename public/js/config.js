// ============================================================
//  CONFIGURACIÓN — editá este archivo para adaptar el panel
// ============================================================

export const APP_NOMBRE = 'Panel de Reparaciones';

// Pegá acá la configuración de tu app web de Firebase
// (Consola de Firebase → Configuración del proyecto → Tus apps → SDK config).
// Mientras apiKey diga "REEMPLAZAR", el panel funciona en MODO DEMO
// con datos de prueba guardados solo en este navegador.
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAfTpNxVvGS_mqFFHjPQMSu60E8aP40iCE',
  authDomain: 'panel-reparaciones-img.firebaseapp.com',
  projectId: 'panel-reparaciones-img',
  storageBucket: 'panel-reparaciones-img.firebasestorage.app',
  messagingSenderId: '1028221035013',
  appId: '1:1028221035013:web:cc25d5948ae9661f9d726c',
};

// Cuentas de Google que siempre son Administrador.
// Debe coincidir con la lista ADMINS de firestore.rules.
export const ADMIN_EMAILS = ['norberto.cabrera.a@gmail.com'];

// Estados de reparación, en el orden del flujo de trabajo.
export const ESTADOS = [
  { id: 'ingresado',      nombre: 'Ingresado',            icono: '📥', color: '#64748b' },
  { id: 'diagnostico',    nombre: 'En diagnóstico',       icono: '🔍', color: '#8b5cf6' },
  { id: 'aprobacion',     nombre: 'Esperando aprobación', icono: '⏳', color: '#eab308' },
  { id: 'repuestos',      nombre: 'Esperando repuestos',  icono: '📦', color: '#f97316' },
  { id: 'reparacion',     nombre: 'En reparación',        icono: '🔧', color: '#3b82f6' },
  { id: 'pruebas',        nombre: 'En pruebas',           icono: '🧪', color: '#06b6d4' },
  { id: 'listo',          nombre: 'Listo para entregar',  icono: '✅', color: '#22c55e' },
  { id: 'entregado',      nombre: 'Entregado',            icono: '🏁', color: '#94a3b8' },
  { id: 'sin_reparacion', nombre: 'Sin reparación',       icono: '⛔', color: '#ef4444' },
];

// Pasos que se usan para calcular la barra de progreso.
export const FLUJO = ['ingresado', 'diagnostico', 'aprobacion', 'repuestos', 'reparacion', 'pruebas', 'listo', 'entregado'];

// Tipos de equipo sugeridos al cargar (se puede escribir cualquier otro).
export const TIPOS = [
  { nombre: 'Notebook',  icono: '💻' },
  { nombre: 'PC',        icono: '🖥️' },
  { nombre: 'Impresora', icono: '🖨️' },
  { nombre: 'Monitor',   icono: '📺' },
  { nombre: 'Celular',   icono: '📱' },
  { nombre: 'Tablet',    icono: '📱' },
  { nombre: 'UPS',       icono: '🔋' },
  { nombre: 'Placa',     icono: '🔌' },
];

// Días en taller a partir de los cuales el equipo se marca en amarillo / rojo.
export const DIAS_ALERTA = { aviso: 7, peligro: 15 };

export const COLORES_TECNICO = ['#2563eb', '#db2777', '#059669', '#d97706', '#7c3aed', '#0891b2', '#dc2626', '#4d7c0f'];

export const ROLES = {
  admin: 'Administrador',
  supervisor: 'Supervisor',
  lector: 'Solo lectura',
};
