// Generated SQL delivery: one transaction, no connections or data migration.
import {readFileSync,writeFileSync} from 'node:fs';
const files=['001_views.sql','002_booking_commands.sql','003_profile_commands.sql','004_onboarding.sql',
 '005_notifications.sql','006_support_views.sql','007_account_access.sql','008_storage_access.sql'];
const sql=files.map(f=>'\n-- '+f+'\n'+readFileSync('database/core_web/'+f,'utf8')
 .replace(/\r\n/g,'\n').replace(/^(BEGIN;|COMMIT;)\s*$/gm,'')).join('\n');
writeFileSync('database/core_web/instalar_core_web.sql',
 '-- GENERADO por scripts/build-core-sql.mjs. Revisar 000_revision_y_entrega.sql primero.\n'+
 '-- Destino: zvplcamcyldcquxqnftb. No ejecutar ademas los archivos individuales.\n'+
 'BEGIN;\nSET LOCAL lock_timeout=\'5s\';\nSET LOCAL statement_timeout=\'90s\';\n'+sql+'\nCOMMIT;\n');
console.log('Paquete SQL atomico generado; no se ejecuto contra ninguna base.');
