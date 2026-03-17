# 🗄️ Esquema de Base de Datos - TmasPlus Dashboard

## 📋 Tablas Principales

### `users`

Tabla principal de usuarios (conductores, clientes, empresas, admins).

**Campos:**
```typescript
{
  id: string;                    // UUID, PK
  auth_id: string | null;         // ID de Supabase Auth
  email: string;                  // Email único
  first_name: string;             // Nombre
  last_name: string;              // Apellido
  mobile: string | null;          // Teléfono
  user_type: string;              // 'driver' | 'customer' | 'company' | 'admin'
  wallet_balance: number;         // Balance de billetera (default: 0)
  location: Json | null;          // Ubicación GPS
  profile_image: string | null;   // URL de imagen de perfil
  rating: number;                 // Calificación (0-5)
  total_rides: number;           // Total de viajes
  is_verified: boolean;          // Verificado
  approved: boolean;              // Aprobado (para conductores)
  blocked: boolean;               // Bloqueado
  referral_id: string | null;      // ID de referido
  city: string | null;            // Ciudad
  
  // Campos específicos de conductor
  driver_active_status: boolean;  // Estado activo del conductor
  license_number: string | null;  // Número de licencia
  license_image: string | null;   // URL imagen licencia (frente)
  license_image_back: string | null; // URL imagen licencia (reverso)
  soat_image: string | null;      // URL SOAT
  card_prop_image: string | null; // URL tarjeta propiedad (frente)
  card_prop_image_bk: string | null; // URL tarjeta propiedad (reverso)
  verify_id_image: string | null; // URL cédula (frente)
  verify_id_image_bk: string | null; // URL cédula (reverso)
  
  // Campos técnicos
  push_token: string | null;      // Token para notificaciones push
  user_platform: string | null;   // Plataforma del usuario
  created_at: string;             // Timestamp
  updated_at: string;             // Timestamp
}
```

**Índices:**
- `email` (único)
- `auth_id` (único)
- `mobile` (único)
- `user_type`
- `approved`
- `blocked`
- `city`

**Relaciones:**
- `referral_id` → `users.id` (self-reference)

---

### `cars`

Tabla de vehículos.

**Campos:**
```typescript
{
  id: string;                      // UUID, PK
  driver_id: string | null;        // FK → users.id
  make: string;                   // Marca
  model: string;                  // Modelo
  color: string | null;           // Color
  plate: string;                  // Placa (única)
  car_image: string | null;       // URL imagen principal
  vehicle_number: string | null;   // Número de vehículo
  vehicle_model: string | null;   // Modelo alternativo
  vehicle_make: string | null;    // Marca alternativa
  vehicle_color: string | null;   // Color alternativo
  fuel_type: string;              // 'gasolina' | 'diesel' | 'electrico' | 'hibrido'
  transmission: string;           // 'manual' | 'automatico'
  capacity: number;               // Capacidad (default: 4)
  is_active: boolean;             // Activo
  features: Json | null;          // Características adicionales
  service_type: string | null;    // Tipo de servicio
  
  // Documentos del vehículo
  soat_image: string | null;      // URL SOAT
  soat_expiry_date: string | null; // Fecha vencimiento SOAT
  card_prop_image: string | null;  // URL tarjeta propiedad (frente)
  card_prop_image_back: string | null; // URL tarjeta propiedad (reverso)
  tecnomecanica_image: string | null; // URL técnico-mecánica
  tecnomecanica_expiry_date: string | null; // Fecha vencimiento técnico-mecánica
  camara_comercio_image: string | null; // URL cámara de comercio
  
  created_at: string;             // Timestamp
  updated_at: string;            // Timestamp
}
```

**Índices:**
- `plate` (único)
- `driver_id`
- `is_active`
- `service_type`

**Relaciones:**
- `driver_id` → `users.id`

---

### `bookings`

Tabla de reservas/viajes.

**Campos:**
```typescript
{
  id: string;                     // UUID, PK
  user_id: string;                // FK → users.id (cliente)
  driver_id: string | null;        // FK → users.id (conductor)
  car_id: string | null;           // FK → cars.id
  origin: Json;                    // Ubicación origen
  destination: Json;              // Ubicación destino
  status: string;                 // Estado: 'NEW' | 'ACCEPTED' | 'STARTED' | 'REACHED' | 'PAID' | 'COMPLETE' | 'CANCELLED'
  fare: number;                   // Tarifa
  payment_mode: string;           // 'cash' | 'wallet' | 'card'
  scheduled_at: string | null;    // Fecha programada
  started_at: string | null;      // Fecha inicio
  completed_at: string | null;    // Fecha completado
  cancelled_at: string | null;    // Fecha cancelado
  cancellation_reason: string | null; // Razón cancelación
  company_id: string | null;      // FK → users.id (empresa)
  created_at: string;            // Timestamp
  updated_at: string;            // Timestamp
}
```

**Índices:**
- `user_id`
- `driver_id`
- `car_id`
- `company_id`
- `status`
- `scheduled_at`

**Relaciones:**
- `user_id` → `users.id`
- `driver_id` → `users.id`
- `car_id` → `cars.id`
- `company_id` → `users.id`

---

### `companies`

Tabla de empresas (opcional, puede estar en users).

**Campos:**
```typescript
{
  id: string;                     // UUID, PK
  user_id: string;                // FK → users.id
  company_name: string;           // Nombre empresa
  company_nit: string;            // NIT
  company_address: string;        // Dirección
  company_city: string;           // Ciudad
  legal_representative_name: string; // Nombre representante legal
  legal_representative_doc_type: string; // Tipo documento
  legal_representative_doc_number: string; // Número documento
  legal_representative_id_image: string | null; // URL cédula (frente)
  legal_representative_id_image_bk: string | null; // URL cédula (reverso)
  camara_comercio_image: string | null; // URL cámara de comercio
  created_at: string;            // Timestamp
  updated_at: string;            // Timestamp
}
```

**Relaciones:**
- `user_id` → `users.id`

---

## 🔗 Relaciones Principales

```
users (1) ──< (N) cars
  │
  ├──< (N) bookings (como cliente)
  │
  ├──< (N) bookings (como conductor)
  │
  └──< (N) bookings (como empresa)

users (1) ──< (1) companies
```

---

## 📊 Tipos de Usuario

### `user_type` Values

- `'admin'` - Administrador del sistema
- `'driver'` - Conductor
- `'customer'` - Cliente
- `'company'` - Empresa

---

## 🔐 Políticas de Seguridad (RLS)

### Supabase Row Level Security

Las políticas RLS deben configurarse en Supabase:

1. **users**: Solo admins pueden ver todos, conductores ven su propio perfil
2. **cars**: Conductores ven sus propios vehículos, admins ven todos
3. **bookings**: Usuarios ven sus propias reservas, admins ven todas

---

## 📁 Storage Buckets

### `driver-documents`
- Documentos de conductores
- Estructura: `{driver_id}/{document_type}_{filename}`

### `vehicle-documents`
- Documentos de vehículos
- Estructura: `{car_id}/{document_type}_{filename}`

### `public-site-assets`
- Imágenes de vehículos
- Estructura: `{car_id}/{filename}`

---

## 🔄 Estados y Enums

### Booking Status
```typescript
'NEW' | 'ACCEPTED' | 'STARTED' | 'REACHED' | 'PAID' | 'COMPLETE' | 'CANCELLED'
```

### Payment Mode
```typescript
'cash' | 'wallet' | 'card'
```

### Fuel Type
```typescript
'gasolina' | 'diesel' | 'electrico' | 'hibrido'
```

### Transmission
```typescript
'manual' | 'automatico'
```

---

## 📝 Notas Importantes

1. **Soft Delete**: Los usuarios no se eliminan físicamente, se marcan como `blocked: true`

2. **Timestamps**: Todos los timestamps son ISO 8601 strings

3. **JSON Fields**: Los campos JSON se usan para datos flexibles (ubicación, características)

4. **URLs de Storage**: Todas las URLs de imágenes/documentos apuntan a Supabase Storage

5. **Validaciones**: Se realizan a nivel de aplicación, no solo en BD

---

**Última actualización:** 2024
