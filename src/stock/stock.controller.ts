import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Request,
} from '@nestjs/common';
import type { RequestWithUser } from '../auth/auth.guard';
import {
  CreateInboundDto,
  InboundIdDto,
  UpdateInboundDto,
} from './dto/stock-inbound.dto';
import {
  CreateOutboundDto,
  OutboundIdDto,
  UpdateOutboundDto,
} from './dto/stock-outbound.dto';
import { StockService } from './stock.service';

@Controller('stock')
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Post('inbounds')
  create(@Request() req: RequestWithUser, @Body() dto: CreateInboundDto) {
    return this.stockService.create(req.user.sub, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('inbounds/list')
  list(@Request() req: RequestWithUser) {
    return this.stockService.findMine(req.user.sub);
  }

  @HttpCode(HttpStatus.OK)
  @Post('inbounds/update')
  update(@Request() req: RequestWithUser, @Body() dto: UpdateInboundDto) {
    return this.stockService.updateDraft(req.user.sub, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('inbounds/confirm')
  confirm(@Request() req: RequestWithUser, @Body() dto: InboundIdDto) {
    return this.stockService.confirm(req.user.sub, dto.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('inbounds/void')
  voidDraft(@Request() req: RequestWithUser, @Body() dto: InboundIdDto) {
    return this.stockService.voidDraft(req.user.sub, dto.id);
  }

  @Post('outbounds')
  createOutbound(
    @Request() req: RequestWithUser,
    @Body() dto: CreateOutboundDto,
  ) {
    return this.stockService.createOutbound(req.user.sub, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('outbounds/list')
  listOutbounds(@Request() req: RequestWithUser) {
    return this.stockService.findMyOutbounds(req.user.sub);
  }

  @HttpCode(HttpStatus.OK)
  @Post('outbounds/update')
  updateOutbound(
    @Request() req: RequestWithUser,
    @Body() dto: UpdateOutboundDto,
  ) {
    return this.stockService.updateOutboundDraft(req.user.sub, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('outbounds/confirm')
  confirmOutbound(@Request() req: RequestWithUser, @Body() dto: OutboundIdDto) {
    return this.stockService.confirmOutbound(req.user.sub, dto.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('outbounds/void')
  voidOutbound(@Request() req: RequestWithUser, @Body() dto: OutboundIdDto) {
    return this.stockService.voidOutboundDraft(req.user.sub, dto.id);
  }
}
