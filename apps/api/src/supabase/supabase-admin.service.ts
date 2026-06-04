import {
  BadGatewayException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Wraps the Supabase Admin API (service-role key). Used to invite a patient by
// email at creation time and to roll back (delete) the created auth user if the
// subsequent local DB write fails.
@Injectable()
export class SupabaseAdminService {
  private readonly logger = new Logger(SupabaseAdminService.name);
  private readonly client: SupabaseClient;

  constructor(config: ConfigService) {
    this.client = createClient(
      config.getOrThrow<string>('SUPABASE_URL'),
      config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }

  // Creates the Supabase auth identity and emails an invite. Returns the new
  // user's id (the JWT `sub`). Maps "already registered" to 409 and transport
  // failures to 502. Never logs the email or key.
  async invitePatient(
    email: string,
    meta: { name: string },
  ): Promise<{ id: string }> {
    let result: Awaited<
      ReturnType<SupabaseClient['auth']['admin']['inviteUserByEmail']>
    >;
    try {
      result = await this.client.auth.admin.inviteUserByEmail(email, {
        data: { name: meta.name },
      });
    } catch {
      throw new BadGatewayException('Auth provider unavailable');
    }

    if (result.error) {
      const status = result.error.status;
      const message = result.error.message ?? '';
      if (status === 422 || /already|registered|exists/i.test(message)) {
        throw new ConflictException('A user with this email already exists');
      }
      throw new BadGatewayException('Failed to invite user');
    }

    return { id: result.data.user.id };
  }

  // Best-effort rollback of an invited user. Swallows errors (logged) so it never
  // masks the original failure that triggered the rollback.
  async deleteUser(id: string): Promise<void> {
    try {
      await this.client.auth.admin.deleteUser(id);
    } catch (error) {
      this.logger.error(`Failed to roll back invited user ${id}`, error as Error);
    }
  }
}
