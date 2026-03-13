# 📡 Documentación de Servicios (API) - TmasPlus Dashboard

## 📋 Índice

1. [AuthService](#authservice)
2. [UsersService](#usersservice)
3. [DriversService](#driversservice)
4. [CarsService](#carsservice)
5. [StorageService](#storageservice)

---

## 🔐 AuthService

Servicio de autenticación para administradores.

### `loginAdmin(credentials: LoginCredentials): Promise<AuthResponse>`

Inicia sesión como administrador.

**Parámetros:**
```typescript
interface LoginCredentials {
  email: string;
  password: string;
}
```

**Retorna:**
```typescript
interface AuthResponse {
  user: User;
  session: Session;
  profile: UserRow;
}
```

**Validaciones:**
- Email y contraseña válidos
- Usuario debe ser tipo `admin`
- Usuario debe estar `approved: true`
- Usuario no debe estar `blocked: true`

**Ejemplo:**
```typescript
const response = await AuthService.loginAdmin({
  email: 'admin@tmasplus.com',
  password: 'password123'
});
```

### `logout(): Promise<void>`

Cierra la sesión actual.

### `getCurrentUser(): Promise<User | null>`

Obtiene el usuario autenticado actual.

### `getCurrentSession(): Promise<Session | null>`

Obtiene la sesión actual.

### `getCurrentProfile(): Promise<UserRow | null>`

Obtiene el perfil completo del usuario actual.

### `isAuthenticated(): Promise<boolean>`

Verifica si hay una sesión válida.

### `isAdmin(): Promise<boolean>`

Verifica si el usuario actual es admin aprobado.

---

## 👥 UsersService

Servicio de gestión de usuarios.

### `getUserById(userId: string): Promise<UserRow | null>`

Obtiene un usuario por ID.

### `getUserByEmail(email: string): Promise<UserRow | null>`

Obtiene un usuario por email.

### `getUserByAuthId(authId: string): Promise<UserRow | null>`

Obtiene un usuario por auth_id (ID de Supabase Auth).

### `createUser(userData: UserInsert): Promise<UserRow>`

Crea un nuevo usuario.

**Parámetros:**
```typescript
interface UserInsert {
  auth_id?: string | null;
  email: string;
  first_name: string;
  last_name: string;
  mobile?: string | null;
  user_type?: string;
  // ... más campos
}
```

### `updateUser(userId: string, updates: UserUpdate): Promise<UserRow>`

Actualiza un usuario existente.

### `deleteUser(userId: string): Promise<boolean>`

Elimina un usuario (soft delete: marca como bloqueado).

### `toggleUserBlock(userId: string, blocked: boolean): Promise<UserRow>`

Bloquea o desbloquea un usuario.

### `updateDriverApproval(userId: string, approved: boolean): Promise<UserRow>`

Aprueba o rechaza un conductor.

### `updateDriverActiveStatus(userId: string, isActive: boolean): Promise<UserRow>`

Actualiza el estado activo de un conductor.

### `getDrivers(filters?: DriverFilters, pagination?: PaginationOptions): Promise<PaginatedResult<UserRow>>`

Obtiene conductores con filtros y paginación.

**Parámetros:**
```typescript
interface DriverFilters {
  approved?: boolean;
  blocked?: boolean;
  city?: string;
  searchQuery?: string;
}

interface PaginationOptions {
  page: number;
  limit: number;
}

interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}
```

**Ejemplo:**
```typescript
const result = await UsersService.getDrivers(
  { approved: true, city: 'Caracas' },
  { page: 1, limit: 20 }
);
```

### `getPendingDrivers(pagination?: PaginationOptions): Promise<PaginatedResult<UserRow>>`

Obtiene conductores pendientes de aprobación.

### `getApprovedDrivers(pagination?: PaginationOptions): Promise<PaginatedResult<UserRow>>`

Obtiene conductores aprobados.

### `getBlockedDrivers(pagination?: PaginationOptions): Promise<PaginatedResult<UserRow>>`

Obtiene conductores bloqueados.

### `searchDrivers(searchQuery: string, pagination?: PaginationOptions): Promise<PaginatedResult<UserRow>>`

Busca conductores por nombre, email o teléfono.

### `getDriversByCity(city: string, pagination?: PaginationOptions): Promise<PaginatedResult<UserRow>>`

Obtiene conductores por ciudad.

### `getDriverStats(): Promise<DriverStats>`

Obtiene estadísticas de conductores.

**Retorna:**
```typescript
interface DriverStats {
  total: number;
  pending: number;
  approved: number;
  blocked: number;
  active: number;
}
```

### `updateWalletBalance(userId: string, amount: number): Promise<UserRow>`

Actualiza el balance de wallet de un usuario.

### `emailExists(email: string): Promise<boolean>`

Verifica si un email ya está registrado.

### `phoneExists(mobile: string): Promise<boolean>`

Verifica si un teléfono ya está registrado.

### `getDriverCities(): Promise<string[]>`

Obtiene lista de ciudades únicas de conductores.

---

## 👨‍✈️ DriversService

Servicio de gestión de conductores (registro completo).

### `registerStep1(data: DriverRegistrationStep1): Promise<{userId: string, authId: string}>`

**PASO 1:** Registro de usuario conductor (datos básicos).

**Parámetros:**
```typescript
interface DriverRegistrationStep1 {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  mobile: string;
  city: string;
  referral_code?: string;
}
```

**Validaciones:**
- Email único
- Teléfono único
- Crea usuario en Supabase Auth
- Crea registro en tabla users

### `registerStep2(userId: string, data: DriverRegistrationStep2): Promise<CarRow>`

**PASO 2:** Información de vehículo.

**Parámetros:**
```typescript
interface DriverRegistrationStep2 {
  make: string;
  model: string;
  year: number;
  color: string;
  plate: string;
  fuel_type?: string;
  transmission?: string;
  capacity?: number;
}
```

**Validaciones:**
- Placa única
- Crea vehículo
- Asocia vehículo con conductor

### `registerStep3(userId: string, data: DriverRegistrationStep3): Promise<UserRow>`

**PASO 3:** Documentos del conductor.

**Parámetros:**
```typescript
interface DriverRegistrationStep3 {
  license_number: string;
  license_image: File;
  license_image_back: File;
  soat_image: File;
  card_prop_image: File;
  card_prop_image_bk: File;
  verify_id_image: File;
  verify_id_image_bk: File;
}
```

**Proceso:**
- Sube todos los documentos a Storage
- Guarda URLs en base de datos

### `registerStep4(userId: string, data: DriverRegistrationStep4): Promise<CompanyData>`

**PASO 4:** Datos de empresa (opcional).

**Parámetros:**
```typescript
interface DriverRegistrationStep4 {
  company_name: string;
  company_nit: string;
  company_address: string;
  company_city: string;
  legal_representative_name: string;
  legal_representative_doc_type: string;
  legal_representative_doc_number: string;
  legal_representative_id_image: File;
  legal_representative_id_image_bk: File;
  camara_comercio_image: File;
}
```

### `registerComplete(data: DriverRegistrationData): Promise<DriverRegistrationResult>`

Registro completo en un solo paso (usa los 4 pasos internamente).

### `approveDriver(userId: string): Promise<UserRow>`

Aprueba un conductor.

### `rejectDriver(userId: string, reason?: string): Promise<UserRow>`

Rechaza un conductor.

---

## 🚗 CarsService

Servicio de gestión de vehículos.

### `createCar(data: CarInsert): Promise<CarRow>`

Crea un nuevo vehículo.

**Validaciones:**
- Placa única

### `getCarById(carId: string): Promise<CarRow | null>`

Obtiene un vehículo por ID.

### `updateCar(carId: string, updates: CarUpdate): Promise<CarRow>`

Actualiza un vehículo.

### `deleteCar(carId: string): Promise<boolean>`

Elimina un vehículo.

### `getCars(filters?: CarFilters, pagination?: PaginationOptions): Promise<PaginatedResult<CarRow>>`

Obtiene vehículos con filtros.

**Filtros:**
```typescript
interface CarFilters {
  driver_id?: string;
  is_active?: boolean;
  service_type?: DriverServiceType;
  searchQuery?: string;
  fuel_type?: string;
  transmission?: string;
  city?: string;
}
```

### `getCarsByDriver(driverId: string): Promise<CarRow[]>`

Obtiene vehículos de un conductor.

### `plateExists(plate: string): Promise<boolean>`

Verifica si una placa ya existe.

### `updateCarDocuments(carId: string, documents: CarDocuments): Promise<CarRow>`

Actualiza documentos de un vehículo.

---

## 📁 StorageService

Servicio de gestión de archivos en Supabase Storage.

### `uploadFile(options: UploadOptions): Promise<UploadResult>`

Sube un archivo genérico.

**Parámetros:**
```typescript
interface UploadOptions {
  bucket: string;
  folder: string;
  file: File;
  filename?: string;
  maxSizeBytes?: number;
  allowedTypes?: readonly string[];
}

interface UploadResult {
  success: boolean;
  url?: string;
  path?: string;
  error?: string;
}
```

**Validaciones:**
- Tamaño máximo (default: 5MB)
- Tipos permitidos

### `uploadDriverDocument(driverId: string, documentType: string, file: File): Promise<UploadResult>`

Sube documento de conductor.

**Buckets:**
- `driver-documents`

### `uploadVehicleDocument(carId: string, documentType: string, file: File): Promise<UploadResult>`

Sube documento de vehículo.

**Buckets:**
- `vehicle-documents`

### `uploadVehicleImage(carId: string, file: File): Promise<UploadResult>`

Sube imagen de vehículo.

**Buckets:**
- `public-site-assets`

### `getPublicUrl(bucket: string, path: string): string`

Obtiene URL pública de un archivo.

### `downloadFile(bucket: string, path: string): Promise<Blob | null>`

Descarga un archivo.

### `deleteFile(bucket: string, path: string): Promise<boolean>`

Elimina un archivo.

### `deleteFiles(bucket: string, paths: string[]): Promise<boolean>`

Elimina múltiples archivos.

### `listFiles(bucket: string, folder: string): Promise<StorageFileMetadata[]>`

Lista archivos en una carpeta.

### `getFileMetadata(bucket: string, path: string): Promise<StorageFileMetadata | null>`

Obtiene metadatos de un archivo.

### `fileExists(bucket: string, path: string): Promise<boolean>`

Verifica si un archivo existe.

### `copyFile(sourceBucket: string, sourcePath: string, targetBucket: string, targetPath: string): Promise<boolean>`

Copia un archivo.

### `moveFile(sourceBucket: string, sourcePath: string, targetBucket: string, targetPath: string): Promise<boolean>`

Mueve un archivo.

### `getFolderSize(bucket: string, folder: string): Promise<number>`

Obtiene el tamaño total de archivos en una carpeta.

---

## 🔧 Constantes Exportadas

### StorageService

```typescript
export const STORAGE_BUCKETS = {
  DRIVER_DOCUMENTS: 'driver-documents',
  VEHICLE_DOCUMENTS: 'vehicle-documents',
  VEHICLE_IMAGES: 'public-site-assets',
};

export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];

export const ALLOWED_DOCUMENT_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/pdf',
];
```

---

## ⚠️ Manejo de Errores

Todos los servicios usan `ErrorHandler` para:
- Categorizar errores
- Mostrar mensajes amigables
- Logging en desarrollo
- Notificaciones toast automáticas

**Ejemplo de uso:**
```typescript
try {
  const user = await UsersService.getUserById('123');
} catch (error) {
  // Error ya manejado por ErrorHandler
  // Toast ya mostrado
  // Log ya hecho
}
```

---

**Última actualización:** 2024
