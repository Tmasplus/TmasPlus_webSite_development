import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PRIMARY_URL = Deno.env.get("PRIMARY_SUPABASE_URL") ?? "";
const PRIMARY_ANON_KEY = Deno.env.get("PRIMARY_SUPABASE_ANON_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = Deno.env.get("MAIL_FROM_EMAIL") ?? "aprobaciones@mail.tmasplus.com";
const FROM_NAME = Deno.env.get("MAIL_FROM_NAME") ?? "T+Plus";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-app-platform, x-app-environment",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

const TYPE_LABEL: Record<string, string> = {
  queja: "Queja",
  reclamo: "Reclamo",
  sugerencia: "Sugerencia",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  in_review: "En revisión",
  resolved: "Resuelta",
  rejected: "Rechazada",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildHtml(args: {
  customerName: string;
  complaintType: string;
  subject: string;
  body: string;
  response: string;
  status: string;
  createdAt: string;
}): string {
  const tipoLabel = TYPE_LABEL[args.complaintType] ?? args.complaintType;
  const estadoLabel = STATUS_LABEL[args.status] ?? args.status;
  const headerTitulo = args.status === "resolved" ? "Tu caso ha sido resuelto" : "Hemos respondido a tu caso";
  const respuestaHtml = escapeHtml(args.response).replace(/\n/g, "<br>");
  const descripcionHtml = escapeHtml(args.body).replace(/\n/g, "<br>");
  const fecha = new Date(args.createdAt).toLocaleString("es-CO");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${headerTitulo} · T+Plus</title></head>
<body style="font-family: Arial, sans-serif; background-color: #f4f7f6; margin: 0; padding: 40px 0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
    <tr>
      <td style="background-color: #002f45; padding: 30px; text-align: center;">
        <img src="https://utofhxgzkdhljrixperh.supabase.co/storage/v1/object/public/public-site-assets/assets/icono_tmasplus.jpeg" alt="Logo TmasPlus" style="height: 50px; vertical-align: middle; margin-right: 15px; display: inline-block;">
        <h1 style="color: #ffffff; margin: 0; font-size: 22px; vertical-align: middle; display: inline-block;">Hola, ${escapeHtml(args.customerName)}</h1>
      </td>
    </tr>

    <tr>
      <td style="padding: 30px;">
        <h2 style="color: #002f45; font-size: 18px; margin-top: 0; text-align: center;">${headerTitulo}</h2>
        <p style="color: #597a8b; font-size: 14px; line-height: 1.6; text-align: center;">
          Recibimos tu ${escapeHtml(tipoLabel.toLowerCase())} y nuestro equipo te ha dado respuesta. A continuación encontrarás los detalles.
        </p>

        <hr style="border: none; border-top: 1px solid #eef2f4; margin: 20px 0;">

        <h3 style="color: #00a7f5; font-size: 15px; margin-bottom: 8px;">📨 Tu caso</h3>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
          <tr>
            <td style="padding: 6px 0; color: #597a8b; font-size: 14px; width: 110px;"><strong>Tipo:</strong></td>
            <td style="padding: 6px 0; color: #002f45; font-size: 14px;">${escapeHtml(tipoLabel)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #597a8b; font-size: 14px;"><strong>Asunto:</strong></td>
            <td style="padding: 6px 0; color: #002f45; font-size: 14px;">${escapeHtml(args.subject)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #597a8b; font-size: 14px;"><strong>Fecha:</strong></td>
            <td style="padding: 6px 0; color: #002f45; font-size: 14px;">${escapeHtml(fecha)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #597a8b; font-size: 14px;"><strong>Estado:</strong></td>
            <td style="padding: 6px 0; color: #002f45; font-size: 14px;">${escapeHtml(estadoLabel)}</td>
          </tr>
        </table>

        <div style="background-color: #f8fafb; border: 1px solid #eef2f4; border-radius: 8px; padding: 14px 16px; color: #597a8b; font-size: 13px; line-height: 1.5; margin-bottom: 24px;">
          <div style="color: #8c9ea8; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">Tu mensaje original</div>
          ${descripcionHtml}
        </div>

        <h3 style="color: #00a7f5; font-size: 15px; margin-bottom: 8px;">💬 Respuesta de T+Plus</h3>
        <div style="background-color: #eaf6fd; border-left: 4px solid #00a7f5; border-radius: 4px; padding: 14px 16px; color: #002f45; font-size: 14px; line-height: 1.6;">
          ${respuestaHtml}
        </div>

        <p style="color: #597a8b; font-size: 13px; line-height: 1.6; margin-top: 28px;">
          Si necesitas seguir conversando sobre este caso, responde a este correo o ingresa nuevamente al apartado de quejas y reclamos en la app.
        </p>
      </td>
    </tr>

    <tr>
      <td style="background-color: #f8fafb; padding: 20px; text-align: center; border-top: 1px solid #eef2f4;">
        <p style="color: #a0b2bd; font-size: 12px; margin: 0;">© T+Plus. Todos los derechos reservados.<br>Nos vemos en la vía.</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "Función mal configurada: faltan credenciales de Supabase" }, 500);
  }
  if (!PRIMARY_URL || !PRIMARY_ANON_KEY) {
    return json({ error: "Función mal configurada: faltan PRIMARY_SUPABASE_URL / PRIMARY_SUPABASE_ANON_KEY" }, 500);
  }
  if (!RESEND_API_KEY) {
    return json({ error: "Función mal configurada: falta RESEND_API_KEY" }, 500);
  }

  // Validar JWT del proyecto primario (admin del dashboard)
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return json({ error: "Falta token de autorización" }, 401);

  const primary = createClient(PRIMARY_URL, PRIMARY_ANON_KEY);
  const { data: userData, error: userErr } = await primary.auth.getUser(token);
  if (userErr || !userData?.user) {
    return json({ error: "Token inválido o expirado" }, 401);
  }

  let payload: { complaintId?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Body inválido" }, 400);
  }

  const complaintId = payload?.complaintId?.trim();
  if (!complaintId) return json({ error: "complaintId requerido" }, 400);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: complaint, error: complaintErr } = await admin
    .from("complaints")
    .select("id, user_id, subject, body, complaint_type, status, admin_response, created_at")
    .eq("id", complaintId)
    .maybeSingle();

  if (complaintErr) return json({ error: complaintErr.message }, 500);
  if (!complaint) return json({ error: "Queja no encontrada" }, 404);
  if (!complaint.admin_response || !String(complaint.admin_response).trim()) {
    return json({ error: "La queja no tiene respuesta del administrador" }, 400);
  }

  const { data: user, error: userRowErr } = await admin
    .from("users")
    .select("id, first_name, last_name, email")
    .eq("id", complaint.user_id)
    .maybeSingle();

  if (userRowErr) return json({ error: userRowErr.message }, 500);
  if (!user?.email) return json({ error: "El usuario no tiene email registrado" }, 400);

  const customerName = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() || "Cliente";

  const html = buildHtml({
    customerName,
    complaintType: complaint.complaint_type,
    subject: complaint.subject,
    body: complaint.body,
    response: String(complaint.admin_response),
    status: complaint.status,
    createdAt: complaint.created_at,
  });

  const subjectPrefix = complaint.status === "resolved" ? "Caso resuelto" : "Respuesta a tu caso";
  const emailSubject = `${subjectPrefix} · ${complaint.subject}`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: [user.email],
      subject: emailSubject,
      html,
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.error("❌ ERROR EN RESEND:", data);
    return json(
      { error: `Resend Error: ${(data as any)?.message || (data as any)?.name || res.status}` },
      502,
    );
  }

  console.log("🎉 RESPUESTA DE QUEJA ENVIADA", { complaintId, to: user.email });
  return json({ success: true, result: data });
});
