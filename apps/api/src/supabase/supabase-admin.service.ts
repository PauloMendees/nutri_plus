import {
  BadGatewayException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthApiError, createClient, SupabaseClient } from '@supabase/supabase-js';

// Wraps the Supabase Admin API (service-role key). Used to invite a user by
// email at creation time and to roll back (delete) the created auth user if the
// subsequent local DB write fails.
@Injectable()
export class SupabaseAdminService {
  private readonly logger = new Logger(SupabaseAdminService.name);
  private readonly client: SupabaseClient;
  private readonly webOrigin: string;

  constructor(config: ConfigService) {
    this.client = createClient(
      config.getOrThrow<string>('SUPABASE_URL'),
      config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    this.webOrigin = config.getOrThrow<string>('WEB_ORIGIN');
  }

  // Creates the Supabase auth identity and emails an invite. Returns the new
  // user's id (the JWT `sub`). Maps "already registered" to 409 and transport
  // failures to 502. Never logs the email or key.
  async inviteUser(
    email: string,
    meta: { name: string },
  ): Promise<{ id: string }> {
    let result: Awaited<
      ReturnType<SupabaseClient['auth']['admin']['inviteUserByEmail']>
    >;
    try {
      result = await this.client.auth.admin.inviteUserByEmail(email, {
        data: { name: meta.name },
        redirectTo: `${this.webOrigin}/accept-invite`,
      });
    } catch {
      throw new BadGatewayException('Auth provider unavailable');
    }

    if (result.error) {
      const code =
        result.error instanceof AuthApiError ? result.error.code : undefined;
      const message = result.error.message ?? '';
      if (
        code === 'email_exists' ||
        code === 'user_already_exists' ||
        /already|registered|exists/i.test(message)
      ) {
        throw new ConflictException('A user with this email already exists');
      }
      // No PII: only the error code/status, never the email or response body.
      this.logger.warn(
        `Supabase invite failed (code=${code ?? 'unknown'}, status=${result.error.status ?? 'unknown'})`,
      );
      throw new BadGatewayException('Failed to invite user');
    }

    const userId = result.data.user?.id;
    if (!userId) {
      throw new BadGatewayException(
        'Auth provider returned an unexpected response',
      );
    }
    return { id: userId };
  }

  // Best-effort rollback of an invited user. Swallows errors (logged) so it never
  // masks the original failure that triggered the rollback.
  async deleteUser(id: string): Promise<void> {
    try {
      const { error } = await this.client.auth.admin.deleteUser(id);
      if (error) {
        this.logger.error(
          `Failed to roll back invited user ${id} (code=${error.status ?? 'unknown'})`,
        );
      }
    } catch (error) {
      this.logger.error(`Failed to roll back invited user ${id}`, error as Error);
    }
  }

  // Ensures the bucket exists (public), uploads the object (overwriting), and
  // returns its public URL. Storage/transport failures map to 502; never logs
  // file contents.
  async uploadPublicObject(
    bucket: string,
    path: string,
    body: Buffer,
    contentType: string,
  ): Promise<string> {
    try {
      const { data: existing } = await this.client.storage.getBucket(bucket);
      if (!existing) {
        await this.client.storage.createBucket(bucket, { public: true });
      }
      const { error } = await this.client.storage
        .from(bucket)
        .upload(path, body, { contentType, upsert: true });
      if (error) {
        throw error;
      }
      return this.client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    } catch {
      this.logger.warn(`Storage upload failed (bucket=${bucket})`);
      throw new BadGatewayException('Storage upload failed');
    }
  }

  // Best-effort delete; a failure is logged, not thrown (the DB is the source
  // of truth for whether a logo is set).
  async removeObject(bucket: string, path: string): Promise<void> {
    try {
      await this.client.storage.from(bucket).remove([path]);
    } catch {
      this.logger.warn(`Storage remove failed (bucket=${bucket})`);
    }
  }
}
