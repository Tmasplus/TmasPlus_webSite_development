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

**Versión:** 1.0.0  
**Última actualización:** 2024
