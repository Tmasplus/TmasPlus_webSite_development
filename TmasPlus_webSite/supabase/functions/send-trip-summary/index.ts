import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const FROM_EMAIL = Deno.env.get('MAIL_FROM_EMAIL') ?? 'aprobaciones@mail.tmasplus.com'
const FROM_NAME = Deno.env.get('MAIL_FROM_NAME') ?? 'T+Plus'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

function fmtMoney(v: any): string {
  const n = Number(v)
  if (!isFinite(n) || n === 0) return '—'
  return COP.format(n)
}

function fmtDuration(min: any): string {
  const n = Number(min)
  if (!isFinite(n) || n <= 0) return '—'
  const h = Math.floor(n / 60)
  const m = Math.round(n % 60)
  return h > 0 ? `${h}h ${m}min` : `${m} min`
}

function fmtDistance(v: any): string {
  const n = Number(v)
  if (!isFinite(n) || n <= 0) return '—'
  return `${n.toFixed(1)} km`
}

serve(async (req: Request) => {
  try {
    const payload = await req.json()
    console.log("🚀 PAYLOAD RECIBIDO:", JSON.stringify({ id: payload.record?.id, tabla: payload.table, esquema: payload.schema }))

    if (payload.schema !== 'public') return new Response("Ignorado: Esquema incorrecto", { status: 200 })
    if (payload.table !== 'bookings') return new Response("Ignorado: Tabla incorrecta", { status: 200 })

    const { record, old_record } = payload
    if (!record?.id) return new Response("Sin ID", { status: 200 })

    const COMPLETED_STATUSES = ['COMPLETE', 'COMPLETED']
    const isNowCompleted = COMPLETED_STATUSES.includes(record?.status)
    const wasPreviouslyCompleted = COMPLETED_STATUSES.includes(old_record?.status)

    console.log("📊 STATUS CHECK:", JSON.stringify({
      newStatus: record?.status,
      oldStatus: old_record?.status,
      isNowCompleted,
      wasPreviouslyCompleted,
      customer_email: record?.customer_email,
    }))

    if (!(isNowCompleted && !wasPreviouslyCompleted)) {
      console.log(`⏸️ Ignorado: status actual="${record?.status}" anterior="${old_record?.status}"`)
      return new Response("No action required", { status: 200 })
    }

    const emailDestino = record.customer_email
    if (!emailDestino) {
      console.log("⚠️ Sin customer_email — no se puede enviar resumen.")
      return new Response("Sin email destino", { status: 200 })
    }

    const nombreCliente = record.customer_name || 'Cliente'
    const referencia = record.reference || record.id
    const origen = record.pickup_address || '—'
    const destino = record.drop_address || '—'
    const distancia = fmtDistance(record.distance)
    const duracion = fmtDuration(record.duration)
    const precio = fmtMoney(record.price)
    const total = fmtMoney(record.total_cost ?? record.price)
    const metodoPago = record.payment_mode || '—'

    const descuentoNum = Number(record.discount)
    const hayDescuento = isFinite(descuentoNum) && descuentoNum > 0
    const descuentoRow = hayDescuento
      ? `<tr>
            <td style="padding: 4px 0; color: #597a8b; font-size: 14px;">Descuento</td>
            <td style="padding: 4px 0; color: #00a7f5; font-size: 14px; text-align: right;">-${fmtMoney(descuentoNum)}</td>
          </tr>`
      : ''

    console.log(`✅ COMPLETED detectado para ${emailDestino} (ref ${referencia})`)

    const htmlContent = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Resumen de tu viaje T+Plus</title></head>
<body style="font-family: Arial, sans-serif; background-color: #f4f7f6; margin: 0; padding: 40px 0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
    <tr>
      <td style="background-color: #002f45; padding: 30px; text-align: center;">
        <img src="https://utofhxgzkdhljrixperh.supabase.co/storage/v1/object/public/public-site-assets/assets/icono_tmasplus.jpeg" alt="Logo TmasPlus" style="height: 50px; vertical-align: middle; margin-right: 15px; display: inline-block;">
        <h1 style="color: #ffffff; margin: 0; font-size: 22px; vertical-align: middle; display: inline-block;">¡Gracias por viajar, ${nombreCliente}!</h1>
      </td>
    </tr>

    <tr>
      <td style="padding: 30px;">
        <h2 style="color: #002f45; font-size: 18px; margin-top: 0; text-align: center;">Resumen de tu viaje</h2>
        <p style="color: #8c9ea8; font-size: 12px; text-align: center; margin: 0 0 20px 0;">Referencia: <strong>${referencia}</strong></p>

        <h3 style="color: #00a7f5; font-size: 15px; margin-bottom: 8px;">📍 Recorrido</h3>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
          <tr>
            <td style="padding: 6px 0; color: #597a8b; font-size: 14px; width: 90px;"><strong>Origen:</strong></td>
            <td style="padding: 6px 0; color: #002f45; font-size: 14px;">${origen}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #597a8b; font-size: 14px;"><strong>Destino:</strong></td>
            <td style="padding: 6px 0; color: #002f45; font-size: 14px;">${destino}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #597a8b; font-size: 14px;"><strong>Distancia:</strong></td>
            <td style="padding: 6px 0; color: #002f45; font-size: 14px;">${distancia}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #597a8b; font-size: 14px;"><strong>Duración:</strong></td>
            <td style="padding: 6px 0; color: #002f45; font-size: 14px;">${duracion}</td>
          </tr>
        </table>

        <hr style="border: none; border-top: 1px solid #eef2f4; margin: 20px 0;">

        <h3 style="color: #00a7f5; font-size: 15px; margin-bottom: 8px;">💳 Costo</h3>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 10px;">
          <tr>
            <td style="padding: 4px 0; color: #597a8b; font-size: 14px;">Tarifa del viaje</td>
            <td style="padding: 4px 0; color: #002f45; font-size: 14px; text-align: right;">${precio}</td>
          </tr>
          ${descuentoRow}
          <tr>
            <td style="padding: 10px 0 0 0; border-top: 1px solid #eef2f4; color: #002f45; font-size: 16px;"><strong>Total pagado</strong></td>
            <td style="padding: 10px 0 0 0; border-top: 1px solid #eef2f4; color: #002f45; font-size: 16px; text-align: right;"><strong>${total}</strong></td>
          </tr>
          <tr>
            <td style="padding: 8px 0 0 0; color: #8c9ea8; font-size: 12px;">Método de pago</td>
            <td style="padding: 8px 0 0 0; color: #8c9ea8; font-size: 12px; text-align: right;">${metodoPago}</td>
          </tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="padding: 0;">
        <img src="https://utofhxgzkdhljrixperh.supabase.co/storage/v1/object/public/public-site-assets/assets/gracias_apoyo.jpeg" alt="¡Muchas gracias por tu apoyo!" style="width: 100%; height: auto; display: block;">
      </td>
    </tr>

    <tr>
      <td style="background-color: #f8fafb; padding: 20px; text-align: center; border-top: 1px solid #eef2f4;">
        <p style="color: #a0b2bd; font-size: 12px; margin: 0;">© T+Plus. Todos los derechos reservados.<br>Nos vemos en la vía.</p>
      </td>
    </tr>
  </table>
</body>
</html>
    `

    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY no configurada')

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: [emailDestino],
        subject: `Resumen de tu viaje T+Plus · ${referencia}`,
        html: htmlContent,
      }),
    })

    const data = await res.json()

    if (res.ok) {
      console.log("🎉 RESUMEN ENVIADO", data)
      return new Response(JSON.stringify({ success: true, result: data }), { headers: { "Content-Type": "application/json" } })
    } else {
      console.error("❌ ERROR EN RESEND:", data)
      throw new Error(`Resend Error: ${data?.message || data?.name || res.status}`)
    }

  } catch (error: any) {
    console.error("🚨 CRASH TOTAL:", error.message)
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } })
  }
})
