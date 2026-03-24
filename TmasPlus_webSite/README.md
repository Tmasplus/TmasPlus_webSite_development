# 🚗 TmasPlus Dashboard


Dashboard administrativo web para la plataforma de movilidad T+Plus. Sistema completo de gestión de conductores, vehículos, reservas y operaciones corporativas.


## 📋 Descripción del Proyecto


TmasPlus Dashboard es una aplicación web desarrollada con React 19, TypeScript y Vite que permite a los administradores gestionar todos los aspectos de la plataforma de transporte T+Plus, incluyendo:


- 👥 Gestión de usuarios y conductores
- 🚗 Gestión de vehículos y documentos
- 📅 Reservas corporativas e individuales
- 💰 Facturación y pagos
- 📝 Contratos y documentación legal
- 🔔 Notificaciones y comunicaciones
- ⚙️ Configuración del sistema


## 🛠️ Stack Tecnológico


### Frontend
- **React 19.1.1** - Framework UI
- **TypeScript 5.9.3** - Tipado estático
- **Vite 7.1.7** - Build tool y dev server
- **Tailwind CSS 3.4.3** - Estilos utility-first
- **React Router DOM 7.9.4** - Enrutamiento
- **Framer Motion 12.23.24** - Animaciones


### Backend & Servicios
- **Supabase 2.39.0** - Backend as a Service
  - Autenticación
  - Base de datos PostgreSQL
  - Storage de archivos
  - Realtime (preparado)


### UI & Utilidades
- **Lucide React** - Iconos
- **React Icons** - Iconos adicionales
- **Sonner** - Notificaciones toast
- **Zod** - Validación de esquemas
- **@react-pdf/renderer** - Generación de PDFs
- **Leaflet** - Mapas interactivos
- **File Saver** - Descarga de archivos


## 📁 Estructura del Proyecto


```
TmasPlus_webSite/
├── src/
│   ├── components/          # Componentes reutilizables
│   │   ├── auth/           # Componentes de autenticación
│   │   ├── layout/         # Layout components (Sidebar, Topbar)
│   │   └── ui/             # Componentes UI base
│   ├── config/             # Configuración
│   │   ├── supabase.ts     # Cliente Supabase
│   │   ├── database.types.ts  # Tipos de BD
│   │   └── constants.ts    # Constantes globales
│   ├── contexts/           # Contextos React
│   │   └── AuthContext.tsx
│   ├── hooks/              # Custom hooks
│   ├── layouts/            # Layouts de página
│   ├── pages/              # Páginas de la aplicación
│   ├── routes/             # Configuración de rutas
│   ├── services/           # Servicios de backend
│   │   ├── auth.service.ts
│   │   ├── users.service.ts
│   │   ├── drivers.service.ts
│   │   ├── cars.service.ts
│   │   ├── storage.service.ts
│   │   └── realtime.service.ts
│   ├── types/              # Tipos TypeScript globales
│   ├── utils/              # Utilidades
│   └── assets/             # Recursos estáticos
├── public/                 # Archivos públicos
└── docs/                   # Documentación adicional
```


## 🚀 Inicio Rápido


### Prerrequisitos


- Node.js 18+
- npm o yarn
- Cuenta de Supabase configurada


### Instalación


```bash
# Instalar dependencias
npm install


# Configurar variables de entorno
cp .env.example .env.local
# Editar .env.local con tus credenciales de Supabase
```


### Variables de Entorno


Crear archivo `.env.local`:


```env
VITE_SUPABASE_URL=tu_url_de_supabase
VITE_SUPABASE_ANON_KEY=tu_anon_key
VITE_APP_VERSION=1.0.0
VITE_NODE_ENV=development
VITE_POLLING_INTERVAL=5000
```


### Desarrollo


```bash
npm run dev
```


La aplicación estará disponible en `http://localhost:5173`


### Build


```bash
npm run build
```


### Preview de Producción


```bash
npm run preview
```


## 📚 Documentación


Para entender completamente el proyecto, consulta:


1. **[ARCHITECTURE.md](./docs/ARCHITECTURE.md)** - Arquitectura del sistema
2. **[DEVELOPMENT.md](./docs/DEVELOPMENT.md)** - Guía de desarrollo
3. **[API_DOCUMENTATION.md](./docs/API_DOCUMENTATION.md)** - Documentación de servicios
4. **[DATABASE_SCHEMA.md](./docs/DATABASE_SCHEMA.md)** - Esquema de base de datos
5. **[WORKFLOWS.md](./docs/WORKFLOWS.md)** - Flujos de trabajo principales
6. **[INFORME_ACTUALIZACIONES.md](./INFORME_ACTUALIZACIONES.md)** - Historial de cambios


## 🔐 Autenticación


El dashboard está protegido y solo permite acceso a usuarios con:
- `user_type: 'admin'`
- `approved: true`
- `blocked: false`


## 🎯 Características Principales


### Gestión de Conductores
- Registro en 4 pasos
- Aprobación/rechazo
- Gestión de documentos
- Asociación vehículo-conductor


### Gestión de Vehículos
- CRUD completo
- Validación de placas únicas
- Gestión de documentos (SOAT, tarjeta de propiedad, etc.)
- Imágenes de vehículos


### Reservas
- Reservas corporativas
- Historial de reservas
- Detalles de reservas
- Cálculo de tarifas


### Storage
- Subida de documentos
- Gestión de imágenes
- Validación de archivos (tamaño, tipo)


## 🧪 Testing


```bash
npm run lint
```


## 📝 Convenciones de Código


- **TypeScript**: Tipado estricto en toda la aplicación
- **Naming**: camelCase para variables, PascalCase para componentes
- **Imports**: Usar alias `@/` para imports absolutos
- **Servicios**: Clases estáticas con métodos estáticos
- **Errores**: Usar `ErrorHandler` para manejo centralizado


## 🤝 Contribución


1. Crear rama desde `main`
2. Realizar cambios
3. Commit con mensajes descriptivos
4. Push y crear Pull Request


## 📄 Licencia


ISC


## 👥 Equipo


TmasPlus Development Team


---


**Versión:** 1.1.0  
**Última actualización:** 2026

# T+Plus Web (Panel de Administración y Registro Web)


Esta es la aplicación web de **T+Plus**, que cumple dos funciones principales:
1. **Panel de Administración (Dashboard):** Acceso exclusivo para administradores (`user_type === 'admin'`) para gestionar conductores, viajes y configuraciones de la plataforma.
2. **Portal de Registro de Conductores:** Permite a los nuevos conductores inscribirse y subir su documentación inicial en varios pasos. *Nota: Una vez que un conductor ha sido aprobado, pierde acceso a la web y debe operar exclusivamente desde la App Móvil.*


---


## Arquitectura y Estado Actual


La aplicación está construida con **React, Vite, Tailwind CSS y Supabase** como Backend as a Service (BaaS) encargado de la base de datos, autenticación (GoTrue) y Storage.


### Cambios Recientes y Flujo de Autenticación Moderno


El flujo de autenticación ha sido reestructurado para ser más resiliente ante los **RLS (Row Level Security)** de Supabase y para crear una experiencia de usuario fluida para el **registro progresivo de conductores**.


A continuación, se resumen los flujos críticos actuales:


#### 1. Consulta Segura de Perfiles vía RPC (Portero)
Anteriormente, la aplicación web intentaba consultar la tabla `users` directamente tras autenticarse con el ID de sesión. Esto desencadenaba problemas constantes por las políticas RLS.
- **Solución implementada:** Se reemplazó la consulta directa por el uso de una función RPC segura (`supabase.rpc('get_auth_profile')`) tanto en el login inicial (`AuthService.loginAdmin`) como al recuperar la sesión activa en recargas (`AuthService.getCurrentProfile`).
- Esta función salta de manera segura al RLS, obteniendo la fila del usuario sin romper React mediante errores silenciosos fallidos. (El tipo `get_auth_profile` está explícitamente añadido a `database.types.ts`).


#### 2. Las "Mini-Sesiones" en `AuthContext`
El archivo principal gestor del estado global, `src/contexts/AuthContext.tsx`, fue adaptado para un manejo inteligente de roles:
- Expulsa inmediatamente a cualquier usuario no autorizado (ej. Conductores con cuenta ya activa/aprobada).
- **Excepción Estratégica (Mini-sesiones):** Si el sistema detecta que el usuario es un conductor *incompleto/no aprobado* (`user_type === 'driver' && !approved`), no lo expulsa. En cambio, le otorga una "mini-sesión" válida en la aplicación.


#### 3. Redirección Inteligente (`LoginPage.tsx`)
Si un conductor a medias inicia sesión desde `/login`, la "mini-sesión" de `AuthContext` entra en vigor temporalmente, permitiendo que el componente `LoginPage` intercepte la redirección correcta.
- Logica: **"Si es conductor inactivo -> redirigir a `/register-driver`"**.


#### 4. Recuperación de Progreso ("La Magia" en `RegisterDriverPage.tsx`)
El portal de inscripción `/register-driver` implementa múltiples pasos (Personal, Documentos, Vehículo, Empresa). Para garantizar que los conductores a medias no reinicien su registro:
- Cuenta con un `useEffect` orquestador usando `useAuth()`.
- Cuando detecta que un usuario inicia sesión (vía redirección del login, o simplemente recarga la página) y es un conductor *no aprobado*, intercepta la solicitud.
- Completa automáticamente el estado del **Paso 1** rellenando la data que ya existe en la base de datos (nombre, email, número de móvil recuperados usando null-checks `?? undefined` para compatibilidad con TypeScript).
- Fuerza a la UI a brincar mágicamente al **Paso 2** de Documentación, reanudando la experiencia del usuario fluida.


---


## Consideraciones de Desarrollo
Para desarrolladores que ingresen al repositorio:


- **Strict Typing:** La interacción con Supabase depende fuertemente de `src/config/database.types.ts`. Si se implementan nuevos Data Tables, Views, o RPCs en Supabase, deben registrarse aquí de manera explícita en `Database['public']...`.
- **Restricciones de Web:** No intentes añadir código en la web para que conductores acepten reservas; esa lógica recae enteramente en el repositorio móvil.
- **Rutas y Guardias:** Si se crean nuevas rutas protegidas para administradores, éstas validarán primero el estatus vía `AuthContext.tsx` (`checkAuth`), la cual verificará que `isAdmin === true` mediante el chequeo estricto del perfil y falta de bloqueos explícitos (`blocked: false`).


## Comandos Típicos
- Instalar dependencias: `npm install`
- Servidor de desarrollo: `npm run dev`
- Construcción a producción: `npm run build`