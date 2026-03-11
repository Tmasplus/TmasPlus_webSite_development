import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

serve(async (req: Request) => {
  try {
    const payload = await req.json()
    console.log("🚀 PAYLOAD RECIBIDO:", JSON.stringify({ id: payload.record?.id, tabla: payload.table, esquema: payload.schema }))

    // Si por error se dispara en otro esquema, lo ignoramos
    if (payload.schema !== 'public') return new Response("Ignorado: Esquema incorrecto", { status: 200 })

    const { record, old_record } = payload
    const userId = record?.id;

    if (!userId) return new Response("Sin ID", { status: 200 })

    // Validamos el cambio de estado (Antes NO estaba aprobado, Ahora SÍ)
    const isNowApproved = record?.approved === true;
    const wasPreviouslyApproved = old_record?.approved === true;
    const isDriver = record?.user_type === 'driver';

    if (isNowApproved && !wasPreviouslyApproved && isDriver) {
      console.log(`✅ APROBACIÓN DETECTADA para ${record.email}. Preparando envío...`)

      const emailDestino = record.email;
      const nombreConductor = record.first_name || 'Conductor';

      // Conectar a Supabase para buscar el código de referido
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )

      const { data: refData } = await supabaseAdmin
        .from('referral_codes')
        .select('referral_code')
        .eq('driver_id', userId)
        .single()

      const codigoReferido = refData?.referral_code || 'Generando...'

      // Tu plantilla personalizada (Recuerda cambiar las URL de las imágenes)
      const htmlContent = `
      <!DOCTYPE html>

      <html>

      <head>

        <meta charset="utf-8">

        <title>¡Cuenta Aprobada! Bienvenido a T+Plus</title>

      </head>

      <body style="font-family: Arial, sans-serif; background-color: #f4f7f6; margin: 0; padding: 40px 0;">

        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">

          <tr>

            <td style="background-color: #002f45; padding: 30px; text-align: center; font-size: 0;">

              <img src="https://utofhxgzkdhljrixperh.supabase.co/storage/v1/object/public/vehicle-images/assets/icono_tmasplus.jpeg" alt="Logo TmasPlus" style="height: 50px; vertical-align: middle; margin-right: 15px; display: inline-block;">

              <h1 style="color: #ffffff; margin: 0; font-size: 24px; vertical-align: middle; display: inline-block;">¡Felicidades, ${nombreConductor}!</h1>

            </td>

          </tr>

          <tr>

            <td style="padding: 40px 30px;">

              <h2 style="color: #002f45; font-size: 20px; margin-top: 0; text-align: center;">Tu perfil como conductor ha sido aprobado</h2>

              <p style="color: #597a8b; font-size: 16px; line-height: 1.6; text-align: center;">

                Tus documentos y tú han superado con éxito el estudio de seguridad. Podrás abrir nuestra APP con el email y contraseña de tu registro y así comenzar a ganar el 100% de todos tus servicios.

              </p>

              

              <hr style="border: none; border-top: 1px solid #eef2f4; margin: 30px 0;">

              

              <h3 style="color: #00a7f5; font-size: 18px; text-align: center; margin-bottom: 10px;">Gana más con tu Código de Referido</h3>

              <p style="color: #597a8b; font-size: 14px; line-height: 1.5; text-align: center; margin-bottom: 20px;">

                Por ser un conductor aprobado, te hemos asignado el siguiente código único. Compártelo con todos tus conductores amigos, conocidos y familiares para que lo usen al momento de registrarse como conductor o Cliente en T+Plus y gana según la campaña que se tenga vigente al momento del registro de tu referido. En lanzamiento por tu primera compra de membresía y 2 referidos Conductores que también adquieran la membresía gana $170.000 Cop y dos meses gratis de membresía. Por cada conductor adicional de los primeros 2 ganarás $50.000 Cop por cada uno cuando él también realice la primera compra de la membresía. Aplican Términos y condiciones disponibles en la WEB <a href="https://tmasplus.com/pionero-t%2B" target="_blank" style="color: #00a7f5; text-decoration: underline; word-break: break-word;">https://tmasplus.com/pionero-t+</a>, oferta válida sólo antes del lanzamiento.

              </p>

              

              <div style="background-color: #f8fafb; border: 2px dashed #00a7f5; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 20px;">

                <p style="font-size: 12px; color: #8c9ea8; margin: 0 0 5px 0; text-transform: uppercase; letter-spacing: 1px;">Tu Código Exclusivo</p>

                <p style="font-size: 28px; font-weight: bold; color: #002f45; margin: 0; letter-spacing: 2px;">${codigoReferido}</p>

              </div>



              <h4 style="color: #002f45; font-size: 14px; margin-bottom: 10px;">¿Cómo funciona?</h4>

              <ul style="color: #597a8b; font-size: 14px; line-height: 1.6; padding-left: 20px; margin-top: 0;">

                <li>Copia tu código y envíalo a tus amigos por WhatsApp.</li>

                <li>Indícales que lo peguen en la casilla "Código de referido" cuando se registren en el portal.</li>

                <li>Recibe un bono directo en tu billetera de T+Plus por cada conductor que sea aprobado.</li>

              </ul>

            </td>

          </tr>

          <tr>

            <td style="padding: 0;">

              <img src="https://utofhxgzkdhljrixperh.supabase.co/storage/v1/object/public/vehicle-images/assets/img_tmasplus1.jpeg" alt="Justo para ti... Justo para todos" style="width: 100%; height: auto; display: block;">

            </td>

          </tr>

          <tr>

            <td style="background-color: #f8fafb; padding: 20px; text-align: center; border-top: 1px solid #eef2f4;">

              <p style="color: #a0b2bd; font-size: 12px; margin: 0;">

                © T+Plus. Todos los derechos reservados.<br>Nos vemos en la vía.

              </p>

            </td>

          </tr>

        </table>

      </body>

      </html>
      `;

      // Enviar por Resend
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({
          from: 'T+Plus administración <aprobaciones@tmasplus.com>', // dominio validado
          to: [emailDestino],
          subject: '¡Tu cuenta ha sido aprobada! + Código de Referido',
          html: htmlContent
        })
      });

      if (res.ok) {
        console.log("🎉 CORREO ENVIADO EXITOSAMENTE")
        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } })
      } else {
        const errorData = await res.json();
        console.error("❌ ERROR EN RESEND:", errorData)
        throw new Error(`Resend Error`);
      }
    } else {
      console.log("⏸️ Ignorado: No hubo cambio de Pendiente a Aprobado.")
      return new Response("No action required", { status: 200 })
    }

  } catch (error: any) {
    console.error("🚨 CRASH TOTAL:", error.message)
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } })
  }
})