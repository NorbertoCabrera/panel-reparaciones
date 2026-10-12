# 🔧 Panel de Reparaciones

Aplicación web para seguir en tiempo real el estado de los equipos en reparación de un servicio técnico: carga de equipos, asignación a técnicos, cola de prioridades y seguimiento visual del avance de cada reparación.

Nació de una necesidad concreta del taller donde trabajo. El responsable necesitaba ver **desde el celular**, de un vistazo, en qué estado está cada equipo y quién lo tiene asignado, y poder reorganizar las prioridades del trabajo sin depender de planillas ni mensajes.

**▶ Demo en vivo:** **https://norbertocabrera.github.io/panel-reparaciones/** (datos de ejemplo, sin login; con el selector de arriba podés probar los distintos roles)

<p align="center">
  <img src="docs/movil-panel.jpg" width="250" alt="Panel principal en el celular">
  <img src="docs/movil-pila.jpg" width="250" alt="Pila de trabajo con arrastrar y soltar">
  <img src="docs/movil-detalle.jpg" width="250" alt="Detalle de un equipo con su progreso">
</p>
<p align="center"><img src="docs/escritorio-panel.jpg" width="780" alt="Vista de escritorio"></p>

## Funcionalidades

- **Panel gráfico**: indicadores (equipos en taller, sin asignar, listos, demorados), gráfico de dona por estado y la carga de trabajo de cada técnico con barras apiladas.
- **Pila de trabajo priorizada**: los equipos se ordenan arrastrando y se asignan a un técnico pasándolos a su cola. Funciona con mouse y en pantallas táctiles.
- **Seguimiento de cada equipo**: línea de pasos del proceso de reparación, días en el taller con alertas por demora e historial de cambios con quién hizo qué y cuándo.
- **Búsqueda y filtros** por cliente, marca, modelo, número de serie, estado o técnico.
- **Tiempo real**: los cambios aparecen al instante en todos los dispositivos, sin recargar.
- **Instalable**: se puede agregar a la pantalla de inicio del celular como si fuera una app.

## Roles y seguridad

El acceso es con cuenta de Google. Cada usuario tiene un rol:

| Rol | Puede |
|---|---|
| **Administrador** | Todo: cargar, editar y eliminar equipos, cambiar estados, asignar, priorizar, administrar técnicos y usuarios |
| **Supervisor** | Ver todo, asignar equipos a técnicos y reordenar la pila |
| **Solo lectura** | Ver todo |

Los permisos **se aplican en el servidor** con [reglas de seguridad de Firestore](firestore.rules), no solo ocultando botones en la interfaz. Por ejemplo, un supervisor puede modificar únicamente los campos de asignación y prioridad de un equipo (`affectedKeys().hasOnly(...)`). Cualquier otra escritura la rechaza la base de datos.

## Tecnologías

- **Frontend:** HTML, CSS y JavaScript sin frameworks ni paso de compilación (módulos ES nativos)
- **Backend:** Firebase Authentication (Google) + Cloud Firestore con caché offline persistente
- **Hosting:** Firebase Hosting (producción) y GitHub Pages con GitHub Actions (demo)
- **Librerías:** [SortableJS](https://github.com/SortableJS/Sortable) para arrastrar y soltar
- Diseño *mobile-first*, modo oscuro automático y gráficos en SVG hechos a mano

### Arquitectura

```
public/
  index.html
  css/estilos.css
  js/config.js   ← estados, tipos de equipo, alertas y credenciales públicas de Firebase
  js/data.js     ← capa de datos con dos implementaciones de la misma interfaz:
                   Firebase (producción) y localStorage (demo)
  js/app.js      ← estado, vistas, componentes y acciones
firestore.rules  ← control de acceso por rol
.github/workflows/demo-pages.yml  ← publica la demo en GitHub Pages
```

La capa de datos expone una interfaz única (`watch`, `add`, `update`, `batch`…) con dos implementaciones. Así la misma interfaz de usuario funciona contra Firestore o contra datos de demo locales, que se activan automáticamente sin Firebase configurado, en `github.io` o con `?demo` en la URL.

---

## Ejecutar localmente

Requiere Node 22 o superior. No hay dependencias que instalar.

```bash
git clone https://github.com/NorbertoCabrera/panel-reparaciones.git
cd panel-reparaciones
node tools/servidor.mjs
```

Abrir http://localhost:5173/?demo. El parámetro `?demo` usa datos de ejemplo guardados en el navegador, sin necesidad de Firebase.

## Desplegar una instancia propia

1. Crear un proyecto en [Firebase](https://console.firebase.google.com) y habilitar **Authentication** (proveedor Google) y **Cloud Firestore**.
2. Registrar una app web y copiar su configuración en `FIREBASE_CONFIG` (`public/js/config.js`).
3. Definir el email del administrador en `ADMIN_EMAILS` (`config.js`) y en `ADMINS()` (`firestore.rules`).
4. Indicar el ID del proyecto en `.firebaserc` y desplegar el hosting y las reglas:

```bash
npx firebase-tools login
npx firebase-tools deploy
```

Los demás usuarios y sus roles se administran desde la sección **Ajustes** de la app.

## Personalización

Los estados del flujo de reparación, los tipos de equipo, los colores y los umbrales de alerta por demora se configuran en [`public/js/config.js`](public/js/config.js).
