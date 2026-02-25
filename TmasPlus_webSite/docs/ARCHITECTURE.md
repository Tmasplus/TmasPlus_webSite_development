# 🏗️ Arquitectura del Sistema - TmasPlus Dashboard

## 📐 Visión General

TmasPlus Dashboard sigue una **arquitectura en capas** con separación clara de responsabilidades:

```
┌─────────────────────────────────────────┐
│         PRESENTATION LAYER               │
│  (Pages, Components, Layouts)           │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│         BUSINESS LOGIC LAYER            │
│  (Services, Hooks, Contexts)            │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│         DATA ACCESS LAYER                │
│  (Supabase Client, Storage)              │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│         EXTERNAL SERVICES                │
│  (Supabase Backend)                      │
└──────────────────────────────────────────┘
```

## 🎯 Principios de Diseño

### 1. Separación de Responsabilidades

- **Pages**: Solo renderizado y manejo de estado local
- **Services**: Lógica de negocio y comunicación con backend
- **Components**: UI reutilizable sin lógica de negocio
- **Utils**: Funciones puras y helpers

### 2. Servicios Estáticos

Todos los servicios son clases estáticas para:
- ✅ No requerir instanciación
- ✅ Facilidad de testing
- ✅ Acceso directo desde cualquier parte

```typescript
// Ejemplo
CarsService.createCar(data)
UsersService.getUserById(id)
```

### 3. Manejo Centralizado de Errores

Sistema unificado de errores con `ErrorHandler`:
- Tipos de errores categorizados
- Mensajes amigables para usuarios
- Logging detallado en desarrollo
- Integración con toasts

### 4. TypeScript Estricto

- Tipos generados desde base de datos
- Interfaces para todas las entidades
- Validación en tiempo de compilación

## 📦 Estructura de Capas

### Capa de Presentación

#### Pages (`/src/pages/`)
Cada página es un componente funcional que:
- Maneja estado local
- Usa servicios para operaciones
- Renderiza componentes UI
- Maneja eventos de usuario

**Ejemplo:**
```typescript
export default function UsersPage() {
  const [users, setUsers] = useState([]);
  
  useEffect(() => {
    UsersService.getDrivers().then(setUsers);
  }, []);
  
  return <DataTable data={users} />;
}
```

#### Components (`/src/components/`)

**UI Components** (`/components/ui/`):
- Componentes base reutilizables
- Sin lógica de negocio
- Props tipadas

**Layout Components** (`/components/layout/`):
- Sidebar, Topbar, Page
- Estructura visual común

**Auth Components** (`/components/auth/`):
- ProtectedRoute
- Componentes de autenticación

### Capa de Lógica de Negocio

#### Services (`/src/services/`)

Cada servicio maneja una entidad principal:

1. **AuthService** - Autenticación
   - Login/logout
   - Verificación de sesión
   - Validación de permisos

2. **UsersService** - Gestión de usuarios
   - CRUD de usuarios
   - Búsqueda y filtrado
   - Estadísticas

3. **DriversService** - Gestión de conductores
   - Registro en 4 pasos
   - Aprobación/rechazo
   - Asociación con vehículos

4. **CarsService** - Gestión de vehículos
   - CRUD de vehículos
   - Validación de placas
   - Gestión de documentos

5. **StorageService** - Gestión de archivos
   - Upload/download
   - Validación de archivos
   - Gestión de buckets

**Patrón de Servicio:**
```typescript
export class ServiceName {
  static async operation(): Promise<Result> {
    try {
      // Validación
      // Operación
      // Manejo de errores
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'ServiceName.operation');
    }
  }
}
```

#### Hooks (`/src/hooks/`)

Custom hooks para lógica reutilizable:
- `useAuth` - Estado de autenticación
- `useDebounced` - Debounce de valores
- `useSupabase` - Acceso a Supabase

#### Contexts (`/src/contexts/`)

- **AuthContext**: Estado global de autenticación
  - Usuario actual
  - Sesión
  - Métodos de login/logout

### Capa de Acceso a Datos

#### Supabase Client (`/src/config/supabase.ts`)

Cliente único y configurado:
- Configuración centralizada
- Tipos generados
- Funciones de utilidad

#### Database Types (`/src/config/database.types.ts`)

Tipos TypeScript generados desde Supabase:
- Interfaces para todas las tablas
- Tipos Insert, Update, Row
- Sincronizado con esquema de BD

## 🔄 Flujo de Datos

### Flujo Típico de Operación

```
1. Usuario interactúa con UI (Page/Component)
   ↓
2. Event handler llama a Service
   ↓
3. Service valida datos
   ↓
4. Service llama a Supabase
   ↓
5. Supabase ejecuta operación en BD
   ↓
6. Service procesa respuesta
   ↓
7. Service maneja errores (si hay)
   ↓
8. Service retorna resultado
   ↓
9. UI actualiza estado
   ↓
10. UI muestra resultado/error
```

### Ejemplo Completo

```typescript
// 1. Usuario hace click en "Crear Vehículo"
// 2. Page maneja submit
const handleSubmit = async (data) => {
  try {
    // 3. Llama a servicio
    const car = await CarsService.createCar(data);
    // 9. Actualiza estado
    setCars([...cars, car]);
    // 10. Muestra éxito
    toast.success('Vehículo creado');
  } catch (error) {
    // 10. Muestra error (manejado por ErrorHandler)
  }
};
```

## 🔐 Autenticación y Autorización

### Flujo de Autenticación

```
1. Usuario ingresa credenciales
   ↓
2. AuthService.loginAdmin()
   ↓
3. Supabase Auth valida credenciales
   ↓
4. Se obtiene perfil de usuario
   ↓
5. Se valida que sea admin aprobado
   ↓
6. Se actualiza AuthContext
   ↓
7. ProtectedRoute permite acceso
```

### Protección de Rutas

```typescript
<ProtectedRoute>
  <DashboardLayout />
</ProtectedRoute>
```

`ProtectedRoute` verifica:
- Sesión válida
- Usuario es admin
- Usuario está aprobado
- Usuario no está bloqueado

## 📁 Gestión de Archivos

### Storage Buckets

- `driver-documents` - Documentos de conductores
- `vehicle-documents` - Documentos de vehículos
- `vehicle-images` - Imágenes de vehículos

### Flujo de Upload

```
1. Usuario selecciona archivo
   ↓
2. StorageService valida (tamaño, tipo)
   ↓
3. Se genera nombre único
   ↓
4. Se sube a Supabase Storage
   ↓
5. Se obtiene URL pública
   ↓
6. Se guarda URL en base de datos
```

## 🎨 Sistema de Estilos

### Tailwind CSS

- Utility-first approach
- Configuración en `tailwind.config.js`
- Clases utilitarias para todo

### Componentes UI

Componentes base con Tailwind:
- Botones, Inputs, Cards
- Modales, Tablas
- Estados vacíos

## 🔧 Configuración

### Vite

- Alias `@/` para imports absolutos
- Variables de entorno con prefijo `VITE_`
- Plugin React para HMR

### TypeScript

- Configuración estricta
- Path mapping
- Tipos generados

### ESLint

- Reglas modernas
- React hooks
- TypeScript

## 📊 Estado de la Aplicación

### Estado Global

- **AuthContext**: Autenticación (único estado global)

### Estado Local

- Cada página/componente maneja su propio estado
- React hooks (`useState`, `useEffect`)
- No se usa Redux (no es necesario)

## 🚀 Optimizaciones

### Performance

- Lazy loading de rutas (preparado)
- React.memo donde sea necesario
- Debounce en búsquedas

### Código

- Servicios reutilizables
- Componentes modulares
- Funciones puras en utils

## 🔮 Extensiones Futuras

1. **Realtime Service**: Implementar actualizaciones en tiempo real
2. **Caching**: Implementar caché de consultas
3. **Offline Support**: Service workers
4. **Testing**: Unit tests y integration tests
5. **Analytics**: Tracking de eventos

---

**Última actualización:** 2024
