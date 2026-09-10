import { createClient } from '@supabase/supabase-js';

const TEST_PROJECT_REF = 'lhqhdnjmewyipuwifzsl';
const url = process.env.TEST_SUPABASE_URL;
const secretKey = process.env.TEST_SUPABASE_SECRET_KEY;
const password = process.env.TEST_USER_PASSWORD;

if (!url || !secretKey || !password) {
  throw new Error(
    'Missing TEST_SUPABASE_URL, TEST_SUPABASE_SECRET_KEY or TEST_USER_PASSWORD.'
  );
}

if (new URL(url).hostname.split('.')[0] !== TEST_PROJECT_REF) {
  throw new Error(`Refusing to seed a project other than ${TEST_PROJECT_REF}.`);
}

if (password.length < 12) {
  throw new Error('TEST_USER_PASSWORD must contain at least 12 characters.');
}

const supabase = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const testUsers = [
  {
    email: 'admin.prueba@tmasplus.test',
    firstName: 'Admin',
    lastName: 'Prueba',
    userType: 'admin',
    mobile: '3000000001',
    approved: true,
    documentNumber: 'TEST-ADMIN-001',
  },
  {
    email: 'cliente.prueba@tmasplus.test',
    firstName: 'Cliente',
    lastName: 'Prueba',
    userType: 'customer',
    mobile: '3000000002',
    approved: true,
    documentNumber: 'TEST-CUSTOMER-001',
  },
  {
    email: 'conductor.uno@tmasplus.test',
    firstName: 'Conductor',
    lastName: 'Uno',
    userType: 'driver',
    mobile: '3000000003',
    approved: true,
    documentNumber: 'TEST-DRIVER-001',
  },
  {
    email: 'conductor.dos@tmasplus.test',
    firstName: 'Conductor',
    lastName: 'Dos',
    userType: 'driver',
    mobile: '3000000004',
    approved: true,
    documentNumber: 'TEST-DRIVER-002',
  },
];

async function findAuthUser(email) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const found = data.users.find(
      (user) => user.email?.toLowerCase() === email.toLowerCase()
    );
    if (found) return found;
    if (data.users.length < 100) return null;
  }
  throw new Error(`Unable to finish searching auth user ${email}.`);
}

async function ensureAuthUser(definition) {
  const existing = await findAuthUser(definition.email);
  if (existing) {
    const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: {
        first_name: definition.firstName,
        last_name: definition.lastName,
        user_type: definition.userType,
        test_fixture: true,
      },
    });
    if (error) throw error;
    return data.user;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: definition.email,
    password,
    email_confirm: true,
    user_metadata: {
      first_name: definition.firstName,
      last_name: definition.lastName,
      user_type: definition.userType,
      test_fixture: true,
    },
  });
  if (error) throw error;
  return data.user;
}

const authUsers = new Map();
for (const definition of testUsers) {
  const authUser = await ensureAuthUser(definition);
  authUsers.set(definition.email, authUser);

  const { error } = await supabase.from('users').upsert(
    {
      id: authUser.id,
      auth_id: authUser.id,
      email: definition.email,
      first_name: definition.firstName,
      last_name: definition.lastName,
      mobile: definition.mobile,
      user_type: definition.userType,
      approved: definition.approved,
      blocked: false,
      is_active: true,
      is_verified: true,
      verified: true,
      document_type: 'CC',
      document_number: definition.documentNumber,
      city: 'Bogotá',
    },
    { onConflict: 'id' }
  );
  if (error) throw error;
}

const carTypes = [
  {
    id: '2acdb415-df6d-4087-bc54-1c741ea86de6',
    name: 'ConfortPlus',
    description: 'Categoría sintética ConfortPlus',
    base_price: 10800,
    price_per_km: 660,
    capacity: 4,
  },
  {
    id: '102d2c48-ee88-4652-ae6c-8f2fe3ae2d20',
    name: 'TaxiPlus',
    description: 'Categoría sintética TaxiPlus',
    base_price: 4920,
    price_per_km: 540,
    capacity: 4,
  },
  {
    id: 'a111364a-95d0-4ac8-8305-35c7536dd064',
    name: 'VanPlus',
    description: 'Categoría sintética VanPlus',
    base_price: 30000,
    price_per_km: 390,
    capacity: 10,
  },
  {
    id: '6975bdc7-e6b0-4002-ba3b-45f2a5d439cc',
    name: 'XPlus',
    description: 'Categoría sintética XPlus',
    base_price: 4800,
    price_per_km: 500,
    capacity: 4,
  },
];

for (const carType of carTypes) {
  const { error } = await supabase.from('car_types').upsert(
    {
      ...carType,
      is_active: true,
      base_price_inter: carType.base_price * 2,
      price_per_km_inter: carType.price_per_km * 2,
      min_fare: carType.base_price,
      min_fare_inter: carType.base_price * 2,
      convenience_fee: 0,
      convenience_fee_type: 'fixed',
    },
    { onConflict: 'id' }
  );
  if (error) throw error;
}

const driverOne = authUsers.get('conductor.uno@tmasplus.test');
const driverTwo = authUsers.get('conductor.dos@tmasplus.test');

const cars = [
  {
    id: '93000000-0000-0000-0000-000000000001',
    driver_id: driverOne.id,
    make: 'Toyota',
    model: 'Corolla Test',
    color: 'Negro',
    plate: 'TST001',
    capacity: 4,
    service_type: 'servicio_especial',
  },
  {
    id: '93000000-0000-0000-0000-000000000002',
    driver_id: driverTwo.id,
    make: 'Renault',
    model: 'Logan Test',
    color: 'Blanco',
    plate: 'TST002',
    capacity: 4,
    service_type: 'taxi_plus',
  },
];

for (const car of cars) {
  const { error } = await supabase.from('cars').upsert(
    { ...car, is_active: true },
    { onConflict: 'id' }
  );
  if (error) throw error;
}

const today = new Date();
const startsOn = new Date(today);
startsOn.setUTCDate(startsOn.getUTCDate() - 1);
const endsOn = new Date(today);
endsOn.setUTCDate(endsOn.getUTCDate() + 30);
const isoDate = (date) => date.toISOString().slice(0, 10);

const memberships = [
  {
    uid: '94000000-0000-0000-0000-000000000001',
    conductor: driverOne.id,
  },
  {
    uid: '94000000-0000-0000-0000-000000000002',
    conductor: driverTwo.id,
  },
];

for (const membership of memberships) {
  const { error } = await supabase.from('memberships').upsert(
    {
      ...membership,
      status: 'ACTIVA',
      costo: 157200,
      fecha_inicio: isoDate(startsOn),
      fecha_terminada: isoDate(endsOn),
      periodo: 30,
    },
    { onConflict: 'uid' }
  );
  if (error) throw error;
}

console.log(
  JSON.stringify(
    {
      projectRef: TEST_PROJECT_REF,
      authUsers: testUsers.map(({ email, userType }) => ({ email, userType })),
      carTypes: carTypes.map(({ id, name }) => ({ id, name })),
      cars: cars.map(({ id, plate, service_type }) => ({ id, plate, service_type })),
      memberships: memberships.length,
    },
    null,
    2
  )
);
