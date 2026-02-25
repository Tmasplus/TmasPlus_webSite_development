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
    const userData: UserInsert = {
      user_type: input.user_type,
      first_name: input.first_name,
      last_name: input.last_name,
      email: input.email,
      city: input.city,
      document_type: input.document_type,
      document_number: input.document_number,
      referral_id: input.referral_id,
      mobile: input.mobile,
      bank_number: input.bank_number,
      vehicle_type: input.vehicle_type,
      vehicle_placa: input.vehicle_placa,
      vehicle_model: input.vehicle_model,
      password: input.password,
      // documents: input.documents
    };

    return await UsersService.createUser(userData);
  }
}
