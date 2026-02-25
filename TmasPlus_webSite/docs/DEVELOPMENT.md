# 👨‍💻 Guía de Desarrollo - TmasPlus Dashboard

## 🚀 Configuración del Entorno de Desarrollo

### Prerrequisitos

```bash
# Node.js 18 o superior
node --version

# npm 9 o superior
npm --version
```

### Instalación Inicial

```bash
# 1. Clonar repositorio
git clone <repo-url>
cd TmasPlus_webSite

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env.local
# Editar .env.local con tus credenciales
```

### Variables de Entorno Requeridas

```env
# Supabase
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu_anon_key

# App
VITE_APP_VERSION=1.0.0
VITE_NODE_ENV=development
VITE_POLLING_INTERVAL=5000

# Storage Buckets (opcional)
VITE_STORAGE_BUCKET_PROFILES=user-profiles
VITE_STORAGE_BUCKET_DOCUMENTS=user-documents
VITE_STORAGE_BUCKET_CARS=car-images
VITE_STORAGE_BUCKET_BOOKINGS=booking-media
```

## 📝 Convenciones de Código

### Naming Conventions

```typescript
// Componentes: PascalCase
export function UserCard() {}

// Funciones/Variables: camelCase
const getUserById = () => {}
const userId = "123"

// Constantes: UPPER_SNAKE_CASE
const MAX_FILE_SIZE = 5 * 1024 * 1024

// Tipos/Interfaces: PascalCase
interface UserData {}
type CarFilters = {}

// Servicios: PascalCase + Service
class UsersService {}
```

### Estructura de Archivos

```
Componente/
├── ComponentName.tsx      # Componente principal
├── ComponentName.test.tsx # Tests (futuro)
└── types.ts              # Tipos locales (si aplica)
```

### Imports

```typescript
// 1. Imports de React
import { useState, useEffect } from 'react'

// 2. Imports de librerías externas
import { motion } from 'framer-motion'

// 3. Imports de componentes
import { Button } from '@/components/ui/Button'

// 4. Imports de servicios
import { UsersService } from '@/services/users.service'

// 5. Imports de tipos
import type { UserRow } from '@/config/database.types'

// 6. Imports de utils
import { ErrorHandler } from '@/utils/errorHandler'

// 7. Imports relativos
import './ComponentName.css'
```

### Formato de Código

- **Indentación**: 2 espacios
- **Comillas**: Simple para JSX, doble para strings
- **Punto y coma**: Sí
- **Líneas máximas**: 100 caracteres (preferible 80)

## 🏗️ Crear un Nuevo Servicio

### Plantilla de Servicio

```typescript
import { supabase } from '@/config/supabase';
import type { EntityRow, EntityInsert, EntityUpdate } from '@/config/database.types';
import { ErrorHandler, AppErrorType } from '@/utils/errorHandler';

/**
 * Servicio de [Nombre] de T+Plus Dashboard
 * Descripción breve del servicio
 */
export class EntityService {
  /**
   * Crea un nuevo [entidad]
   */
  static async createEntity(data: EntityInsert): Promise<EntityRow> {
    try {
      // Validaciones
      // Operación
      const { data: entity, error } = await supabase
        .from('entities')
        .insert(data)
        .select()
        .single();

      if (error) {
        throw ErrorHandler.createError(
          AppErrorType.DATABASE,
          'Error al crear entidad',
          error.message
        );
      }

      if (!entity) {
        throw ErrorHandler.createError(
          AppErrorType.DATABASE,
          'No se pudo crear la entidad',
          'No data returned'
        );
      }

      return entity;
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'EntityService.createEntity');
    }
  }

  /**
   * Obtiene una entidad por ID
   */
  static async getEntityById(id: string): Promise<EntityRow | null> {
    try {
      const { data, error } = await supabase
        .from('entities')
        .select('*')
        .eq('id', id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw ErrorHandler.createError(
          AppErrorType.DATABASE,
          'Error al obtener entidad',
          error.message
        );
      }

      return data || null;
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'EntityService.getEntityById');
    }
  }
}
```

## 🎨 Crear un Nuevo Componente

### Componente UI Reutilizable

```typescript
import { classNames } from '@/utils/classNames';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  className?: string;
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled = false,
  className,
}: ButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={classNames(
        'px-4 py-2 rounded',
        variant === 'primary' && 'bg-blue-500 text-white',
        variant === 'secondary' && 'bg-gray-200',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      {children}
    </button>
  );
}
```

### Página Completa

```typescript
import { useState, useEffect } from 'react';
import { UsersService } from '@/services/users.service';
import { DataTable } from '@/components/ui/DataTable';
import { Button } from '@/components/ui/Button';
import type { UserRow } from '@/config/database.types';

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const result = await UsersService.getDrivers();
      setUsers(result.data);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Cargando...</div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">Usuarios</h1>
        <Button onClick={() => {/* crear usuario */}}>
          Crear Usuario
        </Button>
      </div>
      <DataTable data={users} />
    </div>
  );
}
```

## 🔄 Manejo de Errores

### Usar ErrorHandler

```typescript
import { ErrorHandler, AppErrorType } from '@/utils/errorHandler';

// En servicios
try {
  // operación
} catch (error) {
  throw ErrorHandler.handleWithToast(error, 'ServiceName.method');
}

// Crear error personalizado
throw ErrorHandler.createError(
  AppErrorType.VALIDATION,
  'Mensaje para usuario',
  'Mensaje técnico'
);
```

### Tipos de Errores

- `AUTHENTICATION` - Errores de autenticación
- `AUTHORIZATION` - Errores de permisos
- `DATABASE` - Errores de base de datos
- `STORAGE` - Errores de archivos
- `VALIDATION` - Errores de validación
- `NETWORK` - Errores de red
- `NOT_FOUND` - Recurso no encontrado
- `UNKNOWN` - Error desconocido

## 📤 Subir Archivos

```typescript
import { StorageService } from '@/services/storage.service';

const handleFileUpload = async (file: File) => {
  try {
    const result = await StorageService.uploadDriverDocument(
      driverId,
      'license',
      file
    );

    if (result.success) {
      // Guardar URL en base de datos
      await UsersService.updateUser(driverId, {
        license_image: result.url
      });
    }
  } catch (error) {
    // Error ya manejado por ErrorHandler
  }
};
```

## 🔍 Búsqueda y Filtrado

```typescript
// Con paginación
const result = await UsersService.getDrivers(
  {
    searchQuery: 'Juan',
    city: 'Caracas',
    approved: true
  },
  {
    page: 1,
    limit: 20
  }
);

// Resultado incluye:
// - data: UserRow[]
// - total: number
// - page: number
// - limit: number
// - totalPages: number
// - hasNextPage: boolean
// - hasPreviousPage: boolean
```

## 🧪 Testing (Preparado)

```typescript
// Ejemplo de test (cuando se implemente)
import { describe, it, expect } from 'vitest';
import { UsersService } from '@/services/users.service';

describe('UsersService', () => {
  it('should get user by id', async () => {
    const user = await UsersService.getUserById('123');
    expect(user).toBeDefined();
  });
});
```

## 🐛 Debugging

### Logs en Desarrollo

```typescript
if (import.meta.env.DEV) {
  console.log('Debug info:', data);
}
```

### React DevTools

- Instalar extensión del navegador
- Inspeccionar componentes y estado

### Supabase Dashboard

- Ver logs de queries
- Inspeccionar datos
- Verificar autenticación

## 📦 Build y Deploy

### Build de Producción

```bash
npm run build
```

Genera carpeta `dist/` con archivos optimizados.

### Preview Local

```bash
npm run preview
```

### Variables de Producción

Asegurarse de configurar:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_NODE_ENV=production`

## 🔄 Git Workflow

### Ramas

- `main` - Producción
- `develop` - Desarrollo
- `feature/nombre` - Nuevas características
- `fix/nombre` - Correcciones

### Commits

Formato:
```
tipo(scope): descripción

Ejemplos:
feat(users): agregar búsqueda de usuarios
fix(auth): corregir validación de sesión
docs(readme): actualizar documentación
```

### Pull Requests

- Descripción clara
- Lista de cambios
- Screenshots si aplica
- Tests si aplica

## 📚 Recursos

- [React Docs](https://react.dev)
- [TypeScript Docs](https://www.typescriptlang.org/docs/)
- [Supabase Docs](https://supabase.com/docs)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)
- [Vite Docs](https://vite.dev)

---

**Última actualización:** 2024
