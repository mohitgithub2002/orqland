import { BadRequestException, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AuthUser } from '@/core/decorators/current-user.decorator';
import { HttpAuthGuard } from '@/core/guards/http-auth.guard';
import { deliveryConfig } from '@/config/delivery.config';
import { deliveryFilePurposeEnum, type DeliveryFilePurpose } from '@/infrastructure/database/schema';
import { DeliveryFilesService, type UploadedBinary } from '../services/files/delivery-files.service';

/**
 * Binary uploads stay out of GraphQL: the client uploads here (multipart/form-data, field `file`)
 * and passes the returned `id` to the GraphQL mutation that uses it (registration, proof of delivery,
 * COD proof, support message).
 *
 *   POST /delivery/files?purpose=LICENCE_FRONT   → { id, purpose, mimeType, sizeBytes, createdAt }
 *   GET  /delivery/files/:id                     → the file (authorised per purpose, never cached publicly)
 */
interface AuthedRequest {
  user: AuthUser;
}
interface BinaryResponse {
  setHeader(name: string, value: string): void;
  end(data: Buffer): void;
}

@Controller('delivery/files')
@UseGuards(HttpAuthGuard)
export class DeliveryFilesController {
  constructor(private readonly files: DeliveryFilesService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: deliveryConfig.uploads.maxBytes, files: 1 } }))
  async upload(@Req() req: AuthedRequest, @Query('purpose') purpose: string, @UploadedFile() file: UploadedBinary | undefined) {
    if (!(deliveryFilePurposeEnum.enumValues as readonly string[]).includes(purpose)) {
      throw new BadRequestException('Unknown upload purpose');
    }
    const row = await this.files.upload(req.user, purpose as DeliveryFilePurpose, file);
    return { id: row.id, purpose: row.purpose, mimeType: row.mimeType, sizeBytes: row.sizeBytes, createdAt: row.createdAt };
  }

  @Get(':id')
  async download(@Req() req: AuthedRequest, @Param('id', new ParseUUIDPipe()) id: string, @Res() res: BinaryResponse) {
    const { file, data } = await this.files.read(req.user, id);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(data.length));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `inline; filename="${file.purpose.toLowerCase()}"`);
    res.end(data);
  }
}
