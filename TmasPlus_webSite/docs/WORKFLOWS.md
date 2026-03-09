# 🔄 Flujos de Trabajo Principales - TmasPlus Dashboard

## 📋 Índice

1. [Registro de Conductor](#registro-de-conductor)
2. [Aprobación de Conductor](#aprobación-de-conductor)
3. [Gestión de Vehículo](#gestión-de-vehículo)
4. [Creación de Reserva](#creación-de-reserva)
5. [Proceso de Facturación](#proceso-de-facturación)

---

## 👨‍✈️ Registro de Conductor

### Flujo Completo

```
┌─────────────────────────────────────────────────────────┐
│  PASO 1: Datos Básicos                                  │
│  - Email, contraseña, nombre, teléfono, ciudad         │
│  - Validación: email y teléfono únicos                  │
│  - Crea usuario en Supabase Auth                        │
│  - Crea registro en tabla users (approved: false)      │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────┐
│  PASO 2: Información de Vehículo                        │
│  - Marca, modelo, año, color, placa                     │
│  - Validación: placa única                               │
│  - Crea vehículo en tabla cars                          │
│  - Asocia vehículo con conductor                        │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────┐
│  PASO 3: Documentos del Conductor                       │
│  - Licencia (frente y reverso)                          │
│  - SOAT                                                  │
│  - Tarjeta de propiedad (frente y reverso)              │
│  - Cédula (frente y reverso)                             │
│  - Sube archivos a Storage                               │
│  - Guarda URLs en tabla users                           │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────┐
│  PASO 4: Datos de Empresa (Opcional)                    │
│  - Nombre empresa, NIT, dirección                       │
│  - Representante legal y documentos                     │
│  - Cámara de comercio                                   │
│  - Crea registro en tabla companies                      │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────┐
│  RESULTADO: Conductor registrado (pendiente aprobación) │
│  - approved: false                                       │
│  - driver_active_status: false                          │
└──────────────────────────────────────────────────────────┘
```

### Código de Ejemplo

```typescript
// Paso 1
const { userId, authId } = await DriversService.registerStep1({
  email: 'driver@example.com',
  password: 'password123',
  first_name: 'Juan',
  last_name: 'Pérez',
  mobile: '+584121234567',
  city: 'Caracas'
});

// Paso 2
const car = await DriversService.registerStep2(userId, {
  make: 'Toyota',
  model: 'Corolla',
  year: 2020,
  color: 'Blanco',
  plate: 'ABC123'
});

// Paso 3
await DriversService.registerStep3(userId, {
  license_number: '123456',
  license_image: licenseFile,
  license_image_back: licenseBackFile,
  soat_image: soatFile,
  card_prop_image: cardPropFile,
  card_prop_image_bk: cardPropBackFile,
  verify_id_image: idFile,
  verify_id_image_bk: idBackFile
});

// Paso 4 (opcional)
await DriversService.registerStep4(userId, {
  company_name: 'Mi Empresa',
  company_nit: 'J-12345678-9',
  // ... más campos
});
```

---

## ✅ Aprobación de Conductor

### Flujo de Aprobación

```
┌─────────────────────────────────────────────────────────┐
│  1. Admin revisa documentos del conductor               │
│     - Verifica documentos en Storage                      │
│     - Revisa información del vehículo                   │
└──────────────────┬──────────────────────────────────────┘
                   │
         ┌─────────┴─────────┐
         │                   │
    ┌────▼────┐        ┌─────▼─────┐
    │ APROBAR │        │ RECHAZAR  │
    └────┬────┘        └─────┬─────┘
         │                   │
┌────────▼─────────┐  ┌─────▼──────────┐
│ approved: true    │  │ approved: false│
│ driver_active_    │  │ (opcional)      │
│ status: true      │  │ blocked: true   │
│                   │  │                 │
│ Conductor puede   │  │ Conductor       │
│ trabajar          │  │ bloqueado      │
└───────────────────┘  └─────────────────┘
```

### Código de Ejemplo

```typescript
// Aprobar
await DriversService.approveDriver(userId);
// Actualiza: approved: true, driver_active_status: true

// Rechazar
await DriversService.rejectDriver(userId, 'Documentos incompletos');
// Actualiza: approved: false, (opcional) blocked: true
```

---

## 🚗 Gestión de Vehículo

### Flujo de Creación

```
┌─────────────────────────────────────────────────────────┐
│  1. Validar placa única                                 │
│     - CarsService.plateExists(plate)                    │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────┐
│  2. Crear vehículo                                      │
│     - Datos básicos (marca, modelo, año, etc.)          │
│     - Asociar con conductor (driver_id)                 │
│     - Valores por defecto:                              │
│       * fuel_type: 'gasolina'                           │
│       * transmission: 'manual'                          │
│       * capacity: 4                                     │
│       * is_active: true                                 │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────┐
│  3. Subir documentos (opcional)                         │
│     - SOAT                                              │
│     - Tarjeta de propiedad                              │
│     - Técnico-mecánica                                  │
│     - Cámara de comercio                                │
│     - Guarda URLs en tabla cars                         │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────┐
│  4. Subir imágenes (opcional)                           │
│     - Imagen principal del vehículo                     │
│     - Guarda URL en car_image                           │
└─────────────────────────────────────────────────────────┘
```

### Código de Ejemplo

```typescript
// Validar placa
const exists = await CarsService.plateExists('ABC123');
if (exists) {
  throw new Error('Placa ya registrada');
}

// Crear vehículo
const car = await CarsService.createCar({
  driver_id: driverId,
  make: 'Toyota',
  model: 'Corolla',
  year: 2020,
  color: 'Blanco',
  plate: 'ABC123',
  fuel_type: 'gasolina',
  transmission: 'automatico',
  capacity: 4
});

// Subir documentos
const soatResult = await StorageService.uploadVehicleDocument(
  car.id,
  'soat',
  soatFile
);

await CarsService.updateCarDocuments(car.id, {
  soat_image: soatResult.url,
  soat_expiry_date: '2025-12-31'
});
```

---

## 📅 Creación de Reserva

### Flujo de Reserva Corporativa

```
┌─────────────────────────────────────────────────────────┐
│  1. Cliente/Admin crea reserva                          │
│     - Origen y destino                                  │
│     - Tipo de vehículo                                  │
│     - Fecha y hora (opcional)                           │
│     - Método de pago                                    │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────┐
│  2. Calcular tarifa                                      │
│     - Tarifa base según tipo vehículo                   │
│     - Ajustes por:                                       │
│       * Ida y vuelta (+80%)                             │
│       * Programado (+3000)                              │
│       * Horas adicionales (+1500/hora)                  │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────┐
│  3. Crear booking                                        │
│     - status: 'NEW'                                     │
│     - Guardar en tabla bookings                         │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────┐
│  4. Asignar conductor (automático o manual)             │
│     - Buscar conductor disponible                       │
│     - Asignar vehículo                                  │
│     - status: 'ACCEPTED'                                │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────┐
│  5. Proceso del viaje                                   │
│     - STARTED: Conductor inicia viaje                   │
│     - REACHED: Llegó al destino                         │
│     - PAID: Pago realizado                             │
│     - COMPLETE: Viaje completado                       │
└──────────────────────────────────────────────────────────┘
```

### Código de Ejemplo

```typescript
// Crear reserva
const booking = await BookingsService.createBooking({
  user_id: userId,
  origin: { lat: 10.5, lng: -66.9, address: 'Origen' },
  destination: { lat: 10.6, lng: -66.8, address: 'Destino' },
  fare: 10000,
  payment_mode: 'cash',
  scheduled_at: '2024-12-25T10:00:00Z'
});

// Asignar conductor
await BookingsService.assignDriver(booking.id, driverId, carId);

// Actualizar estado
await BookingsService.updateStatus(booking.id, 'STARTED');
```

---

## 💰 Proceso de Facturación

### Flujo de Facturación Empresarial

```
┌─────────────────────────────────────────────────────────┐
│  1. Generar factura                                     │
│     - Agrupar bookings por empresa                      │
│     - Calcular total                                    │
│     - Generar número de factura                         │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────┐
│  2. Crear registro de factura                          │
│     - Datos de empresa                                  │
│     - Período facturado                                 │
│     - Detalle de bookings                               │
│     - Total a pagar                                    │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────┐
│  3. Generar PDF                                         │
│     - Usar @react-pdf/renderer                          │
│     - Incluir logo, datos empresa                       │
│     - Detalle de servicios                              │
│     - Total y método de pago                           │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────┐
│  4. Enviar factura                                      │
│     - Email a empresa                                   │
│     - Descargar PDF                                     │
│     - Marcar como enviada                               │
└──────────────────────────────────────────────────────────┘
```

---

## 🔄 Estados de Reserva

### Diagrama de Estados

```
    NEW
     │
     ├─→ ACCEPTED (conductor asignado)
     │        │
     │        ├─→ STARTED (viaje iniciado)
     │        │        │
     │        │        ├─→ REACHED (llegó al destino)
     │        │        │        │
     │        │        │        ├─→ PAID (pago realizado)
     │        │        │        │        │
     │        │        │        │        └─→ COMPLETE ✅
     │        │        │        │
     │        │        │        └─→ CANCELLED ❌
     │        │        │
     │        │        └─→ CANCELLED ❌
     │        │
     │        └─→ CANCELLED ❌
     │
     └─→ CANCELLED ❌
```

---

## 🔐 Flujo de Autenticación

```
┌─────────────────────────────────────────────────────────┐
│  1. Usuario ingresa credenciales                        │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────┐
│  2. AuthService.loginAdmin()                            │
│     - Valida con Supabase Auth                          │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────┐
│  3. Obtener perfil de usuario                           │
│     - Buscar en tabla users por auth_id                 │
└──────────────────┬──────────────────────────────────────┘
                   │
         ┌─────────┴─────────┐
         │                   │
    ┌────▼────┐        ┌─────▼─────┐
    │  VÁLIDO │        │ INVÁLIDO  │
    └────┬────┘        └─────┬─────┘
         │                   │
┌────────▼─────────┐  ┌─────▼──────────┐
│ user_type: admin │  │ Cerrar sesión  │
│ approved: true   │  │ Mostrar error  │
│ blocked: false   │  │                │
│                  │  │                │
│ Acceso permitido │  │ Acceso denegado│
└──────────────────┘  └────────────────┘
```

---

## 📝 Notas Importantes

1. **Validaciones**: Todos los flujos incluyen validaciones en cada paso
2. **Errores**: Todos los errores se manejan con `ErrorHandler`
3. **Storage**: Los archivos se suben antes de guardar URLs en BD
4. **Transacciones**: Algunas operaciones deberían ser transaccionales (futuro)
5. **Notificaciones**: Los cambios importantes deberían notificar (futuro)

---

**Última actualización:** 2024
