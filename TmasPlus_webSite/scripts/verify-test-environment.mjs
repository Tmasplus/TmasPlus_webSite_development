import { createClient } from '@supabase/supabase-js';

const TEST_PROJECT_REF = 'lhqhdnjmewyipuwifzsl';
const url = process.env.TEST_SUPABASE_URL;
const publishableKey = process.env.TEST_SUPABASE_PUBLISHABLE_KEY;
const password = process.env.TEST_USER_PASSWORD;

if (!url || !publishableKey || !password) {
  throw new Error(
    'Missing TEST_SUPABASE_URL, TEST_SUPABASE_PUBLISHABLE_KEY or TEST_USER_PASSWORD.'
  );
}

if (new URL(url).hostname.split('.')[0] !== TEST_PROJECT_REF) {
  throw new Error(`Refusing to verify a project other than ${TEST_PROJECT_REF}.`);
}

const supabase = createClient(url, publishableKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
  email: 'admin.prueba@tmasplus.test',
  password,
});
if (loginError) throw loginError;
if (!loginData.session) throw new Error('Admin test login returned no session.');

const { data: profile, error: profileError } = await supabase.rpc('get_auth_profile');
if (profileError) throw profileError;
if (profile?.user_type !== 'admin') {
  throw new Error(`Expected admin profile, got ${profile?.user_type ?? 'null'}.`);
}

const { data: customers, error: customerError } = await supabase
  .from('users')
  .select('id, email, first_name, last_name, mobile, user_type')
  .eq('email', 'cliente.prueba@tmasplus.test')
  .limit(1);
if (customerError) throw customerError;
const customer = customers?.[0];
if (!customer) throw new Error('Synthetic customer not found.');

const { data: categories, error: categoryError } = await supabase
  .from('car_types')
  .select('id, name, is_active')
  .eq('is_active', true)
  .order('name');
if (categoryError) throw categoryError;
if (categories?.length !== 4) {
  throw new Error(`Expected 4 active categories, got ${categories?.length ?? 0}.`);
}

const authHeader = { Authorization: `Bearer ${loginData.session.access_token}` };

async function invokeFunction(name, body) {
  const response = await fetch(`${url}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${loginData.session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`${name} returned ${response.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

const existingResult = await invokeFunction('list-bookings', {
  query: 'TEST-BOOKING-001',
  limit: 1,
});
if (!existingResult?.success) throw new Error(existingResult?.error || 'list-bookings failed.');

let booking = existingResult.bookings?.[0] ?? null;

if (!booking) {
  const category = categories.find((item) => item.name === 'ConfortPlus');
  const now = new Date().toISOString();
  const bookingPayload = {
    customer_id: customer.id,
    customer: customer.id,
    customer_name: `${customer.first_name} ${customer.last_name}`,
    customer_email: customer.email,
    customer_contact: customer.mobile,
    status: 'PENDING',
    customer_status: 'SEARCHING',
    pickup_location: {
      lat: 4.6000000,
      lng: -74.0800000,
      address: 'Origen sintético de prueba',
    },
    destination_location: {
      lat: 4.6500000,
      lng: -74.1000000,
      address: 'Destino sintético de prueba',
    },
    drop_location: {
      lat: 4.6500000,
      lng: -74.1000000,
      address: 'Destino sintético de prueba',
    },
    pickup_address: 'Origen sintético de prueba',
    pickup_lat: 4.6000000,
    pickup_lng: -74.0800000,
    drop_address: 'Destino sintético de prueba',
    drop_lat: 4.6500000,
    drop_lng: -74.1000000,
    distance: 8.5,
    duration: 20,
    car_type: category.name,
    car_type_id: category.id,
    trip_type: 'one_way',
    booking_type: 'immediate',
    booking_date: now,
    payment_mode: 'cash',
    price: 20000,
    estimate: 22000,
    trip_cost: 20000,
    total_cost: 20000,
    driver_share: 20000,
    convenience_fees: 0,
    discount: 0,
    observations: 'Reserva sintética creada por verify-test-environment.mjs',
    reference: 'TEST-BOOKING-001',
    prepaid: false,
    promo_applied: false,
    customer_token: '',
    requested_drivers: {},
    driver_estimates: {},
    waypoints: [],
    otp_verified: false,
    otp_timer_duration: 180,
  };

  const created = await invokeFunction('create-booking', { booking: bookingPayload });
  if (!created?.success || !created.booking) {
    throw new Error(created?.error || 'create-booking failed.');
  }
  booking = created.booking;
}

const driverResult = await invokeFunction('assign-booking-driver', {
  action: 'list-drivers',
  query: '',
});
if (!driverResult?.success) {
  throw new Error(driverResult?.error || 'list-drivers failed.');
}
if (driverResult.drivers?.length !== 2) {
  throw new Error(`Expected 2 assignable drivers, got ${driverResult.drivers?.length ?? 0}.`);
}

if (!booking.driver_id) {
  const driver = driverResult.drivers[0];
  const assigned = await invokeFunction('assign-booking-driver', {
    action: 'assign',
    bookingId: booking.id,
    driverId: driver.id,
  });
  if (!assigned?.success || !assigned.booking?.driver_id) {
    throw new Error(assigned?.error || 'assign-booking-driver failed.');
  }
  booking = assigned.booking;
}

const finalResult = await invokeFunction('list-bookings', {
  query: booking.id,
  limit: 1,
});
const verifiedBooking = finalResult?.bookings?.[0];
if (!verifiedBooking?.driver_id || !verifiedBooking?.car_id) {
  throw new Error('Final booking is missing driver_id or car_id.');
}

console.log(
  JSON.stringify(
    {
      projectRef: TEST_PROJECT_REF,
      login: 'ok',
      profile: profile.user_type,
      customers: customers.length,
      activeCategories: categories.map((item) => item.name),
      assignableDrivers: driverResult.drivers.length,
      booking: {
        id: verifiedBooking.id,
        reference: verifiedBooking.reference,
        status: verifiedBooking.status,
        driverId: verifiedBooking.driver_id,
        carId: verifiedBooking.car_id,
        carTypeId: verifiedBooking.car_type_id,
      },
    },
    null,
    2
  )
);

await supabase.auth.signOut();
