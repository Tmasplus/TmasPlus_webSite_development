# Especificación: Sistema de Referidos (para la App móvil)

> Documento para que la app móvil replique la lógica de referidos que ya usa el
> dashboard web T+Plus. Backend: **Supabase / Postgres** (proyecto principal
> `vlavutmqyrzloivukbqg`).

---

## 1. Tablas involucradas

### `users` (tabla existente)
Columna relevante para referidos:

| Columna | Tipo | Descripción |
|---|---|---|
| `referral_id` | `text` (nullable) | Código de referido **que el conductor escribió al registrarse** (el código de quien lo invitó). NO es su propio código. |

### `referral_codes` — el código propio de cada conductor
Cada conductor tiene **exactamente uno**. Lo genera un trigger en la BD (ver §4).

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` | PK |
| `driver_id` | `uuid` | FK → `users.id` (dueño del código) |
| `referral_code` | `text` | Código único, en MAYÚSCULAS. Formato: `AAA-XXXXX` (ver §3) |
| `is_active` | `bool` | default `true` |
| `total_referrals` | `int` | Contador de referidos. default `0` |
| `created_at` | `timestamptz` | |

### `referrals` — relación referidor ↔ referido
Una fila por cada conductor que entra usando el código de otro.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` | PK |
| `referral_code_id` | `uuid` | FK → `referral_codes.id` |
| `referrer_id` | `uuid` | FK → `users.id` (quien refiere = dueño del código) |
| `referred_driver_id` | `uuid` | FK → `users.id` (el conductor nuevo) |
| `referral_code` | `text` | Copia del código usado |
| `status` | `text` | `'pending'` \| `'approved'` \| `'completed'` \| `'cancelled'` ⚠️ ver §6 |
| `reward_claimed` | `bool` | default `false` |
| `referred_at` | `timestamptz` | default `now()` |

---

## 2. Flujo completo

1. **Registro** — el conductor introduce (opcional) el código de quien lo invitó.
   - Pasar a MAYÚSCULAS y hacer `trim()`.
   - **Validar** antes de continuar:
     ```sql
     SELECT * FROM referral_codes
     WHERE referral_code = UPPER(:code) AND is_active = true;
     ```
     Si no existe → "Código de referido inválido o inactivo".
   - Guardar el código validado en `users.referral_id` (el dashboard lo mete en
     los metadatos del `auth.signUp`, y el trigger lo copia a la fila de `users`).

2. **Generación del código propio** — **NO lo hace la app**. Un trigger SQL
   (`handle_new_user`) crea la fila en `referral_codes` al darse de alta el
   conductor. La app solo lo **lee** para mostrarlo/compartirlo:
   ```sql
   SELECT referral_code, total_referrals
   FROM referral_codes WHERE driver_id = :driverId;
   ```
   Mientras el trigger no lo haya creado, mostrar estado "Generando…".

3. **Crear la relación de referido** (`referrals`) — aplicar estas reglas:
   - El código debe existir y estar `is_active = true`.
   - ❌ No se puede usar el **código propio** (`referral_codes.driver_id == referredDriverId`).
   - ❌ Un conductor solo puede ser referido **una vez**
     (`SELECT id FROM referrals WHERE referred_driver_id = :id` debe estar vacío).
   - Insertar con `status = 'pending'`, `reward_claimed = false`.
   - Incrementar `referral_codes.total_referrals += 1`.

4. **Estados / recompensas**:
   - Cambio de estado: `pending → approved/completed → cancelled`.
   - Reclamar recompensa: solo si `status` final (completed) y `reward_claimed = false`;
     luego poner `reward_claimed = true`.

---

## 3. Formato del código (deducido de datos reales)

Patrón: **`AAA-XXXXX`**
- `AAA` = primeras 3 letras del **nombre** del conductor, en mayúscula.
- `XXXXX` = 5 caracteres hexadecimales en mayúscula (`0-9 A-F`), aparentemente
  derivados de un hash/uuid aleatorio.

Ejemplos reales: `SOR-C4445`, `WIL-BD5C7`, `LUI-69958`, `ALE-F8E4A`, `PAB-F0381`.
Existe además un código manual especial: `TMAS-ADMIN`.

> La app **no** debe generar este código (lo hace el trigger). Esto es solo para
> que sepas cómo se ve y valides longitud/formato si lo muestras.

---

## 4. Trigger SQL (pendiente de extraer del proyecto)

El código fuente del trigger **no está en el repositorio** (no hay migraciones
versionadas; está aplicado directo en Supabase). Se llama `handle_new_user` y,
según la doc, lee `city` y `referral_id` de los metadatos del usuario nuevo,
crea la fila en `users` y genera la fila en `referral_codes`.

Para extraer su definición exacta, ejecutar en **Supabase → SQL Editor**:

```sql
-- Ver el código del trigger / función
SELECT pg_get_functiondef(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname = 'handle_new_user';

-- Ver a qué tabla/evento está enganchado
SELECT event_object_table, action_timing, event_manipulation, trigger_name, action_statement
FROM information_schema.triggers
WHERE trigger_name ILIKE '%user%' OR action_statement ILIKE '%referral%';
```

Confirmar con eso: en qué evento dispara (al `auth.users` insert vs. al aprobar)
y la fórmula exacta del sufijo de 5 caracteres, para replicarla idéntica.

---

## 5. Endpoints de referencia en el dashboard (lógica ya implementada)

`src/services/referrals.service.ts`:
- `validateReferralCode(code)` — valida existencia + activo.
- `checkCodeValidity(code)` — validación en tiempo real (UI).
- `createReferral({ referralCode, referredDriverId })` — crea la relación con las 3 reglas.
- `getDriverReferralCode(driverId)` — código + referidos + conteos.
- `getDriverReferrals(driverId, page, limit, filters)` — lista paginada.
- `getDriverReferralStats(driverId)` — totales.
- `updateReferralStatus(id, status)` / `claimReferralReward(id)`.

---

## 6. ⚠️ Discrepancias a alinear entre web y app

1. **Valores de `status`**: el código TS define `'pending' | 'completed' | 'cancelled'`,
   pero en la BD real hay filas con `status = 'approved'`. Acordar el set definitivo
   de estados antes de implementar en la app.
2. **Posibles referidos duplicados**: en datos reales aparecen filas en `referrals`
   con el mismo `referrer_id` + `referred_driver_id` repetidas. La regla "solo una vez"
   no está garantizada a nivel BD. **Recomendado**: añadir un índice único
   `UNIQUE (referred_driver_id)` en `referrals` para forzarlo.
3. **Recompensas**: `getDriverReferralStats` devuelve `total_rewards` y
   `unclaimed_rewards` hardcodeados en `0`. La lógica de montos de recompensa
   aún no existe; definirla si la app la necesita.

---

## 7. Cambios implementados (2026-06-06)

> Arquitectura: el dashboard se autentica contra el proyecto **primario**
> (`vlavutmqyrzloivukbqg`, donde viven `referral_codes` / `referrals` /
> `users.referral_id`). "La App" usa el proyecto **secundario**
> (`utofhxgzkdhljrixperh`). Los conductores se llevan del primario a la App con
> el botón **Importar** de la pestaña Conductores, vía Edge Functions con
> `service_role`.

### 7.1 El código de referido ahora se importa a `users` de la App
Antes, al importar un conductor NO se copiaba su `referral_id` (el código de
quien lo invitó) a la base de la App. Ahora sí.

- `supabase/functions/import-driver/index.ts`: la interfaz `ImportDriverBody`
  acepta `referral_id`; se escribe en `users.referral_id` tanto al crear la fila
  nueva (`baseFields`) como al re-importar una existente (`stateFields`).
- `src/pages/Users/DriversPage.tsx` (`importOne`): envía
  `referral_id: driver.referral_id ?? null`.
- `src/services/usersSecondary.service.ts` (`importDriverWithAuth`): el tipo de
  entrada incluye `referral_id`.

### 7.2 Usuarios bloqueados hasta ser aprobados (aprobar = desbloquear)
Regla nueva: **todo usuario nace BLOQUEADO + PENDIENTE en la App y solo el
admin, al aprobarlo, lo desbloquea**. El campo `blocked` es el espejo de
`!approved`.

| Archivo | Antes | Ahora |
|---|---|---|
| `functions/create-driver/index.ts` | `approved: true, blocked: false` | `approved: false, blocked: true` |
| `functions/create-customer/index.ts` | `approved: true, blocked: false` | `approved: false, blocked: true` |
| `functions/import-driver/index.ts` | `approved` por defecto `true`; `blocked` por defecto `false` | `approved` por defecto `false`; `blocked = !approved \|\| blockedExplícito` |
| `functions/set-user-approved/index.ts` | solo cambiaba `approved` | cambia `approved` **y** `blocked: !approved` |

Efecto: aprobar a un conductor/cliente lo desbloquea (puede entrar a la App);
quitarle la aprobación lo vuelve a bloquear. Un bloqueo manual explícito
(ban) desde el dashboard sigue prevaleciendo en la importación.

> ⚠️ **Impacto a tener en cuenta:** los usuarios creados manualmente por el admin
> (AddUserModal → create-driver / create-customer) también nacen ahora
> pendientes y bloqueados; hay que aprobarlos para que ingresen.

### 7.3 En Usuarios se muestra cuántos ha referido cada uno
`src/pages/Users/UsersPage.tsx`:
- Nueva columna **"Referidos"** en la tabla (y en el export CSV) con el conteo
  `referral_codes.total_referrals` del usuario, leído de la BD primaria por
  `driver_id` (= `users.id` o `auth_id`).
- El **número de teléfono** ya se mostraba en la columna "Teléfono"; se mantiene.

### 7.4 ⚠️ Despliegue requerido
Los cambios en `supabase/functions/*` son **Edge Functions**: no surten efecto
hasta volver a desplegarlas. Re-desplegar las cuatro funciones tocadas:

```bash
supabase functions deploy import-driver
supabase functions deploy set-user-approved
supabase functions deploy create-driver
supabase functions deploy create-customer
```

Los cambios del frontend (`DriversPage`, `UsersPage`, `usersSecondary.service`)
entran con el próximo build/deploy del dashboard.

### 7.5 Indicación para la App móvil
La App debe **respetar `users.blocked`**: si `blocked = true` (o `approved =
false`), impedir el ingreso/login y mostrar "cuenta pendiente de aprobación".
El desbloqueo ocurre exclusivamente cuando el admin aprueba desde el dashboard.

### 7.6 Expediente del Cliente: muestra su código y cuántos ha referido
Hallazgo: **el proyecto secundario (App) tiene su propia tabla
`referral_codes`** y los **clientes también tienen código propio**, con prefijo
`CLI-` (ej. cliente `6bb01f73-…` → código `CLI-0DC7D`). Es independiente de la
tabla `referral_codes` del primario.

`src/pages/Users/DriverReviewModal.tsx` (expediente de cliente y conductor):
- Antes el modal **saltaba** la consulta para clientes (`user_type = 'customer'`)
  y ocultaba el bloque "Programa de Referidos" con `!isCustomer`.
- Ahora carga `referral_codes` (por `driver_id = users.id`, en la BD que
  corresponda al `source` del expediente) **también para clientes** y muestra el
  bloque con su **código** y el total de **Personas Referidas**.
- El label se adapta: "Personas Referidas" para clientes, "Usuarios Invitados"
  para conductores.
