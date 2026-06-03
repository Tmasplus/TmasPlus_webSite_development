import { UsersService } from './users.service';
import type { UserInsert, UserRow } from '@/config/database.types';

type RegisterInput = {
  user_type: 'customer' | 'driver' | 'company';
  first_name: string;
  last_name: string;
  email: string;
  city: string;
  document_type: string;
  document_number: string;
  referral_id: string;
  mobile: string;
  bank_number: string;
  vehicle_type: string;
  vehicle_placa: string;
  vehicle_model: string;
  password: string;
  // documents: Record<string, File[]>
};

export class RegistrationService {
  static async register(input: RegisterInput): Promise<UserRow> {
    // La tabla `users` de la App (BD primaria) NO tiene columnas
    // `document_number`/`document_type` (la cédula se guarda en `license_number`)
    // ni `bank_number`/`vehicle_*`/`password`. Insertamos solo columnas válidas
    // y mapeamos la cédula a `license_number` para evitar errores 400.
    const userData: UserInsert = {
      user_type: input.user_type,
      first_name: input.first_name,
      last_name: input.last_name,
      email: input.email,
      city: input.city,
      referral_id: input.referral_id,
      mobile: input.mobile,
      license_number: input.document_number || null,
    };

    return await UsersService.createUser(userData);
  }
}
