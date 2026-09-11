import { Body, Controller, Get, Header, Headers, HttpCode, Param, Post, Req } from '@nestjs/common';

import type {
  AuthenticatedPrincipal,
  FoundationRequest,
} from '../../../../common/http/request-context.js';
import { OperationPolicy } from '../../../../common/policy/operation-policy.decorator.js';
import { CurrentPrincipal } from '../../../../common/policy/principal.decorator.js';
import {
  MediaService,
  type MediaAccessProjection,
  type MediaUploadSessionProjection,
} from '../../application/media.service.js';
import type { MediaEvidenceProjection } from '../../application/media-projection.js';
import {
  BindMediaRequestDto,
  ConfirmMediaUploadRequestDto,
  InitiateMediaUploadRequestDto,
  MediaAccessRequestDto,
  MediaPathDto,
  MediaUploadPathDto,
} from './media.dto.js';

@Controller()
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('media-uploads')
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  @OperationPolicy('initiateMediaUpload')
  initiate(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: InitiateMediaUploadRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<MediaUploadSessionProjection> {
    return this.media.initiate(principal, body, { requestId: request.requestId, idempotencyKey });
  }

  @Post('media-uploads/:uploadSessionId/confirm')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @OperationPolicy('confirmMediaUpload')
  confirm(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: MediaUploadPathDto,
    @Body() body: ConfirmMediaUploadRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<MediaEvidenceProjection> {
    return this.media.confirm(principal, path.uploadSessionId, body, {
      requestId: request.requestId,
      idempotencyKey,
    });
  }

  @Get('media/:mediaId')
  @Header('Cache-Control', 'no-store')
  @OperationPolicy('getMediaEvidence')
  get(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: MediaPathDto,
  ): Promise<MediaEvidenceProjection> {
    return this.media.get(principal, path.mediaId);
  }

  @Post('media/:mediaId/bind')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @OperationPolicy('bindMediaEvidence')
  bind(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: MediaPathDto,
    @Body() body: BindMediaRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<MediaEvidenceProjection> {
    return this.media.bind(principal, path.mediaId, body, {
      requestId: request.requestId,
      idempotencyKey,
    });
  }

  @Post('media/:mediaId/access-url')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  @OperationPolicy('createMediaAccessUrl')
  accessUrl(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: MediaPathDto,
    @Body() body: MediaAccessRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<MediaAccessProjection> {
    return this.media.createAccessUrl(principal, path.mediaId, body, {
      requestId: request.requestId,
      idempotencyKey,
    });
  }
}
