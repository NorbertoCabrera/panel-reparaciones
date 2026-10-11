// Capa de datos: Firebase (Auth + Firestore) o modo demo en localStorage.
// Ambas exponen la misma interfaz para que app.js no sepa cuál usa.
import { FIREBASE_CONFIG, ADMIN_EMAILS, COLORES_TECNICO, ESTADOS } from './config.js';

const DIA = 864e5;
const admins = ADMIN_EMAILS.map(e => e.toLowerCase());

// Demo con datos de ejemplo: sin Firebase configurado, en GitHub Pages o con ?demo en la URL.
export const MODO_DEMO = !FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey.startsWith('REEMPLAZAR')
  || location.hostname.endsWith('github.io')
  || new URLSearchParams(location.search).has('demo');

export function crearBackend() {
  return MODO_DEMO ? backendDemo() : backendFirebase();
}

async function backendFirebase() {
  const V = '10.14.1';
  const [{ initializeApp }, A, F] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`),
  ]);
  const app = initializeApp(FIREBASE_CONFIG);
  const auth = A.getAuth(app);
  const db = F.initializeFirestore(app, {
    localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }),
  });
  const proveedor = new A.GoogleAuthProvider();
  proveedor.setCustomParameters({ prompt: 'select_account' });
  A.getRedirectResult(auth).catch(() => {});

  return {
    demo: false,
    onUser: cb => A.onAuthStateChanged(auth, u => cb(u && {
      email: u.email.toLowerCase(),
      nombre: u.displayName || u.email,
      foto: u.photoURL || '',
    })),
    async login() {
      try {
        await A.signInWithPopup(auth, proveedor);
      } catch (e) {
        if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
          await A.signInWithRedirect(auth, proveedor);
        } else if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
          throw e;
        }
      }
    },
    logout: () => A.signOut(auth),
    async getRol(email) {
      if (admins.includes(email)) return 'admin';
      const s = await F.getDoc(F.doc(db, 'usuarios', email));
      return s.exists() ? s.data().rol : null;
    },
    watch(col, cb, onError) {
      return F.onSnapshot(F.collection(db, col),
        s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))), onError);
    },
    add: (col, data) => F.addDoc(F.collection(db, col), data).then(r => r.id),
    set: (col, id, data) => F.setDoc(F.doc(db, col, id), data),
    update: (col, id, data) => F.updateDoc(F.doc(db, col, id), data),
    remove: (col, id) => F.deleteDoc(F.doc(db, col, id)),
    batch(ops) {
      const b = F.writeBatch(db);
      for (const o of ops) {
        if (o.remove) b.delete(F.doc(db, o.col, o.id));
        else b.update(F.doc(db, o.col, o.id), o.data);
      }
      return b.commit();
    },
  };
}

function backendDemo() {
  const KEY = 'panel-reparaciones-demo';
  const KEY_ROL = KEY + '-rol';
  const subs = {};
  const leer = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
  let db = leer() || semilla();
  const lista = col => Object.entries(db[col] || {}).map(([id, d]) => ({ id, ...structuredClone(d) }));
  const emitir = () => { for (const [col, set] of Object.entries(subs)) set.forEach(cb => cb(lista(col))); };
  const guardar = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {} emitir(); };
  const nuevoId = () => Math.random().toString(36).slice(2, 12);
  window.addEventListener('storage', e => { if (e.key === KEY) { db = leer() || semilla(); emitir(); } });

  return {
    demo: true,
    onUser(cb) { cb({ email: 'demo@ejemplo.com', nombre: 'Usuario demo', foto: '' }); return () => {}; },
    login() {},
    logout() {},
    async getRol() { try { return localStorage.getItem(KEY_ROL) || 'admin'; } catch { return 'admin'; } },
    setRolDemo(rol) { try { localStorage.setItem(KEY_ROL, rol); } catch {} location.reload(); },
    reiniciarDemo() { try { localStorage.removeItem(KEY); } catch {} location.reload(); },
    watch(col, cb) {
      (subs[col] ||= new Set()).add(cb);
      cb(lista(col));
      return () => subs[col].delete(cb);
    },
    async add(col, data) { const id = nuevoId(); (db[col] ||= {})[id] = data; guardar(); return id; },
    async set(col, id, data) { (db[col] ||= {})[id] = data; guardar(); },
    async update(col, id, data) { Object.assign(db[col][id], data); guardar(); },
    async remove(col, id) { delete db[col][id]; guardar(); },
    async batch(ops) {
      for (const o of ops) {
        if (o.remove) delete db[o.col][o.id];
        else Object.assign(db[o.col][o.id], o.data);
      }
      guardar();
    },
  };
}

function semilla() {
  const ahora = Date.now();
  const tecnicos = {};
  ['Martín', 'Lucía', 'Diego', 'Sofía', 'Pablo'].forEach((nombre, i) => {
    tecnicos['t' + (i + 1)] = { nombre, color: COLORES_TECNICO[i], orden: i };
  });
  const filas = [
    ['Notebook', 'Lenovo', 'ThinkPad T14', 'PF3X9K2', 'Estudio Contable Ríos', 'No enciende', 'reparacion', 't1', 3],
    ['Impresora', 'HP', 'LaserJet Pro M404', 'VNB3K12345', 'Farmacia Central', 'Atasca papel', 'repuestos', 't2', 9],
    ['PC', 'Dell', 'OptiPlex 7090', '8H2KQ93', 'Municipalidad', 'Muy lenta, posible disco', 'pruebas', 't1', 5],
    ['Notebook', 'Dell', 'Latitude 5420', 'CN0X12', 'Juan Pérez', 'Pantalla rota', 'aprobacion', 't3', 12],
    ['Monitor', 'Samsung', 'S24F350', 'ZZ1234', 'Colegio San José', 'Sin imagen', 'diagnostico', 't4', 2],
    ['Celular', 'Samsung', 'Galaxy A54', 'R58T90', 'María Gómez', 'Batería hinchada', 'listo', 't5', 6],
    ['Notebook', 'Asus', 'VivoBook 15', 'M3N0CV', 'Ana López', 'Teclado no responde', 'ingresado', null, 1],
    ['UPS', 'APC', 'Back-UPS 1500', '3B1234X', 'Clínica del Sol', 'No retiene carga', 'ingresado', null, 0],
    ['PC', 'Armada', 'Ryzen 5 / B450', '', 'Ciber Juegos', 'Reinicios aleatorios', 'ingresado', null, 2],
    ['Impresora', 'Epson', 'L3250', 'X5Y7Z9', 'Librería El Ateneo', 'Cabezal tapado', 'diagnostico', 't2', 4],
    ['Notebook', 'HP', 'ProBook 440 G8', '5CD1234', 'Inmobiliaria Norte', 'Bisagra rota', 'reparacion', 't4', 18],
    ['Tablet', 'Apple', 'iPad 9', 'DMPXK1', 'Lucas Fernández', 'Pin de carga', 'sin_reparacion', 't5', 8],
    ['Notebook', 'Acer', 'Aspire 5', 'NXHN1', 'Pedro Díaz', 'Formateo', 'entregado', 't3', 20],
  ];
  const prioridades = {};
  const equipos = {};
  filas.forEach(([tipo, marca, modelo, serie, cliente, falla, estado, tecnicoId, dias], i) => {
    const fechaIngreso = ahora - dias * DIA - 3600e3;
    const cola = tecnicoId || 'pila';
    prioridades[cola] = (prioridades[cola] ?? -1) + 1;
    const historial = [{ t: fechaIngreso, por: 'Usuario demo', accion: 'Ingresado al taller' }];
    if (tecnicoId) historial.push({ t: fechaIngreso + 3600e3, por: 'Usuario demo', accion: `Asignado a ${tecnicos[tecnicoId].nombre}` });
    if (estado !== 'ingresado') historial.push({ t: fechaIngreso + 86400e3, por: 'Usuario demo', accion: `Estado → ${ESTADOS.find(x => x.id === estado).nombre}` });
    equipos['e' + i] = {
      tipo, marca, modelo, serie, cliente, falla, observaciones: '', estado, tecnicoId,
      prioridad: prioridades[cola], fechaIngreso,
      fechaEntrega: estado === 'entregado' ? ahora - 86400e3 : null,
      actualizado: ahora, historial,
    };
  });
  return {
    tecnicos,
    equipos,
    usuarios: { 'jefe@ejemplo.com': { rol: 'supervisor', agregado: ahora } },
  };
}
