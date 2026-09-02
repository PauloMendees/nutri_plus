import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { MetaSignalResponse } from '@nutri-plus/shared-types';
import { Public } from '../auth/decorators/public.decorator';
import { MetaCtx, type MetaContext } from './meta-context';
import { MetaPublicSignalDto } from './dto/meta-signal.dto';
import { MetaSignalsService } from './meta-signals.service';

/**
 * Relay público de conversão. Existe por um motivo só: `CompleteRegistration`
 * é disparado no submit do cadastro, quando o e-mail ainda não foi confirmado e
 * não há sessão nenhuma — não dá para exigir Bearer aqui.
 *
 * Por isso a allowlist do DTO é de um evento só e nenhum valor monetário é
 * aceito no corpo: o pior que um abuso consegue é sujar o volume de
 * CompleteRegistration, nunca a receita atribuída.
 *
 * O path é neutro (`/signals`, não `/meta/events`) porque bloqueadores de
 * anúncio filtram por padrões no caminho da URL.
 */
@Controller({ path: 'signals', version: '1' })
@ApiExcludeController()
export class MetaSignalsController {
  constructor(private readonly signals: MetaSignalsService) {}

  @Post()
  @Public()
  @HttpCode(202)
  track(@Body() dto: MetaPublicSignalDto, @MetaCtx() ctx: MetaContext): MetaSignalResponse {
    return { fired: this.signals.registration(dto.email, ctx) };
  }
}
