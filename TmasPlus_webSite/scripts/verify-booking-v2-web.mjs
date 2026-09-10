import { createClient } from '@supabase/supabase-js';

const url = process.env.TEST_SUPABASE_URL;
const key = process.env.TEST_SUPABASE_PUBLISHABLE_KEY;
const password = process.env.TEST_USER_PASSWORD;
if (!url || !key || !password) throw new Error('Missing test environment variables.');
if (!url.includes('lhqhdnjmewyipuwifzsl')) throw new Error('Refusing to test a non-test project.');

const client = createClient(url, key, { auth: { persistSession: false } });
const { error: loginError } = await client.auth.signInWithPassword({
  email: 'admin.prueba@tmasplus.test',
  password,
});
if (loginError) throw loginError;

const [{ data: customers, error: customerError }, { data: categories, error: categoryError }] = await Promise.all([
  client.from('users').select('id').eq('email', 'cliente.prueba@tmasplus.test').limit(1),
  client.from('car_types').select('id').eq('name', 'ConfortPlus').eq('is_active', true).limit(1),
]);
if (customerError || categoryError) throw customerError || categoryError;
const customerId = customers?.[0]?.id;
const categoryId = categories?.[0]?.id;
if (!customerId || !categoryId) throw new Error('Missing customer or category fixture.');

const schema = client.schema('booking_v2');
const idempotencyKey = `web-verification-${crypto.randomUUID()}`;
const { data: bookingId, error: createError } = await schema.rpc('create_booking', {
  p_idempotency_key: idempotencyKey,
  p_customer_id: customerId,
  p_requested_car_type_id: categoryId,
  p_booking_type: 'IMMEDIATE',
  p_scheduled_at: null,
  p_request_expires_at: null,
  p_pickup_address: 'Origen de prueba',
  p_pickup_lat: 4.711,
  p_pickup_lng: -74.0721,
  p_dropoff_address: 'Destino de prueba',
  p_dropoff_lat: 4.65,
  p_dropoff_lng: -74.1,
  p_waypoints: [],
  p_observations: 'Prueba web booking_v2',
  p_payment_mode: 'cash',
  p_estimated_distance_m: 8500,
  p_estimated_duration_s: 1200,
  p_estimated_fare: 25000,
  p_tariff_snapshot: { source: 'web-verification' },
});
if (createError) throw createError;

const { data: rows, error: readError } = await schema.from('bookings').select('id, status').eq('id', bookingId);
if (readError) throw readError;
if (rows?.[0]?.status !== 'PENDING') throw new Error('Created booking is not visible as PENDING.');

const { error: deleteError } = await schema.rpc('delete_booking', { p_booking_id: bookingId });
if (deleteError) throw deleteError;

console.log(JSON.stringify({ login: 'ok', schema: 'booking_v2', create: 'ok', read: 'ok', delete: 'ok' }, null, 2));
